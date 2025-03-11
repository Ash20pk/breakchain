import Game from './Game';
import config from './config';
import { isProd } from './utils';
import { createWalletButton } from './utils/wallet';

import './index.css';

// eslint-disable-next-line no-new
new Game(config);

// Create wallet connect button
document.addEventListener('DOMContentLoaded', () => {
  createWalletButton();
});

if (isProd) {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js');
    });
  }
}
