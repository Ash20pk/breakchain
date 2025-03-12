// src/prefabs/ui/blockchain/BlockchainStatus.js
import Phaser from 'phaser';
import CONFIG from '../../../config/game';

/**
 * Blockchain status UI component
 * @class BlockchainStatus
 */
class BlockchainStatus {
  /**
   * Creates an instance of BlockchainStatus
   * @param {Phaser.Scene} scene - The Scene to which this BlockchainStatus belongs
   */
  constructor(scene) {
    this.scene = scene;
    
    // Create status text (initially hidden)
    // Using joystix font to match the game's existing font
    this.statusText = scene.add
      .bitmapText(10, 10, 'joystix', '', 16)
      .setOrigin(0, 0)
      .setDepth(9999)
      .setLetterSpacing(1) // Adds spacing for better readability
      .setTintFill(0x535353) // Dark gray to match the game's high score color
      .setVisible(false);
      
    this.pendingCount = 0;
    this.isConnected = false;
    
    // Register event handlers
    // Check if BLOCKCHAIN events exist before subscribing
    if (CONFIG.EVENTS.BLOCKCHAIN) {
      this.scene.events.on(CONFIG.EVENTS.BLOCKCHAIN.TRANSACTION_UPDATED, this.onTransactionUpdated, this);
      this.scene.events.on(CONFIG.EVENTS.BLOCKCHAIN.CONNECTION_CHANGED, this.onConnectionChanged, this);
    } else {
      console.warn('Blockchain events not defined in CONFIG.EVENTS');
    }
    this.scene.events.on(CONFIG.EVENTS.GAME_RESTART, this.reset, this);
  }
  
  /**
   * Handle transaction update events
   * @param {number} pendingCount - Number of pending transactions
   */
  onTransactionUpdated(pendingCount) {
    this.pendingCount = pendingCount;
    this.updateStatus();
  }
  
  /**
   * Handle connection change events
   * @param {boolean} isConnected - Connection status
   */
  onConnectionChanged(isConnected) {
    this.isConnected = isConnected;
    this.updateStatus();
  }
  
  /**
   * Update status text
   */
  updateStatus() {
    if (!this.isConnected) {
      this.statusText.setText('');
      this.statusText.setVisible(false);
      return;
    }
    
    if (this.pendingCount > 0) {
      this.statusText.setText(`CHAIN TX: ${this.pendingCount}`);
      // Dark orange color for pending transactions that matches the pixel art style
      this.statusText.setTintFill(0x535353);
      this.statusText.setVisible(true);
      
      // Add blinking effect for pending transactions
      if (!this.blinkTween || !this.blinkTween.isPlaying()) {
        this.blinkTween = this.scene.tweens.create({
          targets: this.statusText,
          alpha: { from: 1, to: 0.5 },
          duration: 500,
          yoyo: true,
          repeat: -1
        });
        this.blinkTween.play();
      }
    } else {
      this.statusText.setText('CHAIN READY');
      this.statusText.setTintFill(0x535353);
      this.statusText.setVisible(true);
      
      // Stop blinking if active
      if (this.blinkTween && this.blinkTween.isPlaying()) {
        this.blinkTween.stop();
        this.statusText.setAlpha(1);
      }
    }
  }
  
  /**
   * Reset status
   */
  reset() {
    this.pendingCount = 0;
    this.updateStatus();
  }
  
  /**
   * Resize status component
   * @param {Phaser.Structs.Size} gameSize - Current game size
   */
  resize(gameSize) {
    // Position the status text below high score in the proper position
    const highScoreOffset = 40; // Position below the high score
    this.statusText.setPosition(10, highScoreOffset);
    
    // Adjust position based on game width (for responsive layout)
    if (gameSize.width <= 600) { // Portrait mode
      this.statusText.setFontSize(12); // Smaller font for mobile
    } else {
      this.statusText.setFontSize(16); // Regular font for desktop
    }
  }
}

export default BlockchainStatus;