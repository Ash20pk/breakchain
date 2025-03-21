import dotenv from 'dotenv';
import { Pool } from 'pg';
import { createWalletClient, createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { SomniaChain } from './chains';
import { DinoRunnerABI } from './abi';
import winston from 'winston';

// Load environment variables
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
    new winston.transports.File({ filename: 'recovery-server.log' })
  ]
});

// Constants
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || '';
const RECOVERY_INTERVAL = parseInt(process.env.RECOVERY_INTERVAL || '300000'); // Default 5 minutes
const BATCH_SIZE = parseInt(process.env.RECOVERY_BATCH_SIZE || '5');
const TX_AGE_LIMIT_HOURS = parseInt(process.env.TX_AGE_LIMIT_HOURS || '48'); // Default 48 hours
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || '5');
const WALLET_COUNT = parseInt(process.env.RECOVERY_WALLET_COUNT || '3'); // Default to 3 wallets in pool
const TX_TYPE_JUMP = 'jump';
const TX_TYPE_GAME_OVER = 'gameover';
const TX_TYPE_SET_PLAYER = 'setplayer';

// Initialize database pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

// Transaction types
interface Transaction {
  id: number;
  player_address: string;
  game_id: string;
  type: string;
  height?: number;
  score?: number;
  username?: string;
  timestamp: number;
  status: string;
  retries: number;
  hash?: string;
}

// Wallet status tracking
interface WalletStatus {
  index: number;
  address: string;
  isProcessing: boolean;
  lastTxHash?: string;
  lastProcessedTime?: number;
  totalProcessed: number;
  consecutiveErrors: number;
  nonce: bigint;
}

// Initialize blockchain clients with wallet pool
async function initializeBlockchain() {
  if (!CONTRACT_ADDRESS) {
    throw new Error('CONTRACT_ADDRESS environment variable is required');
  }

  const rpcUrl = process.env.RPC_URL || 'https://dream-rpc.somnia.network';
  logger.info(`Using RPC URL: ${rpcUrl}`);

  // Initialize public client
  const publicClient = createPublicClient({
    chain: SomniaChain,
    transport: http(rpcUrl, {
      timeout: 30000,
      retryCount: 3,
      retryDelay: 1000,
    })
  });
  
  // Initialize wallet pool
  const walletPool: Array<{
    walletClient: any;
    account: any;
    status: WalletStatus;
  }> = [];
  
  // Find wallet private keys from environment variables
  for (let i = 1; i <= WALLET_COUNT; i++) {
    const privateKeyEnvVar = `RECOVERY_PRIVATE_KEY_${i}`;
    const privateKey = process.env[privateKeyEnvVar];
    
    if (!privateKey) {
      logger.warn(`No private key found for wallet ${i} (${privateKeyEnvVar})`);
      continue;
    }
    
    try {
      // Ensure private key has 0x prefix
      const formattedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
      const account = privateKeyToAccount(formattedKey as `0x${string}`);
      
      // Initialize wallet client
      const walletClient = createWalletClient({
        account,
        chain: SomniaChain,
        transport: http(rpcUrl, {
          timeout: 30000,
          retryCount: 3,
          retryDelay: 1000,
        })
      });
      
      // Get initial nonce
      const nonce = await publicClient.getTransactionCount({
        address: account.address
      });
      
      // Create wallet status
      const status: WalletStatus = {
        index: i - 1,
        address: account.address,
        isProcessing: false,
        lastProcessedTime: Date.now(),
        totalProcessed: 0,
        consecutiveErrors: 0,
        nonce: BigInt(String(nonce || 0))
      };
      
      walletPool.push({ walletClient, account, status });
      
      logger.info(`Recovery wallet ${i} initialized: ${account.address}`);
      logger.info(`Current nonce for wallet ${i}: ${nonce}`);
    } catch (error) {
      logger.error(`Failed to initialize wallet ${i}:`, error);
    }
  }
  
  if (walletPool.length === 0) {
    throw new Error('No recovery wallets could be initialized. Please check your private key environment variables.');
  }
  
  logger.info(`Successfully initialized ${walletPool.length} recovery wallets`);
  
  return { publicClient, walletPool };
}

