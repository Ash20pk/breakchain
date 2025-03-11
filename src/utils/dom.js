// utils/dom.js

// Update state display for debugging
export const updateStateDisplay = (elementId, state) => {
    const element = document.getElementById(elementId);
    if (element) {
      // eslint-disable-next-line no-param-reassign
      element.innerHTML = JSON.stringify(state, null, 2);
    }
  };
  
  // Update theme
  export const updateTheme = mode => {
    document.documentElement.setAttribute('data-theme', mode);
    // eslint-disable-next-line no-param-reassign
    document.body.className = mode;
  };
  
  // Update button visibility based on connection state
  export const updateButtonVisibility = (isConnected) => {
    console.log(`Updating button visibility: isConnected=${isConnected}`);
    
    // Handle elements with data-connected-only="true" attribute
    const connectedOnlyElements = document.querySelectorAll('[data-connected-only="true"]');
    connectedOnlyElements.forEach(element => {
      // eslint-disable-next-line no-param-reassign
      element.style.display = isConnected ? 'block' : 'none';
    });
    
    // Handle elements with data-connected-only="false" attribute (show when disconnected)
    const disconnectedOnlyElements = document.querySelectorAll('[data-connected-only="false"]');
    disconnectedOnlyElements.forEach(element => {
      // eslint-disable-next-line no-param-reassign
      element.style.display = isConnected ? 'none' : 'block';
    });
    
    // Handle the legacy data-connected-only elements without value
    const legacyConnectedElements = document.querySelectorAll('[data-connected-only]:not([data-connected-only="true"]):not([data-connected-only="false"])');
    legacyConnectedElements.forEach(element => {
      // eslint-disable-next-line no-param-reassign
      element.style.display = isConnected ? '' : 'none';
    });
    
    // Update address display
    const addressDisplay = document.getElementById('address-display');
    if (addressDisplay) {
      // eslint-disable-next-line no-param-reassign
      addressDisplay.style.display = isConnected ? 'block' : 'none';
    }
  };
  
  export default {
    updateStateDisplay,
    updateTheme,
    updateButtonVisibility
  };