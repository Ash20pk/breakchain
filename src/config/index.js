import Phaser from 'phaser';

import { isProd } from '../utils';

const config = {
  title: 'Dino',
  version: '1.2.1',
  type: Phaser.AUTO,
  backgroundColor: '#fff',
  banner: !isProd,
  render: {
    antialias: false,
  },
  scale: {
    width: 1200,
    height: 350,
    mode: Phaser.Scale.ScaleModes.NONE,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 0 },
      debug: !isProd,
    },
  },
};

export default config;
