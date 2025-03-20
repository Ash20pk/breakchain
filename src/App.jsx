// src/App.jsx - Optimized for mobile
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { ConnectKitButton } from 'connectkit';
import { toast, Toaster } from 'sonner';
import './App.css';
import Game from './Game';
import config from './config';
import Leaderboard from './components/LeaderboardComponent';
import BlockchainSync, { initialize as initializeBlockchain } from './hooks/BlockchainSync';
import NamePromptModal from './components/NamePromptModal'; 
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

function App() {
  const [gameStarted, setGameStarted] = useState(false);
  const [loadingGame, setLoadingGame] = useState(false);
  const [showIntro, setShowIntro] = useState(true);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [introProgress, setIntroProgress] = useState(0);
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [ name, setName ] = useState('');
  const [blockchainInitialized, setBlockchainInitialized] = useState(false);
  const [api, setApi] = useState(null);
  
  const gameContainerRef = useRef(null);
  const { address, isConnected } = useAccount();

  // Fetch high score
  useEffect(() => {
    if (!address) return;
    const fetchHighScore = async () => {
      try {
        const { data: highScore, error } = await supabase
          .from('dino_leaderboard')
          .select(`
            player_address,
            score
          `)
          .eq('player_address', address.toLowerCase())
          .order('score', { ascending: false })
          .limit(1);
        
        if (!error && highScore && highScore.length > 0) {
          const score = Number(highScore[0].score);
          console.log('High score:', score);
          localStorage.setItem('highScore', score);
        }
      } catch (err) {
        console.error('Error fetching high score:', err);
        toast.error('Failed to fetch high score');
      }
    };

    // Add a small delay to allow connection
    setTimeout(() => {
      fetchHighScore();
    }, 1000);
    
  }, [address]);
  
  // Initialize blockchain connection
  useEffect(() => {
    const initialize = async () => {
      console.log("Initializing blockchain connection...");
      const api = await BlockchainSync.initialize();  
      
      if (api) {
        setApi(api);
        
        // Add a small delay to allow connection
        setTimeout(() => {
          const connectionStatus = api.isConnected();
          console.log('Blockchain connection status:', connectionStatus);
          setBlockchainInitialized(connectionStatus);
        }, 2000);
      }
    };
    initialize();
  }, []);
  
  useEffect(() => {
    const checkUsername = async () => {
      if (localStorage.getItem('username')) {
        setName(localStorage.getItem('username'));
        return;
      }
      console.log('Checking username:', {
        isConnected,
        address,
        blockchainInitialized
      });
  
      if (isConnected && address && blockchainInitialized) {
        try {
          const result = await BlockchainSync.checkUsername(address);
          
          console.log('Username check result:', result);
          
          if (!result.username) {
            console.warn('No username found, showing prompt');
            setShowNamePrompt(true);
          } else {
            console.log('Username found:', result.username);
            setName(result.username);
            localStorage.setItem('username', result.username);
          }
        } catch (error) {
          console.error('Error checking username:', error);
        }
      }
    };
  
    // Add a small delay to ensure everything is initialized
    const timer = setTimeout(checkUsername, 500);
  
    return () => clearTimeout(timer);
  }, [isConnected, address, blockchainInitialized]);

  const handleSaveName = async (name) => {
    try {
      if (!blockchainInitialized) {
        return;
      }
      // Send authentication with username
      BlockchainSync.authenticateUser(address, name, (result) => {
        if (result.success) {
          setShowNamePrompt(false);
          setName(name);
          toast.success('Username saved successfully');
        } else {
          console.error('Authentication failed:', result.message);
          toast.error('Failed to save username: ' + result.message);
        }
      });
    } catch (error) {
      console.error('Error saving username:', error);
      toast.error('Failed to save username');
    }
  };

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
        <Toaster 
          position={isMobile ? "bottom-center" : "top-right"} // Position based on device
          richColors={false}
          closeButton={true}
          theme="light"
          toastOptions={{
            duration: 4000,
            style: {
              width: '100%',
              maxWidth: '100%',
              border: '2px solid maroon',
              background: '#fff',
              borderRadius: '0',
              padding: isMobile ? '8px' : '10px'
            }
          }}
        />
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

      <NamePromptModal 
        isOpen={showNamePrompt}
        onSave={handleSaveName}
        onClose={() => setShowNamePrompt(false)}
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
              {isConnected ? name ? 'WELCOME ' + name.toUpperCase() + '!' : 'WALLET CONNECTED' : ''}
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
        <p> 2025 Dino Runner | ON-CHAIN EDITION | Powered by Somnia Network</p>
      </footer>
    </div>
  );
}

export default App;