// src/utils/WalletBridge.js
// Bridge between React wallet state and Phaser components

// Global variable to store current wallet state
window.globalWalletState = window.globalWalletState || {
    address: null,
    isConnected: false
  };
  
  /**
   * Updates the global wallet state and dispatches an event
   * @param {string|null} address - Wallet address
   * @param {boolean} isConnected - Connection status
   * @returns {Object} Updated wallet state
   */
  export function updateGlobalWalletState(address, isConnected) {
    window.globalWalletState = {
      address: address || null,
      isConnected: Boolean(isConnected)
    };
    
    // Dispatch a custom event that Phaser can listen for
    const event = new CustomEvent('WALLET_STATE_CHANGED', { 
      detail: window.globalWalletState 
    });
    document.dispatchEvent(event);
    
    console.log('Global wallet state updated:', window.globalWalletState);
    return window.globalWalletState;
  }
  
  /**
   * Gets the current wallet state (can be called from Phaser or React)
   * @returns {Object} Current wallet state
   */
  export function getWalletState() {
    return window.globalWalletState;
  }
  
  export default {
    updateGlobalWalletState,
    getWalletState
  };