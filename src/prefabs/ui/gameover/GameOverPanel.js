// src/prefabs/ui/gameover/GameOverPanel.js
import CONFIG from '../../../config/game';

/**
 * Game Over Modal with sharing options
 * @class GameOverPanel
 */
class GameOverPanel {
  /**
   * Creates an instance of GameOverPanel
   * @param {Phaser.Scene} scene - The Scene to which this GameOverPanel belongs
   */
  constructor(scene) {
    this.scene = scene;
    
    // Get reference to game dimensions
    const gameWidth = scene.scale.gameSize.width;
    const gameHeight = scene.scale.gameSize.height;

    // Create background overlay that covers the entire game area
    // Using parent container size directly to ensure full coverage
    const parentWidth = scene.scale.parentSize.width || gameWidth;
    const parentHeight = scene.scale.parentSize.height || gameHeight;
    
    this.overlay = scene.add.rectangle(0, 0, 
      parentWidth * 1.5, // Add extra width to ensure coverage 
      parentHeight * 1.5, // Add extra height to ensure coverage
      0x000000, 0.7)  // Semi-transparent black
      .setOrigin(0, 0) // Position from top-left
      .setDepth(9990)  // High depth but below modal elements
      .setVisible(false);
    
    // Create the modal background (smaller size)
    this.modal = scene.add.rectangle(gameWidth / 2, gameHeight / 2, 300, 280, 0xFFFFFF)
      .setOrigin(0.5)
      .setStrokeStyle(2, 0x535353)
      .setDepth(9991)
      .setVisible(false);
    
    // Create title bar (full width of modal, no padding)
    this.titleBar = scene.add.rectangle(gameWidth / 2, gameHeight / 2 - 110, 300, 40, 0xFFFFFF)
      .setOrigin(0.5)
      .setDepth(9992)
      .setVisible(false);
    
    // Create game over text
    this.gameOverText = scene.add
      .bitmapText(gameWidth / 2, gameHeight / 2 - 110, 'joystix', 'GAME OVER', 24)
      .setOrigin(0.5, 0.5)
      .setTint(0xFFFFFF)
      .setDepth(9993)
      .setVisible(false);
    
    // Create dino image (pixel art dead dino - smaller scale)
    this.dinoImage = scene.add
      .image(gameWidth / 2, gameHeight / 2 - 50, 'dino', 'dino-dead')
      .setOrigin(0.5)
      .setScale(0.9) // Reduced size
      .setDepth(9993)
      .setVisible(false);
    
    // Create score text (smaller font)
    this.scoreText = scene.add
      .bitmapText(gameWidth / 2, gameHeight / 2, 'joystix', 'YOUR SCORE: 0', 16)
      .setOrigin(0.5, 0.5)
      .setDepth(9993)
      .setVisible(false);
    
    // Create share button (smaller)
    this.shareButton = scene.add.rectangle(gameWidth / 2, gameHeight / 2 + 45, 180, 35, 0x1DA1F2)
      .setOrigin(0.5)
      .setDepth(9993)
      .setVisible(false);
    
    this.shareText = scene.add
      .bitmapText(gameWidth / 2, gameHeight / 2 + 45, 'joystix', 'SHARE SCORE', 16)
      .setOrigin(0.5, 0.5)
      .setTint(0xFFFFFF)
      .setDepth(9994)
      .setVisible(false);
    
    // Create restart button (smaller)
    this.restartButton = scene.add.rectangle(gameWidth / 2, gameHeight / 2 + 90, 180, 35, 0x4CAF50)
      .setOrigin(0.5)
      .setDepth(9993)
      .setVisible(false);
    
    this.restartText = scene.add
      .bitmapText(gameWidth / 2, gameHeight / 2 + 90, 'joystix', 'RESTART', 16)
      .setOrigin(0.5, 0.5)
      .setTint(0xFFFFFF)
      .setDepth(9994)
      .setVisible(false);
    
    // Create interactive zones for buttons
    this.shareZone = scene.add.zone(gameWidth / 2, gameHeight / 2 + 45, 180, 35)
      .setOrigin(0.5)
      .setDepth(9995)
      .setVisible(false);
    
    this.restartZone = scene.add.zone(gameWidth / 2, gameHeight / 2 + 90, 180, 35)
      .setOrigin(0.5)
      .setDepth(9995)
      .setVisible(false);
    
    // Register event handlers
    this.scene.events.on(CONFIG.EVENTS.GAME_OVER, this.onGameOver, this);
    this.scene.events.on(CONFIG.EVENTS.GAME_RESTART, this.hide, this);
    
    // Set up button interactions
    this.setupButtonInteraction(this.shareZone, this.shareButton, this.shareText, this.onShareClick.bind(this));
    this.setupButtonInteraction(this.restartZone, this.restartButton, this.restartText, this.onRestartClick.bind(this));
    
    // Add overlay interactivity - prevent clicks on game elements underneath
    this.overlay.setInteractive();
  }
  
