# Dino Runner

A Chrome T-Rex Runner game (chrome://dino) clone built with [Phaser 3](https://phaser.io/) on Somnia Blockchain



## Features

- [PWA](https://developers.google.com/web/progressive-web-apps) support
- Responsive design for both portrait and landscape modes
- Touch and keyboard controls
- Day/night cycle mechanics
- Score tracking with current and high score displays
- Game over screen with restart and share options
- Modular UI components
- Progressive difficulty system
- Achievement system with score milestones

## Project Structure

```
src/
├── scenes/
│   ├── game/        # Main game scene and UI management
│   └── ...          # Other game scenes
├── prefabs/
│   ├── ui/
│   │   ├── gameover/  # Game over UI components
│   │   ├── score/     # Score display components
│   │   └── ...        # Other UI components
│   └── ...          # Game object prefabs
└── config/          # Game configuration
```

## Installation

### Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)

### Running Locally

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start development server:
   ```bash
   npm start
   ```

### Building for Production

1. Build the project:
   ```bash
   npm run build
   ```
2. Serve the production build:
   ```bash
   npx serve dist
   ```

## Technical Details

- Built with [Phaser 3](https://phaser.io/) game framework
- Uses ES6+ JavaScript
- Modular component-based architecture
- Event-driven game state management
- Responsive UI scaling system
- Progressive difficulty implementation

## References

- Chromium [source](https://cs.chromium.org/chromium/src/components/neterror/resources/offline.js)
- Phaser 3 [documentation](https://phaser.io/docs/3.0.0/index.html)
