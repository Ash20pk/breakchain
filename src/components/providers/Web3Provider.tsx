
'use client';

import { WagmiProvider, createConfig, http } from "wagmi";
import { SomniaChain } from "@/components/providers/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConnectKitProvider, getDefaultConfig } from "connectkit";
import React from "react";

const config = createConfig(
  getDefaultConfig({
    // Your dApps chains
    chains: [SomniaChain],
    transports: {
      // RPC URL for each chain
      [SomniaChain.id]: http(
        `https://dream-rpc.somnia.network`,
      ),
    },

    // Required API Keys
    walletConnectProjectId: process?.env?.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "",

    // Required App Info
    appName: "Dino Runner",

    // Optional App Info
    appDescription: "Dino Runner - Play and Earn",
    appUrl: "https://dino-runner.com", // your app's url
    appIcon: "https://dino-runner.com/logo.png", // your app's icon, no bigger than 1024x1024px (max. 1MB)
  }),
);

const queryClient = new QueryClient();

export const Web3Provider = ({ children }: { children: React.ReactNode }) => {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <ConnectKitProvider>{children}</ConnectKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
};