// src/prefabs/ui/blockchain/ServerStatusOverlay.js
import Phaser from 'phaser';
import CONFIG from '../../../config/game';

/**
 * Server status overlay that blocks gameplay when server is offline
 * @class ServerStatusOverlay
 */
class ServerStatusOverlay {
  /**
   * Creates an instance of ServerStatusOverlay
   * @param {Phaser.Scene} scene - The Scene to which this ServerStatusOverlay belongs
   */
  constructor(scene) {
    this.scene = scene;
    this.isVisible = false;
    
    // Create overlay elements
    this.createOverlay();
    
    // Initially hide the overlay
    this.hide();
    
    // Register event handlers
    document.addEventListener('BLOCKCHAIN_CONNECTION_CHANGED', this.onConnectionChanged.bind(this));
    this.scene.events.on(CONFIG.EVENTS.GAME_RESTART, this.onGameRestart, this);
  }
  
  /**
   * Helper to create centered text
   * @param {number} x X position
   * @param {number} y Y position
   * @param {string} text Text content
   * @param {number} size Font size
   * @param {number} depth Depth level
   * @returns {Phaser.GameObjects.BitmapText} Text object
   */
  createCenteredText(x, y, text, size, depth) {
    return this.scene.add
      .bitmapText(x, y, 'joystix', text, size)
      .setOrigin(0.5)
      .setDepth(depth)
      .setTintFill(0x535353)
      .setLetterSpacing(1);
  }
  
  /**
   * Create overlay elements
   */
  createOverlay() {
    // Get canvas dimensions directly
    const canvas = this.scene.game.canvas;
    const width = canvas.width;
    const height = canvas.height;
    
    // Semi-transparent background - cover entire game area
    this.background = this.scene.add.rectangle(0, 0, width, height, 0x000000, 0.7)
      .setOrigin(0, 0)
      .setDepth(9990);
      
    // Make server status text larger and more obvious
    this.statusText = this.createCenteredText(
      width / 2, 
      height / 2 - 60, 
      'SERVER OFFLINE', 
      32,
      9991
    );
      
    // Instructions text - make it more visible
    this.instructionsText = this.createCenteredText(
      width / 2, 
      height / 2 + 10, 
      'START THE BLOCKCHAIN\nSERVER TO PLAY', 
      20,
      9991
    );
      
    // Retry button - make it larger and more visible
    this.retryButton = this.scene.add.rectangle(
      width / 2,
      height / 2 + 100,
      220,
      60,
      0xffffff
    )
      .setOrigin(0.5)
      .setDepth(9991)
      .setStrokeStyle(4, 0x535353);
      
    this.retryText = this.createCenteredText(
      width / 2,
      height / 2 + 100,
      'RETRY',
      24,
      9992
    );
      
    // Make button interactive
    this.retryButton.setInteractive({ useHandCursor: true })
      .on('pointerdown', this.onRetryClick, this)
      .on('pointerover', () => {
        this.retryButton.setFillStyle(0xeeeeee);
      })
      .on('pointerout', () => {
        this.retryButton.setFillStyle(0xffffff);
      });
      
    // Add blinking effect to status text
    this.scene.tweens.add({
      targets: this.statusText,
      alpha: { from: 1, to: 0.5 },
      duration: 500,
      yoyo: true,
      repeat: -1
    });
  }
  
  /**
   * Show the overlay
   */
  show() {
    // Get canvas dimensions directly
    const canvas = this.scene.game.canvas;
    const width = canvas.width;
    const height = canvas.height;
    
    // Ensure background covers entire game area before showing
    this.background.setSize(width, height);
    
    // Reposition elements to center of canvas
    this.statusText.setPosition(width / 2, height / 2 - 60);
    this.instructionsText.setPosition(width / 2, height / 2 + 10);
    this.retryButton.setPosition(width / 2, height / 2 + 100);
    this.retryText.setPosition(width / 2, height / 2 + 100);
    
    // Make all elements visible
    this.background.setVisible(true);
    this.statusText.setVisible(true);
    this.instructionsText.setVisible(true);
    this.retryButton.setVisible(true);
    this.retryText.setVisible(true);
    this.isVisible = true;
    
    // Pause the game if running
    if (this.scene.isPlaying) {
      this.scene.isPlaying = false;
      this.scene.physics.pause();
    }
  }
  
  /**
   * Hide the overlay
   */
  hide() {
    this.background.setVisible(false);
    this.statusText.setVisible(false);
    this.instructionsText.setVisible(false);
    this.retryButton.setVisible(false);
    this.retryText.setVisible(false);
    this.isVisible = false;
  }
  
  /**
   * Handle connection change event
   * @param {CustomEvent} event Connection change event
   */
  onConnectionChanged(event) {
    const isConnected = event.detail.isConnected;
    
    if (!isConnected) {
      this.show();
    } else {
      this.hide();
    }
  }
  
  /**
   * Handle retry button click
   */
  onRetryClick() {
    // Try to reconnect to the server
    if (this.scene.blockchainManager && this.scene.blockchainManager.blockchainSync) {
      this.scene.blockchainManager.blockchainSync.reconnect();
      
      // Provide feedback
      this.instructionsText.setText('RECONNECTING...\nPLEASE WAIT');
      
      // Disable retry button temporarily
      this.retryButton.disableInteractive();
      this.retryButton.setFillStyle(0xcccccc);
      
      // Re-enable after timeout
      this.scene.time.delayedCall(3000, () => {
        this.instructionsText.setText('START THE BLOCKCHAIN\nSERVER TO PLAY');
        this.retryButton.setInteractive();
        this.retryButton.setFillStyle(0xffffff);
      });
    }
  }
  
  /**
   * Handle game restart
   */
  onGameRestart() {
    // If server is still offline, make sure overlay is visible
    if (this.scene.blockchainManager && !this.scene.blockchainManager.isServerConnected) {
      this.show();
    }
  }
  
  /**
   * Resize overlay to match game size
   * @param {Phaser.Structs.Size} gameSize Current game size
   */
  resize(gameSize) {
    // Get canvas dimensions directly
    const canvas = this.scene.game.canvas;
    const width = canvas.width;
    const height = canvas.height;
    
    // Resize background to cover the entire canvas
    this.background.setSize(width, height);
    
    // Reposition elements
    this.statusText.setPosition(width / 2, height / 2 - 60);
    this.instructionsText.setPosition(width / 2, height / 2 + 10);
    this.retryButton.setPosition(width / 2, height / 2 + 100);
    this.retryText.setPosition(width / 2, height / 2 + 100);
  }
}

export default ServerStatusOverlay;