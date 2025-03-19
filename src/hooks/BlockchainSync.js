// src/hooks/BlockchainSync.js - With Server Issue Workaround
import { io } from 'socket.io-client';
import { toast } from 'sonner';
import { getWalletState } from '../utils/WalletBridge';
import { getBlockchainEvents } from '../utils/blockchainEvents';

// Debug flag
const DEBUG = import.meta.env.VITE_DEBUG === 'true';

// DEV MODE 
const DEV_MODE = import.meta.env.VITE_DEV_MODE === 'true';


// Define module variables
let socket = null;
let state = {
  connected: false,
  pendingTxCount: 0,
  transactions: [],
  walletStatus: [],
  leaderboard: [],
  gameActive: false,
  gameId: null,
  playerAddress: null,
  authenticated: false
};
let listeners = [];

// Initialize WebSocket connection
export function initialize(config = {}) {
  // If socket already exists, check its state
  if (socket) {
    if (DEBUG) console.log('BlockchainSync: Socket exists, checking connection:', socket.connected);
    
    // If socket exists but not connected, try to reconnect
    if (!socket.connected) {
      if (DEBUG) console.log('BlockchainSync: Socket exists but not connected - reconnecting');
      socket.connect();
    }
    
    return createAPI();
  }
  
  // Get wallet state from WalletBridge
  const walletState = getWalletState();
  if (walletState && walletState.address) {
    config.address = walletState.address;
    if (DEBUG) console.log('BlockchainSync: Wallet state from bridge:', walletState);
  }
  
  // Use default URL if none provided
  const socketUrl = import.meta.env.VITE_WEBSOCKET_URL || 'ws://localhost:3002';
  
  if (DEBUG) console.log(`BlockchainSync: Initializing new socket to ${socketUrl}`);
  
  // Create new socket
  socket = io(socketUrl, {
    transports: ['websocket'],
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    timeout: 10000
  });
  
  // Socket connect handler
  socket.on('connect', () => {
    if (DEBUG) console.log('BlockchainSync: WebSocket CONNECTED');
    updateState({ ...state, connected: true });
    
    // Dispatch connection event
    const events = getBlockchainEvents();
    if (events.CONNECTION_CHANGED) {
      document.dispatchEvent(new CustomEvent(events.CONNECTION_CHANGED, { 
        detail: { isConnected: true } 
      }));
    }
    
    toast.success('Connected to Blockchain', {
      description: 'Ready to record game data'
    });
  });
  
  // Socket disconnect handler
  socket.on('disconnect', () => {
    if (DEBUG) console.log('BlockchainSync: WebSocket DISCONNECTED');
    updateState({ 
      ...state, 
      connected: false,
      gameActive: false,
      gameId: null
    });
    
    // Dispatch connection event
    const events = getBlockchainEvents();
    if (events.CONNECTION_CHANGED) {
      document.dispatchEvent(new CustomEvent(events.CONNECTION_CHANGED, { 
        detail: { isConnected: false } 
      }));
    }
    
    toast.error('Connection to blockchain server lost');
  });
  
  // Socket error handler
  socket.on('connect_error', (error) => {
    console.error('BlockchainSync: Socket connection error:', error.message);
    updateState({ 
      ...state, 
      connected: false,
      gameActive: false,
      gameId: null
    });
    
    // Dispatch connection event
    const events = getBlockchainEvents();
    if (events.CONNECTION_CHANGED) {
      document.dispatchEvent(new CustomEvent(events.CONNECTION_CHANGED, { 
        detail: { isConnected: false, error: error.message } 
      }));
    }
    
    toast.error('Cannot connect to blockchain server', {
      description: error.message
    });
  });
  
  // Server status update
  socket.on('server:status', (data) => {
    if (DEBUG) console.log('BlockchainSync: Received server status:', data);
    updateState({ 
      ...state, 
      pendingTxCount: data.pendingTransactions,
      walletStatus: data.walletStatus || []
    });
  });
  
  // Game start handler
  socket.on('server:gameStart', (data) => {
    if (DEBUG) console.log('BlockchainSync: Received game start response:', data);
    
    if (data.status === 'started') {
      if (DEBUG) console.log(`BlockchainSync: Game started with ID: ${data.gameId}`);
      
      updateState({ 
        ...state, 
        gameActive: true,
        gameId: data.gameId
      });
      
      toast.success('Game started', {
        description: 'Your game is now being recorded on-chain!'
      });
    } else {
      console.warn('BlockchainSync: Received game start with unexpected status:', data.status);
    }
  });
  
  // Game over handler
  socket.on('server:gameOver', (data) => {
    if (DEBUG) console.log(`BlockchainSync: Game over received for game:`, data);
    
    updateState({ 
      ...state, 
      gameActive: false,
      gameId: null
    });
    
    // Dispatch game end event
    const events = getBlockchainEvents();
    if (events.GAME_END) {
      document.dispatchEvent(new CustomEvent(events.GAME_END, { 
        detail: data
      }));
    }
    
    if (data.isHighScore) {
      toast.success('New High Score!', {
        description: `Your score of ${data.finalScore} has been recorded on-chain!`
      });
    }
  });
  
  // Transaction update handler
  socket.on('server:transactionUpdate', (data) => {
    if (DEBUG) console.log('BlockchainSync: Transaction update received:', data);
    
    // Add to transactions list
    const updatedTxs = [data, ...state.transactions].slice(0, 50);
    updateState({ ...state, transactions: updatedTxs });
    
    // Show appropriate notifications
    if (data.status === 'sent') {
      if (data.type === 'gameover') {
        toast.success("Game Score Recorded!", {
          description: `Final score: ${data.score} | TX: ${data.hash?.slice(0, 6)}...`
        });
      } else if (data.type === 'jump') {
        toast.info("Jump Recorded", {
          description: `Score: ${data.score} | TX: ${data.hash?.slice(0, 6)}...`
        });
      }
    } else if (data.status === 'failed') {
      toast.error("Transaction Failed", {
        description: `Failed to record ${data.type}`
      });
    }
  });
  
  // Server error handler
  socket.on('server:error', (data) => {
    console.error('BlockchainSync: Server error received:', data);
    toast.error('Blockchain Server Error', {
      description: data.message || 'Unknown server error'
    });
  });
  
  return createAPI();
}

