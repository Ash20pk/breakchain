// src/main.jsx
import './vite-node-polyfills';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import Web3Provider from './components/Web3Provider';
import './index.css';
import { isProd } from './utils';
import { setupInputBlocker } from './utils/inputBlocker';

// Set up the input blocker to disable F keys, dev console, and right-click
setupInputBlocker();

// Initialize the React app
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Web3Provider>
      <App />
    </Web3Provider>
  </React.StrictMode>
);

// Register service worker for production builds
if (isProd) {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      // With Vite PWA plugin, service worker registration is handled automatically
      console.log('Service worker registered by vite-plugin-pwa');
    });
  }
}