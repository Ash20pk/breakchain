// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

contract DinoRunner {
    // Events
    event JumpRecorded(address player, string name, uint256 height, uint256 score, uint256 timestamp, string gameId);
    event GameOverRecorded(address player, string name, uint256 finalScore, uint256 timestamp, string gameId);
    event HighScoreAchieved(address player, string name, uint256 score, uint256 timestamp, string gameId);
    event OwnerAdded(address newOwner);
    event OwnerRemoved(address removedOwner);
    event PlayerRegistered(address player, string name);

    // Structs
    struct PlayerStats {
        string name;
        uint256 totalJumps;
        uint256 totalGames;
        uint256 highScore;
        uint256 lastPlayedAt;
    }

    struct LeaderboardEntry {
        address player;
        string name;
        uint256 score;
        uint256 timestamp;
    }

    // State variables
    uint256 public totalJumps;
    uint256 public totalGames;
    address[] public players;
    mapping(address => PlayerStats) public playerStats;
    mapping(address => bool) public authorizedRecorders;
    mapping(address => bool) public owners;
    address public primaryOwner;
    LeaderboardEntry[] public leaderboard;
    uint256 public constant LEADERBOARD_SIZE = 10;

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

    // New function to set player name
    function setPlayer(address playerAddress, string calldata name) external onlyAuthorized {
        if (playerStats[playerAddress].totalJumps == 0 && playerStats[playerAddress].totalGames == 0) {
            players.push(playerAddress);
        }
        playerStats[playerAddress].name = name;
        emit PlayerRegistered(playerAddress, name);
    }

    // Updated game recording functions
    function recordJump(
        address player,
        uint256 height,
        uint256 score,
        string calldata gameId
    ) external onlyAuthorized {
        PlayerStats storage stats = playerStats[player];
        
        stats.totalJumps++;
        stats.lastPlayedAt = block.timestamp;
        totalJumps++;
        
        emit JumpRecorded(player, stats.name, height, score, block.timestamp, gameId);
    }

    function recordGameOver(
        address player,
        uint256 finalScore,
        string calldata gameId
    ) external onlyAuthorized {
        PlayerStats storage stats = playerStats[player];
                
        stats.totalGames++;
        stats.lastPlayedAt = block.timestamp;
        
        if (finalScore > stats.highScore) {
            stats.highScore = finalScore;
            updateLeaderboard(player, finalScore);
            emit HighScoreAchieved(player, stats.name, finalScore, block.timestamp, gameId);
        }
        
        totalGames++;
        emit GameOverRecorded(player, stats.name, finalScore, block.timestamp, gameId);
    }

    function updateLeaderboard(address player, uint256 score) private {
        string memory playerName = playerStats[player].name;
        int256 existingIndex = -1;
        for (uint256 i = 0; i < leaderboard.length; i++) {
            if (leaderboard[i].player == player) {
                existingIndex = int256(i);
                break;
            }
        }

        if (existingIndex >= 0) {
            uint256 idx = uint256(existingIndex);
            if (score > leaderboard[idx].score) {
                leaderboard[idx].score = score;
                leaderboard[idx].timestamp = block.timestamp;
                leaderboard[idx].name = playerName;
                
                while (idx > 0 && leaderboard[idx].score > leaderboard[idx-1].score) {
                    LeaderboardEntry memory temp = leaderboard[idx-1];
                    leaderboard[idx-1] = leaderboard[idx];
                    leaderboard[idx] = temp;
                    idx--;
                }
            }
            return;
        }

        if (leaderboard.length < LEADERBOARD_SIZE || score > leaderboard[leaderboard.length - 1].score) {
            LeaderboardEntry memory newEntry = LeaderboardEntry({
                player: player,
                name: playerName,
                score: score,
                timestamp: block.timestamp
            });
            
            if (leaderboard.length == 0) {
                leaderboard.push(newEntry);
            } else {
                bool inserted = false;
                
                for (uint256 i = 0; i < leaderboard.length; i++) {
                    if (score > leaderboard[i].score) {
                        if (leaderboard.length == LEADERBOARD_SIZE) {
                            for (uint256 j = leaderboard.length - 1; j > i; j--) {
                                leaderboard[j] = leaderboard[j - 1];
                            }
                            leaderboard[i] = newEntry;
                        } else {
                            leaderboard.push(leaderboard[leaderboard.length - 1]);
                            for (uint256 j = leaderboard.length - 2; j > i; j--) {
                                leaderboard[j] = leaderboard[j - 1];
                            }
                            leaderboard[i] = newEntry;
                        }
                        inserted = true;
                        break;
                    }
                }
                
                if (!inserted && leaderboard.length < LEADERBOARD_SIZE) {
                    leaderboard.push(newEntry);
                }
            }
        }
    }

    // Rest of the contract functions remain the same
    function addOwner(address newOwner) external onlyPrimaryOwner {
        require(newOwner != address(0), "Invalid owner address");
        owners[newOwner] = true;
        authorizedRecorders[newOwner] = true;
        emit OwnerAdded(newOwner);
    }

    function removeOwner(address ownerToRemove) external onlyPrimaryOwner {
        require(ownerToRemove != primaryOwner, "Cannot remove primary owner");
        require(owners[ownerToRemove], "Address is not an owner");
        owners[ownerToRemove] = false;
        emit OwnerRemoved(ownerToRemove);
    }

    function transferPrimaryOwnership(address newPrimaryOwner) external onlyPrimaryOwner {
        require(newPrimaryOwner != address(0), "Invalid new owner address");
        if (!owners[newPrimaryOwner]) {
            owners[newPrimaryOwner] = true;
            authorizedRecorders[newPrimaryOwner] = true;
            emit OwnerAdded(newPrimaryOwner);
        }
        primaryOwner = newPrimaryOwner;
    }

    function addAuthorizedRecorder(address recorder) external onlyOwner {
        authorizedRecorders[recorder] = true;
    }

    function removeAuthorizedRecorder(address recorder) external onlyOwner {
        require(!owners[recorder], "Cannot remove owner's recorder status");
        authorizedRecorders[recorder] = false;
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