// Create API object
function createAPI() {
  return {
    getState: () => state,
    subscribe,
    startGame,
    endGame,
    recordJump,
    getLeaderboard,
    reconnect,
    disconnect,
    isConnected: () => socket && socket.connected,
    authenticateUser,
    checkUsername
  };
}

// Helper function to update state and notify listeners
function updateState(newState) {
  state = newState;
  listeners.forEach(listener => listener(state));
  
  // Notify UI about transaction count
  const events = getBlockchainEvents();
  if (events.TRANSACTION_UPDATED) {
    document.dispatchEvent(new CustomEvent(events.TRANSACTION_UPDATED, { 
      detail: { pendingCount: state.pendingTxCount } 
    }));
  }
}

// Subscribe to state changes
export function subscribe(listener) {
  listeners.push(listener);
  listener(state);
  
  // Return unsubscribe function
  return () => {
    listeners = listeners.filter(l => l !== listener);
  };
}

// Start a new game with WORKAROUND for server not responding
export async function startGame(playerAddress) {
  console.log(`BlockchainSync: startGame called with address: ${playerAddress}`);
  
  // Check basic requirements
  if (!socket) {
    console.error('BlockchainSync: Cannot start game - no socket');
    return null;
  }
  
  if (!socket.connected) {
    console.error('BlockchainSync: Socket not connected');
    
    // If in DEV_MODE, proceed anyway with fake game
    if (DEV_MODE) {
      console.warn('BlockchainSync: DEV MODE - Creating fake game session despite connection issues');
    } else {
      return null;
    }
  }
  
  if (!playerAddress) {
    console.error('BlockchainSync: Cannot start game - no player address');
    return null;
  }
  
  // Generate a unique game ID
  const gameId = `dino-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  console.log(`BlockchainSync: Starting new game with ID: ${gameId}`);
  
  try {
    // Get player username if available
    const username = state.username || '';
    
    // Send the game start request to the server with username
    if (socket.connected) {
      console.log(`BlockchainSync: Emitting gameStart request for ${gameId} with username ${username}`);
      socket.emit('client:gameStart', {
        gameId,
        playerAddress,
        username
      });
    }
    
    // WORKAROUND for server not responding: create a local game session immediately
    if (DEV_MODE) {
      console.log(`BlockchainSync: DEV MODE - Creating local game session immediately`);
      
      // Short pause for visual consistency
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Update the state
      updateState({
        ...state,
        gameActive: true,
        gameId: gameId
      });
      
      toast.success('Game started (DEV MODE)', {
        description: 'Local game session active'
      });
      
      console.log(`BlockchainSync: DEV MODE - Local game session started with ID: ${gameId}`);
      return gameId;
    }
    
    // For non-DEV mode, wait for server confirmation (with timeout)
    return new Promise((resolve, reject) => {
      // Listen for server response
      const handleGameStart = (data) => {
        if (data.gameId !== gameId) return;
        
        // Clean up listener
        socket.off('server:gameStart', handleGameStart);
        
        if (data.status === 'started') {
          resolve(gameId);
        } else {
          reject(new Error(`Game start failed: ${data.status}`));
        }
      };
      
      socket.once('server:gameStart', handleGameStart);
      
      // Set timeout
      setTimeout(() => {
        socket.off('server:gameStart', handleGameStart);
        reject(new Error('Game start timeout after 10 seconds'));
      }, 10000);
    });
  } catch (error) {
    console.error('BlockchainSync: Error starting game:', error);
    
    if (DEV_MODE) {
      // In DEV mode, still return the game ID to allow local gameplay
      return gameId;
    }
    
    return null;
  }
}

// Record a jump - with DEV MODE support
export async function recordJump(playerAddress, height, score) {
  // Check requirements
  if (!socket || !socket.connected) {
    if (!DEV_MODE) {
      console.warn('BlockchainSync: Cannot record jump - socket not connected');
      return false;
    }
    console.warn('BlockchainSync: DEV MODE - Recording jump locally despite connection issues');
  }
  
  if (!state.gameActive || !state.gameId) {
    console.warn('BlockchainSync: Cannot record jump - no active game', {
      gameActive: state.gameActive,
      gameId: state.gameId
    });
    return false;
  }
  
  if (!playerAddress) {
    console.warn('BlockchainSync: Cannot record jump - no player address');
    return false;
  }
  
  // Record the jump if connected
  if (socket.connected) {
    console.log(`BlockchainSync: Recording jump for game ${state.gameId}`);
    socket.emit('client:jump', {
      gameId: state.gameId,
      playerAddress,
      height,
      score
    });
  } else if (DEV_MODE) {
    console.log(`BlockchainSync: DEV MODE - Logging jump locally: score=${score}, height=${height}`);
  }
  
  return true;
}

// End the game - with DEV MODE support
export async function endGame(playerAddress, finalScore, distance) {
  // Check requirements
  if (!socket || !socket.connected) {
    if (!DEV_MODE) {
      console.warn('BlockchainSync: Cannot end game - socket not connected');
      return false;
    }
    console.warn('BlockchainSync: DEV MODE - Ending game locally despite connection issues');
  }
  
  if (!state.gameActive || !state.gameId) {
    console.warn('BlockchainSync: Cannot end game - no active game', {
      gameActive: state.gameActive,
      gameId: state.gameId
    });
    return false;
  }
  
  if (!playerAddress) {
    console.warn('BlockchainSync: Cannot end game - no player address');
    return false;
  }
  
  // Record game end if connected
  if (socket.connected) {
    console.log(`BlockchainSync: Ending game ${state.gameId} with score ${finalScore}`);
    socket.emit('client:gameOver', {
      gameId: state.gameId,
      playerAddress,
      finalScore,
      distance
    });
  } else if (DEV_MODE) {
    console.log(`BlockchainSync: DEV MODE - Logging game end locally: score=${finalScore}`);
  }
  
  // Update state immediately
  updateState({
    ...state,
    gameActive: false,
    gameId: null
  });
  
  return true;
}

// Get leaderboard
export async function getLeaderboard() {
  if (!socket || !socket.connected) {
    console.warn('BlockchainSync: Cannot get leaderboard - not connected');
    return [];
  }
  
  socket.emit('client:getLeaderboard');
  return state.leaderboard;
}

// Reconnect to server
export function reconnect() {
  console.log('BlockchainSync: Reconnect called');
  
  if (!socket) {
    console.log('BlockchainSync: No socket to reconnect, initializing...');
    initialize();
    return;
  }
  
  if (socket.connected) {
    console.log('BlockchainSync: Socket already connected');
    return;
  }
  
  console.log('BlockchainSync: Attempting to reconnect socket...');
  socket.connect();
}

// Disconnect from server
export function disconnect() {
  if (socket && socket.connected) {
    console.log('BlockchainSync: Disconnecting socket');
    socket.disconnect();
    
    updateState({
      ...state,
      connected: false,
      gameActive: false,
      gameId: null
    });
  }
}

export function checkUsername(playerAddress) {
  return new Promise((resolve, reject) => {
    if (!socket || !socket.connected) {
      reject(new Error('Socket not connected'));
      return;
    }

    socket.emit('client:checkUsername', { playerAddress });
    
    socket.once('server:usernameCheck', (response) => {
      resolve(response);
    });

    setTimeout(() => reject(new Error('Username check timed out')), 5000);
  });
}

// Authenticate user with their wallet address
export function authenticateUser(playerAddress, username, callback) {
  if (!socket) {
    console.error('BlockchainSync: Cannot authenticate - no socket');
    if (callback) callback({ success: false, message: 'No socket connection' });
    return false;
  }
  
  if (!socket.connected) {
    console.error('BlockchainSync: Cannot authenticate - socket not connected');
    if (callback) callback({ success: false, message: 'Socket not connected' });
    return false;
  }
  
  if (!playerAddress) {
    console.error('BlockchainSync: Cannot authenticate - no player address');
    if (callback) callback({ success: false, message: 'No player address provided' });
    return false;
  }
  
  console.log(`BlockchainSync: Authenticating user with address ${playerAddress} and username ${username}`);
  
  // Set up one-time listener for auth response
  socket.once('server:auth', (response) => {
    console.log('BlockchainSync: Received authentication response:', response);
    
    if (response.status === 'authenticated') {
      console.log(`BlockchainSync: User ${playerAddress} authenticated successfully`);
      
      // Update state with username if provided
      updateState({
        ...state,
        playerAddress: playerAddress,
        username: username,
        authenticated: true
      });
      
      // Show success toast
      toast.success('Wallet Connected', {
        description: username ? `Welcome, ${username}!` : 'Your wallet is now connected to the game'
      });
      
      if (callback) callback({ success: true, playerAddress, username });
    } else {
      console.error(`BlockchainSync: Authentication failed:`, response.message);
      
      // Show error toast
      toast.error('Authentication Failed', {
        description: response.message || 'Could not connect wallet'
      });
      
      if (callback) callback({ success: false, message: response.message });
    }
  });
  
  // Set timeout for auth response
  const authTimeout = setTimeout(() => {
    socket.off('server:auth'); // Remove the listener to prevent memory leaks
    console.error('BlockchainSync: Authentication timeout after 5 seconds');
    
    toast.error('Authentication Timeout', {
      description: 'Server did not respond in time'
    });
    
    if (callback) callback({ success: false, message: 'Authentication timeout' });
  }, 5000);
  
  // Send auth request with username
  socket.emit('client:auth', { 
    playerAddress: playerAddress,
    username: username
  });
  
  // Clear timeout when response is received
  socket.once('server:auth', () => {
    clearTimeout(authTimeout);
  });
  
  return true;
}

// Export the module functions
export default {
  initialize,
  startGame,
  endGame,
  recordJump,
  getLeaderboard,
  reconnect,
  disconnect,
  subscribe,
  getState: () => state,
  isConnected: () => socket && socket.connected,
  authenticateUser,
  checkUsername
};