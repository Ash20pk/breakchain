// server/index.ts - High Performance WebSocket Transaction Server
import express from 'express';
import http from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { Pool, PoolConfig, PoolClient } from 'pg';
import { createWalletClient, createPublicClient, http as viemHttp } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import dotenv from 'dotenv';
import { SomniaChain } from './chains';
import { DinoRunnerABI } from './abi';
import { createClient } from 'redis';
import winston, { Logger } from 'winston';
import os from 'os';
import cluster from 'cluster';
import { initAnalytics, getAnalytics } from './analytics';

dotenv.config();

// Configure logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'transaction-server.log' })
  ]
});

// Initialize analytics service
const analyticsService = initAnalytics(logger);

// Constants
const PORT = parseInt(process.env.PORT || '3001');
const WEBSOCKET_PING_INTERVAL = 30000; // 30s
const CLEANUP_INTERVAL = 3600000; // 1h
const WALLET_COUNT = parseInt(process.env.WALLET_COUNT || '3');
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || '';
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '5');
const USE_REDIS = process.env.USE_REDIS === 'true';
const WORKER_COUNT = process.env.WORKER_COUNT ? parseInt(process.env.WORKER_COUNT) : os.cpus().length;

const DEV_MODE = process.env.DEV_MODE === 'false';
const DB_OPERATIONS_TIMEOUT = 5000; // 5 seconds timeout for database operations

// Transaction types
const TX_TYPE_JUMP = 'jump';
const TX_TYPE_GAME_OVER = 'gameover';

// Database configuration
const getDbConfig = (): PoolConfig => {
  const config: PoolConfig = {
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000, // Increased from 2000ms to 10000ms
  };

  // Log connection info (but hide password)
  const connectionDetails = process.env.DATABASE_URL ? 
    process.env.DATABASE_URL.replace(/:[^:]*@/, ':****@') : 
    'No DATABASE_URL provided';
  
  logger.info(`Database configuration: ${connectionDetails}`);
  
  return config;
};

// Database connection pool with improved error handling
const createDbPool = () => {
  const pool = new Pool(getDbConfig());
  
  pool.on('error', (err) => {
    logger.error('Unexpected database pool error:', err);
  });
  
  pool.on('connect', (client) => {
    logger.info('New database connection established');
    
    client.on('error', (err) => {
      logger.error('Database client error:', err);
    });
  });
  
  // Test the connection
  pool.query('SELECT NOW()')
    .then(() => {
      logger.info('Database connection successful');
    })
    .catch(err => {
      logger.error('Initial database connection test failed:', err);
    });
  
  return pool;
};

// Initialize the pool
const pool = createDbPool();

// Define Socket.IO event types
interface ClientToServerEvents {
  'client:auth': (data: { playerAddress: string; signature: string, username: string }) => void;
  'client:checkUsername': (data: { playerAddress: string }) => void;
  'client:gameStart': (data: { playerAddress: string; gameId: string }) => void;
  'client:jump': (data: { gameId: string; playerAddress: string; height: number; score: number }) => void;
  'client:gameOver': (data: { gameId: string; playerAddress: string; finalScore: number; distance: number }) => void;
  'client:getLeaderboard': () => void;
  'client:getPendingCount': () => void;
  'disconnect': () => void;
}

interface ServerToClientEvents {
  'server:status': (data: { status: string; timestamp: number; pendingTransactions: number; walletStatus: WalletStatus[] }) => void;
  'server:auth': (data: { status: string; playerAddress?: string; message?: string }) => void;
  'server:usernameCheck': (data: { username: string | null; error?: boolean }) => void;
  'server:gameStart': (data: { status: string; gameId: string; timestamp: number }) => void;
  'server:jump': (data: { status: string; txId: number; gameId: string; timestamp: number }) => void;
  'server:gameOver': (data: { status: string; txId: number; gameId: string; finalScore: number; isHighScore: boolean; timestamp: number }) => void;
  'server:leaderboard': (data: { leaderboard: any[]; timestamp: number }) => void;
  'server:pendingCount': (data: { count: number; timestamp: number }) => void;
  'server:transactionUpdate': (data: any) => void;
  'server:walletStatus': (data: { wallets: WalletStatus[]; timestamp: number }) => void;
  'server:highScore': (data: { playerAddress: string; score: number; gameId: string }) => void;
  'server:error': (data: { message: string }) => void;
}

type ClientSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
let io: SocketIOServer<ClientToServerEvents, ServerToClientEvents> | null = null;

// Redis client for pub/sub and shared state
let redisClient: any = null;
let redisSub: any = null;

let broadcastTransactionUpdate: (tx: any) => void = (tx: any) => {
  // No-op implementation for when io is not available
  // Will be replaced with a real implementation once io is initialized
  if (!io) {
    logger.debug('Attempted to broadcast transaction update before io initialization');
    return;
  }
  
  // Broadcast to all clients interested in this transaction
  if (tx.player_address) {
    io?.to(`player:${tx.player_address}`).emit('server:transactionUpdate', {
      ...tx,
      timestamp: Date.now()
    });
  }
  
  if (tx.game_id) {
    io?.to(`game:${tx.game_id}`).emit('server:transactionUpdate', {
      ...tx,
      timestamp: Date.now()
    });
  }
};

 // Define broadcastWalletStatus with a default no-op implementation
let broadcastWalletStatus: () => void = () => {
  // No-op implementation for when io is not available
  if (!io) {
    logger.debug('Attempted to broadcast wallet status before io initialization');
    return;
  }
  
  const status = blockchainManager.getWalletStatus();
  io?.emit('server:walletStatus', {
    wallets: status,
    timestamp: Date.now()
  });
};

if (USE_REDIS) {
  redisClient = createClient({
    url: process.env.REDIS_URL
  });
  
  redisClient.on('error', (err: any) => logger.error('Redis Client Error', err));
  
  // Clone client for subscription
  redisSub = redisClient.duplicate();
}

// Initialize Redis clients
async function initRedis() {
  if (USE_REDIS) {
    await redisClient.connect();
    await redisSub.connect();
    logger.info('Redis connected');
    
    // Subscribe to transaction channels
    await redisSub.subscribe('tx:processed', (message: string) => {
      try {
        const data = JSON.parse(message);
        broadcastTransactionUpdate(data);
      } catch (err) {
        logger.error('Error handling Redis message', err);
      }
    });
  }
}

// Blockchain wallet management
type WalletStatus = {
  index: number;
  address: string;
  isProcessing: boolean;
  lastTxHash?: string;
  lastProcessedTime?: number;
  totalProcessed: number;
  consecutiveErrors: number;
  queueLength?: number;
};

