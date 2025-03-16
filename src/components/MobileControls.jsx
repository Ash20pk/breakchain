// src/components/MobileControls.jsx
import React, { useState, useEffect } from 'react';
import './MobileControls.css';

const MobileControls = ({ onJump, onDuck }) => {
  const [touchStartY, setTouchStartY] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  
  // Check if we're on mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768 || 
                 ('ontouchstart' in window) ||
                 (navigator.maxTouchPoints > 0));
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  // Don't render controls for desktop
  if (!isMobile) return null;
  
  const handleTouchStart = (e) => {
    setTouchStartY(e.touches[0].clientY);
  };
  
  const handleTouchEnd = (e) => {
    const touchEndY = e.changedTouches[0].clientY;
    const deltaY = touchEndY - touchStartY;
    
    // Swipe up = jump, swipe down = duck
    if (deltaY < -50) {
      onJump();
    } else if (deltaY > 50) {
      onDuck();
    } else {
      // Simple tap = jump
      onJump();
    }
  };
  
  return (
    <div 
      className="mobile-controls"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="control-instructions">
        <div className="swipe-up">Swipe Up to Jump</div>
        <div className="swipe-down">Swipe Down to Duck</div>
        <div className="tap">Tap to Jump</div>
      </div>
    </div>
  );
};

export default MobileControls;