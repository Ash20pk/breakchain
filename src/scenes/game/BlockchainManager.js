// src/scenes/game/BlockchainManager.js
import BlockchainSync from '../../hooks/BlockchainSync';
import { getWalletState } from '../../utils/wallet';
import CONFIG from '../../config/game';
import { safeEmit } from '../../utils/blockchainEvents';
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
    this.eventEmitter = eventEmitter;
    this.blockchainSync = BlockchainSync.initialize();
    this.isGameActive = false;
    this.currentGameId = null;
    this.isServerConnected = false;
    this.walletAddress = null;
    this.walletConnected = false;

    // Register event handlers
    try {
      this.eventEmitter.on(CONFIG.EVENTS.GAME_START, this.onGameStart, this);
      this.eventEmitter.on(CONFIG.EVENTS.GAME_OVER, this.onGameOver, this);
      this.eventEmitter.on(CONFIG.EVENTS.PLAYER_ACTION, this.onPlayerJump, this);
    } catch (error) {
      console.error('Error registering blockchain event handlers:', error);
    }
    
    // Listen for blockchain connection changes
    document.addEventListener('BLOCKCHAIN_CONNECTION_CHANGED', (event) => {
      this.isServerConnected = event.detail.isConnected;
      console.log(`Blockchain server connection changed: ${this.isServerConnected}`);
      
      if (!this.isServerConnected && this.isGameActive) {
        // If server disconnects during gameplay, pause the game
        this.pauseGame();
      }
    });
    
    // Listen for wallet state changes
    document.addEventListener('WALLET_STATE_CHANGED', this.handleWalletStateChanged.bind(this));
    
    // Initialize wallet state
    this.updateWalletState();
    
    console.log('BlockchainManager initialized');
  }
  
  /**
   * Handle wallet state changes
   * @param {CustomEvent} event - Wallet state change event
   */
  handleWalletStateChanged(event) {
    const { address, isConnected } = event.detail;
    console.log('Wallet state changed in BlockchainManager:', { address, isConnected });
    
    // Update local state
    this.walletAddress = address;
    this.walletConnected = isConnected;
    
    // Handle wallet disconnection during gameplay
    if (!isConnected && this.isGameActive) {
      console.warn('Wallet disconnected during gameplay');
      // Optional: you could pause the game here
    }
  }
  
  /**
   * Update wallet state from the current global state
   */
  updateWalletState() {
    const walletState = getWalletState();
    if (walletState) {
      this.walletAddress = walletState.address;
      this.walletConnected = walletState.isConnected;
    }
  }

  /**
   * Check if wallet is connected
   * @returns {boolean}
   */
  isWalletConnected() {
    // First check local state
    if (this.walletConnected && this.walletAddress) {
      return true;
    }
    
    // If not connected, update from global state and check again
    this.updateWalletState();
    return this.walletConnected && this.walletAddress;
  }

  /**
   * Get wallet address
   * @returns {string|null}
   */
  getWalletAddress() {
    // First check local state
    if (this.walletAddress) {
      return this.walletAddress;
    }
    
    // If no address, update from global state and return
    this.updateWalletState();
    return this.walletAddress;
  }
  
  /**
   * Check if server is connected and wallet is available
   * @returns {boolean}
   */
  canStartGame() {
    if (!this.isServerConnected) {
      toast.error('Cannot start game', {
        description: 'Not connected to blockchain server'
      });
      return false;
    }
    
    if (!this.isWalletConnected()) {
      toast.error('Cannot start game', {
        description: 'Please connect your wallet first'
      });
      return false;
    }
    
    return true;
  }
  
  /**
   * Pause the game due to server disconnect
   */
  pauseGame() {
    if (this.isGameActive) {
      // Emit game over event to stop gameplay
      this.eventEmitter.emit(CONFIG.EVENTS.GAME_OVER);
      
      toast.error('Game paused', {
        description: 'Connection to blockchain server lost'
      });
      
      this.isGameActive = false;
      this.currentGameId = null;
    }
  }

  /**
   * Handle game start
   */
  async onGameStart() {
    try {
      // Check if server and wallet are ready
      if (!this.canStartGame()) {
        // Prevent game from starting by emitting game over
        this.eventEmitter.emit(CONFIG.EVENTS.GAME_OVER);
        return;
      }
      
      const address = this.getWalletAddress();
      console.log('Starting game with blockchain recording for address:', address);
      
      const gameId = await this.blockchainSync.startGame(address);
      if (gameId) {
        this.isGameActive = true;
        this.currentGameId = gameId;
        console.log(`Game started with ID: ${gameId}`);
      } else {
        // If game ID is not returned, prevent game from starting
        this.eventEmitter.emit(CONFIG.EVENTS.GAME_OVER);
        toast.error('Failed to start blockchain recording');
      }
    } catch (error) {
      console.error('Failed to start blockchain recording:', error);
      // Prevent game from starting by emitting game over
      this.eventEmitter.emit(CONFIG.EVENTS.GAME_OVER);
      toast.error('Cannot start game', {
        description: error.message || 'Blockchain server error'
      });
    }
  }

  /**
   * Handle game over
   * @param {number} finalScore - Final game score
   */
  async onGameOver(finalScore) {
    try {
      const address = this.getWalletAddress();
      if (!this.isGameActive || !address) return;

      console.log(`Recording final score: ${finalScore}`);
      const success = await this.blockchainSync.endGame(address, finalScore, finalScore);
      
      if (success && CONFIG.EVENTS.BLOCKCHAIN) {
        // Emit event for visual effects
        try {
          this.eventEmitter.emit(CONFIG.EVENTS.BLOCKCHAIN.GAME_END, {
            gameId: this.currentGameId,
            finalScore,
            distance: finalScore
          });
        } catch (error) {
          console.error('Error emitting game end event:', error);
        }
      }
      
      this.isGameActive = false;
      this.currentGameId = null;
    } catch (error) {
      console.error('Failed to record game end:', error);
    }
  }

  /**
   * Handle player jump
   */
  async onPlayerJump(player, currentScore) {
    try {
      const address = this.getWalletAddress();
      if (!this.isGameActive || !address || !this.isServerConnected) return;

      // Estimate jump height from player velocity (a negative value indicates upward movement)
      const jumpHeight = Math.abs(player?.body?.velocity?.y) || 1800;
      
      console.log(`Recording jump with height: ${jumpHeight}, score: ${currentScore}`);
      const success = await this.blockchainSync.recordJump(address, jumpHeight, currentScore);
      
      if (success && CONFIG.EVENTS.BLOCKCHAIN) {
        // Emit event for visual effects
        try {
          this.eventEmitter.emit(CONFIG.EVENTS.BLOCKCHAIN.JUMP_RECORDED, {
            player,
            jumpHeight,
            score: currentScore
          });
        } catch (error) {
          console.error('Error emitting jump recorded event:', error);
        }
      }
    } catch (error) {
      console.error('Failed to record jump:', error);
    }
  }
}

export default BlockchainManager;