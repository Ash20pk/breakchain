// src/scenes/game/BlockchainManager.js - With Dev Mode Support
import BlockchainSync from '../../hooks/BlockchainSync';
import { getWalletState } from '../../utils/WalletBridge';
import CONFIG from '../../config/game';
import { toast } from 'sonner';

/**
 * Blockchain Manager
 * @class BlockchainManager
 */
class BlockchainManager {
  /**
   * Creates an instance of BlockchainManager
   * @param {Phaser.Events.EventEmitter} eventEmitter - The game EventEmitter
   */
  constructor(eventEmitter) {
    // Always enable debugging
    this.debug = true;
    
    if (this.debug) console.log('BlockchainManager: Constructor called');
    
    this.eventEmitter = eventEmitter;
    this.blockchainSync = BlockchainSync.initialize();
    this.isGameActive = false;
    this.currentGameId = null;
    this.isServerConnected = false;
    this.walletAddress = null;
    this.walletConnected = false;
    this.lastError = null;
    
    // Register event handlers
    if (this.debug) console.log('BlockchainManager: Registering event handlers');
    
    this.eventEmitter.on(CONFIG.EVENTS.GAME_START, this.onGameStart, this);
    this.eventEmitter.on(CONFIG.EVENTS.GAME_OVER, this.onGameOver, this);
    this.eventEmitter.on(CONFIG.EVENTS.GAME_RESTART, this.onGameStart, this); // Use same handler for restart
    this.eventEmitter.on(CONFIG.EVENTS.PLAYER_ACTION, this.onPlayerJump, this);
    
    // Listen for blockchain connection changes
    document.addEventListener('BLOCKCHAIN_CONNECTION_CHANGED', (event) => {
      this.isServerConnected = event.detail.isConnected;
      if (this.debug) console.log(`BlockchainManager: Server connection changed: ${this.isServerConnected}`);
    });
    
    // Listen for wallet state changes
    document.addEventListener('WALLET_STATE_CHANGED', (event) => {
      this.walletAddress = event.detail.address;
      this.walletConnected = event.detail.isConnected;
      if (this.debug) console.log(`BlockchainManager: Wallet state changed:`, event.detail);
    });
    
    // Initialize wallet state
    this.updateWalletState();
    
    // Check server connection (initial)
    this.isServerConnected = this.blockchainSync.isConnected();
    
    if (this.debug) console.log('BlockchainManager: Initialized with state:', {
      isServerConnected: this.isServerConnected,
      walletAddress: this.walletAddress,
      walletConnected: this.walletConnected
    });
  }
  
  /**
   * Update wallet state from the current global state
   */
  updateWalletState() {
    const walletState = getWalletState();
    if (walletState) {
      this.walletAddress = walletState.address;
      this.walletConnected = walletState.isConnected;
      if (this.debug) console.log('BlockchainManager: Wallet state updated:', walletState);
    }
  }

  /**
   * Handle game start/restart - this is the key function
   */
  async onGameStart() {
    console.log('BlockchainManager: GAME_START/RESTART event received');
    
    try {
      // Always reset state on game start/restart
      this.isGameActive = false;
      this.currentGameId = null;
      this.lastError = null;
      
      // Update connection states
      this.isServerConnected = this.blockchainSync.isConnected();
      this.updateWalletState();
      
      console.log('BlockchainManager: Current state before starting game:', {
        isServerConnected: this.isServerConnected,
        walletAddress: this.walletAddress,
        walletConnected: this.walletConnected
      });
      
      // In real mode, we'd check these requirements strictly
      // In DEV mode, we'll just log warnings but continue
      if (!this.walletConnected || !this.walletAddress) {
        console.warn('BlockchainManager: Starting game with no wallet connection');
      }
      
      // Start a new game with blockchain
      console.log(`BlockchainManager: Starting blockchain game with address: ${this.walletAddress}`);
      
      const gameId = await this.blockchainSync.startGame(this.walletAddress);
      
      if (gameId) {
        this.isGameActive = true;
        this.currentGameId = gameId;
        console.log(`BlockchainManager: Game successfully started with ID: ${gameId}`);
        
        // Log the final state
        console.log('BlockchainManager: State after game start:', {
          isGameActive: this.isGameActive,
          currentGameId: this.currentGameId
        });
      } else {
        console.error('BlockchainManager: Failed to get game ID');
        this.lastError = 'Failed to get game ID from blockchain';
      }
    } catch (error) {
      console.error('BlockchainManager: Error starting game:', error);
      this.lastError = error.message;
    }
  }

  /**
   * Handle game over
   * @param {number} finalScore - Final game score
   */
  async onGameOver(finalScore) {
    console.log(`BlockchainManager: GAME_OVER event with score: ${finalScore}`);
    
    try {
      // Skip if not in active game - but in DEV mode, we'll show a warning only
      if (!this.isGameActive || !this.currentGameId) {
        console.warn('BlockchainManager: Game over called when not in active game:', {
          isGameActive: this.isGameActive,
          currentGameId: this.currentGameId
        });
      }
      
      // Skip if no wallet - but in DEV mode, we'll show a warning only
      if (!this.walletAddress) {
        console.warn('BlockchainManager: Game over called with no wallet address');
      }

      // If we have an active game and wallet, record the score
      if (this.isGameActive && this.currentGameId && this.walletAddress) {
        console.log(`BlockchainManager: Recording final score: ${finalScore} for game ${this.currentGameId}`);
        
        await this.blockchainSync.endGame(
          this.walletAddress, 
          finalScore, 
          finalScore
        );
      }
      
      // Reset state
      this.isGameActive = false;
      this.currentGameId = null;
      
      console.log('BlockchainManager: Game end recorded, state reset');
    } catch (error) {
      console.error('BlockchainManager: Error ending game:', error);
      
      // Reset state even on error
      this.isGameActive = false;
      this.currentGameId = null;
    }
  }

  /**
   * Handle player jump
   */
  async onPlayerJump(player, currentScore) {
    try {
      // Log debug info
      if (this.debug) {
        console.log('BlockchainManager: PLAYER_ACTION event with state:', {
          isGameActive: this.isGameActive,
          currentGameId: this.currentGameId,
          walletAddress: this.walletAddress,
          isServerConnected: this.isServerConnected
        });
      }
      
      // Skip if not in active game
      if (!this.isGameActive || !this.currentGameId) {
        if (this.lastError) {
          console.warn(`BlockchainManager: Cannot record jump - not in active game (Error: ${this.lastError})`);
        } else {
          console.warn('BlockchainManager: Cannot record jump - not in active game');
        }
        return;
      }
      
      // Skip if no wallet address
      if (!this.walletAddress) {
        console.warn('BlockchainManager: Cannot record jump - no wallet address');
        return;
      }

      // Estimate jump height from player velocity
      const jumpHeight = Math.abs(player?.body?.velocity?.y) || 1800;
      
      if (this.debug) console.log(`BlockchainManager: Recording jump with height: ${jumpHeight}, score: ${currentScore}`);
      
      await this.blockchainSync.recordJump(
        this.walletAddress, 
        jumpHeight, 
        currentScore
      );
    } catch (error) {
      console.error('BlockchainManager: Error recording jump:', error);
    }
  }
}

export default BlockchainManager;