// src/scenes/game/UI.js
import ScoreZone from '../../prefabs/ui/score/ScoreZone';
import CurrentScorePanel from '../../prefabs/ui/score/CurrentScorePanel';
import HighScorePanel from '../../prefabs/ui/score/HighScorePanel';
import GameOverPanel from '../../prefabs/ui/gameover/GameOverPanel';
import BlockchainEffects from '../../prefabs/ui/blockchain/BlockchainEffects';
import BlockchainStatus from '../../prefabs/ui/blockchain/BlockchainStatus';
import CONFIG from '../../config/game';

/**
 * Game UI manager
 * @class UI
 */
class UI {
  /**
   * Creates an instance of UI
   * @param {Phaser.Scene} scene - The Scene to which this UI belongs
   */
  constructor(scene) {
    console.log('UI constructor', scene);
    this.scene = scene;
    
    // In-game UI components
    this.gameOverPanel = new GameOverPanel(scene);
    this.currentScorePanel = new CurrentScorePanel(scene);
    this.highScorePanel = new HighScorePanel(scene);
    this.scoreZone = new ScoreZone(this.currentScorePanel, this.highScorePanel);
    
    // Blockchain UI components
    this.blockchainStatus = new BlockchainStatus(scene);
    this.blockchainEffects = new BlockchainEffects(scene);
    
    // Register event handlers
    this.scene.events.on(CONFIG.EVENTS.GAME_START, this.onGameStart, this);
    this.scene.events.on(CONFIG.EVENTS.GAME_RESTART, this.onGameRestart, this);
    this.scene.events.on(CONFIG.EVENTS.GAME_OVER, this.onGameOver, this);
    this.scene.events.on(CONFIG.EVENTS.GAME_INTRO_START, this.onIntroStart, this);
  }

  /**
   * Update UI
   * @param {boolean} isPlaying - Whether game is running
   * @param {Phaser.Structs.Size} gameSize - Current game size
   * @param {number} score - Current game score
   */
  update(isPlaying, gameSize, score) {
    this.currentScorePanel.update(isPlaying, score);
    this.highScorePanel.update(score);
    this.scoreZone.update(gameSize);
  }

  /**
   * Resize UI
   * @param {Phaser.Structs.Size} gameSize - Current game size
   */
  resize(gameSize) {
    if (this.scoreZone) {
      this.scoreZone.resize(gameSize);
    }
    
    if (this.gameOverPanel) {
      this.gameOverPanel.resize(gameSize);
    }
    
    if (this.blockchainStatus) {
      this.blockchainStatus.resize(gameSize);
    }
  }
  
  /**
   * Handle game start 
   */
  onGameStart() {
    // Method left for future use
  }
  
  /**
   * Handle game restart
   */
  onGameRestart() {
    // Method left for future use
  }
  
  /**
   * Handle game over
   */
  onGameOver() {

  }
  
  /**
   * Handle intro start
   */
  onIntroStart() {
    // Method left for future use
  }
  
  /**
   * Clean up event listeners when scene is destroyed
   */
  destroy() {
    // Remove event handlers
    this.scene.events.off(CONFIG.EVENTS.GAME_START, this.onGameStart, this);
    this.scene.events.off(CONFIG.EVENTS.GAME_RESTART, this.onGameRestart, this);
    this.scene.events.off(CONFIG.EVENTS.GAME_OVER, this.onGameOver, this);
    this.scene.events.off(CONFIG.EVENTS.GAME_INTRO_START, this.onIntroStart, this);

    // Clean up UI components
    if (this.gameOverPanel) {
      this.gameOverPanel.destroy();
    }
  }
}

export default UI;