// Select the best wallet for a transaction
function selectWallet(walletPool: Array<{ walletClient: any; account: any; status: WalletStatus }>) {
  if (walletPool.length === 0) {
    return null;
  }
  
  // First try to find a wallet that's not currently processing
  const availableWallets = walletPool.filter(wallet => !wallet.status.isProcessing);
  
  if (availableWallets.length > 0) {
    // Sort by fewest consecutive errors, then by longest time since last processed
    availableWallets.sort((a, b) => {
      // First sort by consecutive errors
      if (a.status.consecutiveErrors !== b.status.consecutiveErrors) {
        return a.status.consecutiveErrors - b.status.consecutiveErrors;
      }
      
      // Then sort by last processed time (oldest first)
      return (a.status.lastProcessedTime || 0) - (b.status.lastProcessedTime || 0);
    });
    
    return availableWallets[0];
  }
  
  // If all wallets are busy, pick the one with the most processed transactions
  // (assuming it's the most reliable)
  return walletPool.reduce<{ walletClient: any; account: any; status: WalletStatus } | null>((best, current) => {
    if (!best || current.status.totalProcessed > best.status.totalProcessed) {
      return current;
    }
    return best;
  }, null);
}

// Fetch failed transactions
async function fetchFailedTransactions(): Promise<Transaction[]> {
  const client = await pool.connect();
  try {
    // Calculate timestamp for age limit
    const ageThreshold = Date.now() - (TX_AGE_LIMIT_HOURS * 60 * 60 * 1000);

    // Fetch failed transactions that are not too old and within retry limits
    const result = await client.query(
      `SELECT * FROM dino_transaction_queue 
       WHERE status = 'failed' 
       AND timestamp > $1
       AND retries < $2
       ORDER BY timestamp ASC
       LIMIT $3`,
      [ageThreshold, MAX_RETRIES, BATCH_SIZE]
    );

    return result.rows;
  } finally {
    client.release();
  }
}

// Process a failed transaction with a specific wallet
async function processTransaction(
  tx: Transaction, 
  wallet: { walletClient: any; account: any; status: WalletStatus },
  publicClient: any
): Promise<[boolean, string | undefined]> {
  const { walletClient, account, status } = wallet;
  
  try {
    let hash: string | undefined;
    
    // Mark wallet as processing
    status.isProcessing = true;
    
    // Update nonce for this wallet
    let currentNonce = status.nonce;
    
    // Log transaction details
    logger.info(`Processing failed transaction: ID=${tx.id}, Type=${tx.type}, Player=${tx.player_address} with Wallet ${status.index} (${account.address})`);

    // Handle different transaction types
    if (tx.type === TX_TYPE_JUMP) {
      // Record jump transaction
      const { request } = await publicClient.simulateContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        abi: DinoRunnerABI,
        functionName: 'recordJump',
        args: [
          tx.player_address as `0x${string}`,
          BigInt(String(tx.height || 0)),
          BigInt(String(tx.score || 0)),
          tx.game_id
        ],
        account: account,
        nonce: currentNonce
      });
      
      hash = await walletClient.writeContract(request);
      
    } else if (tx.type === TX_TYPE_GAME_OVER) {
      // Record game over transaction
      const { request } = await publicClient.simulateContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        abi: DinoRunnerABI,
        functionName: 'recordGameOver',
        args: [
          tx.player_address as `0x${string}`,
          BigInt(String(tx.score || 0)),
          tx.game_id
        ],
        account: account,
        nonce: currentNonce
      });
      
      hash = await walletClient.writeContract(request);
      
    } else if (tx.type === TX_TYPE_SET_PLAYER) {
      // Set player name
      const { request } = await publicClient.simulateContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        abi: DinoRunnerABI,
        functionName: 'setPlayer',
        args: [
          tx.player_address as `0x${string}`,
          tx.username || ""
        ],
        account: account,
        nonce: currentNonce
      });
      
      hash = await walletClient.writeContract(request);
    } else {
      logger.warn(`Unknown transaction type: ${tx.type}`);
      status.isProcessing = false;
      return [false, undefined];
    }

    // Update wallet status on success
    status.nonce = currentNonce + BigInt(1);
    status.lastTxHash = hash;
    status.lastProcessedTime = Date.now();
    status.totalProcessed += 1;
    status.consecutiveErrors = 0;
    status.isProcessing = false;

    logger.info(`Successfully sent transaction ${tx.id} with hash ${hash} using wallet ${status.index}`);
    return [true, hash];
  } catch (error) {
    // Update wallet status on error
    status.consecutiveErrors += 1;
    status.isProcessing = false;
    
    // If we get a nonce error, try to refresh the nonce from the blockchain
    const errorStr = String(error);
    if (errorStr.includes('nonce') || errorStr.includes('NONCE_TOO_LOW')) {
      try {
        const newNonce = await publicClient.getTransactionCount({
          address: account.address,
          blockTag: 'pending'
        });
        status.nonce = newNonce;
        logger.info(`Updated nonce for wallet ${status.index} to ${newNonce} after nonce error`);
      } catch (nonceError) {
        logger.error(`Failed to refresh nonce for wallet ${status.index}:`, nonceError);
      }
    }
    
    logger.error(`Error processing transaction ${tx.id} with wallet ${status.index}:`, error);
    return [false, undefined];
  }
}

