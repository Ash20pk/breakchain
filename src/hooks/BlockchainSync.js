// src/hooks/BlockchainSync.js - Updated to handle wallet state changes
import { io } from 'socket.io-client';
import { toast } from 'sonner';
import { getWalletState } from '../utils/wallet';
import { getBlockchainEvents } from '../utils/blockchainEvents';

// Define module variables
let socket = null;
let state = {
  connected: false,
  pendingTxCount: 0,
  transactions: [],
  walletStatus: [],
  leaderboard: [],
  gameActive: false,
  gameId: null
};
let listeners = [];

// Initialize WebSocket connection
export function initialize(config = {}) {
  // Get wallet state if available - using updated getWalletState
  const walletState = getWalletState();
  if (walletState && walletState.address) {
    config.address = walletState.address;
  }
  
  const socketUrl = config.socketUrl || process.env.NEXT_PUBLIC_WEBSOCKET_URL || 'ws://localhost:3002';
  
  socket = io(socketUrl, {
    transports: ['websocket'],
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    timeout: 10000
  });
  
  socket.on('connect', () => {
    console.log('WebSocket connected');
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
  
  socket.on('disconnect', () => {
    console.log('WebSocket disconnected');
    updateState({ 
      ...state, 
      connected: false,
      gameActive: false 
    });
    
    // Dispatch connection event
    const events = getBlockchainEvents();
    if (events.CONNECTION_CHANGED) {
      document.dispatchEvent(new CustomEvent(events.CONNECTION_CHANGED, { 
        detail: { isConnected: false } 
      }));
    }
    
    toast.error('Connection to blockchain server lost', {
      description: 'Game paused. Trying to reconnect...'
    });
  });
  
  socket.on('connect_error', (error) => {
    console.error('Socket connection error:', error);
    updateState({ 
      ...state, 
      connected: false,
      gameActive: false
    });
    
    // Dispatch connection event
    const events = getBlockchainEvents();
    if (events.CONNECTION_CHANGED) {
      document.dispatchEvent(new CustomEvent(events.CONNECTION_CHANGED, { 
        detail: { isConnected: false, error: error.message } 
      }));
    }
    
    toast.error('Cannot connect to blockchain server', {
      description: 'Please check that the server is running'
    });
  });
  
  socket.on('server:status', (data) => {
    updateState({ 
      ...state, 
      pendingTxCount: data.pendingTransactions,
      walletStatus: data.walletStatus || []
    });
  });
  
  socket.on('server:pendingCount', (data) => {
    updateState({ ...state, pendingTxCount: data.count });
  });
  
  socket.on('server:walletStatus', (data) => {
    updateState({ ...state, walletStatus: data.wallets || [] });
  });
  
  socket.on('server:transactionUpdate', (data) => {
    // Add to transactions list
    const updatedTxs = [data, ...state.transactions].slice(0, 50);
    updateState({ ...state, transactions: updatedTxs });
    
    // Show toast notification based on transaction type
    if (data.status === 'sent') {
      if (data.type === 'gameover') {
        toast.success("Game Score Recorded!", {
          description: `Final score: ${data.score} | TX: ${data.hash?.slice(0, 6)}...`
        });
      } else if (data.type === 'jump') {
        toast.info("Jump Recorded", {
          description: `Score: ${data.score} | TX: ${data.hash?.slice(0, 6)}...`
        });
        
        // Dispatch jump recorded event
        const events = getBlockchainEvents();
        if (events.JUMP_RECORDED) {
          document.dispatchEvent(new CustomEvent(events.JUMP_RECORDED, { 
            detail: { hash: data.hash, score: data.score } 
          }));
        }
      }
    } else if (data.status === 'failed') {
      toast.error("Transaction Failed", {
        description: `Failed to record ${data.type}`
      });
    }
  });
  
  socket.on('server:gameStart', (data) => {
    if (data.status === 'started') {
      updateState({ 
        ...state, 
        gameActive: true,
        gameId: data.gameId
      });
      
      toast.success('Game started', {
        description: 'Your game is now being recorded on-chain!'
      });
    }
  });
  
  socket.on('server:gameOver', (data) => {
    updateState({ 
      ...state, 
      gameActive: false
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
  
  socket.on('server:leaderboard', (data) => {
    updateState({ ...state, leaderboard: data.leaderboard });
  });
  
  socket.on('server:highScore', (data) => {
    toast.success('New High Score Achieved!', {
      description: `Score: ${data.score}`,
      duration: 5000
    });
  });
  
  socket.on('server:error', (data) => {
    toast.error('Error', {
      description: data.message
    });
    
    // Dispatch error event
    const events = getBlockchainEvents();
    if (events.ERROR) {
      document.dispatchEvent(new CustomEvent(events.ERROR, { 
        detail: data
      }));
    }
  });
  
  // Listen for wallet state changes to update connections if needed
  document.addEventListener('WALLET_STATE_CHANGED', (event) => {
    // If wallet disconnects, we might want to handle that here
    const { address, isConnected } = event.detail;
    
    if (!isConnected && state.gameActive) {
      console.warn('Wallet disconnected during active game');
      // Handle disconnection during active game
    }
  });
  
  return {
    getState: () => state,
    subscribe,
    startGame,
    endGame,
    recordJump,
    getLeaderboard,
    reconnect,
    disconnect,
    isConnected: () => state.connected
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

// Start a new game
export async function startGame(playerAddress) {
  if (!socket) {
    toast.error('Cannot start game', {
      description: 'Socket not initialized'
    });
    throw new Error('Socket not initialized');
  }
  
  if (!state.connected) {
    toast.error('Cannot start game', {
      description: 'Not connected to blockchain server'
    });
    throw new Error('Not connected to blockchain server');
  }
  
  if (!playerAddress) {
    toast.error('Cannot start game', {
      description: 'Wallet not connected'
    });
    throw new Error('Wallet not connected');
  }

  // Check if there's already an active game
  if (state.gameActive && state.gameId) {
    console.warn("Attempting to start a new game while another is active");
    return state.gameId; // Return existing gameId if already active
  }
  
  const gameId = `dino-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  console.log(`Initiating game start request for game ID: ${gameId}`);
  
  try {
    return await new Promise((resolve, reject) => {
      let isResolved = false;
      let timeoutId;
      
      // Add error event handling
      const handleServerError = (data) => {
        if (isResolved) return;
        
        console.error("Server error event received:", data);
        socket.off('server:gameStart', handleGameStart);
        socket.off('server:error', handleServerError);
        
        isResolved = true;
        if (timeoutId) clearTimeout(timeoutId);
        
        reject(new Error(`Server error: ${data.message || 'Unknown error'}`));
      };
      
      // Handler function for game start confirmation
      const handleGameStart = (data) => {
        console.log(`Received game start response:`, data);
        
        // Prevent multiple resolution
        if (isResolved) {
          console.log("Already resolved, ignoring redundant response");
          return;
        }
        
        // Clear the timeout
        if (timeoutId) {
          console.log("Clearing timeout as server responded");
          clearTimeout(timeoutId);
        }
        
        // Mark as resolved
        isResolved = true;
        
        // Remove all listeners
        socket.off('server:gameStart', handleGameStart);
        socket.off('server:error', handleServerError);
        socket.off('error', handleError);
        
        if (data.status === 'started' && data.gameId === gameId) {
          console.log(`Game successfully started with ID: ${gameId}`);
          resolve(gameId);
        } else {
          console.error(`Game start failed, server returned:`, data);
          reject(new Error(`Failed to start game: ${data.status || 'unknown error'}`));
        }
      };
      
      // Handle potential socket errors
      const handleError = (error) => {
        if (isResolved) return;
        
        isResolved = true;
        console.error("Socket error during game start:", error);
        
        // Remove all listeners
        socket.off('server:gameStart', handleGameStart);
        socket.off('server:error', handleServerError);
        
        if (timeoutId) clearTimeout(timeoutId);
        
        reject(new Error(`Socket error: ${error.message || 'Unknown error'}`));
      };
      
      // Set up event listeners
      socket.once('server:gameStart', handleGameStart);
      socket.once('server:error', handleServerError);
      socket.once('error', handleError);
      
      // Set timeout for response (15 seconds)
      console.log("Setting 15-second timeout for game start response");
      timeoutId = setTimeout(() => {
        // Only reject if not already resolved
        if (isResolved) {
          console.log("Timeout triggered but already resolved, ignoring");
          return;
        }
        
        isResolved = true;
        console.error("Game start request timed out after 15 seconds");
        
        // Remove all listeners
        socket.off('server:gameStart', handleGameStart);
        socket.off('server:error', handleServerError);
        socket.off('error', handleError);
        
        reject(new Error('Game start request timed out'));
      }, 15000);
      
      // Send game start request
      console.log(`Emitting client:gameStart event with gameId ${gameId}`);
      socket.emit('client:gameStart', {
        gameId,
        playerAddress
      });
      
      // Double-check socket connection
      if (!socket.connected) {
        console.error("Socket not connected when trying to start game");
        clearTimeout(timeoutId);
        isResolved = true;
        
        // Remove all listeners
        socket.off('server:gameStart', handleGameStart);
        socket.off('server:error', handleServerError);
        socket.off('error', handleError);
        
        reject(new Error('Socket not connected'));
      }
    });
  } catch (error) {
    console.error("Game start error:", error);
    throw error;
  }
}

// Record a jump
export async function recordJump(playerAddress, height, score) {
  if (!socket || !state.connected) {
    console.warn('Cannot record jump: not connected to server');
    return false;
  }
  
  if (!state.gameActive || !state.gameId || !playerAddress) {
    console.warn('Cannot record jump: game not active or wallet not connected');
    return false;
  }
  
  socket.emit('client:jump', {
    gameId: state.gameId,
    playerAddress,
    height,
    score
  });
  
  return true;
}

// End the game
export async function endGame(playerAddress, finalScore, distance) {
  if (!socket || !state.connected) {
    console.warn('Cannot end game: not connected to server');
    return false;
  }
  
  if (!state.gameActive || !state.gameId || !playerAddress) {
    console.warn('Cannot end game: game not active or wallet not connected');
    return false;
  }
  
  socket.emit('client:gameOver', {
    gameId: state.gameId,
    playerAddress,
    finalScore,
    distance
  });
  
  return true;
}

// Get leaderboard
export async function getLeaderboard() {
  if (!socket || !state.connected) {
    console.warn('Cannot get leaderboard: not connected to server');
    return [];
  }
  
  socket.emit('client:getLeaderboard');
  return state.leaderboard;
}

// Reconnect to server
export function reconnect() {
  if (socket) {
    socket.connect();
    toast.info('Reconnecting to blockchain server...');
  }
}

// Disconnect from server
export function disconnect() {
  if (socket) {
    socket.disconnect();
  }
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
  isConnected: () => state.connected
};