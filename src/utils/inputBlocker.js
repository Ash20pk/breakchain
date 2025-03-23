// src/utils/inputBlocker.js

/**
 * Prevents developer tools, F keys, and right-clicks in the game
 * Add this file to your project and import it in your main.jsx or index.js
 */

export const setupInputBlocker = () => {
    const isProduction = import.meta.env.PROD;
    
    // Skip in development mode unless explicitly enabled
    if (!isProduction && !import.meta.env.VITE_FORCE_INPUT_BLOCKER) {
      console.log('Input blocker disabled in development mode');
      return;
    }
  
    console.log('Setting up input security for game');
  
    // Block F keys (F1-F12) with stronger approach
    const blockFKeys = (event) => {
      // Get the key code and key
      const keyCode = event.keyCode || event.which;
      const key = event.key;
      
      // Block F1-F12 keys by both key and keyCode (112-123 are F1-F12)
      if ((key && key.match(/^F\d+$/)) || (keyCode >= 112 && keyCode <= 123)) {
        event.preventDefault();
        event.stopPropagation();
        return false;
      }
      
      // Block common developer shortcuts
      if ((event.ctrlKey || event.metaKey) && 
          (key === 'u' || key === 's' || key === 'i' || 
           keyCode === 85 || keyCode === 83 || keyCode === 73)) {
        event.preventDefault();
        event.stopPropagation();
        return false;
      }
    };
    
    // Apply on multiple events and capture phase for earlier interception
    document.addEventListener('keydown', blockFKeys, true);
    document.addEventListener('keyup', blockFKeys, true);
    document.addEventListener('keypress', blockFKeys, true);
    
    // Directly override the function keys
    for (let i = 1; i <= 12; i++) {
      Object.defineProperty(window, 'onkeyup' + i, {
        get: function() { return null; },
        set: function() { return false; }
      });
      Object.defineProperty(window, 'onkeydown' + i, {
        get: function() { return null; },
        set: function() { return false; }
      });
    }
  
    // Block right-click with better coverage
    const blockRightClick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      return false;
    };
    
    // Apply to document and window for complete coverage
    document.addEventListener('contextmenu', blockRightClick, true);
    window.addEventListener('contextmenu', blockRightClick, true);
    
    // Add the handler directly to React's root element for React components
    const rootElement = document.getElementById('root');
    if (rootElement) {
      rootElement.addEventListener('contextmenu', blockRightClick, true);
    }
    
    // Re-apply the block dynamically as the DOM changes
    setTimeout(() => {
      document.querySelectorAll('*').forEach(element => {
        element.addEventListener('contextmenu', blockRightClick, true);
      });
    }, 1000);
  
    // Detect DevTools
    const devToolsDetector = () => {
      const threshold = 160; // DevTools usually changes window size
      const widthThreshold = window.outerWidth - window.innerWidth > threshold;
      const heightThreshold = window.outerHeight - window.innerHeight > threshold;
      
      if (widthThreshold || heightThreshold) {
        console.clear();
        // Optional: You could add additional actions here
      }
    };
  
    // Check periodically
    setInterval(devToolsDetector, 1000);
  
    // Try to prevent debugging
    (function preventDebugging(){
      const startTime = new Date();
      debugger;
      const endTime = new Date();
      if (endTime - startTime > 100) {
        // Debugger was opened
        console.clear();
      }
      
      // Run this check again after a delay
      setTimeout(preventDebugging, 500);
    })();
  
    // Override console methods
    if (isProduction) {
      const noop = () => {};
      const methods = ['log', 'debug', 'info', 'warn', 'error', 'table'];
      
      const consoleBackups = {};
      methods.forEach(method => {
        consoleBackups[method] = console[method];
        console[method] = noop;
      });
      
      // Provide a way to restore console in case of errors
      window.__restoreConsole = () => {
        methods.forEach(method => {
          console[method] = consoleBackups[method];
        });
      };
    }
  
    // Add event listeners to detect when the game container is focused
    const gameContainer = document.querySelector('.game-container');
    if (gameContainer) {
      gameContainer.addEventListener('mouseenter', () => {
        // Apply even stricter controls when in game area
        document.body.classList.add('game-focus');
      });
      
      gameContainer.addEventListener('mouseleave', () => {
        document.body.classList.remove('game-focus');
      });
    }
    
    // Set up mutation observer to detect DevTools elements
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.addedNodes && mutation.addedNodes.length > 0) {
          for (let i = 0; i < mutation.addedNodes.length; i++) {
            const node = mutation.addedNodes[i];
            
            // Check if this looks like DevTools
            if (node.nodeType === 1) { // Element node
              // Check for known DevTools classes and IDs
              if (
                node.id?.includes('inspector') || 
                node.id?.includes('console') || 
                node.id?.includes('devtools') ||
                node.id?.includes('firebug') ||
                node.classList?.contains('DevTools') ||
                node.classList?.contains('console-panel')
              ) {
                node.remove();
                console.clear();
              }
            }
          }
        }
      });
    });
    
    // Start observing the document for added nodes
    observer.observe(document.documentElement, { 
      childList: true,
      subtree: true 
    });
  };
  
  export default setupInputBlocker;