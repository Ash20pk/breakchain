// chain.js - Somnia Testnet configuration
import { defineChain } from '@reown/appkit/networks';

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