  /**
   * Set up button interaction effects
   * @param {Phaser.GameObjects.Zone} zone - Interactive zone
   * @param {Phaser.GameObjects.Rectangle} button - Button background
   * @param {Phaser.GameObjects.BitmapText} text - Button text
   * @param {Function} callback - Click callback function
   */
  setupButtonInteraction(zone, button, text, callback) {
    zone.setInteractive({ useHandCursor: true });
    
    zone.on('pointerover', () => {
      button.setScale(1.05);
      text.setScale(1.05);
    });
    
    zone.on('pointerout', () => {
      button.setScale(1);
      text.setScale(1);
    });
    
    zone.on('pointerdown', () => {
      button.setFillStyle(button.fillColor, 0.8);
    });
    
    zone.on('pointerup', () => {
      button.setFillStyle(button.fillColor, 1);
      callback();
    });
  }
  
  /**
   * Handle game over event
   * @param {number} score - Final score
   */
  onGameOver(score) {
    this.show(score);
  }
  
  /**
   * Show the modal
   * @param {number} score - Final score
   */
  show(score) {
    // Save score for sharing
    this.score = score;
    
    // Update score text
    this.scoreText.setText(`YOUR SCORE: ${score}`);
    
    // Make sure overlay covers the full parent container with extra padding
    const parentSize = this.scene.scale.parentSize;
    const parentWidth = parentSize.width || this.scene.scale.gameSize.width;
    const parentHeight = parentSize.height || this.scene.scale.gameSize.height;
    
    this.overlay.setSize(
      parentWidth * 1.5, // Ensure complete coverage on all devices
      parentHeight * 1.5
    );
    // Ensure overlay is positioned correctly
    this.overlay.setPosition(0, 0);
    
    // Check if we're in mobile mode
    const { width } = this.scene.scale.gameSize;
    const isMobile = width < 600;
    
    // Adjust based on screen size
    const modalWidth = isMobile ? 250 : 300;
    
    // Ensure title bar matches modal width exactly
    this.titleBar.width = modalWidth;
    
    // Reset dino scale based on screen size
    this.dinoImage.setScale(isMobile ? 0.25 : 0.3);
    
    // Make all elements visible, starting with the overlay
    this.overlay.setVisible(true);
    this.overlay.setAlpha(0); // Start transparent
    
    // Fade in overlay
    this.scene.tweens.add({
      targets: this.overlay,
      alpha: 0.7,
      duration: 200,
      onComplete: () => {
        // Show modal elements
        this.modal.setVisible(true);
        this.titleBar.setVisible(true);
        this.gameOverText.setVisible(true);
        this.dinoImage.setVisible(true);
        this.scoreText.setVisible(true);
        this.shareButton.setVisible(true);
        this.shareText.setVisible(true);
        this.restartButton.setVisible(true);
        this.restartText.setVisible(true);
        this.shareZone.setVisible(true);
        this.restartZone.setVisible(true);
        
        // Ensure buttons are interactive
        this.shareZone.setInteractive();
        this.restartZone.setInteractive();
        
        // Add appearance animation
        const elements = [
          this.modal, this.titleBar, this.gameOverText, 
          this.scoreText,
          this.shareButton, this.shareText,
          this.restartButton, this.restartText
        ];
        
        // Skip animating the dino to keep it at the fixed scale
        
        // Set initial scale
        elements.forEach(el => el.setScale(0.8));
        
        // Animate to normal scale
        this.scene.tweens.add({
          targets: elements,
          scale: 1,
          duration: 300,
          ease: 'Back.easeOut'
        });
      }
    });
  }
  
  /**
   * Hide the modal
   */
  hide() {
    // Animate elements
    const elements = [
      this.modal, this.titleBar, this.gameOverText, 
      this.dinoImage, this.scoreText,
      this.shareButton, this.shareText,
      this.restartButton, this.restartText
    ];
    
    // Fade out elements
    this.scene.tweens.add({
      targets: elements,
      alpha: 0,
      duration: 200,
      onComplete: () => {
        // Hide all elements
        elements.forEach(el => {
          el.setVisible(false);
          el.setAlpha(1); // Reset alpha for next time
        });
        
        // Disable button interaction
        this.shareZone.disableInteractive();
        this.restartZone.disableInteractive();
        this.shareZone.setVisible(false);
        this.restartZone.setVisible(false);
        
        // Fade out overlay
        this.scene.tweens.add({
          targets: this.overlay,
          alpha: 0,
          duration: 200,
          onComplete: () => {
            this.overlay.setVisible(false);
          }
        });
      }
    });
  }
  
