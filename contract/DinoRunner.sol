// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

/**
 * @title DinoRunner
 * @dev Contract for recording dinosaur game interactions on blockchain
 */
contract DinoRunner {
    // Events
    event JumpRecorded(address player, uint256 height, uint256 score, uint256 timestamp, string gameId);
    event GameOverRecorded(address player, uint256 finalScore, uint256 timestamp, string gameId);
    event HighScoreAchieved(address player, uint256 score, uint256 timestamp, string gameId);
    event OwnerAdded(address newOwner);
    event OwnerRemoved(address removedOwner);

    // Structs
    struct PlayerStats {
        uint256 totalJumps;
        uint256 totalGames;
        uint256 highScore;
        uint256 lastPlayedAt;
    }

    // State variables
    uint256 public totalJumps;
    uint256 public totalGames;
    address[] public players;
    mapping(address => PlayerStats) public playerStats;
    mapping(address => bool) public authorizedRecorders;
    
    // Multiple owners support
    mapping(address => bool) public owners;
    address public primaryOwner;  // The original owner who can add/remove other owners

    // Top scores
    struct LeaderboardEntry {
        address player;
        uint256 score;
        uint256 timestamp;
    }
    LeaderboardEntry[] public leaderboard;
    uint256 public constant LEADERBOARD_SIZE = 10;

    // Constructor
    constructor() {
        primaryOwner = msg.sender;
        owners[msg.sender] = true;
        authorizedRecorders[msg.sender] = true;
    }

    // Modifiers
    modifier onlyPrimaryOwner() {
        require(msg.sender == primaryOwner, "Only primary owner can call this function");
        _;
    }

    modifier onlyOwner() {
        require(owners[msg.sender], "Only owners can call this function");
        _;
    }

    modifier onlyAuthorized() {
        require(authorizedRecorders[msg.sender] || owners[msg.sender], 
                "Not authorized to record data");
        _;
    }

    // Owner management functions
    function addOwner(address newOwner) external onlyPrimaryOwner {
        require(newOwner != address(0), "Invalid owner address");
        owners[newOwner] = true;
        authorizedRecorders[newOwner] = true;  // Owners are automatically authorized recorders
        emit OwnerAdded(newOwner);
    }

    function removeOwner(address ownerToRemove) external onlyPrimaryOwner {
        require(ownerToRemove != primaryOwner, "Cannot remove primary owner");
        require(owners[ownerToRemove], "Address is not an owner");
        owners[ownerToRemove] = false;
        // Note: We don't remove them from authorizedRecorders automatically
        emit OwnerRemoved(ownerToRemove);
    }

    function transferPrimaryOwnership(address newPrimaryOwner) external onlyPrimaryOwner {
        require(newPrimaryOwner != address(0), "Invalid new owner address");
        
        // Add as owner first if not already
        if (!owners[newPrimaryOwner]) {
            owners[newPrimaryOwner] = true;
            authorizedRecorders[newPrimaryOwner] = true;
            emit OwnerAdded(newPrimaryOwner);
        }
        
        primaryOwner = newPrimaryOwner;
    }

    // Owner functions
    function addAuthorizedRecorder(address recorder) external onlyOwner {
        authorizedRecorders[recorder] = true;
    }

    function removeAuthorizedRecorder(address recorder) external onlyOwner {
        // Don't allow removing owners' recorder status
        require(!owners[recorder], "Cannot remove owner's recorder status");
        authorizedRecorders[recorder] = false;
    }

    // Game recording functions
    function recordJump(
        address player,
        uint256 height,
        uint256 score,
        string calldata gameId
    ) external onlyAuthorized {
        // Update player stats
        if (playerStats[player].totalJumps == 0) {
            // New player
            players.push(player);
        }
        
        playerStats[player].totalJumps++;
        playerStats[player].lastPlayedAt = block.timestamp;
        
        // Update global stats
        totalJumps++;
        
        // Emit event
        emit JumpRecorded(player, height, score, block.timestamp, gameId);
    }

    function recordGameOver(
        address player,
        uint256 finalScore,
        string calldata gameId
    ) external onlyAuthorized {
        // Update player stats
        if (playerStats[player].totalGames == 0) {
            // New player
            players.push(player);
        }
        
        playerStats[player].totalGames++;
        playerStats[player].lastPlayedAt = block.timestamp;
        
        // Check if this is a new high score for the player
        if (finalScore > playerStats[player].highScore) {
            playerStats[player].highScore = finalScore;
            
            // Update leaderboard if eligible
            updateLeaderboard(player, finalScore);
            
            // Emit high score event
            emit HighScoreAchieved(player, finalScore, block.timestamp, gameId);
        }
        
        // Update global stats
        totalGames++;
        
        // Emit event
        emit GameOverRecorded(player, finalScore, block.timestamp, gameId);
    }

    // Helper function to update leaderboard
    function updateLeaderboard(address player, uint256 score) private {
        // Check if the score is high enough to be on the leaderboard
        if (leaderboard.length < LEADERBOARD_SIZE || score > leaderboard[leaderboard.length - 1].score) {
            // Create new entry
            LeaderboardEntry memory newEntry = LeaderboardEntry({
                player: player,
                score: score,
                timestamp: block.timestamp
            });
            
            // Find position to insert (maintain sorted order)
            if (leaderboard.length == 0) {
                // First entry
                leaderboard.push(newEntry);
            } else {
                bool inserted = false;
                
                for (uint256 i = 0; i < leaderboard.length; i++) {
                    if (score > leaderboard[i].score) {
                        // Insert at this position
                        if (leaderboard.length == LEADERBOARD_SIZE) {
                            // Remove last element if at capacity
                            for (uint256 j = leaderboard.length - 1; j > i; j--) {
                                leaderboard[j] = leaderboard[j - 1];
                            }
                            leaderboard[i] = newEntry;
                        } else {
                            // Add and shift if not at capacity
                            leaderboard.push(leaderboard[leaderboard.length - 1]); // Duplicate last element
                            for (uint256 j = leaderboard.length - 2; j > i; j--) {
                                leaderboard[j] = leaderboard[j - 1];
                            }
                            leaderboard[i] = newEntry;
                        }
                        inserted = true;
                        break;
                    }
                }
                
                // If not inserted and not at capacity, add to the end
                if (!inserted && leaderboard.length < LEADERBOARD_SIZE) {
                    leaderboard.push(newEntry);
                }
            }
        }
    }

    // View functions
    function isOwner(address account) external view returns (bool) {
        return owners[account];
    }

    function getPlayerStats(address player) external view returns (PlayerStats memory) {
        return playerStats[player];
    }
    
    function getLeaderboard() external view returns (LeaderboardEntry[] memory) {
        return leaderboard;
    }
    
    function getGlobalStats() external view returns (uint256, uint256, uint256) {
        return (totalJumps, totalGames, players.length);
    }
}