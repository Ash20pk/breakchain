-- Schema for DinoRunner Game with Blockchain Integration

-- Transaction Queue for jumps and game over events
CREATE TABLE dino_transaction_queue (
    id SERIAL PRIMARY KEY,
    player_address VARCHAR(42) NOT NULL,
    game_id VARCHAR(50) NOT NULL,
    type VARCHAR(20) NOT NULL,  -- 'jump' or 'gameover'
    height INTEGER,             -- jump height (null for gameover)
    score INTEGER NOT NULL,     -- current score or final score
    timestamp BIGINT NOT NULL,  -- client timestamp in milliseconds
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'sent', 'failed'
    hash VARCHAR(66),           -- transaction hash when sent
    retries INTEGER NOT NULL DEFAULT 0,
    wallet_index INTEGER,       -- which wallet processed this transaction
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index for fast queue processing
CREATE INDEX idx_dino_transaction_queue_status ON dino_transaction_queue(status, timestamp);
CREATE INDEX idx_dino_transaction_queue_player ON dino_transaction_queue(player_address);

-- Player Sessions table to track games
CREATE TABLE dino_player_sessions (
    id SERIAL PRIMARY KEY,
    player_address VARCHAR(42) NOT NULL,
    game_id VARCHAR(50) NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMP WITH TIME ZONE,
    final_score INTEGER,
    highest_jump INTEGER,
    jumps_count INTEGER DEFAULT 0,
    distance_traveled INTEGER,
    completed BOOLEAN DEFAULT FALSE
);

-- Create index for player lookups
CREATE INDEX idx_dino_player_sessions_player ON dino_player_sessions(player_address);
CREATE INDEX idx_dino_player_sessions_game_id ON dino_player_sessions(game_id);

-- Player Leaderboard 
CREATE TABLE dino_leaderboard (
    id SERIAL PRIMARY KEY,
    player_address VARCHAR(42) NOT NULL,
    player_name VARCHAR(100),
    score INTEGER NOT NULL,
    game_id VARCHAR(50) NOT NULL,
    achieved_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    verified_on_chain BOOLEAN DEFAULT FALSE,
    tx_hash VARCHAR(66)
);

-- Create index for leaderboard
CREATE INDEX idx_dino_leaderboard_score ON dino_leaderboard(score DESC);

-- Player Profiles
CREATE TABLE dino_player_profiles (
    player_address VARCHAR(42) PRIMARY KEY,
    username VARCHAR(100),
    avatar_url VARCHAR(255),
    total_games INTEGER DEFAULT 0,
    total_jumps INTEGER DEFAULT 0,
    high_score INTEGER DEFAULT 0,
    total_distance INTEGER DEFAULT 0,
    first_played_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_played_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- WebSocket Sessions for realtime connections
CREATE TABLE dino_websocket_sessions (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(50) NOT NULL,
    player_address VARCHAR(42),
    connected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_active_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    client_info JSONB,
    status VARCHAR(20) DEFAULT 'active' -- 'active', 'disconnected'
);

-- Create index for WebSocket session management
CREATE INDEX idx_dino_websocket_sessions_status ON dino_websocket_sessions(status);

-- Game Events for analytics
CREATE TABLE dino_game_events (
    id SERIAL PRIMARY KEY,
    game_id VARCHAR(50) NOT NULL,
    player_address VARCHAR(42) NOT NULL,
    event_type VARCHAR(30) NOT NULL, -- 'jump', 'collision', 'powerup', 'gameover', etc.
    event_data JSONB NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index for game events
CREATE INDEX idx_dino_game_events_game_id ON dino_game_events(game_id);
CREATE INDEX idx_dino_game_events_player ON dino_game_events(player_address);

-- Functions and Triggers

-- Update player profiles on game completion
CREATE OR REPLACE FUNCTION update_player_profile_after_game() 
RETURNS TRIGGER AS $$
BEGIN
    -- Update existing player or insert new one
    INSERT INTO dino_player_profiles (
        player_address, 
        total_games, 
        total_jumps,
        high_score,
        last_played_at
    ) VALUES (
        NEW.player_address,
        1,
        NEW.jumps_count,
        NEW.final_score,
        NEW.end_time
    )
    ON CONFLICT (player_address) DO UPDATE SET
        total_games = dino_player_profiles.total_games + 1,
        total_jumps = dino_player_profiles.total_jumps + NEW.jumps_count,
        high_score = GREATEST(dino_player_profiles.high_score, NEW.final_score),
        last_played_at = NEW.end_time;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update player profile when game is completed
CREATE TRIGGER update_player_stats_on_game_complete
AFTER UPDATE OF completed ON dino_player_sessions
FOR EACH ROW WHEN (NEW.completed = true)
EXECUTE FUNCTION update_player_profile_after_game();

-- Clean up old transactions automatically
CREATE OR REPLACE FUNCTION cleanup_old_transactions() 
RETURNS void AS $$
BEGIN
    -- Delete transactions older than 24 hours that are not pending
    DELETE FROM dino_transaction_queue 
    WHERE status != 'pending' 
    AND timestamp < (EXTRACT(EPOCH FROM NOW()) * 1000 - 86400000);
    
    -- Reset transactions that have been pending for too long (1 hour)
    UPDATE dino_transaction_queue
    SET status = 'failed'
    WHERE status = 'pending'
    AND timestamp < (EXTRACT(EPOCH FROM NOW()) * 1000 - 3600000);
END;
$$ LANGUAGE plpgsql;

-- Function to get next batch of pending transactions
CREATE OR REPLACE FUNCTION get_next_pending_transactions(batch_size INTEGER)
RETURNS SETOF dino_transaction_queue AS $$
BEGIN
    RETURN QUERY
    SELECT * FROM dino_transaction_queue
    WHERE status = 'pending'
    ORDER BY timestamp ASC
    LIMIT batch_size
    FOR UPDATE SKIP LOCKED;
END;
$$ LANGUAGE plpgsql;