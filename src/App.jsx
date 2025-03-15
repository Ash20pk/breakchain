import React, { useState, useRef } from 'react';
import { useAccount } from 'wagmi';
import { ConnectKitButton } from 'connectkit';
import './App.css';
import Game from './Game';
import config from './config';
import DinoLoader from './components/DinoLoader';

function App() {
  const [gameStarted, setGameStarted] = useState(false);
  const gameContainerRef = useRef(null);
  const { address, isConnected } = useAccount();

  // Initialize the game
  const startGame = () => {
    if (gameStarted) return;
    
    // Create and initialize the game if the container exists
   
      new Game(config);
      setGameStarted(true);
    
  };

  // If the game has started, just show the game container
  if (gameStarted) {
    return (
      <div className="game-container">
        {/* Phaser will append the canvas to this div */}
      </div>
    );
  }

  return (
    <div className="app-container">
      <DinoLoader />
      
      <div className="wallet-connector">
        <h2 className="title">
          {isConnected ? 'Wallet Connected!' : 'Wallet Not Connected'}
        </h2>
        
        <p className="status-message" style={{ color: isConnected ? '#228B22' : '#8B0000' }}>
          {isConnected 
            ? `Address: ${address?.slice(0, 6)}...${address?.slice(-4)}` 
            : 'Connect your wallet to record your score on the blockchain'}
        </p>
        
        <div className="button-container">
          <ConnectKitButton.Custom>
            {({ isConnected, show }) => {
              return (
                <button 
                  className="pixel-button"
                  onClick={show}
                >
                  {isConnected ? 'WALLET CONNECTED' : 'CONNECT WALLET'}
                </button>
              );
            }}
          </ConnectKitButton.Custom>
          
          {isConnected && (
            <button 
              className="pixel-button"
              onClick={startGame}
            >
              START GAME
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;