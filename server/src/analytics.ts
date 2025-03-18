// server/src/analytics.ts
import { PostHog } from 'posthog-node';
import dotenv from 'dotenv';
import { Logger } from 'winston';

dotenv.config();

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
    this.intervalId = setInterval(() => this.calculateAndSendTps(), 10000);
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
      this.posthog = new PostHog(apiKey, { host });
      this.logger.info('PostHog analytics initialized successfully');
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
      timestamp: Date.now()
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
          game_id: txData.game_id
        }
      });
    }
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
      tx => tx.timestamp > now - 60000
    );
    
    // Log current stats
    this.logger.info(`Current TPS: ${this.currentTps}, Recent Tx: ${recentTransactions}`);
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
   * Flush all metrics to PostHog and shutdown
   */
  async shutdown() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    if (this.posthog) {
      try {
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