// src/components/LeaderboardComponent.jsx - Optimized for mobile
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPublicClient, http } from 'viem';
import { SomniaChain } from '../utils/chain';
import { DinoRunnerABI } from './abi/DinoRunnerABI';
import './Leaderboard.css'; // Make sure to use the optimized CSS

const Leaderboard = () => {
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  
  // Create client with the correct transport configuration and memoize it
  const client = useMemo(() => createPublicClient({
    chain: SomniaChain,
    transport: http("https://dream-rpc.somnia.network", {
      timeout: 15000, // 15 second timeout
      retryCount: 3,
      retryDelay: 1000,
    })
  }), []);

  // Contract address
  const contractAddress = import.meta.env.VITE_CONTRACT_ADDRESS;

  // Function to format addresses for display - memoized for performance
  const formatAddress = useCallback((address) => {
    if (!address) return "";
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }, []);

  // Function to format dates
  const formatDate = useCallback((timestamp) => {
    try {
      const date = new Date(Number(timestamp) * 1000);
      // Mobile-friendly date format
      return date.toLocaleDateString(undefined, { 
        month: 'short', 
        day: 'numeric'
      });
    } catch (err) {
      console.error("Error formatting date:", err);
      return "Unknown";
    }
  }, []);

  // Function to handle retrying the data fetch
  const handleRetry = useCallback(() => {
    setLoading(true);
    setError(null);
    setRetryCount(prev => prev + 1);
  }, []);

  // Detect if we're on a mobile device
  const isMobile = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth <= 768 || 
           ('ontouchstart' in window) || 
           (navigator.maxTouchPoints > 0);
  }, []);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      if (!contractAddress) {
        setError("Contract address not configured");
        setLoading(false);
        return;
      }

      try {
        console.log("Fetching leaderboard data...");
        
        // Use viem to call the getLeaderboard function from the contract
        const data = await client.readContract({
          address: contractAddress,
          abi: DinoRunnerABI,
          functionName: 'getLeaderboard',
        });
        
        if (!data || !Array.isArray(data)) {
          throw new Error("Invalid data received from blockchain");
        }

        // Transform the data for display
        const formattedLeaderboard = data
          .filter(entry => entry && typeof entry === 'object') // Filter valid entries
          .map((entry, index) => ({
            rank: index + 1,
            player: entry.player,
            score: Number(entry.score || 0),
            timestamp: entry.timestamp ? formatDate(entry.timestamp) : 'Unknown'
          }))
          .sort((a, b) => b.score - a.score); // Ensure sorting by score (descending)

        setLeaderboard(formattedLeaderboard);
        setLoading(false);
      } catch (err) {
        console.error("Error fetching leaderboard:", err);
        
        // Provide a more user-friendly error message
        if (err.message?.includes('network') || err.message?.includes('timeout')) {
          setError("Network error. Please check your connection and try again.");
        } else if (err.message?.includes('contract')) {
          setError("Contract error. The leaderboard data couldn't be accessed.");
        } else {
          setError(`Failed to fetch leaderboard: ${err.message || "Unknown error"}`);
        }
        
        setLoading(false);
      }
    };

    fetchLeaderboard();
  }, [client, contractAddress, retryCount, formatDate]);

  // Render loading state
  if (loading) {
    return (
      <div className="blockchain-leaderboard">
        <h2>TOP SCORES</h2>
        <div className="loading-container">
          <div className="dino-running-loader"></div>
          <p>Loading leaderboard...</p>
        </div>
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <div className="blockchain-leaderboard">
        <h2>TOP SCORES</h2>
        <div className="error-container">
          <p className="error-message">{error}</p>
          <button 
            className="pixel-button retry-button"
            onClick={handleRetry}
          >
            RETRY
          </button>
        </div>
      </div>
    );
  }

  // Render empty state
  if (!leaderboard || leaderboard.length === 0) {
    return (
      <div className="blockchain-leaderboard">
        <h2>TOP SCORES</h2>
        <div className="empty-container">
          <p className="no-scores">No scores recorded yet. Be the first!</p>
          <div className="dino-blinking"></div>
        </div>
        <p className="blockchain-note">
          All scores are permanently recorded on the Somnia blockchain
        </p>
      </div>
    );
  }

  // Render leaderboard
  return (
    <div className="blockchain-leaderboard">
      <h2>TOP SCORES</h2>
      <div className="leaderboard-table-container">
        <table className="leaderboard-table">
          <thead>
            <tr>
              <th>#</th>
              <th>PLAYER</th>
              <th>SCORE</th>
            </tr>
          </thead>
          <tbody>
            {leaderboard.map((entry) => (
              <tr key={`${entry.player}-${entry.score}`} className={entry.rank <= 3 ? `rank-${entry.rank}` : ''}>
                <td>{entry.rank}</td>
                <td className="player-address">{formatAddress(entry.player)}</td>
                <td>{entry.score.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="blockchain-note">
        All scores are permanently recorded on the Somnia blockchain
      </p>
    </div>
  );
};

export default Leaderboard;