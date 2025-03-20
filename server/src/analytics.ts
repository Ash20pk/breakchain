// server/src/analytics.ts
import { PostHog } from 'posthog-node';
import dotenv from 'dotenv';
import { Logger } from 'winston';

dotenv.config();

// Configurable constants
const BUFFER_WINDOW_MS = parseInt(process.env.ANALYTICS_BUFFER_WINDOW_MS || '60000');
const TPS_CALC_INTERVAL = parseInt(process.env.ANALYTICS_TPS_INTERVAL_MS || '10000');
const POSTHOG_FLUSH_AT = parseInt(process.env.POSTHOG_FLUSH_AT || '20');
const POSTHOG_FLUSH_INTERVAL = parseInt(process.env.POSTHOG_FLUSH_INTERVAL || '10000');

/**
 * Analytics service for tracking blockchain metrics using PostHog
 */
export class AnalyticsService {
  private posthog: PostHog | null = null;
  private logger: Logger;
  private transactionBuffer: any[] = [];
  private lastTpsCalculation: number = Date.now();
  private currentTps: number = 0;
  private intervalId: NodeJS.Timeout | null = null;

  constructor(logger: Logger) {
    this.logger = logger;
    this.initPostHog();
    
    // Calculate TPS every 10 seconds and send to PostHog
    this.intervalId = setInterval(() => this.calculateAndSendTps(), TPS_CALC_INTERVAL);
  }

  /**
   * Initialize PostHog client
   */
  private initPostHog() {
    const apiKey = process.env.POSTHOG_API_KEY;
    const host = process.env.POSTHOG_HOST || 'https://app.posthog.com';
    
    if (!apiKey) {
      this.logger.warn('PostHog API key not found. Analytics will be disabled.');
      return;
    }
    
    try {
      // Initialize with custom batching settings
      this.posthog = new PostHog(apiKey, { 
        host,
        flushAt: POSTHOG_FLUSH_AT, 
        flushInterval: POSTHOG_FLUSH_INTERVAL
      });
      this.logger.info(`PostHog analytics initialized with flushAt=${POSTHOG_FLUSH_AT}, flushInterval=${POSTHOG_FLUSH_INTERVAL}ms`);
    } catch (error) {
      this.logger.error('Failed to initialize PostHog:', error);
    }
  }

  /**
   * Track a blockchain transaction
   * @param txData Transaction data
   */
  trackTransaction(txData: any) {
    if (!this.posthog) return;
    
    // Add to transaction buffer for TPS calculation
    this.transactionBuffer.push({
      ...txData,
      timestamp: Date.now(),
      submissionTime: Date.now() // Track when tx was submitted for confirmation timing
    });
    
    // Track in PostHog with all relevant properties
    this.posthog.capture({
      distinctId: txData.player_address || 'anonymous',
      event: `blockchain_${txData.type}`,
      properties: {
        game_id: txData.game_id,
        status: txData.status,
        score: txData.score,
        transaction_hash: txData.hash,
        height: txData.height,
        timestamp: txData.timestamp || Date.now(),
        transaction_id: txData.id
      }
    });
    
    // Additional events for PostHog insights
    if (txData.type === 'gameover') {
      // Track game completion event
      this.posthog.capture({
        distinctId: txData.player_address || 'anonymous',
        event: 'game_completed',
        properties: {
          score: txData.score,
          game_id: txData.game_id,
          timestamp: Date.now()
        }
      });
    } else if (txData.type === 'setplayer') {
        // Track player registration event
        this.posthog.capture({
          distinctId: txData.player_address || 'anonymous',
          event: 'player_registered',
          properties: {
            player_name: txData.username,
            timestamp: Date.now()
          }
        });
      }
    }

  /**
   * Track transaction confirmation on blockchain
   */
  trackTransactionConfirmation(txHash: string, status: 'confirmed' | 'failed', data: any) {
    if (!this.posthog) return;
    
    this.posthog.capture({
      distinctId: data.player_address || 'anonymous',
      event: `blockchain_tx_${status}`,
      properties: {
        txHash: txHash,
        type: data.type,
        gameId: data.game_id,
        confirmationTime: Date.now(),
        blockNumber: data.blockNumber || 0,
        confirmationDuration: data.submissionTime ? Date.now() - data.submissionTime : null,
        score: data.score
      }
    });
  }