class BlockchainManager {
  private walletClients: any[] = [];
  private publicClient: any;
  private contractAddress: string;
  private abi: any[];
  private walletStatus: WalletStatus[] = [];
  private processingIntervals: NodeJS.Timeout[] = [];
  private walletNonces: Map<number, bigint> = new Map(); // Track nonces per wallet
  private walletQueues: Map<number, any[]> = new Map(); // Queue per wallet
  private queueProcessingInterval: NodeJS.Timeout | null = null;
  private readonly QUEUE_PROCESS_INTERVAL = 200; // ms between processing attempts
  private readonly TRANSACTION_DELAY = 100; // ms between transactions for same wallet
  private isInitialized: boolean = false;
  private lastUsedWalletIndex: number = -1;
  private readonly TRANSACTION_SPACING = 200; // ms between transactions for same wallet
  private watcherInterval: NodeJS.Timeout | null = null;
  private hourlyResetInterval: NodeJS.Timeout | null = null;



  constructor(contractAddress: string, abi: any[]) {
    this.contractAddress = contractAddress;
    this.abi = abi;
  }

  /**
   * Stop the transaction watcher
   */
  stopTransactionWatcher() {
    if (this.watcherInterval) {
      clearInterval(this.watcherInterval);
      this.watcherInterval = null;
    }
    
    if (this.hourlyResetInterval) {
      clearInterval(this.hourlyResetInterval);
      this.hourlyResetInterval = null;
    }
    
    logger.info("Transaction watcher stopped");
  }

  async initialize() {
    if (this.isInitialized && this.walletClients.length > 0) {
      logger.info('Wallets already initialized');
      return;
    }

    // Stop existing watchers if reinitializing
    this.stopTransactionWatcher();
    
    try {
      // Reset wallet collections
      this.walletClients = [];
      this.walletStatus = [];
      this.walletQueues = new Map();
      this.walletNonces = new Map();
      this.lastUsedWalletIndex = -1;
      
      // Define wallet private keys
      const privateKeys = [];
      for (let i = 0; i < WALLET_COUNT; i++) {
        const key = process.env[`PRIVATE_KEY_${i+1}`];
        if (key && key.trim() !== '') {
          privateKeys.push(key);
          logger.info(`Found private key ${i+1}`);
        } else {
          logger.warn(`Private key ${i+1} not found or is empty`);
        }
      }
      
      if (privateKeys.length === 0) {
        logger.error('No private keys configured');
        throw new Error('No private keys configured');
      }
      
      // Initialize RPC URL
      const rpcUrl = process.env.RPC_URL || 'https://dream-rpc.somnia.network';
      logger.info(`Using RPC URL: ${rpcUrl}`);
      
      // Initialize public client
      this.publicClient = createPublicClient({
        chain: SomniaChain,
        transport: viemHttp(rpcUrl, {
          timeout: 30000,
          retryCount: 3,
          retryDelay: 1000,
        })
      });
      
      // Initialize wallet clients
      for (let i = 0; i < privateKeys.length; i++) {
        try {
          logger.info(`Initializing wallet ${i}...`);
          
          // Ensure private key has 0x prefix
          const privateKey = privateKeys[i].startsWith('0x') 
            ? privateKeys[i] 
            : `0x${privateKeys[i]}`;
            
          const account = privateKeyToAccount(privateKey as `0x${string}`);
          
          // Test if the account is valid
          if (!account || !account.address) {
            logger.error(`Invalid account for wallet ${i}`);
            continue;
          }
          
          logger.info(`Wallet ${i} account address: ${account.address}`);
          
          const walletClient = createWalletClient({
            account,
            chain: SomniaChain,
            transport: viemHttp(rpcUrl, {
              timeout: 30000,
              retryCount: 3,
              retryDelay: 1000,
            })
          });
          
          this.walletClients.push(walletClient);
          this.walletStatus.push({
            index: i,
            address: account.address,
            isProcessing: false,
            totalProcessed: 0,
            consecutiveErrors: 0,
            queueLength: 0
          });

          // Initialize empty queue for this wallet
          this.walletQueues.set(i, []);
          
          // Initialize nonce from blockchain
          try {
            const nonce = await this.publicClient.getTransactionCount({
              address: account.address
            });
            this.walletNonces.set(i, nonce);
            logger.info(`Wallet ${i} nonce: ${nonce}`);
          } catch (nonceError) {
            // Use 0 as default nonce if we can't get it from the blockchain
            this.walletNonces.set(i, BigInt(0));
          }
          
          logger.info(`Wallet ${i} initialized with address ${account.address}`);
        } catch (error) {
          logger.error(`Failed to initialize wallet ${i}:`, error);
        }
      }
      
      if (this.walletClients.length === 0) {
        logger.error('Failed to initialize any wallets');
        throw new Error('Failed to initialize any wallets');
      }
      
      this.isInitialized = true;
      logger.info(`Blockchain manager initialized with ${this.walletClients.length} wallets`);
      
      // Start queue processing
      this.startQueueProcessing();
      
      return true;
    } catch (error) {
      logger.error('Blockchain manager initialization error:', error);
      throw error;
    }
  }

  async getNextNonce(walletIndex: number): Promise<bigint> {
    try {
      // Always get fresh on-chain nonce
      const onChainNonce = await this.publicClient.getTransactionCount({
        address: this.walletClients[walletIndex].account.address,
        blockTag: 'pending' // Include pending transactions
      });
      
      // Compare with locally tracked nonce
      const trackedNonce = this.walletNonces.get(walletIndex) || BigInt(0);
      
      // Use the maximum value to avoid nonce errors
      const nextNonce = onChainNonce > trackedNonce ? onChainNonce : trackedNonce;
      
      // Update tracker for future reference
      this.walletNonces.set(walletIndex, nextNonce);
      
      return nextNonce;
    } catch (error) {
      logger.error(`Failed to get nonce for wallet ${walletIndex}:`, error);
      
      // Fall back to tracked nonce if we have one
      const fallbackNonce = this.walletNonces.get(walletIndex);
      if (fallbackNonce !== undefined) return fallbackNonce;
      
      throw new Error(`Cannot determine nonce for wallet ${walletIndex}`);
    }
  }

    // Start queue processing for all wallets
    startQueueProcessing() {
      this.queueProcessingInterval = setInterval(() => {
        for (let i = 0; i < this.walletClients.length; i++) {
          this.processWalletQueue(i);
        }
      }, this.QUEUE_PROCESS_INTERVAL);
      logger.info('Started transaction queue processing');
    }

    queueToWallet(walletIndex: number, tx: any) {
      // Add directly to this wallet's queue
      const queue = this.walletQueues.get(walletIndex) || [];
      queue.push({
        ...tx,
        queuedAt: Date.now()
      });
      this.walletQueues.set(walletIndex, queue);
      
      logger.info(`Transaction ${tx.id} added directly to wallet ${walletIndex} queue`);
      
      // Update wallet status
      this.walletStatus[walletIndex].queueLength = queue.length;
      
      return true;
    }

