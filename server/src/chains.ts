// lib/chains.ts
import { defineChain } from 'viem';

// Define the Somnia chain configuration
export const SomniaChain = defineChain({
    id: 50312,
    name: "Somnia Testnet",
    nativeCurrency: {
      decimals: 18,
      name: "Ether",
      symbol: "STT",
    },
    rpcUrls: {
        default: {
          http: ["https://dream-rpc.somnia.network"],
        },
      },
      blockExplorers: {
        default: { name: "Explorer", url: "http://shannon-explorer.somnia.network/" },
      },
});