  /**
   * Track complete game session with rich metadata
   */
  trackGameCompletion(gameData: any) {
    if (!this.posthog) return;
    
    this.posthog.capture({
      distinctId: gameData.playerAddress || 'anonymous',
      event: 'game_completed_full',
      properties: {
        gameId: gameData.gameId,
        finalScore: gameData.finalScore,
        distance: gameData.distance,
        duration: gameData.duration || 0,
        jumpsCount: gameData.jumpsCount || 0,
        isHighScore: gameData.isHighScore || false,
        timestamp: Date.now(),
        date: new Date().toISOString()
      }
    });
  }

  /**
   * Calculate TPS and send to PostHog
   */
  private calculateAndSendTps() {
    if (!this.posthog) return;
    
    const now = Date.now();
    const timeWindow = now - this.lastTpsCalculation;
    
    // Count transactions in the last 10 seconds
    const recentTransactions = this.transactionBuffer.filter(
      tx => tx.timestamp > now - 10000
    ).length;
    
    // Calculate TPS
    this.currentTps = Math.round((recentTransactions / timeWindow) * 1000 * 100) / 100;
    this.lastTpsCalculation = now;
    
    // Send TPS to PostHog
    this.posthog.capture({
      distinctId: 'system',
      event: 'blockchain_tps',
      properties: {
        tps: this.currentTps,
        transactions_in_window: recentTransactions,
        window_size_ms: timeWindow
      }
    });
    
    // Clean up old transactions from buffer (keep last 60 seconds)
    this.transactionBuffer = this.transactionBuffer.filter(
      tx => tx.timestamp > now - BUFFER_WINDOW_MS
    );
  }
  
  /**
   * Track game start event
   */
  trackGameStart(data: any) {
    if (!this.posthog) return;
    
    this.posthog.capture({
      distinctId: data.playerAddress || 'anonymous',
      event: 'game_started',
      properties: {
        game_id: data.gameId,
        timestamp: Date.now()
      }
    });
  }
  
  /**
   * Track session start (for player engagement metrics)
   */
  trackSessionStart(playerAddress: string, sessionId: string, clientInfo: any = {}) {
    if (!this.posthog) return;
    
    this.posthog.capture({
      distinctId: playerAddress || 'anonymous',
      event: 'session_started',
      properties: {
        sessionId: sessionId,
        startTime: Date.now(),
        deviceInfo: clientInfo,
        timestamp: Date.now()
      }
    });
  }
  
  /**
   * Track session end (for player engagement metrics)
   */
  trackSessionEnd(playerAddress: string, sessionId: string, duration: number) {
    if (!this.posthog) return;
    
    this.posthog.capture({
      distinctId: playerAddress || 'anonymous',
      event: 'session_ended',
      properties: {
        sessionId: sessionId,
        duration: duration,
        endTime: Date.now(),
        timestamp: Date.now()
      }
    });
  }
  
  /**
   * Track client-side events (browser/frontend events)
   */
  trackClientEvent(eventName: string, data: any) {
    if (!this.posthog) return;
    
    this.posthog.capture({
      distinctId: data.playerAddress || 'anonymous',
      event: eventName,
      properties: {
        ...data.properties,
        clientTimestamp: data.timestamp || Date.now(),
        serverTimestamp: Date.now(),
        sessionId: data.sessionId
      }
    });
  }
  
  /**
   * Track player identification
   */
  identifyPlayer(address: string, properties: any = {}) {
    if (!this.posthog || !address) return;
    
    this.posthog.identify({
      distinctId: address,
      properties: {
        $name: properties.name || `Player ${address.substring(0, 6)}`,
        wallet_address: address,
        first_seen: properties.first_seen || new Date().toISOString(),
        ...properties
      }
    });
  }
  
  /**
   * Force an immediate flush of queued events
   */
  flush() {
    if (this.posthog) {
      this.posthog.flush();
    }
  }
  
  /**
   * Flush all metrics to PostHog and shutdown
   */
  async shutdown() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    if (this.posthog) {
      try {
        // Make sure to wait for shutdown to complete
        await this.posthog.shutdown();
        this.logger.info('PostHog analytics flushed and shut down');
      } catch (error) {
        this.logger.error('Error shutting down PostHog:', error);
      }
    }
  }
}

// Singleton instance
let analyticsInstance: AnalyticsService | null = null;

/**
 * Initialize analytics with the provided logger
 */
export function initAnalytics(logger: Logger): AnalyticsService {
  if (!analyticsInstance) {
    analyticsInstance = new AnalyticsService(logger);
  }
  return analyticsInstance;
}

/**
 * Get the analytics instance
 */
export function getAnalytics(): AnalyticsService | null {
  return analyticsInstance;
}