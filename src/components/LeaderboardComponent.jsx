import React, { useState, useEffect, useCallback } from 'react';
import './Leaderboard.css';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const Leaderboard = () => {
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  const formatAddress = useCallback((address) => {
    if (!address) return "";
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }, []);

  const handleRetry = useCallback(() => {
    setLoading(true);
    setError(null);
    setRetryCount(prev => prev + 1);
  }, []);

  const fetchLeaderboard = async () => {
    try {
      console.log("Fetching leaderboard data from Supabase...");
      
      const { data: leaderboardData, error } = await supabase
        .from('dino_leaderboard')
        .select(`
          player_address,
          score,
          dino_player_profiles!inner(username)
        `)
        .order('score', { ascending: false })
        .limit(10);
      
      if (error) throw error;
      
      console.log("Leaderboard data:", leaderboardData);
      if (!leaderboardData || !Array.isArray(leaderboardData)) {
        throw new Error("Invalid data received from database");
      }

      // Process the leaderboard data
      const processedEntries = leaderboardData.map((entry, index) => ({
        rank: index + 1,
        player: entry.player_address,
        score: Number(entry.score),
        displayName: entry.username || formatAddress(entry.player_address)
      }));

      setLeaderboard(processedEntries);
      setLoading(false);
    } catch (err) {
      console.error("Error fetching leaderboard:", err);
      
      if (err.message?.includes('network') || err.message?.includes('timeout')) {
        setError("Network error. Please check your connection and try again.");
      } else {
        setError(`Failed to fetch leaderboard: ${err.message || "Unknown error"}`);
      }
      
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaderboard();
  }, [retryCount, formatAddress]);

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
              <tr 
                key={`${entry.player}-${entry.score}`} 
                className={entry.rank <= 3 ? `rank-${entry.rank}` : ''}
              >
                <td>{entry.rank}</td>
                <td className="player-address">{entry.displayName}</td>
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