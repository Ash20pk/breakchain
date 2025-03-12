// src/utils/blockchainEvents.js

/**
 * This module provides safe access to blockchain events,
 * creating fallbacks if the main CONFIG.EVENTS doesn't include blockchain events
 */

import CONFIG from '../config/game';

// Default blockchain events if not defined in CONFIG
const DEFAULT_BLOCKCHAIN_EVENTS = {
  GAME_START: 'BLOCKCHAIN_GAME_START',
  GAME_END: 'BLOCKCHAIN_GAME_END',
  JUMP_RECORDED: 'BLOCKCHAIN_JUMP_RECORDED',
  TRANSACTION_UPDATED: 'BLOCKCHAIN_TRANSACTION_UPDATED',
  CONNECTION_CHANGED: 'BLOCKCHAIN_CONNECTION_CHANGED',
  ERROR: 'BLOCKCHAIN_ERROR'
};

/**
 * Get blockchain events from CONFIG or use defaults
 */
export const getBlockchainEvents = () => {
  // If blockchain events exist in CONFIG, use them
  if (CONFIG && CONFIG.EVENTS && CONFIG.EVENTS.BLOCKCHAIN) {
    return CONFIG.EVENTS.BLOCKCHAIN;
  }
  
  // Otherwise use default events
  console.warn('Blockchain events not found in CONFIG, using defaults');
  return DEFAULT_BLOCKCHAIN_EVENTS;
};

/**
 * Safe event emitter for blockchain events
 * @param {Phaser.Events.EventEmitter} emitter - Event emitter
 * @param {string} eventName - Event name key (from BLOCKCHAIN events)
 * @param {any} data - Event data
 */
export const safeEmit = (emitter, eventName, data) => {
  try {
    const events = getBlockchainEvents();
    if (events[eventName]) {
      emitter.emit(events[eventName], data);
      return true;
    }
  } catch (error) {
    console.error(`Error emitting ${eventName} event:`, error);
  }
  return false;
};

/**
 * Safe event listener for blockchain events
 * @param {Phaser.Events.EventEmitter} emitter - Event emitter
 * @param {string} eventName - Event name key (from BLOCKCHAIN events)
 * @param {function} listener - Event listener
 * @param {object} context - Event context
 */
export const safeOn = (emitter, eventName, listener, context) => {
  try {
    const events = getBlockchainEvents();
    if (events[eventName]) {
      emitter.on(events[eventName], listener, context);
      return true;
    }
  } catch (error) {
    console.error(`Error adding listener for ${eventName} event:`, error);
  }
  return false;
};

/**
 * Creates a custom DOM event for blockchain events
 * @param {string} eventName - Event name key (from BLOCKCHAIN events)
 * @param {any} detail - Event detail data
 */
export const createDOMEvent = (eventName, detail) => {
  try {
    const events = getBlockchainEvents();
    if (events[eventName]) {
      return new CustomEvent(events[eventName], { detail });
    }
  } catch (error) {
    console.error(`Error creating DOM event for ${eventName}:`, error);
  }
  return null;
};

export default {
  getBlockchainEvents,
  safeEmit,
  safeOn,
  createDOMEvent
};