// hooks/useBlockchainSync.ts
import { useEffect, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { toast } from 'sonner';
import { useAccount, useSignMessage } from 'wagmi';

// Define types
interface Transaction {
  id: number;
  player_address: string;
  game_id: string;
  type: string;
  height?: number;
  score: number;
  status: string;
  hash?: string;
  timestamp: number;
}

interface WalletStatus {
  index: number;
  address: string;
  isProcessing: boolean;
  totalProcessed: number;
  consecutiveErrors: number;
}

interface BlockchainSyncState {
  connected: boolean;
  pendingTxCount: number;
  transactions: Transaction[];
  walletStatus: WalletStatus[];
  leaderboard: any[];
  gameActive: boolean;
  gameId: string | null;
}

interface BlockchainSyncActions {
  startGame: () => Promise<string>;
  endGame: (finalScore: number, distance: number) => Promise<void>;
  recordJump: (height: number, score: number) => Promise<void>;
  getLeaderboard: () => Promise<void>;
  reconnect: () => void;
  disconnect: () => void;
}

// Custom hook for blockchain synchronization
export function useBlockchainSync(): [BlockchainSyncState, BlockchainSyncActions] {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [state, setState] = useState<BlockchainSyncState>({
    connected: false,
    pendingTxCount: 0,
    transactions: [],
    walletStatus: [],
    leaderboard: [],
    gameActive: false,
    gameId: null
  });

  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();

  // Connect to WebSocket server
  useEffect(() => {
    const socketUrl = process.env.NEXT_PUBLIC_WEBSOCKET_URL || 'ws://localhost:3002';
    
    const socketInstance = io(socketUrl, {
      transports: ['websocket'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 10000
    });
    
    socketInstance.on('connect', () => {
      console.log('WebSocket connected');
      setState(prev => ({ ...prev, connected: true }));
      
      // If we have an address, authenticate immediately
      if (address) {
        authenticatePlayer(address);
      }
    });
    
    socketInstance.on('disconnect', () => {
      console.log('WebSocket disconnected');
      setState(prev => ({ 
        ...prev, 
        connected: false
      }));
      
      toast.error('Connection to blockchain server lost', {
        description: 'Trying to reconnect...'
      });
    });
    
    socketInstance.on('server:status', (data) => {
      setState(prev => ({ 
        ...prev, 
        pendingTxCount: data.pendingTransactions,
        walletStatus: data.walletStatus || []
      }));
    });
    
    socketInstance.on('server:pendingCount', (data) => {
      setState(prev => ({ ...prev, pendingTxCount: data.count }));
    });
    
    socketInstance.on('server:walletStatus', (data) => {
      setState(prev => ({ ...prev, walletStatus: data.wallets || [] }));
    });
    
    socketInstance.on('server:transactionUpdate', (data) => {
      // Add to transactions list
      setState(prev => {
        const updatedTxs = [data, ...prev.transactions].slice(0, 50);
        return { ...prev, transactions: updatedTxs };
      });
      
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
    
    socketInstance.on('server:gameStart', (data) => {
      if (data.status === 'started') {
        setState(prev => ({ 
          ...prev, 
          gameActive: true,
          gameId: data.gameId
        }));
        
        toast.success('Game started', {
          description: 'Your game is now being recorded on-chain!'
        });
      }
    });
    
    socketInstance.on('server:gameOver', (data) => {
      setState(prev => ({ 
        ...prev, 
        gameActive: false
      }));
      
      if (data.isHighScore) {
        toast.success('New High Score!', {
          description: `Your score of ${data.finalScore} has been recorded on-chain!`
        });
      }
    });
    
    socketInstance.on('server:leaderboard', (data) => {
      setState(prev => ({ ...prev, leaderboard: data.leaderboard }));
    });
    
    socketInstance.on('server:highScore', (data) => {
      toast.success('New High Score Achieved!', {
        description: `Score: ${data.score}`,
        duration: 5000
      });
    });
    
    socketInstance.on('server:error', (data) => {
      toast.error('Error', {
        description: data.message
      });
    });
    
    // Set socket in state
    setSocket(socketInstance);
    
    // Cleanup on unmount
    return () => {
      socketInstance.disconnect();
    };
  }, []);

  // Authenticate player with wallet signature
  const authenticatePlayer = useCallback(async (playerAddress: string) => {
    if (!socket || !playerAddress) return;
    
    try {
      // Create a message to sign
      const message = `Authenticate Dino Runner game session: ${Date.now()}`;
      
      // Get signature
      const signature = await signMessageAsync({ message });
      
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
  }, [socket, signMessageAsync]);

  // // Re-authenticate when wallet address changes
  // useEffect(() => {
  //   if (socket && socket.connected && address && !state.authenticated) {
  //     authenticatePlayer(address);
  //   }
  // }, [socket, address, state.authenticated, authenticatePlayer]);


  // Action: Start a new game with enhanced timeout handling and debugging
  const startGame = useCallback(async (): Promise<string> => {
    if (!socket || !state.connected || !address) {
      console.error("Cannot start game:", { 
        socketExists: !!socket, 
        connected: state.connected, 
        addressExists: !!address 
      });
      throw new Error('Not connected');
    }
    
    // Check if there's already an active game
    if (state.gameActive && state.gameId) {
      console.warn("Attempting to start a new game while another is active");
      // You could choose to end the current game first or throw an error
    }
    
    const gameId = `dino-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    console.log(`Initiating game start request for game ID: ${gameId}`);
    
    try {
      return await new Promise<string>((resolve, reject) => {
        let isResolved = false;
        let timeoutId: NodeJS.Timeout;
        
        // Add error event handling specifically for SQL errors
        const handleServerError = (data: any) => {
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
        const handleGameStart = (data: any) => {
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
        const handleError = (error: any) => {
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
          playerAddress: address
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
  }, [socket, state.connected, state.gameActive, state.gameId, address]);

  // Action: Record a jump
  const recordJump = useCallback(async (height: number, score: number): Promise<void> => {
    if (!socket || !state.gameActive || !state.gameId || !address) {
      return;
    }
    
    socket.emit('client:jump', {
      gameId: state.gameId,
      playerAddress: address,
      height,
      score
    });
  }, [socket, state.gameActive, state.gameId, address]);

  // Action: End the game
  const endGame = useCallback(async (finalScore: number, distance: number): Promise<void> => {
    if (!socket || !state.gameActive || !state.gameId || !address) {
      return;
    }
    
    socket.emit('client:gameOver', {
      gameId: state.gameId,
      playerAddress: address,
      finalScore,
      distance
    });
  }, [socket, state.gameActive, state.gameId, address]);

  // Action: Get leaderboard
  const getLeaderboard = useCallback(async (): Promise<void> => {
    if (!socket || !state.connected) {
      return;
    }
    
    socket.emit('client:getLeaderboard');
  }, [socket, state.connected]);

  // Action: Reconnect to server
  const reconnect = useCallback(() => {
    if (socket) {
      socket.connect();
    }
  }, [socket]);

  // Action: Disconnect from server
  const disconnect = useCallback(() => {
    if (socket) {
      socket.disconnect();
    }
  }, [socket]);

  // Return state and actions
  return [
    state,
    {
      startGame,
      endGame,
      recordJump,
      getLeaderboard,
      reconnect,
      disconnect
    }
  ];
}

// Export a singleton instance for global state usage
let blockchainSyncInstance: ReturnType<typeof createBlockchainSyncInstance> | null = null;

// Type for the singleton instance
interface BlockchainSyncInstance {
  subscribe: (listener: (state: BlockchainSyncState) => void) => () => void;
  getState: () => BlockchainSyncState;
  startGame: (playerAddress: string) => Promise<string>;
  endGame: (playerAddress: string, finalScore: number, distance: number) => Promise<void>;
  recordJump: (playerAddress: string, height: number, score: number) => Promise<void>;
  getLeaderboard: () => Promise<void>;
  reconnect: () => void;
  disconnect: () => void;
}

function createBlockchainSyncInstance(): BlockchainSyncInstance {
  const listeners = new Set<(state: BlockchainSyncState) => void>();
  let currentState: BlockchainSyncState = {
    connected: false,
    pendingTxCount: 0,
    transactions: [],
    walletStatus: [],
    leaderboard: [],
    gameActive: false,
    gameId: null
  };
  
  const socketUrl = typeof window !== 'undefined' 
    ? (process.env.NEXT_PUBLIC_WEBSOCKET_URL || 'ws://localhost:3002')
    : '';
  
  // Create socket only on client side
  const socket = typeof window !== 'undefined'
    ? io(socketUrl, {
        transports: ['websocket'],
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        timeout: 10000
      })
    : null;
  
  // Helper to update state and notify listeners
  function updateState(updater: (state: BlockchainSyncState) => BlockchainSyncState) {
    currentState = updater(currentState);
    listeners.forEach(listener => listener(currentState));
  }
  
  // Setup socket event listeners
  if (socket) {
    socket.on('connect', () => {
      console.log('WebSocket connected (global)');
      updateState(prev => ({ ...prev, connected: true }));
    });
    
    socket.on('disconnect', () => {
      console.log('WebSocket disconnected (global)');
      updateState(prev => ({ 
        ...prev, 
        connected: false,
        authenticated: false
      }));
      
      toast.error('Connection to blockchain server lost', {
        description: 'Trying to reconnect...'
      });
    });
    
    socket.on('server:status', (data) => {
      updateState(prev => ({ 
        ...prev, 
        pendingTxCount: data.pendingTransactions,
        walletStatus: data.walletStatus || []
      }));
    });
    
    socket.on('server:auth', (data) => {
      if (data.status === 'authenticated') {
        updateState(prev => ({ ...prev, authenticated: true }));
        toast.success('Connected to blockchain network');
      } else {
        toast.error('Authentication failed', {
          description: data.message
        });
      }
    });
    
    socket.on('server:pendingCount', (data) => {
      updateState(prev => ({ ...prev, pendingTxCount: data.count }));
    });
    
    socket.on('server:walletStatus', (data) => {
      updateState(prev => ({ ...prev, walletStatus: data.wallets || [] }));
    });
    
    socket.on('server:transactionUpdate', (data) => {
      // Add to transactions list
      updateState(prev => {
        const updatedTxs = [data, ...prev.transactions].slice(0, 50);
        return { ...prev, transactions: updatedTxs };
      });
      
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
        updateState(prev => ({ 
          ...prev, 
          gameActive: true,
          gameId: data.gameId
        }));
        
        toast.success('Game started', {
          description: 'Your game is now being recorded on-chain!'
        });
      }
    });
    
    socket.on('server:gameOver', (data) => {
      updateState(prev => ({ 
        ...prev, 
        gameActive: false
      }));
      
      if (data.isHighScore) {
        toast.success('New High Score!', {
          description: `Your score of ${data.finalScore} has been recorded on-chain!`
        });
      }
    });
    
    socket.on('server:leaderboard', (data) => {
      updateState(prev => ({ ...prev, leaderboard: data.leaderboard }));
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
  }
  
  // Actions
  // async function authenticatePlayer(playerAddress: string, signMessage: (message: string) => Promise<string>) {
  //   if (!socket || !playerAddress) return;
    
  //   try {
  //     // Create a message to sign
  //     const message = `Authenticate Dino Runner game session: ${Date.now()}`;
      
  //     // Get signature
  //     const signature = await signMessage(message);
      
  //     // Send authentication request
  //     socket.emit('client:auth', {
  //       playerAddress,
  //       signature,
  //       message
  //     });
      
  //   } catch (err) {
  //     console.error('Error authenticating player:', err);
  //     toast.error('Authentication failed');
  //   }
  // }
  
  async function startGame(playerAddress: string): Promise<string> {
    if (!socket || !currentState.connected || !playerAddress) {
      throw new Error('Not connected');
    }
    
    const gameId = `dino-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    
    return new Promise((resolve, reject) => {
      // Set one-time listener for game start confirmation
      socket.once('server:gameStart', (data) => {
        if (data.status === 'started' && data.gameId === gameId) {
          resolve(gameId);
        } else {
          reject(new Error('Failed to start game'));
        }
      });
      
      // Set timeout for response
      const timeout = setTimeout(() => {
        socket.off('server:gameStart');
        reject(new Error('Game start request timed out'));
      }, 5000);
      
      // Send game start request
      socket.emit('client:gameStart', {
        gameId,
        playerAddress
      });
    });
  }
  
  async function recordJump(playerAddress: string, height: number, score: number): Promise<void> {
    if (!socket || !currentState.gameActive || !currentState.gameId || !playerAddress) {
      return;
    }
    
    socket.emit('client:jump', {
      gameId: currentState.gameId,
      playerAddress,
      height,
      score
    });
  }
  
  async function endGame(playerAddress: string, finalScore: number, distance: number): Promise<void> {
    if (!socket || !currentState.gameActive || !currentState.gameId || !playerAddress) {
      return;
    }
    
    socket.emit('client:gameOver', {
      gameId: currentState.gameId,
      playerAddress,
      finalScore,
      distance
    });
  }
  
  async function getLeaderboard(): Promise<void> {
    if (!socket || !currentState.connected) {
      return;
    }
    
    socket.emit('client:getLeaderboard');
  }
  
  function reconnect() {
    if (socket) {
      socket.connect();
    }
  }
  
  function disconnect() {
    if (socket) {
      socket.disconnect();
    }
  }
  
  return {
    subscribe(listener: (state: BlockchainSyncState) => void) {
      listeners.add(listener);
      listener(currentState);
      
      return () => {
        listeners.delete(listener);
      };
    },
    
    getState() {
      return currentState;
    },
    
    startGame,
    endGame,
    recordJump,
    getLeaderboard,
    reconnect,
    disconnect
  };
}

// Export a function to get the singleton instance
export function getBlockchainSync(): BlockchainSyncInstance {
  if (!blockchainSyncInstance && typeof window !== 'undefined') {
    blockchainSyncInstance = createBlockchainSyncInstance();
  }
  return blockchainSyncInstance as BlockchainSyncInstance;
}

// Hook for using the singleton in React components
export function useGlobalBlockchainSync(): [BlockchainSyncState, BlockchainSyncActions] {
  const [state, setState] = useState<BlockchainSyncState>(
    getBlockchainSync().getState()
  );
  
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  
  useEffect(() => {
    // Subscribe to state changes
    const unsubscribe = getBlockchainSync().subscribe(setState);
    return unsubscribe;
  }, []);
  
  // // Authenticate when address changes
  // useEffect(() => {
  //   if (address && !state.authenticated && state.connected) {
  //     getBlockchainSync().authenticatePlayer(
  //       address,
  //       async (message) => await signMessageAsync({ message })
  //     );
  //   }
  // }, [address, state.authenticated, state.connected, signMessageAsync]);
  
  // Wrap the actions to use the current address
  const actions: BlockchainSyncActions = {
    startGame: async () => {
      if (!address) throw new Error('No wallet address');
      return getBlockchainSync().startGame(address);
    },
    
    endGame: async (finalScore, distance) => {
      if (!address) return;
      return getBlockchainSync().endGame(address, finalScore, distance);
    },
    
    recordJump: async (height, score) => {
      if (!address) return;
      return getBlockchainSync().recordJump(address, height, score);
    },
    
    getLeaderboard: async () => {
      return getBlockchainSync().getLeaderboard();
    },
    
    reconnect: () => {
      getBlockchainSync().reconnect();
    },
    
    disconnect: () => {
      getBlockchainSync().disconnect();
    }
  };
  
  return [state, actions];
}