'use client';
import React, { useEffect, useRef, useState } from 'react';
import { toast } from "sonner";
import { useBlockchainSync } from '@/hooks/useBlockchainSync';
import { useAccount } from 'wagmi';

// Components
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ConnectButton } from '@/components/ui/connect-button';

import { 
  Play, 
  Pause, 
  RotateCw,
  Trophy,
  Send,
  BarChart3,
  AlertCircle,
  RotateCcw
} from 'lucide-react';

// Constants
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 300;
const GROUND_HEIGHT = 250;
const DINO_WIDTH = 40;
const DINO_HEIGHT = 60;
const JUMP_FORCE = -15;
const GRAVITY = 0.8;
const CACTUS_WIDTH = 20;
const CACTUS_HEIGHT = 50;
const CLOUD_WIDTH = 60;
const CLOUD_HEIGHT = 30;
const INITIAL_GAME_SPEED = 6;
const SCORE_INCREMENT = 0.1;
const RECORD_JUMP_INTERVAL = 5; // Record every X jumps
const SCORE_RECORD_INTERVAL = 50; // Record at every X score

// Interfaces
interface Dino {
  x: number;
  y: number;
  velocityY: number;
  isJumping: boolean;
}

interface Cactus {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Cloud {
  id: string;
  x: number;
  y: number;
}

const DinoRunner = () => {
  // Account connection
  const { address, isConnected } = useAccount();
  
  // Blockchain sync hook
  const [blockchainState, blockchainActions] = useBlockchainSync();
  
  // Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const lastFrameTimeRef = useRef<number>(0);
  
  // Game state
  const [isGameRunning, setIsGameRunning] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [gameSpeed, setGameSpeed] = useState(INITIAL_GAME_SPEED);
  const [dino, setDino] = useState<Dino>({
    x: 50,
    y: GROUND_HEIGHT - DINO_HEIGHT,
    velocityY: 0,
    isJumping: false
  });
  const [cacti, setCacti] = useState<Cactus[]>([]);
  const [clouds, setClouds] = useState<Cloud[]>([]);
  const [jumpCount, setJumpCount] = useState(0);
  const [lastRecordedScore, setLastRecordedScore] = useState(0);
  const [totalDistance, setTotalDistance] = useState(0);
  const [showStats, setShowStats] = useState(false);
  
  // Load high score from localStorage on mount
  useEffect(() => {
    const savedHighScore = localStorage.getItem('dinoHighScore');
    if (savedHighScore) {
      setHighScore(parseInt(savedHighScore));
    }
    
    // Initialize clouds
    initializeClouds();
    
    // Fetch leaderboard at startup
    if (blockchainState.connected) {
      blockchainActions.getLeaderboard();
    }
  }, [blockchainState.connected]);
  
  // Setup keyboard listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.code === 'Space' || e.code === 'ArrowUp') && !dino.isJumping && isGameRunning) {
        jump();
      } else if (e.code === 'Enter' && (gameOver || !isGameRunning) && isConnected) {
        resetGame();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      cancelAnimationFrame(animationRef.current);
    };
  }, [dino.isJumping, isGameRunning, gameOver, isConnected]);

  // Game loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Animation function
    const animate = (timestamp: number) => {
      // Calculate delta time for smooth animation
      const deltaTime = lastFrameTimeRef.current ? (timestamp - lastFrameTimeRef.current) / 1000 : 0.016;
      lastFrameTimeRef.current = timestamp;
      
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Update and draw game
      if (isGameRunning && !gameOver) {
        updateGame(deltaTime);
      }
      
      drawGame(ctx);
      
      // Continue animation loop
      animationRef.current = requestAnimationFrame(animate);
    };
    
    // Start animation loop
    animationRef.current = requestAnimationFrame(animate);
    
    return () => {
      cancelAnimationFrame(animationRef.current);
    };
  }, [isGameRunning, gameOver, dino, cacti, clouds, score, blockchainState]);

  // Initialize clouds
  const initializeClouds = () => {
    const initialClouds = [];
    for (let i = 0; i < 3; i++) {
      initialClouds.push({
        id: `cloud-${i}-${Date.now()}`,
        x: 200 + (i * 300),
        y: 50 + Math.random() * 100
      });
    }
    setClouds(initialClouds);
  };

  // Update game state
  const updateGame = (deltaTime: number) => {
    // Update score and distance
    const scoreIncrement = SCORE_INCREMENT * gameSpeed;
    setScore(prevScore => prevScore + scoreIncrement);
    setTotalDistance(prev => prev + gameSpeed * deltaTime);
    
    // Update dino position
    updateDino(deltaTime);
    
    // Update cacti
    updateCacti(deltaTime);
    
    // Update clouds
    updateClouds(deltaTime);
    
    // Increase game speed gradually
    if (score > 0 && Math.floor(score) % 100 === 0 && Math.floor(score) > Math.floor(score - scoreIncrement)) {
      setGameSpeed(prevSpeed => prevSpeed * 1.05);
    }
    
    // Record score milestone
    if (score >= lastRecordedScore + SCORE_RECORD_INTERVAL) {
      setLastRecordedScore(Math.floor(score / SCORE_RECORD_INTERVAL) * SCORE_RECORD_INTERVAL);
      
      // Record to blockchain
      if (blockchainState.gameActive) {
        blockchainActions.recordJump(
          Math.floor(dino.y),
          Math.floor(score)
        ).catch(err => console.error('Error recording score milestone:', err));
      }
    }
    
    // Check for collisions
    checkCollisions();
  };

  // Update dinosaur position
  const updateDino = (deltaTime: number) => {
    setDino(prevDino => {
      // Apply gravity
      let newVelocityY = prevDino.velocityY + GRAVITY;
      let newY = prevDino.y + newVelocityY;
      
      // Check ground collision
      if (newY > GROUND_HEIGHT - DINO_HEIGHT) {
        newY = GROUND_HEIGHT - DINO_HEIGHT;
        newVelocityY = 0;
        return {
          ...prevDino,
          y: newY,
          velocityY: newVelocityY,
          isJumping: false
        };
      }
      
      return {
        ...prevDino,
        y: newY,
        velocityY: newVelocityY,
        isJumping: true
      };
    });
  };

  // Update cacti positions
  const updateCacti = (deltaTime: number) => {
    // Move existing cacti
    setCacti(prevCacti => {
      const updatedCacti = prevCacti
        .map(cactus => ({
          ...cactus,
          x: cactus.x - gameSpeed
        }))
        .filter(cactus => cactus.x > -CACTUS_WIDTH); // Remove offscreen cacti
      
      return updatedCacti;
    });
    
    // Add new cactus at random intervals
    if (Math.random() < 0.01) {
      const minSpacing = 300; // Minimum spacing between cacti
      
      // Check if we can add a new cactus
      const lastCactus = cacti[cacti.length - 1];
      const canAddCactus = !lastCactus || lastCactus.x < CANVAS_WIDTH - minSpacing;
      
      if (canAddCactus) {
        // Randomize cactus height for variety
        const height = CACTUS_HEIGHT + Math.random() * 20 - 10;
        
        setCacti(prevCacti => [
          ...prevCacti,
          {
            id: `cactus-${Date.now()}-${Math.random()}`,
            x: CANVAS_WIDTH,
            y: GROUND_HEIGHT - height,
            width: CACTUS_WIDTH,
            height
          }
        ]);
      }
    }
  };

  // Update cloud positions
  const updateClouds = (deltaTime: number) => {
    // Move existing clouds
    setClouds(prevClouds => {
      const updatedClouds = prevClouds
        .map(cloud => ({
          ...cloud,
          x: cloud.x - gameSpeed * 0.3  // Clouds move slower than the ground
        }))
        .filter(cloud => cloud.x > -CLOUD_WIDTH); // Remove offscreen clouds
      
      // Add new cloud if needed
      if (updatedClouds.length < 3 && Math.random() < 0.01) {
        updatedClouds.push({
          id: `cloud-${Date.now()}-${Math.random()}`,
          x: CANVAS_WIDTH,
          y: 30 + Math.random() * 100
        });
      }
      
      return updatedClouds;
    });
  };

  // Check for collisions
  const checkCollisions = () => {
    for (const cactus of cacti) {
      // Simple AABB collision detection
      if (
        dino.x < cactus.x + cactus.width &&
        dino.x + DINO_WIDTH > cactus.x &&
        dino.y < cactus.y + cactus.height &&
        dino.y + DINO_HEIGHT > cactus.y
      ) {
        handleGameOver();
        break;
      }
    }
  };

  // Handle jump
  const jump = () => {
    if (!dino.isJumping && isGameRunning) {
      setDino(prevDino => ({
        ...prevDino,
        velocityY: JUMP_FORCE,
        isJumping: true
      }));
      
      // Increment jump counter
      const newJumpCount = jumpCount + 1;
      setJumpCount(newJumpCount);
      
      // Record jump to blockchain occasionally to avoid spam
      if (newJumpCount % RECORD_JUMP_INTERVAL === 0 && blockchainState.gameActive) {
        blockchainActions.recordJump(
          Math.floor(dino.y),
          Math.floor(score)
        ).catch(err => console.error('Error recording jump:', err));
      }
    }
  };

  // Handle game over
  const handleGameOver = async () => {
    setIsGameRunning(false);
    setGameOver(true);
    
    // Update high score
    if (score > highScore) {
      setHighScore(score);
      localStorage.setItem('dinoHighScore', Math.floor(score).toString());
    }
    
    // Record game over to blockchain
    if (blockchainState.gameActive) {
      try {
        await blockchainActions.endGame(Math.floor(score), Math.floor(totalDistance));
        toast.success(`Game over! Final score: ${Math.floor(score)} recorded on-chain.`);
      } catch (err) {
        console.error('Error recording game over:', err);
        toast.error('Failed to record final score');
      }
    } else {
      toast.error("Game Over!", {
        description: `Final Score: ${Math.floor(score)} (not recorded on blockchain)`
      });
    }
  };

  // Reset game
  const resetGame = async () => {
    // Start a new blockchain game session
    if (isConnected && blockchainState.connected) {
      try {
        // First check if a game is already active and end it
        if (blockchainState.gameActive && blockchainState.gameId) {
          try {
            await blockchainActions.endGame(Math.floor(score), Math.floor(totalDistance));
            console.log("Ended previous active game before starting new one");
          } catch (err) {
            console.warn("Could not cleanly end previous game:", err);
            // Continue anyway
          }
        }
        
        // Add a small delay to ensure server had time to process game ending
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Now start the new game
        await blockchainActions.startGame();
        
        setIsGameRunning(true);
        setGameOver(false);
        setScore(0);
        setGameSpeed(INITIAL_GAME_SPEED);
        setDino({
          x: 50,
          y: GROUND_HEIGHT - DINO_HEIGHT,
          velocityY: 0,
          isJumping: false
        });
        setCacti([]);
        setJumpCount(0);
        setLastRecordedScore(0);
        setTotalDistance(0);
        initializeClouds();
        
        toast.success('Game started!', {
          description: 'Your gameplay will be recorded on the blockchain'
        });
      } catch (err) {
        console.error('Error starting game:', err);
        
        // More specific error message based on error type
        if (err.message && err.message.includes("unique or exclusion constraint")) {
          toast.error('Session error', { 
            description: 'You may have another active game. Please try again in a moment.'
          });
          
          // Try to reconnect or reset the session
          blockchainActions.reconnect();
        } else {
          toast.error('Failed to start blockchain game session');
        }
      }
    } else if (!isConnected) {
      toast.error('Please connect your wallet to play');
    } else if (!blockchainState.connected) {
      toast.error('Cannot connect to blockchain server. Retrying...');
      // Try to reconnect
      blockchainActions.reconnect();
    }
  };

  // Draw game elements
  const drawGame = (ctx: CanvasRenderingContext2D) => {
    // Draw sky
    ctx.fillStyle = '#f0f8ff';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // Draw clouds
    ctx.fillStyle = '#ffffff';
    clouds.forEach(cloud => {
      drawCloud(ctx, cloud);
    });
    
    // Draw ground
    ctx.fillStyle = '#8b4513';
    ctx.fillRect(0, GROUND_HEIGHT, CANVAS_WIDTH, 1);
    
    // Draw ground texture
    ctx.fillStyle = '#d2b48c';
    ctx.fillRect(0, GROUND_HEIGHT + 1, CANVAS_WIDTH, CANVAS_HEIGHT - GROUND_HEIGHT - 1);
    
    // Draw cacti
    ctx.fillStyle = '#2e8b57';
    cacti.forEach(cactus => {
      drawCactus(ctx, cactus);
    });
    
    // Draw dino
    drawDino(ctx);
    
    // Draw score
    ctx.fillStyle = '#000000';
    ctx.font = '16px Arial';
    ctx.textAlign = 'right';
    ctx.fillText(`Score: ${Math.floor(score)}`, CANVAS_WIDTH - 20, 30);
    ctx.fillText(`High Score: ${Math.floor(highScore)}`, CANVAS_WIDTH - 20, 50);
    
    // Draw blockchain status
    ctx.fillStyle = '#000000';
    ctx.font = '12px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`Pending TXs: ${blockchainState.pendingTxCount}`, 20, 20);
    
    const txCount = blockchainState.transactions.length;
    ctx.fillText(`Recorded: ${txCount}`, 20, 40);
    
    // Show connection status
    const statusColor = blockchainState.connected ? 
      '#22c55e' : 
      '#ef4444';
    
    ctx.fillStyle = statusColor;
    ctx.beginPath();
    ctx.arc(10, 60, 5, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'left';
    ctx.fillText(
      blockchainState.connected ? 
        'Connected' : 
        'Disconnected', 
      20, 63
    );
    
    // Draw game over screen
    if (gameOver) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      
      ctx.fillStyle = '#ffffff';
      ctx.font = '30px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('GAME OVER', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 20);
      
      ctx.font = '20px Arial';
      ctx.fillText(`Score: ${Math.floor(score)}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 10);
      
      if (isConnected) {
        ctx.fillText('Press ENTER to restart', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 40);
      } else {
        ctx.fillText('Connect wallet to play', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 40);
      }
    }
    
    // Draw start game text
    if (!isGameRunning && !gameOver) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      
      ctx.fillStyle = '#ffffff';
      ctx.font = '30px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('BLOCKCHAIN DINO RUNNER', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 40);
      
      ctx.font = '20px Arial';
      
      if (isConnected) {
        ctx.fillText('Press ENTER to start', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
        ctx.fillText('Use SPACE to jump', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 30);
      } else {
        ctx.fillText('Connect your wallet to play', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
      }
    }
  };

  // Draw dinosaur
  const drawDino = (ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = '#333333';
    
    // Body
    ctx.fillRect(dino.x, dino.y, DINO_WIDTH, DINO_HEIGHT);
    
    // Head
    ctx.fillRect(dino.x + DINO_WIDTH - 10, dino.y - 15, 20, 20);
    
    // Eye
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(dino.x + DINO_WIDTH - 2, dino.y - 7, 3, 0, Math.PI * 2);
    ctx.fill();
    
    // Legs (animated based on movement)
    ctx.fillStyle = '#333333';
    if (dino.isJumping) {
      // Both legs back when jumping
      ctx.fillRect(dino.x + 5, dino.y + DINO_HEIGHT, 8, 10);
      ctx.fillRect(dino.x + DINO_WIDTH - 15, dino.y + DINO_HEIGHT, 8, 10);
    } else {
      // Alternate legs when running (using score as a timer)
      const legOffset = (Math.floor(score * 10) % 2 === 0) ? 0 : 10;
      ctx.fillRect(dino.x + 5, dino.y + DINO_HEIGHT, 8, 10 + legOffset);
      ctx.fillRect(dino.x + DINO_WIDTH - 15, dino.y + DINO_HEIGHT, 8, 10 - legOffset);
    }
    
    // Tail
    ctx.beginPath();
    ctx.moveTo(dino.x, dino.y + 10);
    ctx.lineTo(dino.x - 15, dino.y + 20);
    ctx.lineTo(dino.x, dino.y + 30);
    ctx.fill();
  };

  // Draw cactus
  const drawCactus = (ctx: CanvasRenderingContext2D, cactus: Cactus) => {
    // Main stem
    ctx.fillRect(cactus.x, cactus.y, cactus.width, cactus.height);
    
    // Add branches for visual variety
    const branchHeight = cactus.height * 0.3;
    const branchWidth = cactus.width * 0.8;
    
    // Left branch
    ctx.fillRect(
      cactus.x - branchWidth + 5, 
      cactus.y + cactus.height * 0.2, 
      branchWidth, 
      8
    );
    
    // Right branch
    ctx.fillRect(
      cactus.x + cactus.width - 5, 
      cactus.y + cactus.height * 0.4, 
      branchWidth, 
      8
    );
  };

  // Draw cloud
  const drawCloud = (ctx: CanvasRenderingContext2D, cloud: Cloud) => {
    // Cloud base
    ctx.beginPath();
    ctx.arc(cloud.x + 20, cloud.y + 15, 15, 0, Math.PI * 2);
    ctx.arc(cloud.x + 35, cloud.y + 10, 20, 0, Math.PI * 2);
    ctx.arc(cloud.x + 50, cloud.y + 15, 15, 0, Math.PI * 2);
    ctx.fill();
  };

  // Wallet status display
  const WalletStatusDisplay = () => {
    if (!blockchainState.walletStatus.length) return null;
    
    return (
      <div className="space-y-2 mt-4">
        <h3 className="text-sm font-medium">Wallet Status</h3>
        <div className="space-y-2">
          {blockchainState.walletStatus.map((wallet) => (
            <div 
              key={wallet.index} 
              className={`text-xs flex items-center justify-between p-2 rounded border 
                ${wallet.consecutiveErrors >= 5 ? 'bg-red-100 dark:bg-red-900/30 border-red-300' : 
                  wallet.isProcessing ? 'bg-blue-100 dark:bg-blue-900/30 border-blue-300' : 
                  'bg-gray-100 dark:bg-gray-800 border-gray-300'}`}
            >
              <div className="flex items-center gap-2">
                <span>Wallet {wallet.index + 1}</span>
                {wallet.isProcessing && <span className="animate-pulse">⚡</span>}
                {wallet.consecutiveErrors >= 5 && <AlertCircle className="h-3 w-3 text-red-500" />}
              </div>
              <div className="flex items-center gap-2">
                <span>Tx: {wallet.totalProcessed}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Transactions list
  const TransactionsList = () => {
    return (
      <div className="h-60 overflow-y-auto space-y-2 pr-2">
        {blockchainState.transactions.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            <Trophy className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No transactions yet</p>
          </div>
        ) : (
          blockchainState.transactions.map((tx, i) => {
            const isGameOver = tx.type === 'gameover';
            
            return (
              <div 
                key={tx.id} 
                className={`text-xs border rounded p-2 bg-secondary/20
                  ${isGameOver ? 'border-red-300' : 'border-blue-300'}`}
              >
                <div className="flex justify-between">
                  <span className="font-medium truncate">
                    {tx.hash ? tx.hash.substring(0, 10) + '...' : 'Pending...'}
                  </span>
                  <Badge 
                    variant="outline" 
                    className={isGameOver ? "bg-red-100 dark:bg-red-900/30" : ""}
                  >
                    {isGameOver ? 'Game Over' : 'Jump'}
                  </Badge>
                </div>
                <div className="text-muted-foreground mt-1">
                  {isGameOver ? (
                    <span>Final Score: {tx.score}</span>
                  ) : (
                    <span>Height: {tx.height} | Score: {tx.score}</span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    );
  };

  // Leaderboard display
  const LeaderboardDisplay = () => {
    if (!blockchainState.leaderboard || blockchainState.leaderboard.length === 0) {
      return (
        <div className="text-center text-muted-foreground py-4">
          <p>No scores on leaderboard yet</p>
        </div>
      );
    }
    
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Top Scores</h3>
        <div className="space-y-1">
          {blockchainState.leaderboard.map((entry, index) => (
            <div 
              key={index} 
              className="flex justify-between items-center text-xs p-2 rounded bg-secondary/10"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium">{index + 1}.</span>
                <span className="truncate max-w-32">
                  {entry.username || entry.player_address.substring(0, 6) + '...'}
                </span>
              </div>
              <Badge>{entry.score}</Badge>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col items-center py-6 px-4 max-w-7xl mx-auto">
      <div className="w-full mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Trophy className="text-yellow-500" />
          Break Somnia: Dino Runner
        </h1>
        <p className="text-muted-foreground">
          Jump over cacti to survive. Every jump and game over is recorded on the Somnia blockchain!
        </p>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full" style={{ height: '650px' }}>
        {/* Left sidebar - Controls */}
        <div className="lg:col-span-3 h-full overflow-y-auto pr-2">
          <div className="space-y-6">
            {/* Connect wallet & game controls */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2">
                  <Play className="h-5 w-5 text-blue-500" />
                  Game Controls
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Wallet connection */}
                <div className="w-full">
                  <ConnectButton />
                </div>
                
                <Separator />
                
                {/* Game controls */}
                <div className="grid grid-cols-1 gap-2">
                  <Button 
                    variant="outline" 
                    onClick={() => isGameRunning ? handleGameOver() : resetGame()}
                    disabled={!isConnected || (!isGameRunning && !blockchainState.connected)}
                    className="flex items-center justify-center gap-2"
                  >
                    {isGameRunning ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    {isGameRunning ? "End Game" : "Start Game"}
                  </Button>
                  
                  <Button
                    variant="default"
                    onClick={jump}
                    disabled={!isGameRunning || dino.isJumping}
                    className="flex items-center justify-center gap-2"
                  >
                    Jump (Space)
                  </Button>
                </div>
                
                <Separator />
                
                {/* Game info */}
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Current Score:</span>
                    <Badge variant="outline">{Math.floor(score)}</Badge>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Blockchain Status:</span>
                    <Badge 
                      variant="outline" 
                      className={
                        blockchainState.connected ? 
                          "bg-green-100 dark:bg-green-900/30" : 
                          "bg-red-100 dark:bg-red-900/30"
                      }
                    >
                      {blockchainState.connected ? 
                        "Connected" : 
                        "Disconnected"}
                    </Badge>
                  </div>
                </div>
                
                <Separator />
                
                {/* Statistics toggle */}
                <Button 
                  variant="outline"
                  onClick={() => setShowStats(!showStats)}
                  className="w-full flex items-center gap-1"
                >
                  <BarChart3 className="h-4 w-4" />
                  {showStats ? 'Hide Stats' : 'Show Stats'}
                </Button>
                
                {/* Reconnect button */}
                {!blockchainState.connected && (
                  <Button 
                    variant="outline"
                    onClick={() => blockchainActions.reconnect()}
                    className="w-full flex items-center gap-1"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Reconnect to Blockchain
                  </Button>
                )}
              </CardContent>
            </Card>
            
            {/* Blockchain status */}
            {showStats && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-purple-500" />
                    Blockchain Stats
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Pending TXs:</span>
                    <Badge variant="outline" className={blockchainState.pendingTxCount > 0 ? "bg-amber-100 dark:bg-amber-900" : ""}>
                      {blockchainState.pendingTxCount}
                    </Badge>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Total Recorded:</span>
                    <Badge variant="outline">{blockchainState.transactions.length}</Badge>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Jump Records:</span>
                    <Badge variant="outline">{jumpCount}</Badge>
                  </div>
                  
                  <Separator />
                  
                  <WalletStatusDisplay />
                </CardContent>
              </Card>
            )}
            
            {/* Leaderboard */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-yellow-500" />
                  Leaderboard
                </CardTitle>
              </CardHeader>
              <CardContent>
                <LeaderboardDisplay />
                
                <Button 
                  variant="outline"
                  onClick={() => blockchainActions.getLeaderboard()}
                  className="w-full mt-4 text-xs"
                >
                  Refresh Leaderboard
                </Button>
              </CardContent>
            </Card>
            
            {/* Transactions log */}
            <Card className="h-80 overflow-hidden">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2">
                  <RotateCw className="h-5 w-5 text-green-500" />
                  Blockchain Transactions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <TransactionsList />
              </CardContent>
            </Card>
          </div>
        </div>
        
        {/* Main game area */}
        <div className="lg:col-span-9 h-full">
          <Card className="p-4 h-full">
            <canvas 
              ref={canvasRef} 
              width={CANVAS_WIDTH} 
              height={CANVAS_HEIGHT} 
              onClick={jump}
              className="w-full h-full border-2 border-gray-300 rounded-md cursor-pointer"
            />
            
            <div className="mt-2 text-center text-sm text-muted-foreground">
              Press SPACE to jump or click the canvas. Each jump is recorded on the Somnia blockchain.
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default DinoRunner;