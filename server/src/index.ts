// server/index.ts - High Performance WebSocket Transaction Server
import express from 'express';
import http from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { Pool } from 'pg';
import { createWalletClient, createPublicClient, http as viemHttp } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import dotenv from 'dotenv';
import { SomniaChain } from './chains';
import { DinoRunnerABI } from './abi';
import { createClient } from 'redis';
import winston from 'winston';
import os from 'os';
import cluster from 'cluster';

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

// Constants
const PORT = parseInt(process.env.PORT || '3001');
const WEBSOCKET_PING_INTERVAL = 30000; // 30s
const CLEANUP_INTERVAL = 3600000; // 1h
const WALLET_COUNT = parseInt(process.env.WALLET_COUNT || '3');
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || '';
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '5');
const USE_REDIS = process.env.USE_REDIS === 'true';
const WORKER_COUNT = process.env.WORKER_COUNT ? parseInt(process.env.WORKER_COUNT) : os.cpus().length;

// Transaction types
const TX_TYPE_JUMP = 'jump';
const TX_TYPE_GAME_OVER = 'gameover';

// Database connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Define Socket.IO event types
interface ClientToServerEvents {
  'client:auth': (data: { playerAddress: string; signature: string }) => void;
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
};

class BlockchainManager {
  private walletClients: any[] = [];
  private publicClient: any;
  private contractAddress: string;
  private abi: any[];
  private walletStatus: WalletStatus[] = [];
  private processingIntervals: NodeJS.Timeout[] = [];
  private pendingNonces: Map<number, bigint> = new Map();
  private isInitialized: boolean = false;

  constructor(contractAddress: string, abi: any[]) {
    this.contractAddress = contractAddress;
    this.abi = abi;
  }

  async initialize() {
    if (this.isInitialized) return;
    
    try {
      // Define wallet private keys
      const privateKeys = [];
      for (let i = 0; i < WALLET_COUNT; i++) {
        const key = process.env[`PRIVATE_KEY_${i+1}`] || '';
        if (key) privateKeys.push(key);
      }
      
      if (privateKeys.length === 0) {
        throw new Error('No private keys configured');
      }
      
      // Initialize RPC URL
      const rpcUrl = process.env.RPC_URL || 'https://dream-rpc.somnia.network';
      
      // Initialize public client
      this.publicClient = createPublicClient({
        chain: SomniaChain,
        transport: viemHttp(rpcUrl, {
          timeout: 30000,
        })
      });
      
      // Initialize wallet clients
      for (let i = 0; i < privateKeys.length; i++) {
        try {
          const account = privateKeyToAccount(privateKeys[i] as `0x${string}`);
          const walletClient = createWalletClient({
            account,
            chain: SomniaChain,
            transport: viemHttp(rpcUrl, {
              timeout: 30000,
            })
          });
          
          this.walletClients.push(walletClient);
          this.walletStatus.push({
            index: i,
            address: account.address,
            isProcessing: false,
            totalProcessed: 0,
            consecutiveErrors: 0
          });
          
          logger.info(`Wallet ${i} initialized with address ${account.address}`);
        } catch (error) {
          logger.error(`Failed to initialize wallet ${i}:`, error);
        }
      }
      
      this.isInitialized = true;
      logger.info(`Blockchain manager initialized with ${this.walletClients.length} wallets`);
      
      // Start processing for each wallet
      this.startProcessing();
      
    } catch (error) {
      logger.error('Blockchain manager initialization error:', error);
      throw error;
    }
  }

  startProcessing() {
    // Start transaction processing for each wallet
    for (let i = 0; i < this.walletClients.length; i++) {
      // Stagger wallet processing to avoid contention
      const interval = 200 + (i * 50);
      
      this.processingIntervals[i] = setInterval(
        () => this.processTransactionBatch(i),
        interval
      );
      
      logger.info(`Started processing for wallet ${i} with interval ${interval}ms`);
    }
  }

  stopProcessing() {
    for (let i = 0; i < this.processingIntervals.length; i++) {
      if (this.processingIntervals[i]) {
        clearInterval(this.processingIntervals[i]);
      }
    }
    logger.info('Stopped all transaction processing');
  }

  getWalletStatus(): WalletStatus[] {
    return [...this.walletStatus];
  }

  resetWallet(index: number) {
    if (index >= 0 && index < this.walletStatus.length) {
      this.walletStatus[index].consecutiveErrors = 0;
      logger.info(`Reset wallet ${index}`);
      
      // Restart processing if needed
      if (this.processingIntervals[index]) {
        clearInterval(this.processingIntervals[index]);
        this.processingIntervals[index] = setInterval(
          () => this.processTransactionBatch(index),
          200
        );
      }
    }
  }

