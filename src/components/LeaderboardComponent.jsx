import React, { useState, useEffect } from 'react';
import { createPublicClient, http } from 'viem';
import { SomniaChain } from '../utils/chain';
import { DinoRunnerABI } from './abi/DinoRunnerABI';
import './Leaderboard.css';

const Leaderboard = () => {
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Create client with the correct transport configuration
  const client = createPublicClient({
    chain: SomniaChain,
    transport: http("https://dream-rpc.somnia.network")
  });

  // Contract address
  const contractAddress = import.meta.env.VITE_CONTRACT_ADDRESS;

  useEffect(() => {
    const fetchLeaderboard = async () => {
      if (!contractAddress) {
        setError("Contract address not available");
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
        
        console.log("Raw data from contract:", data);

        // Transform the data for display
        const formattedLeaderboard = data.map((entry, index) => ({
          rank: index + 1,
          player: entry.player,
          score: Number(entry.score),
          timestamp: new Date(Number(entry.timestamp) * 1000).toLocaleDateString()
        }));
        
        console.log("Formatted leaderboard:", formattedLeaderboard);

        setLeaderboard(formattedLeaderboard);
        setLoading(false);
      } catch (err) {
        console.error("Error fetching leaderboard:", err);
        setError("Failed to fetch leaderboard data: " + err.message);
        setLoading(false);
      }
    };

    fetchLeaderboard();
  }, [client, contractAddress]);

  // Debug output - add this to see what's happening
  console.log("Component state:", { loading, error, leaderboardLength: leaderboard.length });

  // Function to format addresses for display
  const formatAddress = (address) => {
    if (!address) return "";
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  if (loading) {
    return (
      <div className="blockchain-leaderboard">
        <h2>Top Scores</h2>
        <div className="loading-container">
          <div className="pixel-loader"></div>
          <p>Loading leaderboard from blockchain...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="blockchain-leaderboard">
        <h2>Top Scores</h2>
        <div className="error-container">
          <p className="error-message">{error}</p>
          <button 
            className="pixel-button"
            onClick={() => window.location.reload()}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="blockchain-leaderboard">
      <h2>Top Scores</h2>
      {leaderboard && leaderboard.length > 0 ? (
        <div className="leaderboard-table-container">
          <table className="leaderboard-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Player</th>
                <th>Score</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((entry) => (
                <tr key={`${entry.player}-${entry.score}`}>
                  <td>{entry.rank}</td>
                  <td>{formatAddress(entry.player)}</td>
                  <td>{entry.score}</td>
                  <td>{entry.timestamp}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="no-scores">No scores recorded yet. Be the first!</p>
      )}
      <p className="blockchain-note">
        All scores are permanently recorded on the Somnia blockchain
      </p>
    </div>
  );
};

export default Leaderboard;