  // Stop queue processing
  stopQueueProcessing() {
    if (this.queueProcessingInterval) {
      clearInterval(this.queueProcessingInterval);
      this.queueProcessingInterval = null;
    }
    logger.info('Stopped transaction queue processing');
  }

  // Get wallet status
  getWalletStatus(): WalletStatus[] {
    // Update queue lengths
    for (let i = 0; i < this.walletStatus.length; i++) {
      const queue = this.walletQueues.get(i) || [];
      this.walletStatus[i].queueLength = queue.length;
    }
    return [...this.walletStatus];
  }

  selectNextWallet() {
    if (!this.walletClients || this.walletClients.length === 0) {
      logger.error('No wallet clients initialized');
      return -1;
    }
  
    const totalWallets = this.walletClients.length;
    let bestWalletIndex = -1;
    let lowestErrorCount = Number.MAX_SAFE_INTEGER;
    let lowestQueueLength = Number.MAX_SAFE_INTEGER;
  
    // First try to find a non-processing wallet
    for (let i = 0; i < totalWallets; i++) {
      const wallet = this.walletStatus[i];
      if (!wallet.isProcessing && wallet.consecutiveErrors < 5) {
        bestWalletIndex = i;
        break;
      }
    }
  
    // If all wallets are processing, find one with lowest queue
    if (bestWalletIndex === -1) {
      for (let i = 0; i < totalWallets; i++) {
        const wallet = this.walletStatus[i];
        const queue = this.walletQueues.get(i) || [];
        if (queue.length < lowestQueueLength) {
          lowestQueueLength = queue.length;
          bestWalletIndex = i;
        }
      }
    }
  
    // If still no wallet, pick any available one
    if (bestWalletIndex === -1) {
      bestWalletIndex = (this.lastUsedWalletIndex + 1) % totalWallets;
    }
  
    this.lastUsedWalletIndex = bestWalletIndex;
    return bestWalletIndex;
  }

  // Queue a transaction to the best available wallet
  queueTransaction(tx: any) {
    const walletIndex = this.selectNextWallet();
    
    if (walletIndex === -1) {
      logger.error('No available wallets to process transaction');
      
      // Add error handling - update transaction status to 'failed' in database
      (async () => {
        try {
          const client = await pool.connect();
          try {
            await client.query(
              'UPDATE dino_transaction_queue SET status = $1, retries = retries + 1 WHERE id = $2',
              ['failed', tx.id]
            );
            
            logger.error(`Transaction ${tx.id} marked as failed due to no available wallets`);
            
            // Broadcast failure
            broadcastTransactionUpdate({
              id: tx.id,
              player_address: tx.player_address,
              game_id: tx.game_id,
              type: tx.type,
              status: 'failed',
              error: 'No available wallets to process transaction'
            });
          } finally {
            client.release();
          }
        } catch (dbError) {
          logger.error(`Error updating failed transaction ${tx.id}:`, dbError);
        }
      })();
      
      return -1; // Return -1 to indicate failure
    }
    
    // Add to wallet's queue
    const queue = this.walletQueues.get(walletIndex) || [];
    queue.push({
      ...tx,
      queuedAt: Date.now()
    });
    this.walletQueues.set(walletIndex, queue);
    
    logger.info(`Transaction ${tx.id} added to wallet ${walletIndex} queue, length: ${queue.length}`);
    
    // Update wallet status
    this.walletStatus[walletIndex].queueLength = queue.length;
    
    return walletIndex;
  }
  

  async processPlayerNameUpdate(walletIndex: number, tx: any) {
    const wallet = this.walletClients[walletIndex];
    const currentNonce = this.walletNonces.get(walletIndex);
    
    if (!currentNonce) {
      throw new Error(`No nonce available for wallet ${walletIndex}`);
    }
    
    try {
      // Simulate the contract call first
      const { request } = await this.publicClient.simulateContract({
        address: this.contractAddress as `0x${string}`,
        abi: this.abi,
        functionName: 'setPlayer',
        args: [
          tx.player_address as `0x${string}`,
          tx.username || "" 
        ],
        account: wallet.account,
        nonce: currentNonce
      });
      
      // Send the transaction
      const hash = await wallet.writeContract(request);
      
      // Update the nonce for next transaction
      this.walletNonces.set(walletIndex, currentNonce + BigInt(1));
      
      return hash;
    } catch (error) {
      logger.error(`Error updating player name for ${tx.player_address}:`, error);
      throw error;
    }
  }

