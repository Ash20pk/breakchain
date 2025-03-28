const PLAYER = {
  FRAMES: {
    INITIAL: 'dino-idle-1',
    IDLING: ['dino-idle-1', 'dino-idle-2'],
    RUNNING: ['dino-run-1', 'dino-run-2'],
    DUCKING: ['dino-duck-1', 'dino-duck-2'],
    JUMPING: 'dino-idle-1',
    DEAD: 'dino-dead',
  },
  POS: {
    INITIAL_X: 0,
    X: 50,
    Y: 325,
  },
  GRAVITY: {
    Y: 2300,
  },
  JUMP: {
    VELOCITY: {
      MAX: 2500, 
      START: 1800 * 0.9 * -1, 
      SPEED_FALL: 1800 * 0.75, 
      INCREASE_INCREMENT: 95 * -1, 
      INCREASE_THRESHOLD: 250 * -1, 
    },
    ACCELERATION: 3200,
  },
  BLINK: {
    DURATION: 100,
    DELAY: 7000,
  },
  STATES: {
    IDLING: 'IDLING',
    RUNNING: 'RUNNING',
    DUCKING: 'DUCKING',
    JUMPING: 'JUMPING',
    DEAD: 'DEAD',
  },
};

export default PLAYER;