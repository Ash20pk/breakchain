// src/components/WalletStateSync.jsx
import React, { useEffect } from 'react';
import { useAccount } from 'wagmi';
import { updateGlobalWalletState } from '../utils/WalletBridge';

/**
 * Component that syncs Wagmi wallet state with the global state
 * This component doesn't render anything visible
 */
const WalletStateSync = () => {
  const { address, isConnected } = useAccount();
  
  useEffect(() => {
    // Update global state whenever wallet status changes in Wagmi
    updateGlobalWalletState(address, isConnected);
    
    console.log('Wallet state synced from React:', { address, isConnected });
    
    // Clean up on unmount
    return () => {
      // Optional: you could reset state here if needed
    };
  }, [address, isConnected]);
  
  // This component doesn't render anything
  return null;
};

export default WalletStateSync;