  // Process the transaction queue for a specific wallet
  async processWalletQueue(walletIndex: number) {
    // Skip if this wallet is already processing or has too many errors
    if (
      !this.walletClients[walletIndex] || 
      this.walletStatus[walletIndex].isProcessing
    ) {
      return;
    }
    
    const queue = this.walletQueues.get(walletIndex) || [];
    if (queue.length === 0) {
      return; // Nothing to process
    }
    
    // Mark wallet as processing
    this.walletStatus[walletIndex].isProcessing = true;
    
    try {
      // Process one transaction at a time
      const tx = queue[0]; // Get the next transaction without removing it yet
      
      // Get the current nonce for this wallet
      let currentNonce = await this.getNextNonce(walletIndex);

      if (currentNonce === undefined) {
        // If nonce not in map, get it from blockchain
        currentNonce = await this.publicClient.getTransactionCount({
          address: this.walletClients[walletIndex].account.address
        });
        
        // Ensure currentNonce is a bigint before storing it
        if (currentNonce !== undefined) {
          this.walletNonces.set(walletIndex, currentNonce as bigint);
        } else {
          throw new Error(`Failed to get nonce for wallet ${walletIndex}`);
        }
      }
      
      const wallet = this.walletClients[walletIndex];
      
      // Process the transaction
      try {
        let hash: string | undefined;

        if (tx.type === TX_TYPE_JUMP) {
          // Record jump transaction
          const { request } = await this.publicClient.simulateContract({
            address: this.contractAddress as `0x${string}`,
            abi: this.abi,
            functionName: 'recordJump',
            args: [
              tx.player_address as `0x${string}`,
              // Convert to string first to handle undefined/null
              BigInt(String(tx.height || 0)),
              BigInt(String(tx.score || 0)),
              tx.game_id
            ],
            account: wallet.account,
            nonce: currentNonce
          });
          
          hash = await wallet.writeContract(request);
          
        } else if (tx.type === TX_TYPE_GAME_OVER) {
          // Record game over transaction
          const { request } = await this.publicClient.simulateContract({
            address: this.contractAddress as `0x${string}`,
            abi: this.abi,
            functionName: 'recordGameOver',
            args: [
              tx.player_address as `0x${string}`,
              BigInt(String(tx.score || 0)),
              tx.game_id
            ],
            account: wallet.account,
            nonce: currentNonce
          });
          
          hash = await wallet.writeContract(request);
        } else if (tx.type === 'setplayer') {
          // Handle player name update
          hash = await this.processPlayerNameUpdate(walletIndex, tx);
        }
        
        // Update database
        if (hash) {
          const client = await pool.connect();
          try {
            // Update transaction status in database
            await client.query(
              'UPDATE dino_transaction_queue SET status = $1, hash = $2, wallet_index = $3 WHERE id = $4',
              ['sent', hash, walletIndex, tx.id]
            );
          } finally {
            client.release();
          }
          
          // Increment counters
          this.walletStatus[walletIndex].totalProcessed++;
          
          // Reset consecutive errors on success
          this.walletStatus[walletIndex].consecutiveErrors = 0;
          
          // Track in analytics
          if (analyticsService) {
            analyticsService.trackTransaction({
              id: tx.id,
              player_address: tx.player_address,
              game_id: tx.game_id,
              type: tx.type,
              status: 'sent',
              hash,
              score: tx.score
            });
          }
          
          // Broadcast transaction update
          broadcastTransactionUpdate({
            id: tx.id,
            player_address: tx.player_address,
            game_id: tx.game_id,
            type: tx.type,
            status: 'sent',
            hash,
            score: tx.score
          });
          
          logger.info(`Wallet ${walletIndex} processed ${tx.type} transaction for ${tx.player_address}, hash: ${hash}`);
        }
        
        // Remove the processed transaction from queue
        queue.shift();
        this.walletQueues.set(walletIndex, queue);
        
      } catch (err) {
        logger.error(`Wallet ${walletIndex} error processing transaction ${tx.id}:`, err);
        
        // Check for nonce error
        const errorMessage = err instanceof Error ? err.message : 'Unknown transaction error';
        
        if (errorMessage.includes('NONCE_TOO_SMALL')) {
          // If nonce is too small, get the current nonce from blockchain and try again
          logger.warn(`Nonce too small for wallet ${walletIndex}, refreshing nonce`);
          const newNonce = await this.publicClient.getTransactionCount({
            address: this.walletClients[walletIndex].account.address
          });
          this.walletNonces.set(walletIndex, newNonce);
          
          // Keep transaction in queue to retry with correct nonce
        } else {
          // For other errors, mark the transaction as failed
          const client = await pool.connect();
          try {
            await client.query(
              'UPDATE dino_transaction_queue SET status = $1, retries = retries + 1 WHERE id = $2',
              ['failed', tx.id]
            );
          } finally {
            client.release();
          }
          
          // Track failed transaction
          if (analyticsService) {
            analyticsService.trackTransaction({
              id: tx.id,
              player_address: tx.player_address,
              game_id: tx.game_id,
              type: tx.type,
              status: 'failed',
              error: errorMessage
            });
          }
          
          // Broadcast failure
          broadcastTransactionUpdate({
            id: tx.id,
            player_address: tx.player_address,
            game_id: tx.game_id,
            type: tx.type,
            status: 'failed'
          });
          
          // Remove the failed transaction from queue
          queue.shift();
          this.walletQueues.set(walletIndex, queue);
          
          // Increment consecutive errors
          this.walletStatus[walletIndex].consecutiveErrors += 1;
        }
      }
      
    } catch (error) {
      logger.error(`Error in wallet queue processing for wallet ${walletIndex}:`, error);
      this.walletStatus[walletIndex].consecutiveErrors += 1;
    } finally {
      // Add a small delay before processing the next transaction
      setTimeout(() => {
        this.walletStatus[walletIndex].isProcessing = false;
      }, this.TRANSACTION_DELAY);
    }
  }