  private async processTransactionBatch(walletIndex: number) {
    // Skip if this wallet is already processing or has too many errors
    if (
      !this.walletClients[walletIndex] || 
      this.walletStatus[walletIndex].isProcessing ||
      this.walletStatus[walletIndex].consecutiveErrors >= 5
    ) {
      return;
    }
    
    // Mark wallet as processing
    this.walletStatus[walletIndex].isProcessing = true;
    
    try {
      // Get batch of pending transactions
      const client = await pool.connect();
      
      try {
        // Start transaction
        await client.query('BEGIN');
        
        // Get batch of pending transactions using the function we created
        const result = await client.query(
          'SELECT * FROM get_next_pending_transactions($1)',
          [BATCH_SIZE]
        );
        
        const transactions = result.rows;
        
        if (transactions.length === 0) {
          // No pending transactions, release client and return
          await client.query('COMMIT');
          this.walletStatus[walletIndex].isProcessing = false;
          return;
        }
        
        // Process batch of transactions
        const wallet = this.walletClients[walletIndex];
        let processedCount = 0;
        let successCount = 0;
        
        
        // Process each transaction
        for (const tx of transactions) {
          try {
            let hash;
            
            if (tx.type === TX_TYPE_JUMP) {
              // Record jump transaction
              const { request } = await this.publicClient.simulateContract({
                address: this.contractAddress as `0x${string}`,
                abi: this.abi,
                functionName: 'recordJump',
                args: [
                  tx.player_address as `0x${string}`,
                  BigInt(tx.height),
                  BigInt(tx.score),
                  tx.game_id
                ],
                account: wallet.account
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
                  BigInt(tx.score),
                  tx.game_id
                ],
                account: wallet.account
              });
              
              hash = await wallet.writeContract(request);
            }
            
            // Update transaction status in database
            await client.query(
              'UPDATE dino_transaction_queue SET status = $1, hash = $2, wallet_index = $3 WHERE id = $4',
              ['sent', hash, walletIndex, tx.id]
            );
            
            // Increment counters
            processedCount++;
            successCount++;
            
            // Publish transaction update to Redis if enabled
            if (USE_REDIS) {
              await redisClient.publish('tx:processed', JSON.stringify({
                id: tx.id,
                player_address: tx.player_address,
                game_id: tx.game_id,
                type: tx.type,
                status: 'sent',
                hash,
                score: tx.score
              }));
            } else {
              // Broadcast directly if Redis not used
              broadcastTransactionUpdate({
                id: tx.id,
                player_address: tx.player_address,
                game_id: tx.game_id,
                type: tx.type,
                status: 'sent',
                hash,
                score: tx.score
              });
            }
            
            logger.info(`Wallet ${walletIndex} processed ${tx.type} transaction for ${tx.player_address}, hash: ${hash}`);
            
          } catch (err) {
            logger.error(`Wallet ${walletIndex} error processing transaction ${tx.id}:`, err);
            
            // Mark transaction as failed
            await client.query(
              'UPDATE dino_transaction_queue SET status = $1, retries = retries + 1 WHERE id = $2',
              ['failed', tx.id]
            );
            
            // Publish failure to Redis if enabled
            if (USE_REDIS) {
              await redisClient.publish('tx:processed', JSON.stringify({
                id: tx.id,
                player_address: tx.player_address,
                game_id: tx.game_id,
                type: tx.type,
                status: 'failed'
              }));
            } else {
              broadcastTransactionUpdate({
                id: tx.id,
                player_address: tx.player_address,
                game_id: tx.game_id,
                type: tx.type,
                status: 'failed'
              });
            }
          }
        }
        
        // Commit transaction
        await client.query('COMMIT');
        
        // Update wallet status
        this.walletStatus[walletIndex].lastProcessedTime = Date.now();
        this.walletStatus[walletIndex].totalProcessed += successCount;
        
        if (successCount > 0) {
          // Reset consecutive errors on success
          this.walletStatus[walletIndex].consecutiveErrors = 0;
        } else if (processedCount > 0) {
          // Increment consecutive errors only if we tried to process transactions
          this.walletStatus[walletIndex].consecutiveErrors += 1;
        }
        
        // Broadcast updated wallet status
        broadcastWalletStatus();
        
      } catch (dbError) {
        await client.query('ROLLBACK');
        logger.error(`Database error in wallet ${walletIndex}:`, dbError);
        this.walletStatus[walletIndex].consecutiveErrors += 1;
      } finally {
        client.release();
      }
      
    } catch (error) {
      logger.error(`Error in transaction processing for wallet ${walletIndex}:`, error);
      this.walletStatus[walletIndex].consecutiveErrors += 1;
    } finally {
      this.walletStatus[walletIndex].isProcessing = false;
    }
  }
}

