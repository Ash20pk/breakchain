import { ConnectKitButton } from "connectkit";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export const ConnectButton = () => {
  return (
    <ConnectKitButton.Custom>
      {({ isConnected, isConnecting, show, hide, address, ensName, chain }) => (
        <button
          onClick={show}
          className={cn(
            buttonVariants({ variant: "default", size: "default" }),
            "focus-visible:ring-2 focus-visible:ring-offset-2 justify-center"
          )}
        >
          {isConnected ? "Connected" : "Connect Button"}
        </button>
      )}
    </ConnectKitButton.Custom>
  );
};