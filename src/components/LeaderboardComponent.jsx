import React, { useState, useEffect, useCallback } from 'react';
import './Leaderboard.css';
import { createClient } from '@supabase/supabase-js';
import { useAccount } from 'wagmi';
import { toast } from 'sonner';

// Initialize Supabase client
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const Leaderboard = () => {
  const [leaderboard, setLeaderboard] = useState([]);
  const [playerRank, setPlayerRank] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const { address } = useAccount();

  const formatAddress = useCallback((address) => {
    if (!address) return "";
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }, []);

  const handleRetry = useCallback(() => {
    setLoading(true);
    setError(null);
    setRetryCount(prev => prev + 1);
  }, []);

  // Fetch both top 10 and player's position
  const fetchLeaderboardData = async () => {
    try {
      setLoading(true);
      console.log("Fetching leaderboard data from Supabase...");
      
      // Get top 10 scores
      const { data: topScores, error: topError } = await supabase
        .from('dino_leaderboard')
        .select(`
          player_address,
          score,
          dino_player_profiles(username)
        `)
        .order('score', { ascending: false })
        .limit(10);
        
      if (topError) throw topError;
      
      // Process the top 10 scores
      const processedTopScores = topScores.map((entry, index) => ({
        rank: index + 1,
        player: entry.player_address,
        score: Number(entry.score),
        displayName: entry.dino_player_profiles?.username || formatAddress(entry.player_address),
        isCurrentPlayer: address && entry.player_address.toLowerCase() === address.toLowerCase()
      }));
      
      // If player is connected, find their rank
      let playerRankData = null;
      if (address) {
        // First check if player is already in top 10
        const playerInTop10 = processedTopScores.find(entry => 
          entry.player.toLowerCase() === address.toLowerCase()
        );
        
        if (playerInTop10) {
          playerRankData = playerInTop10;
        } else {
          // If not in top 10, fetch player's best score
          const { data: playerData, error: playerError } = await supabase
            .from('dino_leaderboard')
            .select(`
              player_address,
              score,
              dino_player_profiles(username)
            `)
            .eq('player_address', address.toLowerCase())
            .order('score', { ascending: false })
            .limit(1);
          
          if (!playerError && playerData && playerData.length > 0) {
            // Get player's rank
            const { data: rankData, error: rankError } = await supabase
              .rpc('get_player_rank', { player_addr: address.toLowerCase() });
            
            if (!rankError && rankData) {
              playerRankData = {
                rank: rankData,
                player: playerData[0].player_address,
                score: Number(playerData[0].score),
                displayName: playerData[0].dino_player_profiles?.username || formatAddress(playerData[0].player_address),
                isCurrentPlayer: true
              };
            }
          }
        }
      }
      
      setLeaderboard(processedTopScores);
      setPlayerRank(playerRankData);
      setLoading(false);
    } catch (err) {
      console.error("Error fetching leaderboard:", err);
      setError(`Failed to fetch leaderboard: ${err.message}`);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaderboardData();
  }, [retryCount, formatAddress, address]);

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

  const showPlayerNotInTop10 = playerRank && !leaderboard.some(entry => 
    entry.player.toLowerCase() === address?.toLowerCase()
  );

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
                className={`
                  ${entry.rank <= 3 ? `rank-${entry.rank}` : ''}
                  ${entry.isCurrentPlayer ? 'current-player' : ''}
                `}
              >
                <td>{entry.rank}</td>
                <td className="player-address">
                  {entry.displayName}
                  {entry.isCurrentPlayer ? <span className="your-score">YOU</span> : null}
                </td>
                <td>{entry.score.toLocaleString()}</td>
              </tr>
            ))}
            
            {/* Show player's rank if not in top 10 */}
            {showPlayerNotInTop10 && (
              <>
                <tr className="rank-separator">
                  <td colSpan="3">...</td>
                </tr>
                <tr className="current-player">
                  <td>{playerRank.rank}</td>
                  <td className="player-address">
                    {playerRank.displayName}
                    <span className="your-score">YOU</span>
                  </td>
                  <td>{playerRank.score.toLocaleString()}</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
      
      {address && !playerRank && (
        <div className="not-ranked-message">
          <p>You haven't recorded a score yet. Play now to get on the leaderboard!</p>
        </div>
      )}
      
      <div className="leaderboard-controls">
        <button 
          className="pixel-button refresh-button"
          onClick={handleRetry}
        >
          REFRESH
        </button>
      </div>
      
      <p className="blockchain-note">
        All scores are permanently recorded on the Somnia blockchain
      </p>
    </div>
  );
};

export default Leaderboard;