// src/components/LeaderboardComponent.jsx - Optimized for mobile
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPublicClient, http } from 'viem';
import { SomniaChain } from '../utils/chain';
import { DinoRunnerABI } from './abi/DinoRunnerABI';
import './Leaderboard.css';

const Leaderboard = () => {
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  
  const client = useMemo(() => createPublicClient({
    chain: SomniaChain,
    transport: http("https://dream-rpc.somnia.network", {
      timeout: 15000,
      retryCount: 3,
      retryDelay: 1000,
    })
  }), []);

  const contractAddress = import.meta.env.VITE_CONTRACT_ADDRESS;

  const formatAddress = useCallback((address) => {
    if (!address) return "";
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }, []);

  const formatDate = useCallback((timestamp) => {
    try {
      const date = new Date(Number(timestamp) * 1000);
      return date.toLocaleDateString(undefined, { 
        month: 'short', 
        day: 'numeric'
      });
    } catch (err) {
      console.error("Error formatting date:", err);
      return "Unknown";
    }
  }, []);

  const handleRetry = useCallback(() => {
    setLoading(true);
    setError(null);
    setRetryCount(prev => prev + 1);
  }, []);

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
        
        const data = await client.readContract({
          address: contractAddress,
          abi: DinoRunnerABI,
          functionName: 'getLeaderboard',
        });
        
        console.log("Leaderboard data:", data);
        if (!data || !Array.isArray(data)) {
          throw new Error("Invalid data received from blockchain");
        }

        const formattedLeaderboard = data
          .filter(entry => entry && typeof entry === 'object')
          .reduce((acc, entry) => {
            const existingEntry = acc.find(e => e.player === entry.player);
            if (!existingEntry || Number(entry.score) > existingEntry.score) {
              if (existingEntry) {
                existingEntry.score = Number(entry.score);
                existingEntry.timestamp = formatDate(entry.timestamp);
              } else {
                acc.push({
                  player: entry.player,
                  score: Number(entry.score),
                  timestamp: formatDate(entry.timestamp)
                });
              }
            }
            return acc;
          }, [])
          .sort((a, b) => b.score - a.score)
          .map((entry, index) => ({ ...entry, rank: index + 1 }));

        setLeaderboard(formattedLeaderboard);
        setLoading(false);
      } catch (err) {
        console.error("Error fetching leaderboard:", err);
        
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