// Update transaction status in the database
async function updateTransactionStatus(tx: Transaction, success: boolean, hash?: string, walletIndex?: number): Promise<void> {
  const client = await pool.connect();
  try {
    if (success && hash) {
      // Update to 'sent' status with hash and wallet_index
      await client.query(
        'UPDATE dino_transaction_queue SET status = $1, hash = $2, retries = retries + 1, wallet_index = $3 WHERE id = $4',
        ['sent', hash, walletIndex, tx.id]
      );
      logger.info(`Updated transaction ${tx.id} status to 'sent' with hash ${hash} (wallet ${walletIndex})`);
    } else {
      // Update retry count
      await client.query(
        'UPDATE dino_transaction_queue SET retries = retries + 1 WHERE id = $1',
        [tx.id]
      );
      logger.info(`Increased retry count for transaction ${tx.id}`);
    }
  } finally {
    client.release();
  }
}

// Main recovery process
async function runRecovery() {
  logger.info('Starting transaction recovery process');
  
  try {
    // Initialize blockchain
    const blockchain = await initializeBlockchain();
    const { publicClient, walletPool } = blockchain;
    
    // Fetch failed transactions
    const failedTransactions = await fetchFailedTransactions();
    
    if (failedTransactions.length === 0) {
      logger.info('No failed transactions to recover');
      return;
    }
    
    logger.info(`Found ${failedTransactions.length} failed transactions to recover`);
    logger.info(`Available wallets: ${walletPool.length}`);
    
    // Process each transaction
    for (const tx of failedTransactions) {
      try {
        // Select the best wallet for this transaction
        const selectedWallet = selectWallet(walletPool);
        
        if (!selectedWallet) {
          logger.error('No wallets available for processing');
          continue;
        }
        
        // Get fresh nonce before each transaction
        try {
          const freshNonce = await publicClient.getTransactionCount({
            address: selectedWallet.account.address,
            blockTag: 'pending'
          });
          
          // Use the greater of tracked nonce or fresh nonce
          if (freshNonce > selectedWallet.status.nonce) {
            selectedWallet.status.nonce = BigInt(String(freshNonce));
            logger.info(`Updated nonce for wallet ${selectedWallet.status.index} to ${freshNonce}`);
          }
        } catch (nonceError) {
          logger.warn(`Could not refresh nonce for wallet ${selectedWallet.status.index}, using stored value: ${selectedWallet.status.nonce}`);
        }
        
        // Process the transaction with selected wallet
        const [success, hash] = await processTransaction(tx, selectedWallet, publicClient);
        
        // Update status in database
        await updateTransactionStatus(tx, success, hash, selectedWallet.status.index);
        
        // Add a small delay between transactions
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        logger.error(`Error handling transaction ${tx.id}:`, error);
      }
    }
    
    // Log wallet statistics
    logger.info('Wallet pool status:');
    walletPool.forEach(wallet => {
      logger.info(`Wallet ${wallet.status.index} (${wallet.status.address}): processed=${wallet.status.totalProcessed}, errors=${wallet.status.consecutiveErrors}, nonce=${wallet.status.nonce}`);
    });
    
    logger.info('Transaction recovery process completed');
  } catch (error) {
    logger.error('Error in recovery process:', error);
  }
}

// Start the recovery server
async function startRecoveryServer() {
  logger.info('Transaction Recovery Server starting up');
  
  // Initial check
  await runRecovery();
  
  // Set up recurring checks
  setInterval(runRecovery, RECOVERY_INTERVAL);
  
  logger.info(`Recovery server running, checking every ${RECOVERY_INTERVAL / 1000} seconds`);
}

// Handle shutdown gracefully
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down');
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down');
  process.exit(0);
});

// Start the server
startRecoveryServer().catch(error => {
  logger.error('Failed to start recovery server:', error);
  process.exit(1);
});