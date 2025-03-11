// store/appkitStore.js

// Define store with localStorage persistence
const STORE_KEY = 'dino_runner_wallet_state';

// Initialize store with saved state or defaults
const createInitialStore = () => {
  try {
    const savedState = localStorage.getItem(STORE_KEY);
    const defaultState = {
      accountState: {},
      networkState: {},
      appKitState: {},
      themeState: { themeMode: 'light', themeVariables: {} },
      events: [],
      walletInfo: {},
      eip155Provider: null
    };
    
    return savedState ? { ...defaultState, ...JSON.parse(savedState) } : defaultState;
  } catch (error) {
    console.error('Error loading state from localStorage:', error);
    return {
      accountState: {},
      networkState: {},
      appKitState: {},
      themeState: { themeMode: 'light', themeVariables: {} },
      events: [],
      walletInfo: {},
      eip155Provider: null
    };
  }
};

// Create the store
export const store = createInitialStore();

// Save store to localStorage
export const saveStore = () => {
  try {
    // Create a sanitized copy of the store to remove circular references
    const storeCopy = {
      accountState: store.accountState ? {
        address: store.accountState.address,
        isConnected: store.accountState.isConnected
      } : {},
      networkState: store.networkState ? {
        chainId: store.networkState.chainId
      } : {},
      themeState: store.themeState,
      walletInfo: store.walletInfo ? {
        name: store.walletInfo.name,
        icon: store.walletInfo.icon
      } : {}
      // Deliberately omitting appKitState, events, and eip155Provider which may contain circular references
    };
    
    localStorage.setItem(STORE_KEY, JSON.stringify(storeCopy));
  } catch (error) {
    console.error('Error saving state to localStorage:', error);
  }
};

// Update store and save to localStorage
export const updateStore = (key, value) => {
  store[key] = value;
  saveStore();
};

// Load state from localStorage 
export const loadStore = () => {
  try {
    const savedState = localStorage.getItem(STORE_KEY);
    if (savedState) {
      const parsedState = JSON.parse(savedState);
      Object.keys(parsedState).forEach(key => {
        store[key] = parsedState[key];
      });
    }
  } catch (error) {
    console.error('Error loading state from localStorage:', error);
  }
};

export default {
  store,
  updateStore,
  saveStore,
  loadStore
};