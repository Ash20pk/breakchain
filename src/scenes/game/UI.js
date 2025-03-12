import ScoreZone from '../../prefabs/ui/score/ScoreZone';
import CurrentScorePanel from '../../prefabs/ui/score/CurrentScorePanel';
import HighScorePanel from '../../prefabs/ui/score/HighScorePanel';
import GameOverPanel from '../../prefabs/ui/gameover/GameOverPanel';
import BlockchainEffects from '../../prefabs/ui/blockchain/BlockchainEffects';
import BlockchainStatus from '../../prefabs/ui/blockchain/BlockchainStatus';
import ServerStatusOverlay from '../../prefabs/ui/blockchain/ServerStatusOverlay';


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
    this.gameOverPanel = new GameOverPanel(scene);
    this.currentScorePanel = new CurrentScorePanel(scene);
    this.highScorePanel = new HighScorePanel(scene);
    this.scoreZone = new ScoreZone(this.currentScorePanel, this.highScorePanel);

    // Blockchain UI components
    this.blockchainStatus = new BlockchainStatus(scene);
    this.blockchainEffects = new BlockchainEffects(scene);
    this.serverStatusOverlay = new ServerStatusOverlay(scene);
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
    this.scoreZone.resize(gameSize);
    this.gameOverPanel.resize(gameSize);
    this.blockchainStatus.resize(gameSize);
  }
}

export default UI;
