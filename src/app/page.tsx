// app/dino/page.tsx
import { Metadata } from 'next';
import DinoRunnerGame from '@/components/DinoRunner';
import { Web3Provider } from '@/components/providers/Web3Provider'

export const metadata: Metadata = {
  title: 'Break Somnia: Dino Runner',
  description: 'Jump over cacti and record your high scores on the Somnia blockchain!',
};

export default function DinoPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-blue-50 to-indigo-50 dark:from-gray-950 dark:to-indigo-950">
      <Web3Provider>
        <DinoRunnerGame />
      </Web3Provider>
    </main>
  );
}