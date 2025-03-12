// src/prefabs/ui/blockchain/BlockchainEffects.js
import Phaser from 'phaser';
import CONFIG from '../../../config/game';

/**
 * Visual effects for blockchain events
 * @class BlockchainEffects
 */
class BlockchainEffects {
  /**
   * Creates an instance of BlockchainEffects
   * @param {Phaser.Scene} scene - The Scene to which this BlockchainEffects belongs
   */
  constructor(scene) {
    this.scene = scene;
    
    // Register event handlers
    // Check if BLOCKCHAIN events exist before subscribing
    if (CONFIG.EVENTS.BLOCKCHAIN) {
      this.scene.events.on(CONFIG.EVENTS.BLOCKCHAIN.JUMP_RECORDED, this.onJumpRecorded, this);
      this.scene.events.on(CONFIG.EVENTS.BLOCKCHAIN.GAME_END, this.onGameEnd, this);
    } else {
      console.warn('Blockchain events not defined in CONFIG.EVENTS');
    }
  }
  
  /**
   * Handle jump recorded event
   * @param {object} data - Jump data
   */
  onJumpRecorded(data) {
    // Create a small "JUMP RECORDED" text that flies up and fades out
    const jumpText = this.scene.add
      .bitmapText(
        this.scene.player.x + 50, 
        this.scene.player.y - 50, 
        'joystix', 
        'JUMP RECORDED', 
        14
      )
      .setOrigin(0.5)
      .setDepth(9999)
      .setTintFill(0x535353)
      .setAlpha(0);
    
    // Animate the text
    this.scene.tweens.add({
      targets: jumpText,
      y: jumpText.y - 40,
      alpha: { from: 0, to: 1 },
      duration: 300,
      ease: 'Power1',
      onComplete: () => {
        this.scene.tweens.add({
          targets: jumpText,
          y: jumpText.y - 20,
          alpha: 0,
          duration: 500,
          delay: 500,
          ease: 'Power1',
          onComplete: () => {
            jumpText.destroy();
          }
        });
      }
    });
  }
  
  /**
   * Handle game end event
   * @param {object} data - Game end data
   */
  onGameEnd(data) {
    // Create "SCORE RECORDED" text that appears below game over
    const scoreText = this.scene.add
      .bitmapText(
        this.scene.scale.gameSize.width / 2, 
        this.scene.scale.gameSize.height / 2 + 40, 
        'joystix', 
        'SCORE RECORDED ON-CHAIN', 
        16
      )
      .setOrigin(0.5)
      .setDepth(9999)
      .setTintFill(0x535353)
      .setAlpha(0);
    
    // Animate the text
    this.scene.tweens.add({
      targets: scoreText,
      alpha: 1,
      duration: 500,
      delay: 1000, // Delay to show after game over
      ease: 'Power1',
      onComplete: () => {
        // Flash effect
        this.scene.tweens.add({
          targets: scoreText,
          alpha: { from: 1, to: 0.5 },
          duration: 400,
          yoyo: true,
          repeat: 3
        });
      }
    });
    
    // Remove the text when game restarts
    this.scene.events.once(CONFIG.EVENTS.GAME_RESTART, () => {
      scoreText.destroy();
    });
  }
}

export default BlockchainEffects;