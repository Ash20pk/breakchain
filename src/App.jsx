import React, { useState, useRef, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { ConnectKitButton } from 'connectkit';
import { toast, Toaster } from 'sonner';
import './App.css';
import Game from './Game';
import config from './config';
import Leaderboard from './components/LeaderboardComponent';

function App() {
  const [gameStarted, setGameStarted] = useState(false);
  const [loadingGame, setLoadingGame] = useState(false);
  const [showIntro, setShowIntro] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  
  const gameContainerRef = useRef(null);
  const { address, isConnected } = useAccount();

  // Toggle leaderboard view
  const toggleLeaderboard = () => {
    setShowLeaderboard(!showLeaderboard);
    playButtonSound();
  };

  // Handle button sounds
  const playButtonSound = () => {
    try {
      const sound = new Audio('/assets/sounds/player-action.mp3');
      sound.volume = 0.3;
      sound.play();
    } catch (error) {
      console.log('Error playing sound:', error);
    }
  };
  
  const [introProgress, setIntroProgress] = useState(0);

  // Show intro animation with smooth transition
  useEffect(() => {
    if (showIntro) {
      // Progress animation
      const progressInterval = setInterval(() => {
        setIntroProgress(prev => {
          const next = prev + 1;
          return next > 100 ? 100 : next;
        });
      }, 35); // Approximately 3.5 seconds to reach 100%
      
      // Prepare for transition
      const transitionTimer = setTimeout(() => {
        // Add fade-out class to intro container
        const introEl = document.querySelector('.intro-container');
        if (introEl) introEl.classList.add('fade-out');
        
        // Set a short delay before fully removing the intro
        setTimeout(() => {
          setShowIntro(false);
        }, 300);
      }, 3700);
      
      return () => {
        clearInterval(progressInterval);
        clearTimeout(transitionTimer);
      };
    }
  }, [showIntro]);

  // Initialize the game
  const startGame = () => {
    if (gameStarted) return;
    
    playButtonSound();
    setLoadingGame(true);
    
    // Simulate loading for the game assets
    setTimeout(() => {
      try {
        new Game(config);
        setGameStarted(true);
        setLoadingGame(false);
        
        toast.success('Game started!', {
          description: 'Your jumps and score will be recorded on the blockchain'
        });
      } catch (error) {
        console.error('Error starting game:', error);
        setLoadingGame(false);
        toast.error('Failed to start game', {
          description: 'Please try again or reload the page'
        });
      }
    }, 2000);
  };

  // If the game has started, just show the game container
  if (gameStarted) {
    return (
      <div className="game-container" ref={gameContainerRef}>
        <Toaster position="top-right" richColors />
      </div>
    );
  }

  // Show intro animation
  if (showIntro) {
    return (
      <div className="intro-container">
        <div className="intro-logo">
          <div className="dino-logo" />
          <div className="intro-text">DINO RUNNER</div>
          <div className="intro-tagline">ON-CHAIN EDITION</div>
        </div>
        
        <div className="intro-loading-container">
          <div 
            className="intro-loading-progress" 
            style={{ width: `${introProgress}%` }}
          />
          <div className="intro-loading-text">LOADING...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <Toaster position="top-right" richColors />
      
      <div className="game-title">
        <h1>DINO RUNNER</h1>
        {!isConnected ? <div className="subtitle">ON-CHAIN EDITION</div> : <div className="connected-text">ON-CHAIN EDITION</div>}
      </div>
      
      {showLeaderboard ? (
        <div className="leaderboard-view">
          <Leaderboard />
          <button 
            className="pixel-button back-button"
            onClick={toggleLeaderboard}
          >
            BACK TO MENU
          </button>
        </div>
      ) : (
        <>
          <div className="wallet-connector">
            <h2 className="title">
              {isConnected ? 'WALLET CONNECTED!' : 'CONNECT YOUR WALLET'}
            </h2>
            
            <div className={`status-message ${isConnected ? 'connected' : 'disconnected'}`}>
              {isConnected 
                ? `Address: ${address?.slice(0, 6)}...${address?.slice(-4)}` 
                : 'Connect to record your score on the blockchain'}
            </div>
            
            <div className="button-container">
              <ConnectKitButton.Custom>
                {({ isConnected, show }) => {
                  return (
                    <button 
                      className="pixel-button"
                      onClick={() => {
                        playButtonSound();
                        show();
                      }}
                    >
                      {isConnected ? 'CHANGE WALLET' : 'CONNECT WALLET'}
                    </button>
                  );
                }}
              </ConnectKitButton.Custom>
              
              <button 
                className="pixel-button play-button"
                onClick={startGame}
                disabled={!isConnected || loadingGame}
              >
                {loadingGame ? 'LOADING...' : 'START GAME'}
              </button>

              <button 
                className="pixel-button leaderboard-button"
                onClick={toggleLeaderboard}
                disabled={isLoading}
              >
                VIEW LEADERBOARD
              </button>
            </div>
          </div>
          
          {/* Game instructions - only shown on main screen, hidden when leaderboard is visible */}
          <div className="instructions">
            <h3>HOW TO PLAY</h3>
            <ul>
              <li>Press <span className="key">SPACE</span> or <span className="key">↑</span> to jump</li>
              <li>Press <span className="key">↓</span> to duck</li>
              <li>Avoid obstacles and survive as long as possible</li>
              <li>Your jumps and score will be recorded on the blockchain</li>
            </ul>
          </div>
        </>
      )}
      
      <footer>
        <p>© 2025 Dino Runner | ON-CHAIN EDITION | Powered by Somnia Network</p>
      </footer>
    </div>
  );
}

export default App;