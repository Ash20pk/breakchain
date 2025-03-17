// src/App.jsx - Optimized for mobile
import React, { useState, useRef, useEffect, useCallback } from 'react';
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
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [introProgress, setIntroProgress] = useState(0);
  
  const gameContainerRef = useRef(null);
  const { address, isConnected } = useAccount();

  // Check if we're on a mobile device
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(
        window.innerWidth <= 768 || 
        ('ontouchstart' in window) || 
        (navigator.maxTouchPoints > 0)
      );
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    // Apply viewport fix for iOS Safari
    const viewportMeta = document.createElement('meta');
    viewportMeta.name = 'viewport';
    viewportMeta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';
    document.head.appendChild(viewportMeta);
    
    return () => {
      window.removeEventListener('resize', checkMobile);
      document.head.removeChild(viewportMeta);
    };
  }, []);

  // Toggle leaderboard view
  const toggleLeaderboard = useCallback(() => {
    setShowLeaderboard(!showLeaderboard);
    playButtonSound();
  }, [showLeaderboard]);

  // Handle button sounds
  const playButtonSound = useCallback(() => {
    try {
      const sound = new Audio('/assets/sounds/player-action.mp3');
      sound.volume = 0.3;
      sound.play();
    } catch (error) {
      console.log('Error playing sound:', error);
    }
  }, []);
  
  // Handle jump from mobile controls
  const handleJump = useCallback(() => {
    // Send keypress event to the game
    const event = new KeyboardEvent('keydown', {
      code: 'Space',
      key: ' ',
      which: 32,
      keyCode: 32,
      bubbles: true
    });
    document.dispatchEvent(event);
    
    // Play sound for mobile feedback
    playButtonSound();
  }, [playButtonSound]);
  
  // Handle duck from mobile controls
  const handleDuck = useCallback(() => {
    // Send keypress event to the game
    const event = new KeyboardEvent('keydown', {
      code: 'ArrowDown',
      key: 'ArrowDown',
      which: 40,
      keyCode: 40,
      bubbles: true
    });
    document.dispatchEvent(event);
  }, []);

  // Show intro animation with smooth transition
  useEffect(() => {
    if (showIntro) {
      // Progress animation
      const progressInterval = setInterval(() => {
        setIntroProgress(prev => {
          const next = prev + 1;
          return next > 100 ? 100 : next;
        });
      }, 15); // Approximately 3.5 seconds to reach 100%
      
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
  const startGame = useCallback(() => {
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
  }, [gameStarted, playButtonSound]);

  // If the game has started, just show the game container with mobile controls
  if (gameStarted) {
    return (
      <>
        <div className="game-container" ref={gameContainerRef}>
          <Toaster position="top-right" richColors />
        </div>
      </>
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
      <Toaster 
        position={isMobile ? "bottom-center" : "top-right"} 
        richColors 
        closeButton={true}
        toastOptions={{
          duration: isMobile ? 3000 : 5000,
          style: {
            fontSize: isMobile ? '12px' : '14px',
            maxWidth: isMobile ? '90vw' : '380px'
          }
        }}
      />
      
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
              >
                VIEW LEADERBOARD
              </button>
            </div>
          </div>
          
          {/* Game instructions - with mobile/desktop differences */}
          <div className="instructions">
            <h3>HOW TO PLAY</h3>
            
            <div className="desktop-instructions">
              <ul>
                <li>Press <span className="key">SPACE</span> or <span className="key">↑</span> to jump</li>
                <li>Press <span className="key">↓</span> to duck</li>
                <li>Avoid obstacles and survive as long as possible</li>
                <li>Your jumps and score will be recorded on the blockchain</li>
              </ul>
            </div>
            
            <div className="mobile-instructions">
              <ul>
                <li>Tap the screen to jump</li>
                <li>Swipe up to jump</li>
                <li>Swipe down to duck</li>
                <li>Avoid obstacles and survive as long as possible</li>
                <li>Your score will be recorded on the blockchain</li>
              </ul>
            </div>
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