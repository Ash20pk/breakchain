import './vite-node-polyfills';
import Game from './Game';
import config from './config';
import { isProd } from './utils';
import { createWalletButton } from './utils/wallet';

import './index.css';

// Create a new game instance
new Game(config);

// Create wallet connect button when DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
  createWalletButton();
});

// Register service worker for production builds
if (isProd) {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      // With Vite PWA plugin, service worker registration is handled automatically
      console.log('Service worker registered by vite-plugin-pwa');
    });
  }
}