// src/components/NamePromptModal.jsx
import React, { useState } from 'react';
import './NamePromptModal.css';

const NamePromptModal = ({ isOpen, onSave, onClose }) => {
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const handleSave = () => {
    // Validate name
    if (!name.trim()) {
      setError('Please enter your name');
      return;
    }
    
    if (name.length > 30) {
      setError('Name must be 30 characters or less');
      return;
    }
    
    // Call the parent save handler
    onSave(name);
    
    // Clear the form
    setName('');
    setError('');
  };

  if (!isOpen) return null;

  return (
    <div className="name-modal-overlay">
      <div className="name-modal">
        <div className="name-modal-header">
          <h2>Welcome!</h2>
        </div>

        <div className="name-modal-body">
          <p>Please enter your name to continue:</p>
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError('');
            }}
            placeholder="Your name"
            className="name-input"
            maxLength="30"
            autoFocus
          />
          {error && <div className="name-error">{error}</div>}
        </div>

        <div className="name-modal-footer">
          <button className="pixel-button save-button" onClick={handleSave}>
            SAVE
          </button>
        </div>
      </div>
    </div>
  );
};

export default NamePromptModal;