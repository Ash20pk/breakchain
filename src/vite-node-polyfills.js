import { Buffer } from 'buffer';
import process from 'process';

// Polyfill Node.js globals and modules to make them available in browser environment
window.global = window;
window.Buffer = Buffer;
window.process = process;

// Add a dummy console.stub since this is sometimes referenced
if (!console.stub) {
  console.stub = (...args) => console.log(...args);
}

export default function setupPolyfills() {
  // This function is just a convenient way to import this file
  // The actual polyfills are applied when this file is imported
  console.log('Node.js polyfills initialized for browser environment');
}