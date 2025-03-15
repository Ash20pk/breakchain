import React from "react";
import { WagmiProvider, createConfig, http } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConnectKitProvider, getDefaultConfig } from "connectkit";
import { SomniaChain } from "../utils/chain";
import WalletStateSync from "./WalletStateSync";

// Create a query client
const queryClient = new QueryClient();

// Get project ID from environment variables
const projectId = import.meta.env.VITE_WALLET_CONNECT_PROJECT_ID;

// Configure wagmi
const config = createConfig(
  getDefaultConfig({
    // Your dApp chains
    chains: [SomniaChain],
    transports: {
      // RPC URL for each chain
      [SomniaChain.id]: http("https://dream-rpc.somnia.network"),
    },

    // Required API Keys
    walletConnectProjectId: projectId,

    // Required App Info
    appName: "Dino Runner",

    // Optional App Info
    appDescription: "Chrome Dino game with blockchain integration",
    appUrl: window.location.origin,
    appIcon: "/favicon.ico", 
  }),
);

// Web3Provider component
export const Web3Provider = ({ children }) => {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <ConnectKitProvider
          theme="auto"
          options={{
            customTheme: {
              "--ck-font-family": "'Press Start 2P', monospace",
              "--ck-border-radius": "0px",
              "--ck-overlay-background": "rgba(0, 0, 0, 0.8)",
            },
          }}
        >
          {/* This component syncs wallet state to the global state */}
          <WalletStateSync />
          {children}
        </ConnectKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
};

export default Web3Provider;