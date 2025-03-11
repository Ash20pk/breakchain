// blockchainSync.js
import { io } from 'socket.io-client';
import { toast } from 'sonner';
import { getWalletState, config as wagmiConfig } from '../utils/wallet';
import { signMessage } from '@wagmi/core';

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
  // Get wallet state if available
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
    
    // If we have an address, authenticate immediately
    if (config.address) {
      authenticatePlayer(config.address);
    }
  });
  
  socket.on('disconnect', () => {
    console.log('WebSocket disconnected');
    updateState({ 
      ...state, 
      connected: false
    });
    
    toast.error('Connection to blockchain server lost', {
      description: 'Trying to reconnect...'
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
  });
  
  return {
    getState: () => state,
    subscribe,
    authenticatePlayer,
    startGame,
    endGame,
    recordJump,
    getLeaderboard,
    reconnect,
    disconnect
  };
}

// Helper function to update state and notify listeners
function updateState(newState) {
  state = newState;
  listeners.forEach(listener => listener(state));
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

// Authenticate player with wallet signature
export async function authenticatePlayer(playerAddress) {
  if (!socket || !playerAddress) return;
  
  try {
    // Create a message to sign
    const message = `Authenticate Dino Runner game session: ${Date.now()}`;
    
    // Get signature using Wagmi's signMessage
    const signature = await signMessage(wagmiConfig, {
      message,
    });
    
    // Send authentication request
    socket.emit('client:auth', {
      playerAddress,
      signature,
      message
    });
    
  } catch (err) {
    console.error('Error authenticating player:', err);
    toast.error('Authentication failed');
  }
}

// Start a new game
export async function startGame(playerAddress) {
  if (!socket || !state.connected || !playerAddress) {
    console.error("Cannot start game:", { 
      socketExists: !!socket, 
      connected: state.connected, 
      addressExists: !!playerAddress 
    });
    throw new Error('Not connected');
  }
  
  // Check if there's already an active game
  if (state.gameActive && state.gameId) {
    console.warn("Attempting to start a new game while another is active");
  }
  
  const gameId = `dino-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  console.log(`Initiating game start request for game ID: ${gameId}`);
  
  try {
    return await new Promise((resolve, reject) => {
      let isResolved = false;
      let timeoutId;
      
      // Add error event handling specifically for SQL errors
      const handleServerError = (data) => {
        if (isResolved) return;
        
        console.error("Server error event received:", data);
        socket.off('server:gameStart', handleGameStart);
        socket.off('server:error', handleServerError);
        
        isResolved = true;
        if (timeoutId) clearTimeout(timeoutId);
        
        if (data.message && data.message.includes("unique or exclusion constraint")) {
          reject(new Error("Database constraint error: You may already have an active game"));
        } else {
          reject(new Error(`Server error: ${data.message || 'Unknown error'}`));
        }
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
  if (!socket || !state.gameActive || !state.gameId || !playerAddress) {
    return;
  }
  
  socket.emit('client:jump', {
    gameId: state.gameId,
    playerAddress,
    height,
    score
  });
}

// End the game
export async function endGame(playerAddress, finalScore, distance) {
  if (!socket || !state.gameActive || !state.gameId || !playerAddress) {
    return;
  }
  
  socket.emit('client:gameOver', {
    gameId: state.gameId,
    playerAddress,
    finalScore,
    distance
  });
}

// Get leaderboard
export async function getLeaderboard() {
  if (!socket || !state.connected) {
    return;
  }
  
  socket.emit('client:getLeaderboard');
}

// Reconnect to server
export function reconnect() {
  if (socket) {
    socket.connect();
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
  authenticatePlayer,
  startGame,
  endGame,
  recordJump,
  getLeaderboard,
  reconnect,
  disconnect,
  subscribe,
  getState: () => state
};