  /**
   * Handle share button click
   */
  onShareClick() {
    try {
      // Play sound
      this.scene.sound.play('player-action', { volume: 0.5 });
    } catch (e) {
      // Ignore if sound not available
    }
    
    const score = this.score || 0;
    const text = `I challenge you to beat my score of ${score}.\nCheck out the game here: [link]`;
    const url = window.location.href;
    const poweredBy = 'Somnia_Network';
    const via = 'Somnia_Network';
    
    // Create Twitter share URL
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text.replace('[link]', url))}&hashtags=${encodeURIComponent(poweredBy)}&via=${encodeURIComponent(via)}`;
    
    // Open in new window
    window.open(twitterUrl, '_blank', 'width=550,height=420');
  }
  
  /**
   * Handle restart button click
   */
  onRestartClick() {
    try {
      // Play sound
      this.scene.sound.play('player-action', { volume: 0.5 });
    } catch (e) {
      // Ignore if sound not available
    }
    
    // Hide the modal
    this.hide();
    
    // Emit the game restart event
    this.scene.events.emit(CONFIG.EVENTS.GAME_RESTART);
  }
  
  /**
   * Resize modal elements when game size changes
   * @param {Phaser.Structs.Size} gameSize - New game size
   */
  resize(gameSize) {
    const { width, height } = gameSize;
    const centerX = width / 2;
    const centerY = height / 2;
    
    // Resize overlay to cover the entire parent container with extra padding
    const parentSize = this.scene.scale.parentSize;
    const parentWidth = parentSize.width || width;
    const parentHeight = parentSize.height || height;
    
    this.overlay.setSize(
      parentWidth * 1.5, // Add extra width to ensure coverage on all devices
      parentHeight * 1.5 // Add extra height to ensure coverage on all devices
    );
    
    // Make sure overlay is positioned at top-left
    this.overlay.setPosition(0, 0);
    
    // Determine if we're in mobile mode (portrait or small screen)
    const isMobile = width < 600;
    
    // Adjust modal size for mobile
    const modalWidth = isMobile ? 250 : 300;
    const modalHeight = isMobile ? 250 : 280;
    const titleBarHeight = isMobile ? 36 : 40;
    
    // Adjust font sizes for mobile
    this.gameOverText.setFontSize(isMobile ? 20 : 24);
    this.scoreText.setFontSize(isMobile ? 14 : 16);
    this.shareText.setFontSize(isMobile ? 14 : 16);
    this.restartText.setFontSize(isMobile ? 14 : 16);
    
    // Adjust button sizes for mobile
    const buttonWidth = isMobile ? 160 : 180;
    const buttonHeight = isMobile ? 32 : 35;
    
    // Resize modal and buttons
    this.modal.setSize(modalWidth, modalHeight);
    this.titleBar.setSize(modalWidth, titleBarHeight);
    this.shareButton.setSize(buttonWidth, buttonHeight);
    this.restartButton.setSize(buttonWidth, buttonHeight);
    this.shareZone.setSize(buttonWidth, buttonHeight);
    this.restartZone.setSize(buttonWidth, buttonHeight);
    
    // Calculate vertical spacing based on mobile/desktop
    const titleOffset = isMobile ? -95 : -110;
    const dinoOffset = isMobile ? -40 : -50;
    const scoreOffset = isMobile ? 0 : 0;
    const shareOffset = isMobile ? 38 : 45;
    const restartOffset = isMobile ? 78 : 90;
    
    // Reposition all elements
    this.modal.setPosition(centerX, centerY);
    this.titleBar.setPosition(centerX, centerY + titleOffset);
    this.gameOverText.setPosition(centerX, centerY + titleOffset);
    this.dinoImage.setPosition(centerX, centerY + dinoOffset);
    this.scoreText.setPosition(centerX, centerY + scoreOffset);
    
    this.shareButton.setPosition(centerX, centerY + shareOffset);
    this.shareText.setPosition(centerX, centerY + shareOffset);
    this.shareZone.setPosition(centerX, centerY + shareOffset);
    
    this.restartButton.setPosition(centerX, centerY + restartOffset);
    this.restartText.setPosition(centerX, centerY + restartOffset);
    this.restartZone.setPosition(centerX, centerY + restartOffset);
    
    // Adjust dino scale for mobile
    this.dinoImage.setScale(isMobile ? 0.25 : 0.3);
  }
  
  /**
   * Clean up resources when scene is destroyed
   */
  destroy() {
    // Remove event listeners
    this.scene.events.off(CONFIG.EVENTS.GAME_OVER, this.onGameOver, this);
    this.scene.events.off(CONFIG.EVENTS.GAME_RESTART, this.hide, this);
    
    // Clean up button interactions
    this.shareZone.off('pointerover');
    this.shareZone.off('pointerout');
    this.shareZone.off('pointerdown');
    this.shareZone.off('pointerup');
    
    this.restartZone.off('pointerover');
    this.restartZone.off('pointerout');
    this.restartZone.off('pointerdown');
    this.restartZone.off('pointerup');
    
    // Destroy game objects
    this.overlay.destroy();
    this.modal.destroy();
    this.titleBar.destroy();
    this.gameOverText.destroy();
    this.dinoImage.destroy();
    this.scoreText.destroy();
    this.shareButton.destroy();
    this.shareText.destroy();
    this.restartButton.destroy();
    this.restartText.destroy();
    this.shareZone.destroy();
    this.restartZone.destroy();
  }
}

export default GameOverPanel;