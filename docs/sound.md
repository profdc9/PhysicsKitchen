# Collision Sound System

- Collision sounds are generated via the Web Audio API (no audio files needed, pure oscillator tones)
- Each body can have a collision sound enabled with configurable frequency, volume, and duration
- Sound is triggered in the planck.js `world.on('begin-contact', ...)` callback
- Frequency can be entered as raw Hz or selected via a musical note picker (e.g. A4 = 440 Hz)
- Sound properties are stored in body userData alongside other custom properties:
  ```
  { enabled: boolean, frequencyHz: number, volume: number, durationMs: number }
  ```
