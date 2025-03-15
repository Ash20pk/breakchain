import React, { useState, useEffect } from 'react';
import './DinoLoader.css';

const DinoLoader = () => {
  const [frame, setFrame] = useState(0);
  
  // Animation frames for the dino
  const frames = [
    '-848px -2px', // first running frame
    '-936px -2px'  // second running frame
  ];
  
  // Animation effect
  useEffect(() => {
    const animationInterval = setInterval(() => {
      setFrame(prevFrame => (prevFrame === 0 ? 1 : 0));
    }, 200);
    
    return () => {
      clearInterval(animationInterval);
    };
  }, []);
  
  return (
    <div className="dino-loader">
      <div 
        className="dino-sprite" 
        style={{ backgroundPosition: frames[frame] }}
      />
    </div>
  );
};

export default DinoLoader;