// wallet.js
import { SomniaChain } from './chain';
import { createAppKit } from '@reown/appkit';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { store, updateStore } from './appkitStore';
import { updateButtonVisibility } from './dom';

// Create Wagmi adapter using Vite environment variables
const projectId = import.meta.env.VITE_WALLET_CONNECT_PROJECT_ID;

export const wagmiAdapter = new WagmiAdapter({
  projectId,
  networks: [SomniaChain],
});

// Configure the metadata
const metadata = {
  name: 'Dino Runner',
  description: 'Chrome Dino game with blockchain integration',
  url: window.location.origin,
  icons: ['https://avatars.githubusercontent.com/u/37784886'],
};

// Create the AppKit instance
export const appKit = createAppKit({
  adapters: [wagmiAdapter],
  networks: [SomniaChain],
  metadata,
  themeMode: 'light',
  projectId,
  themeVariables: {
    '--w3m-accent': 'transparent',
    '--w3m-font-family': 'Press Start 2P',
    '--w3m-z-index': 10,
  }
});

// Update address display
function updateAddressDisplay(accountState) {
  // Update the disconnect button to show the address instead
  const disconnectButton = document.getElementById('disconnect');
  if (!disconnectButton) return;
  
  if (accountState?.isConnected && accountState?.address) {
    const shortAddress = `${accountState.address.slice(0, 6)}...${accountState.address.slice(-4)}`;
    
    // Clear button content
    disconnectButton.innerHTML = '';
    
    // Add address text
    const addressSpan = document.createElement('span');
    addressSpan.textContent = shortAddress;
    disconnectButton.appendChild(addressSpan);
    
    // Show the button
    // eslint-disable-next-line no-param-reassign
    disconnectButton.style.display = 'flex';
  } else {
    // Reset to default text when disconnected
    // eslint-disable-next-line no-param-reassign
    disconnectButton.innerHTML = 'DISCONNECT';
    // eslint-disable-next-line no-param-reassign
    disconnectButton.style.display = 'none';
  }
}

// Initialize subscribers for AppKit events
export const initializeSubscribers = (modal) => {
  modal.subscribeProviders(state => {
    updateStore('eip155Provider', state.eip155);
    console.log('Provider state updated:', state);
  });
  
  modal.subscribeAccount(state => {
    updateStore('accountState', state);
    updateAddressDisplay(state);
    console.log('Account state updated:', state);
  });
  
  modal.subscribeNetwork(state => {
    updateStore('networkState', state);
    console.log('Network state updated:', state);
  });
  
  modal.subscribeState(state => {
    updateStore('appKitState', state);
    updateButtonVisibility(modal.getIsConnectedState());
    console.log('AppKit state updated:', state);
  });
};

// Create wallet UI elements 
export function createWalletButton() {
  console.log('Creating wallet button');
  
  // Add CSS for 8-bit style
  const style = document.createElement('style');
  style.textContent = `
  @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
  
  .wallet-container {
    position: absolute;
    top: 10px;
    right: 10px;
    z-index: 1000;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 8px;
  }
  
  .pixel-btn {
    font-family: 'Press Start 2P', monospace;
    font-size: 12px;
    padding: 8px 12px;
    background-color: #fff; /* White background like the game */
    color: #535353; /* Dark gray text like the high score */
    border: 2px solid #535353; /* Border to match game elements */
    cursor: pointer;
    text-transform: uppercase;
    image-rendering: pixelated;
    transition: all 0.1s;
    box-shadow: 4px 4px 0 #f5f5f5; /* Light shadow for depth */
    letter-spacing: 1px;
  }
  
  .pixel-btn:hover {
    transform: translate(2px, 2px);
    box-shadow: 2px 2px 0 #f5f5f5;
  }
  
  /* Active game style */
  .pixel-btn:active {
    transform: translate(4px, 4px);
    box-shadow: none;
  }
  
  .pixel-btn.disconnect {
    background-color: #fff;
    color: #535353;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 10px; /* Smaller font for address */
  }
  
  /* Mobile responsive adjustments */
  @media (max-width: 600px) {
    .pixel-btn {
      font-size: 8px;
      padding: 6px 8px;
    }
    
    .pixel-btn.disconnect {
      font-size: 8px;
    }
  }
`;
  document.head.appendChild(style);

  // Create container for wallet UI
  const walletContainer = document.createElement('div');
  walletContainer.id = 'wallet-container';
  walletContainer.className = 'wallet-container';
  document.body.appendChild(walletContainer);

  // Create connect button
  const connectButton = document.createElement('button');
  connectButton.id = 'open-connect-modal';
  connectButton.className = 'pixel-btn';
  connectButton.innerText = 'CONNECT WALLET';
  connectButton.setAttribute('data-connected-only', 'false');
  walletContainer.appendChild(connectButton);

  // Create address/disconnect button
  const disconnectButton = document.createElement('button');
  disconnectButton.id = 'disconnect';
  disconnectButton.className = 'pixel-btn disconnect';
  disconnectButton.innerText = 'DISCONNECT'; // Initial text, will be replaced with address
  disconnectButton.style.display = 'none';
  disconnectButton.setAttribute('data-connected-only', 'true');
  walletContainer.appendChild(disconnectButton);

  // Initialize wallet event listeners
  initializeSubscribers(appKit);

  // Check initial connection
  const isInitiallyConnected = appKit.getIsConnectedState();
  updateButtonVisibility(isInitiallyConnected);

  // Set up event listeners for UI elements
  connectButton.addEventListener('click', () => {
    console.log('Opening AppKit modal');
    appKit.open();
  });

  disconnectButton.addEventListener('click', async () => {
    console.log('Disconnecting wallet');
    try {
      await appKit.disconnect();
      updateStore('accountState', { isConnected: false, address: null });
      updateButtonVisibility(false);
    } catch (error) {
      console.error('Error disconnecting wallet:', error);
    }
  });

  return {
    getAddress: () => store.accountState?.address,
    isConnected: () => appKit.getIsConnectedState()
  };
}

export function getWalletState() {
  return store.accountState || null;
}

export default {
  appKit,
  wagmiAdapter,
  store,
  createWalletButton,
  initializeSubscribers,
  getWalletState
};