  /**
   * Start watching for transaction confirmations
   * @param {Function} onConfirmation - Callback for confirmed transactions
   */
  startTransactionWatcher(onConfirmation: (tx: any, status: 'confirmed' | 'failed', receipt: any) => void) {
    if (!this.publicClient) {
      logger.warn('Cannot start transaction watcher: public client not initialized');
      return;
    }

    logger.info('Starting rate-limited transaction watcher...');
  
      // Transaction processing variables
      const BATCH_SIZE = 10; // Process 10 transactions at a time
      const CHECK_INTERVAL = 10000; // Check every 10 seconds
      const HOURLY_LIMIT = 10; // Process only 10 transactions per hour
    
      // Track processed count within the current hour
    let processedThisHour = 0;
    let hourStartTime = Date.now();
    
    // Reset the hourly counter every hour
    const hourlyReset = setInterval(() => {
      processedThisHour = 0;
      hourStartTime = Date.now();
      logger.info('Resetting hourly transaction check counter');
    }, 3600000); // 1 hour

    // Create polling interval 
  const pollInterval = setInterval(async () => {
    try {
      // Skip if we've already hit the hourly limit
      if (processedThisHour >= HOURLY_LIMIT) {
        return;
      }
      
      // Calculate how many we can process in this batch
      const remaining = HOURLY_LIMIT - processedThisHour;
      const toProcess = Math.min(remaining, BATCH_SIZE);
      
      // Get pending transactions from DB
      const client = await pool.connect();
      try {
        const pendingTxs = await client.query(
          "SELECT * FROM dino_transaction_queue WHERE status = 'sent' AND hash IS NOT NULL ORDER BY timestamp ASC LIMIT $1",
          [toProcess]
        );
        
        if (pendingTxs.rows.length === 0) {
          return; // No pending transactions
        }
        
        logger.info(`Checking ${pendingTxs.rows.length} of ${toProcess} pending transactions for confirmation`);
        
        // Check each transaction for confirmation
        for (const tx of pendingTxs.rows) {
          try {
            // Increment counter as we're processing this transaction
            processedThisHour++;
            
            const receipt = await this.publicClient.getTransactionReceipt({
              hash: tx.hash as `0x${string}`
            });
            
            if (receipt) {
              // Transaction is confirmed
              const status = receipt.status === 'success' ? 'confirmed' : 'failed';
              
              // Update transaction status in DB
              await client.query(
                "UPDATE dino_transaction_queue SET status = $1 WHERE id = $2",
                [status, tx.id]
              );
              
              // Call the confirmation callback
              onConfirmation(tx, status, receipt);
              
              logger.info(`Transaction ${tx.hash} confirmed with status ${status} (${processedThisHour}/${HOURLY_LIMIT} this hour)`);
            } else {
              // Check if transaction is too old
              const txTimestamp = new Date(tx.timestamp).getTime();
              const hoursAgo = Date.now() - (12 * 3600000); // 12 hours
              
              if (txTimestamp < hoursAgo) {
                await client.query(
                  "UPDATE dino_transaction_queue SET status = 'failed' WHERE id = $1",
                  [tx.id]
                );
                logger.warn(`Marking old transaction ${tx.hash} as failed (over 12 hours old)`);
                
                // Call callback with failed status
                onConfirmation(tx, 'failed', null);
              } else {
                logger.info(`Transaction ${tx.hash} not yet confirmed, will retry later`);
              }
            }
          } catch (txError) {
            logger.warn(`Error checking transaction ${tx.hash}: ${txError instanceof Error ? txError.message : txError}`);
          }
        }
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error("Error in transaction watcher:", error);
    }
  }, CHECK_INTERVAL);
    
    // Store interval references for shutdown
    this.watcherInterval = pollInterval;
    this.hourlyResetInterval = hourlyReset;
  
    logger.info(`Transaction confirmation watcher started: ${BATCH_SIZE} per batch, ${HOURLY_LIMIT} per hour, checking every ${CHECK_INTERVAL/1000}s`);
  
    return pollInterval;
  }

  // Reset a wallet's error count
  resetWallet(index: number) {
    if (index >= 0 && index < this.walletStatus.length) {
      this.walletStatus[index].consecutiveErrors = 0;
      logger.info(`Reset wallet ${index}`);
    }
  }
}

// Function to process queue from database periodically
async function startProcessingQueueFromDB() {
  setInterval(async () => {
    const client = await pool.connect();
    try {
      // Begin transaction
      await client.query('BEGIN');
      
      // Get batch of pending transactions
      const result = await client.query(`
        SELECT * FROM dino_transaction_queue 
        WHERE status = 'pending' 
        ORDER BY id ASC
        LIMIT ${BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      `);
      
      if (result.rows.length > 0) {
        logger.info(`Found ${result.rows.length} pending transactions to process`);
        
        // Process each transaction through blockchain manager
        for (const tx of result.rows) {
          const walletIndex = blockchainManager.selectNextWallet();
          
          if (walletIndex === -1) {
            logger.error('No available wallets to process transaction');
            await client.query(
              'UPDATE dino_transaction_queue SET status = $1, retries = retries + 1 WHERE id = $2',
              ['failed', tx.id]
            );
          } else {
            // Queue transaction for processing with selected wallet
            blockchainManager.queueToWallet(walletIndex, tx);
            
            // Update status to 'processing' to prevent other processes from picking it up
            await client.query(
              'UPDATE dino_transaction_queue SET status = $1, wallet_index = $2 WHERE id = $3',
              ['processing', walletIndex, tx.id]
            );

            // Add delay between transactions for the same wallet
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        }
      }
      
      // Commit transaction
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error processing transaction queue:', error);
    } finally {
      client.release();
    }
  }, 1000); // Check every second
}

/**
 * Check if a score qualifies for the leaderboard
 * @param client Database client
 * @param score Player's score
 * @param playerAddress Player's wallet address
 */
async function isHighScoreForLeaderboard(
  client: PoolClient, 
  score: number, 
  playerAddress: string
): Promise<boolean> {
  // First check total number of entries
  const totalResult = await client.query('SELECT COUNT(*) FROM dino_leaderboard');
  const totalEntries = parseInt(totalResult.rows[0].count.toString(), 10);
  
  // If fewer than 10 entries, it's automatically a high score
  if (totalEntries < 10) {
    return true;
  }
  
  // Check if this player already has a better score
  const playerBestResult = await client.query(
    'SELECT MAX(score) as best FROM dino_leaderboard WHERE player_address = $1',
    [playerAddress]
  );
  
  const playerBest = playerBestResult.rows[0]?.best ? parseInt(playerBestResult.rows[0].best.toString(), 10) : 0;
  
  // If player's new score is better than their existing best, continue checking
  if (score > playerBest) {
    // Find the lowest score in the top 10
    const lowestResult = await client.query(
      'SELECT MIN(score) as min_score FROM (SELECT score FROM dino_leaderboard ORDER BY score DESC LIMIT 10) AS top_scores'
    );
    
    const lowestTopScore = lowestResult.rows[0]?.min_score ? 
      parseInt(lowestResult.rows[0].min_score.toString(), 10) : 0;
    
    // It's a high score if it beats the lowest score in the top 10
    return score > lowestTopScore;
  }
  
  return false;
}

// Create blockchain manager
const blockchainManager = new BlockchainManager(CONTRACT_ADDRESS, DinoRunnerABI);

// Master process setup - handles clustering and load balancing
if (cluster.isPrimary) {
  logger.info(`Master ${process.pid} is running`);
  
  // Initialize blockchain manager in the primary process
  blockchainManager.initialize().then(() => {
    // Start processing queue from database in master process only
    startProcessingQueueFromDB();
  }).catch(err => {
    logger.error('Failed to initialize blockchain manager:', err);
    process.exit(1);
  });

  // Start transaction watcher in master process
  blockchainManager.startTransactionWatcher((tx, status, receipt) => {
    // Update the existing transaction in the database
      (async () => {
        const client = await pool.connect();
        try {
          // Just update status of the existing transaction
          await client.query(
            `UPDATE dino_transaction_queue 
            SET status = $1
            WHERE id = $2`,
            [status, tx.id]
          );
        
        // If Redis is enabled, publish confirmation for workers to broadcast
        if (USE_REDIS && redisClient) {
          await redisClient.publish('tx:confirmation', JSON.stringify({
            id: tx.id,
            player_address: tx.player_address,
            game_id: tx.game_id,
            type: tx.type,
            status,
            hash: tx.hash,
            score: tx.score
          }));
        }
        
        // Track in analytics
        if (analyticsService) {
          analyticsService.trackTransactionConfirmation(tx.hash, status, {
            ...tx,
            blockNumber: receipt?.blockNumber
          });
        }
        
        logger.info(`Transaction ${tx.hash} confirmed with status ${status}`);
      } finally {
        client.release();
      }
    })();
  });

  // Fork workers for handling WebSocket connections
  for (let i = 0; i < WORKER_COUNT; i++) {
    cluster.fork({ WORKER_ONLY: 'true' });
  }

  cluster.on('exit', (worker, code, signal) => {
    logger.warn(`Worker ${worker.process.pid} died with code ${code} and signal ${signal}`);
    // Replace dead worker
    cluster.fork();
  });
  
  // Setup cleanup job
  setInterval(async () => {
    try {
      const client = await pool.connect();
      try {
        await client.query('SELECT cleanup_old_transactions()');
        logger.info('Cleaned up old transactions');
      } finally {
        client.release();
      }
    } catch (err) {
      logger.error('Error running cleanup job:', err);
    }
  }, CLEANUP_INTERVAL);
  
} else {
  // Worker process - handles WebSocket connections
  logger.info(`Worker ${process.pid} started`);
  
  // Initialize Express app and Socket.IO server
  const app = express();
  const server = http.createServer(app);
  // When creating the io instance, assign it to the module-level variable:
  io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(server, {
    cors: {
      origin: process.env.CORS_ORIGIN || '*',
      methods: ['GET', 'POST']
    },
    pingInterval: WEBSOCKET_PING_INTERVAL,
    transports: ['websocket', 'polling']
  });

  // Connect to Redis if enabled
  if (USE_REDIS) {
    initRedis().catch(err => {
      logger.error('Failed to initialize Redis:', err);
    });
  }

  // Track connected clients
  const connectedClients = new Map();

// WebSocket event handlers
  io.on('connection', async (socket: ClientSocket) => {
    logger.info(`Client connected: ${socket.id}`);

    const sessionStartTime = Date.now();
    
    // Add to connected clients map
    connectedClients.set(socket.id, {
      id: socket.id,
      playerAddress: null,
      gameId: null,
      connectedAt: sessionStartTime
    });
    
    // Send initial status
    socket.emit('server:status', {
      status: 'connected',
      timestamp: Date.now(),
      pendingTransactions: await getPendingTransactionCount(),
      walletStatus: blockchainManager.getWalletStatus()
    });
    
    // Handle client authentication
    socket.on('client:auth', async (data) => {
      try {
        const { playerAddress, username } = data;
        const normalizedAddress = playerAddress.toLowerCase(); // Normalize address
        
        // Validate signature (currently bypassed in development)
        const isValid = true; // validateSignature(normalizedAddress, signature);
        
        if (!isValid) {
          socket.emit('server:auth', {
            status: 'error',
            message: 'Invalid signature'
          });
          return;
        }
        
        // Update client info in memory
        const clientInfo = connectedClients.get(socket.id);
        if (clientInfo) {
          clientInfo.playerAddress = normalizedAddress;
          clientInfo.username = username;
          connectedClients.set(socket.id, clientInfo);
        }
        
        const client = await pool.connect();
        try {
          // Begin transaction for consistent database updates
          await client.query('BEGIN');
          
          try {
            // Always record the WebSocket session
            await client.query(
              'INSERT INTO dino_websocket_sessions (session_id, player_address, status) VALUES ($1, $2, $3) ' +
              'ON CONFLICT (session_id) DO UPDATE SET player_address = $2, status = $3, last_active_at = NOW()',
              [socket.id, normalizedAddress, 'active']
            );
            
            // Check if player profile exists
            const profileResult = await client.query(
              'SELECT username FROM dino_player_profiles WHERE player_address = $1',
              [normalizedAddress]
            );
            
            let existingUsername = null;
            let usernameChanged = false;
            let queueNameUpdate = false;
            
            if (profileResult.rows.length > 0) {
              // Profile exists
              existingUsername = profileResult.rows[0].username;
              
              if (username && username !== existingUsername) {
                // Username provided and different from existing - update it
                await client.query(
                  'UPDATE dino_player_profiles SET username = $1, last_played_at = NOW() WHERE player_address = $2',
                  [username, normalizedAddress]
                );
                usernameChanged = true;
                queueNameUpdate = true;
                logger.info(`Updated username for ${normalizedAddress}: ${existingUsername} -> ${username}`);
              } else {
                // Just update last_played_at
                await client.query(
                  'UPDATE dino_player_profiles SET last_played_at = NOW() WHERE player_address = $1',
                  [normalizedAddress]
                );
                logger.info(`Player profile exists for ${normalizedAddress}, username: ${existingUsername || 'none'}`);
              }
            } else {
              // No profile exists - create new one
              await client.query(
                'INSERT INTO dino_player_profiles (player_address, username, first_played_at, last_played_at) VALUES ($1, $2, NOW(), NOW())',
                [normalizedAddress, username]
              );
              queueNameUpdate = true;
              logger.info(`Created new player profile for ${normalizedAddress}, username: ${username || 'none'}`);
            }
            
            // Queue transaction to update name on-chain if needed and username is provided
            if (queueNameUpdate && username) {
              await client.query(
                `INSERT INTO dino_transaction_queue 
                (player_address, game_id, type, timestamp, status, username, score) 
                VALUES ($1, $2, $3, $4, $5, $6, $7) 
                RETURNING id`,
                [normalizedAddress, 'profile-update', 'setplayer', Date.now(), 'pending', username, 0]
              );
              logger.info(`Player name update queued for ${normalizedAddress}, username: ${username}`);
            }
            
            // Commit transaction
            await client.query('COMMIT');
            
          } catch (err) {
            // Rollback transaction on error
            await client.query('ROLLBACK');
            logger.error(`Database error in auth for ${normalizedAddress}:`, err);
            throw err; // Re-throw to be caught by outer catch
          }
        } finally {
          client.release();
        }
        
        // Join player-specific room for targeted updates
        socket.join(`player:${normalizedAddress}`);
        
        // Track analytics after DB operations complete
        if (analyticsService) {
          analyticsService.identifyPlayer(normalizedAddress, { username });
          analyticsService.trackSessionStart(normalizedAddress, socket.id);
        }
        
        // Send successful authentication response
        socket.emit('server:auth', {
          status: 'authenticated',
          playerAddress: normalizedAddress
        });
        
        logger.info(`Client ${socket.id} authenticated as ${normalizedAddress}, username: ${username || 'none'}`);
        
      } catch (error: Error | unknown) {
        logger.error(`Error in client authentication: ${error}`);
        socket.emit('server:auth', {
          status: 'error',
          message: 'Authentication failed: ' + (error instanceof Error ? error.message : 'Unknown error')
        });
      }
    });

    socket.on('client:checkUsername', async (data) => {
      try {
        const client = await pool.connect();
        try {
          const result = await client.query(
            'SELECT username FROM dino_player_profiles WHERE player_address = $1',
            [data.playerAddress.toLowerCase()]
          );
          
          const username = result.rows.length > 0 ? result.rows[0].username : null;
          
          socket.emit('server:usernameCheck', {
            username
          });
        } finally {
          client.release();
        }
      } catch (error) {
        logger.error('Error checking username:', error);
        socket.emit('server:usernameCheck', { username: null, error: true });
      }
    });
    
   // Handle game session start
    socket.on('client:gameStart', async (data) => {
      try {
        const { gameId, playerAddress } = data;

        const normalizedAddress = playerAddress.toLowerCase();
        
        // Basic validation
        if (!gameId || !normalizedAddress) {
          socket.emit('server:error', {
            message: 'Invalid game start request: missing gameId or playerAddress'
          });
          return;
        }

        logger.info(`Game start request: gameId=${gameId}, player=${normalizedAddress}`);
        
        // Get or create client info
        let clientInfo = connectedClients.get(socket.id);
        if (!clientInfo) {
          // Create new client info if it doesn't exist
          clientInfo = {
            id: socket.id,
            playerAddress: null,
            gameId: null,
            connectedAt: Date.now()
          };
          connectedClients.set(socket.id, clientInfo);
        }
        
        // Update client info
        clientInfo.playerAddress = normalizedAddress;
        clientInfo.gameId = gameId;
        connectedClients.set(socket.id, clientInfo);
        
        // Join game-specific room
        socket.join(`game:${gameId}`);
        socket.join(`player:${normalizedAddress}`); // Also join the player-specific room
        
        // Database operations with timeout protection
        const dbOperationsPromise = (async () => {
          let client;
          try {
            client = await pool.connect();
            
            // First check if session exists
            const sessionResult = await client.query(
              'SELECT * FROM dino_websocket_sessions WHERE session_id = $1',
              [socket.id]
            );
            
            // Begin transaction
            await client.query('BEGIN');
            
            try {
              // Insert or update session info
              if (sessionResult.rowCount === 0) {
                // Session doesn't exist, insert new record
                await client.query(
                  'INSERT INTO dino_websocket_sessions (session_id, player_address, status) VALUES ($1, $2, $3)',
                  [socket.id, normalizedAddress, 'active']
                );
              } else {
                // Session exists, update it
                await client.query(
                  'UPDATE dino_websocket_sessions SET player_address = $1, status = $2, last_active_at = NOW() WHERE session_id = $3',
                  [normalizedAddress, 'active', socket.id]
                );
              }
              
              // Check for any existing active game sessions for this player and close them
              await client.query(
                `UPDATE dino_player_sessions 
                SET end_time = NOW(), completed = false 
                WHERE player_address = $1 AND end_time IS NULL AND game_id != $2`,
                [normalizedAddress, gameId]
              );
              
              // Then create the new game session
              try {
                await client.query(
                  'INSERT INTO dino_player_sessions (player_address, game_id) VALUES ($1, $2)',
                  [normalizedAddress, gameId]
                );
              } catch (err) {
                logger.warn(`Game session may already exist for player ${normalizedAddress}, game ${gameId}`);
                
                // Check if this game session already exists
                const existingGame = await client.query(
                  'SELECT * FROM dino_player_sessions WHERE player_address = $1 AND game_id = $2',
                  [normalizedAddress, gameId]
                );
                
                if (existingGame.rowCount === 0) {
                  // Unexpected error, rethrow to be caught in outer catch
                  throw err;
                }
              }
              
              // Commit transaction
              await client.query('COMMIT');
              return true;
              
            } catch (innerErr) {
              // Rollback on error
              await client.query('ROLLBACK');
              throw innerErr;
            }
            
          } catch (err) {
            logger.error(`Database error in game start for ${gameId}:`, err);
            throw err;
          } finally {
            if (client) client.release();
          }
        });
        
        // Add timeout to database operations
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Database operation timeout')), DB_OPERATIONS_TIMEOUT);
        });
        
        // Race the database operations against the timeout
        try {
          await Promise.race([dbOperationsPromise, timeoutPromise]);
          
          // Database operations completed successfully or timed out
          // Either way, we'll acknowledge the game start to prevent client-side timeout
          socket.emit('server:gameStart', {
            status: 'started',
            gameId,
            timestamp: Date.now()
          });

          // THEN track in analytics AFTER DB operations (even if they failed)
          if (analyticsService) {
            analyticsService.trackGameStart({
              playerAddress: normalizedAddress,
              gameId
            });
            
            // Identify the player
            analyticsService.identifyPlayer(normalizedAddress, {
              first_seen: new Date().toISOString()
            });
          }
          
          logger.info(`Game ${gameId} started for player ${normalizedAddress}`);
          
        } catch (error) {
          logger.error(`Error starting game ${gameId}:`, error);
          
          // Still acknowledge the game start but with a different status
          // This is better than letting the client time out
          socket.emit('server:gameStart', {
            status: 'started',
            gameId,
            timestamp: Date.now(),
          });
          
          logger.warn(`Game ${gameId} started with warnings for player ${normalizedAddress}`);
        }
        
      } catch (err) {
        logger.error(`Unexpected error in game start handler:`, err);
        
        // Send error to client
        socket.emit('server:error', {
          message: 'Failed to start game: Server error'
        });
      }
    });
    
    // Handle player jump
    socket.on('client:jump', async (data) => {
      try {
        const { gameId, playerAddress, height, score } = data;
        const normalizedAddress = playerAddress.toLowerCase();
        const clientInfo = connectedClients.get(socket.id);
        
        // More permissive check
        if (!clientInfo) {
          socket.emit('server:error', {
            message: 'Invalid session'
          });
          return;
        }
        
        // Update client info if needed
        if (clientInfo.playerAddress !== normalizedAddress) {
          clientInfo.playerAddress = normalizedAddress;
        }
        if (clientInfo.gameId !== gameId) {
          clientInfo.gameId = gameId;
        }
        
        connectedClients.set(socket.id, clientInfo);
        
        // First add to database
        let txId = null;
        const client = await pool.connect();
        try {
          // Add transaction to queue
          const result = await client.query(
            `INSERT INTO dino_transaction_queue 
            (player_address, game_id, type, score, height, timestamp, status) 
            VALUES ($1, $2, $3, $4, $5, $6, $7) 
            RETURNING id`,
            [playerAddress, gameId, TX_TYPE_JUMP, score, height, Date.now(), 'pending']
          );
          
          txId = result.rows[0].id;
          
        } finally {
          client.release();
        }
          
          // Acknowledge jump recorded
          socket.emit('server:jump', {
            status: 'recorded',
            txId,
            gameId,
            timestamp: Date.now()
          });
          
        } catch (err) {
          logger.error(`Error processing jump: ${err}`);
          socket.emit('server:error', {
            message: 'Failed to record jump'
          });
        }
      });
    
    // Handle game over
    socket.on('client:gameOver', async (data) => {
      try {
        const { gameId, playerAddress, finalScore, distance } = data;
        const normalizedAddress = playerAddress.toLowerCase();
        const clientInfo = connectedClients.get(socket.id);
        
        // More permissive check
        if (!clientInfo) {
          socket.emit('server:error', {
            message: 'Invalid session'
          });
          return;
        }
        
        // Calculate game duration if we have a start time
        const gameStartTime = clientInfo.gameStartTime || clientInfo.connectedAt;
        const gameDuration = gameStartTime ? Date.now() - gameStartTime : 0;
        
        // Update client info
        clientInfo.playerAddress = normalizedAddress;
        clientInfo.gameId = gameId;
        clientInfo.finalScore = finalScore;
        clientInfo.distance = distance;
        connectedClients.set(socket.id, clientInfo);
        
        // DB operations first - separate from blockchain operations
        let txId = null;
        let jumpsCount = 0;
        let isHighScore = false;
        
        const client = await pool.connect();
        try {
          // Begin transaction for database operations
          await client.query('BEGIN');
          
          try {
            // 1. Add transaction to queue table
            const result = await client.query(
              `INSERT INTO dino_transaction_queue 
               (player_address, game_id, type, score, timestamp, status) 
               VALUES ($1, $2, $3, $4, $5, $6) 
               RETURNING id`,
              [playerAddress, gameId, TX_TYPE_GAME_OVER, finalScore, Date.now(), 'pending']
            );
            
            txId = result.rows[0].id;
            
            // 2. Record game over event
            await client.query(
              `INSERT INTO dino_game_events 
               (game_id, player_address, event_type, event_data) 
               VALUES ($1, $2, $3, $4)`,
              [gameId, normalizedAddress, 'gameover', JSON.stringify({ 
                finalScore, 
                distance, 
                duration: gameDuration 
              })]
            );
            
            // 3. Check if this is a high score
            const playerBestScore = await client.query(
              `SELECT MAX(score) as best_score 
               FROM dino_leaderboard 
               WHERE player_address = $1`,
              [normalizedAddress]
            );
            
            const currentBest = playerBestScore?.rows[0]?.best_score 
              ? Number(playerBestScore.rows[0].best_score) 
              : 0;
            
            // It's only a high score if it beats the player's previous best
            const isPersonalBest = finalScore > currentBest;

            
            const numericScore = typeof finalScore === 'string' ? parseInt(finalScore, 10) : finalScore;

            if (isPersonalBest) {
              isHighScore = await isHighScoreForLeaderboard(client, numericScore, normalizedAddress);
            }

            if (isHighScore) {
              // Check if player already has a leaderboard entry
              const existingEntry = await client.query(
                `SELECT id, score FROM dino_leaderboard 
                 WHERE player_address = $1`,
                [normalizedAddress]
              );
              
              if (existingEntry.rows.length > 0) {
                // Player already exists in leaderboard - only update if new score is higher
                const currentHighScore = existingEntry.rows[0].score;
                if (finalScore > currentHighScore) {
                  await client.query(
                    `UPDATE dino_leaderboard 
                     SET score = $1, game_id = $2, achieved_at = NOW() 
                     WHERE player_address = $3`,
                    [finalScore, gameId, normalizedAddress]
                  );
                }
              } else {
                // New leaderboard entry
                await client.query(
                  `INSERT INTO dino_leaderboard 
                   (player_address, score, game_id) 
                   VALUES ($1, $2, $3)`,
                  [normalizedAddress, finalScore, gameId]
                );
                
                logger.info(`Added ${normalizedAddress} with score ${finalScore} to leaderboard`);
              }

              // Notify about high score
              io?.to(`player:${normalizedAddress}`).emit('server:highScore', {
                playerAddress: normalizedAddress,
                score: finalScore,
                gameId
              });
              logger.info(`Updated ${normalizedAddress} leaderboard entry with new high score ${finalScore}`);
            }
            
            // Commit database transaction
            await client.query('COMMIT');
          } catch (dbError) {
            // Rollback on error
            await client.query('ROLLBACK');
            throw dbError;
          }
        } finally {
          client.release();
        }
          
          // Acknowledge game over
          socket.emit('server:gameOver', {
            status: 'recorded',
            txId,
            gameId,
            finalScore,
            isHighScore,
            timestamp: Date.now()
          });
          
        } catch (err) {
          logger.error(`Error processing game over: ${err}`);
          socket.emit('server:error', {
            message: 'Failed to record game over'
          });
        }
      });
    
    // Handle leaderboard requests
    socket.on('client:getLeaderboard', async () => {
      try {
        const client = await pool.connect();
        try {
          const result = await client.query(
            `SELECT l.*, p.username 
             FROM dino_leaderboard l
             LEFT JOIN dino_player_profiles p ON l.player_address = p.player_address
             ORDER BY l.score DESC
             LIMIT 10`
          );
          
          socket.emit('server:leaderboard', {
            leaderboard: result.rows,
            timestamp: Date.now()
          });
        } finally {
          client.release();
        }
      } catch (err) {
        logger.error(`Error fetching leaderboard: ${err}`);
        socket.emit('server:error', {
          message: 'Failed to fetch leaderboard'
        });
      }
    });
    
    // Handle pending transaction count requests
    socket.on('client:getPendingCount', async () => {
      try {
        const count = await getPendingTransactionCount();
        socket.emit('server:pendingCount', {
          count,
          timestamp: Date.now()
        });
      } catch (err) {
        logger.error(`Error fetching pending count: ${err}`);
      }
    });
    
    // Handle client disconnect
    socket.on('disconnect', async () => {
      const clientInfo = connectedClients.get(socket.id);
      if (clientInfo) {
        // Update session status in database
        try {
          const client = await pool.connect();
          try {
            await client.query(
              'UPDATE dino_websocket_sessions SET status = $1, last_active_at = NOW() WHERE session_id = $2',
              ['disconnected', socket.id]
            );
            
            // If there was an active game, mark it as incomplete
            if (clientInfo.gameId && clientInfo.playerAddress) {
              await client.query(
                `UPDATE dino_player_sessions 
                 SET end_time = NOW(), completed = false 
                 WHERE game_id = $1 AND player_address = $2 AND end_time IS NULL`,
                [clientInfo.gameId, clientInfo.playerAddress.toLowerCase()]
              );
            }
          } finally {
            client.release();
          }
        } catch (err) {
          logger.error(`Error updating session on disconnect: ${err}`);
        }
        
        // Remove from tracked clients
        connectedClients.delete(socket.id);
      }
      
      logger.info(`Client disconnected: ${socket.id}`);
    });
  });
  
  // Helper function to get pending transaction count
  async function getPendingTransactionCount(): Promise<number> {
    try {
      const client = await pool.connect();
      try {
        const result = await client.query(
          'SELECT COUNT(*) FROM dino_transaction_queue WHERE status = $1',
          ['pending']
        );
        return parseInt(result.rows[0].count);
      } finally {
        client.release();
      }
    } catch (err) {
      logger.error('Error counting pending transactions:', err);
      return 0;
    }
  }

  // Start the server
  server.listen(PORT, () => {
    logger.info(`WebSocket server running on port ${PORT} (Worker ${process.pid})`);
  });
  
  // Broadcast wallet status every 5 seconds
  setInterval(broadcastWalletStatus, 5000);

  // Ensure proper shutdown
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down');
    if (analyticsService) {
      await analyticsService.shutdown();
    }
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.info('SIGINT received, shutting down');
    if (analyticsService) {
      await analyticsService.shutdown();
    }
    process.exit(0);
  });
}