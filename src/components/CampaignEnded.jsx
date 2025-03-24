import React, { useEffect, useState } from 'react';

const CampaignEndedNotification = ({ onClose }) => {
  const [fadeOut, setFadeOut] = useState(false);
  const [showConfetti, setShowConfetti] = useState(true);

  useEffect(() => {
    // Create confetti effect
    const createConfetti = () => {
      const confettiContainer = document.createElement('div');
      confettiContainer.className = 'confetti-container';
      document.body.appendChild(confettiContainer);

      // Generate random confetti pieces
      for (let i = 0; i < 100; i++) {
        setTimeout(() => {
          const confetti = document.createElement('div');
          confetti.className = 'confetti';
          confetti.style.left = `${Math.random() * 100}vw`;
          confetti.style.animationDuration = `${Math.random() * 3 + 2}s`;
          confetti.style.backgroundColor = `hsl(${Math.random() * 360}, 100%, 70%)`;
          confettiContainer.appendChild(confetti);
          
          // Remove confetti after animation
          setTimeout(() => {
            confetti.remove();
          }, 5000);
        }, i * 20);
      }

      // Remove container after all animations complete
      setTimeout(() => {
        confettiContainer.remove();
      }, 7000);
    };

    if (showConfetti) {
      createConfetti();
    }
  }, [showConfetti]);

  const handleClose = () => {
    setFadeOut(true);
    setTimeout(() => {
      if (onClose) onClose();
    }, 500); // Match transition duration
  };

  return (
    <div className={`campaign-ended-wrapper ${fadeOut ? 'fade-out' : ''}`}>
      <style jsx>{`
        .campaign-ended-wrapper {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          display: flex;
          justify-content: center;
          align-items: center;
          background-color: rgba(0, 0, 0, 0.7);
          z-index: 9999;
          opacity: 1;
          transition: opacity 0.5s ease-in-out;
        }
        
        .fade-out {
          opacity: 0;
        }
        
        .campaign-ended-modal {
          background-color: #fff;
          border: 3px solid #535353;
          padding: 2rem;
          max-width: 90%;
          width: 550px;
          box-shadow: 5px 5px 0 #f5f5f5;
          text-align: center;
          font-family: 'Press Start 2P', monospace;
          animation: popup 0.5s ease-out;
          image-rendering: pixelated;
        }
        
        .campaign-title {
          font-size: clamp(1.4rem, 4vw, 1.8rem);
          color: #535353;
          margin-bottom: 1.5rem;
          letter-spacing: 1px;
        }
        
        .trophy {
          font-size: 3rem;
          margin: 1rem 0;
          animation: pulse 2s infinite;
        }
        
        .campaign-message {
          font-size: clamp(0.7rem, 2.5vw, 1rem);
          line-height: 1.6;
          margin-bottom: 1.5rem;
          color: #535353;
        }
        
        .stats-container {
          background-color: rgba(240, 240, 240, 0.5);
          border: 3px solid #535353;
          padding: 1rem;
          margin: 1.5rem 0;
          text-align: left;
        }
        
        .stat-item {
          margin: 0.5rem 0;
          font-size: clamp(0.6rem, 2vw, 0.8rem);
          line-height: 1.5;
        }
        
        .stat-highlight {
          color: #535353;
          font-weight: bold;
        }
        
        .button-container {
          margin-top: 1.5rem;
        }
        
        .close-button {
          font-family: 'Press Start 2P', monospace;
          font-size: clamp(0.7rem, 2vw, 0.9rem);
          padding: 0.8rem 1.5rem;
          background-color: #fff;
          color: #535353;
          border: 3px solid #535353;
          cursor: pointer;
          text-transform: uppercase;
          transition: transform 0.1s, box-shadow 0.1s;
          box-shadow: 4px 4px 0 #f5f5f5;
          position: relative;
        }
        
        .close-button::after {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: linear-gradient(
            to bottom,
            rgba(255, 255, 255, 0.2) 0%,
            transparent 50%,
            rgba(0, 0, 0, 0.1) 100%
          );
          pointer-events: none;
        }
        
        .close-button:hover {
          transform: translate(2px, 2px);
          box-shadow: 2px 2px 0 #f5f5f5;
        }
        
        .close-button:active {
          transform: translate(4px, 4px);
          box-shadow: none;
        }
        
        .confetti-container {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          pointer-events: none;
          z-index: 10000;
        }
        
        .confetti {
          position: absolute;
          top: -10px;
          width: 8px;
          height: 8px;
          background-color: #535353;
          image-rendering: pixelated;
          animation: fall linear forwards;
        }
        
        @keyframes popup {
          0% { transform: scale(0.8); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        
        @keyframes pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.1); }
          100% { transform: scale(1); }
        }
        
        @keyframes fall {
          0% { transform: translateY(-10px) rotate(0deg); }
          100% { transform: translateY(100vh) rotate(720deg); }
        }
        
        @media (max-width: 600px) {
          .campaign-title {
            font-size: 1.2rem;
          }
          
          .campaign-message {
            font-size: 0.8rem;
          }
          
          .trophy {
            font-size: 2rem;
          }
          
          .stat-item {
            font-size: 0.7rem;
          }
          
          .close-button {
            font-size: 0.8rem;
            padding: 0.6rem 1.2rem;
          }
        }
      `}</style>
      
      <div className="campaign-ended-modal">
        <h1 className="campaign-title">CAMPAIGN ENDED</h1>
        <div className="trophy">🏆</div>
        <p className="campaign-message">
          THANK YOU FOR BEING PART OF THE DINO RUNNER!
          THE CAMPAIGN HAS NOW CONCLUDED.
        </p>
        
        <div className="stats-container">
          <div className="stat-item">
            <span className="stat-highlight">2,395</span> PLAYERS PARTICIPATED
          </div>
          <div className="stat-item">
            <span className="stat-highlight">729,000</span> TRANSACTIONS RECORDED ON-CHAIN
          </div>
        </div>
        
        <div className="button-container">
          <button className="close-button" onClick={handleClose}>
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
};

export default CampaignEndedNotification;