// Create blockchain manager
const blockchainManager = new BlockchainManager(CONTRACT_ADDRESS, DinoRunnerABI);

// Master process setup - handles clustering and load balancing
if (cluster.isPrimary) {
  logger.info(`Master ${process.pid} is running`);
  
  // Check if this is a worker-only process
  if (process.env.WORKER_ONLY === 'true') {
    logger.info('Running in worker-only mode, no transaction processing');
  } else {
    // Initialize blockchain manager in the primary process
    blockchainManager.initialize().catch(err => {
      logger.error('Failed to initialize blockchain manager:', err);
      process.exit(1);
    });
  }

  // Fork workers for handling WebSocket connections
  for (let i = 0; i < WORKER_COUNT; i++) {
    cluster.fork();
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
  io!.on('connection', async (socket: ClientSocket) => {
    logger.info(`Client connected: ${socket.id}`);
    
    // Add to connected clients map
    connectedClients.set(socket.id, {
      id: socket.id,
      playerAddress: null,
      gameId: null,
      connectedAt: Date.now()
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
        const { playerAddress, signature } = data;
        
        // In a real app, verify the signature here
        // This is simplified for the example
        const isValid = true; // validateSignature(playerAddress, signature);
        
        if (isValid) {
          // Update client info
          const clientInfo = connectedClients.get(socket.id);
          if (clientInfo) {
            clientInfo.playerAddress = playerAddress;
            connectedClients.set(socket.id, clientInfo);
          }
          
          // Store session in database
          const client = await pool.connect();
          try {
            await client.query(
              'INSERT INTO dino_websocket_sessions (session_id, player_address, status) VALUES ($1, $2, $3)',
              [socket.id, playerAddress, 'active']
            );
          } finally {
            client.release();
          }
          
          // Join player-specific room
          socket.join(`player:${playerAddress}`);
          
          // Acknowledge successful auth
          socket.emit('server:auth', {
            status: 'authenticated',
            playerAddress
          });
          
          logger.info(`Client ${socket.id} authenticated as ${playerAddress}`);
        } else {
          socket.emit('server:auth', {
            status: 'error',
            message: 'Invalid signature'
          });
        }
      } catch (err) {
        logger.error(`Error in client authentication: ${err}`);
        socket.emit('server:auth', {
          status: 'error',
          message: 'Authentication failed'
        });
      }
    });
    
    // Handle game session start
    socket.on('client:gameStart', async (data) => {
      try {
        const { gameId, playerAddress } = data;
        const clientInfo = connectedClients.get(socket.id);
        
        // Make sure we have a valid client info
        if (!clientInfo) {
          socket.emit('server:error', {
            message: 'Invalid session'
          });
          return;
        }
        
        // Update client info with the player address directly
        clientInfo.playerAddress = playerAddress;
        clientInfo.gameId = gameId;
        connectedClients.set(socket.id, clientInfo);
        
        // Join game-specific room
        socket.join(`game:${gameId}`);
        socket.join(`player:${playerAddress}`); // Also join the player-specific room
        
        // Store game session in database
        const client = await pool.connect();
        try {
          // First check if session exists
          const sessionResult = await client.query(
            'SELECT * FROM dino_websocket_sessions WHERE session_id = $1',
            [socket.id]
          );
          
          // Insert or update session info
          if (sessionResult.rowCount === 0) {
            // Session doesn't exist, insert new record
            try {
              await client.query(
                'INSERT INTO dino_websocket_sessions (session_id, player_address, status) VALUES ($1, $2, $3)',
                [socket.id, playerAddress, 'active']
              );
            } catch (err) {
              // If insert fails due to unique constraint, try update instead
              logger.warn('Session insert failed, trying update:', err);
              await client.query(
                'UPDATE dino_websocket_sessions SET player_address = $1, status = $2, last_active_at = NOW() WHERE session_id = $3',
                [playerAddress, 'active', socket.id]
              );
            }
          } else {
            // Session exists, update it
            await client.query(
              'UPDATE dino_websocket_sessions SET player_address = $1, status = $2, last_active_at = NOW() WHERE session_id = $3',
              [playerAddress, 'active', socket.id]
            );
          }
          
          // Check for any existing active game sessions for this player and close them
          await client.query(
            `UPDATE dino_player_sessions 
             SET end_time = NOW(), completed = false 
             WHERE player_address = $1 AND end_time IS NULL AND game_id != $2`,
            [playerAddress, gameId]
          );
          
          // Then create the new game session
          try {
            await client.query(
              'INSERT INTO dino_player_sessions (player_address, game_id) VALUES ($1, $2)',
              [playerAddress, gameId]
            );
          } catch (err) {
            logger.error(`Error creating game session: ${err}`);
            
            // Check if this game session already exists
            const existingGame = await client.query(
              'SELECT * FROM dino_player_sessions WHERE player_address = $1 AND game_id = $2',
              [playerAddress, gameId]
            );
            
            if (existingGame.rowCount === 0) {
              // If it doesn't exist but insert failed for another reason, rethrow
              socket.emit('server:error', {
                message: 'Failed to create game session: Database error'
              });
              throw err;
            } else {
              // Game already exists, we can continue
              logger.info(`Game session already exists for player ${playerAddress}, game ${gameId}`);
            }
          }
        } catch (err) {
          logger.error(`Database error in game start: ${err}`);
          socket.emit('server:error', {
            message: 'Database error starting game'
          });
          client.release();
          return;
        } finally {
          client.release();
        }
        
        // Acknowledge game start
        socket.emit('server:gameStart', {
          status: 'started',
          gameId,
          timestamp: Date.now()
        });
        
        logger.info(`Game ${gameId} started for player ${playerAddress}`);
      } catch (err) {
        logger.error(`Error starting game: ${err}`);
        socket.emit('server:error', {
          message: 'Failed to start game'
        });
      }
    });
    
    // Similarly update game over handler
    socket.on('client:gameOver', async (data) => {
      try {
        const { gameId, playerAddress, finalScore, distance } = data;
        const clientInfo = connectedClients.get(socket.id);
        
        // More permissive check
        if (!clientInfo) {
          socket.emit('server:error', {
            message: 'Invalid session'
          });
          return;
        }
        
        // Update client info if needed
        if (clientInfo.playerAddress !== playerAddress) {
          clientInfo.playerAddress = playerAddress;
        }
        if (clientInfo.gameId !== gameId) {
          clientInfo.gameId = gameId;
        }
        
        connectedClients.set(socket.id, clientInfo);
        
        // Rest of the game over handler code remains the same
        const client = await pool.connect();
        try {
          // Add transaction to queue
          const result = await client.query(
            `INSERT INTO dino_transaction_queue 
             (player_address, game_id, type, score, timestamp, status) 
             VALUES ($1, $2, $3, $4, $5, $6) 
             RETURNING id`,
            [playerAddress, gameId, TX_TYPE_GAME_OVER, finalScore, Date.now(), 'pending']
          );
          
          const txId = result.rows[0].id;
          
          // Update game session in database
          await client.query(
            `UPDATE dino_player_sessions 
             SET end_time = NOW(), final_score = $1, distance_traveled = $2, completed = true 
             WHERE game_id = $3 AND player_address = $4`,
            [finalScore, distance, gameId, playerAddress]
          );
          
          // Record game over event
          await client.query(
            `INSERT INTO dino_game_events 
             (game_id, player_address, event_type, event_data) 
             VALUES ($1, $2, $3, $4)`,
            [gameId, playerAddress, 'gameover', JSON.stringify({ finalScore, distance })]
          );
          
          // Check if this is a high score
          const leaderboardResult = await client.query(
            `SELECT COUNT(*) FROM dino_leaderboard 
             WHERE score <= $1 AND player_address != $2`,
            [finalScore, playerAddress]
          );
          
          const isHighScore = parseInt(leaderboardResult.rows[0].count) > 0;
          
          if (isHighScore) {
            // Add to leaderboard
            await client.query(
              `INSERT INTO dino_leaderboard 
               (player_address, score, game_id) 
               VALUES ($1, $2, $3)`,
              [playerAddress, finalScore, gameId]
            );
            
            // Notify about high score
            io?.to(`player:${playerAddress}`).emit('server:highScore', {
              playerAddress,
              score: finalScore,
              gameId
            });
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
          
          logger.info(`Game over recorded for ${playerAddress}, score: ${finalScore}`);
        } finally {
          client.release();
        }
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
                [clientInfo.gameId, clientInfo.playerAddress]
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
}