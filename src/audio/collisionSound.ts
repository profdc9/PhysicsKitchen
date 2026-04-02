/**
 * Collision sound synthesis via the Web Audio API.
 * Generates short oscillator tones — no audio files required.
 */

// Lazily created; deferred until first user interaction to satisfy browser autoplay policy.
let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  // Resume if the browser suspended it before a user gesture.
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

/**
 * Play a short sine-wave beep.
 *
 * @param frequencyHz  Oscillator pitch in Hz (e.g. 440 = A4).
 * @param volume       Peak gain in [0, 1].
 * @param durationMs   Total duration of the note in milliseconds.
 */
export function playCollisionSound(frequencyHz: number, volume: number, durationMs: number): void {
  const ctx = getAudioContext();

  const oscillator = ctx.createOscillator();
  const gainNode   = ctx.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);

  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequencyHz, ctx.currentTime);

  const durationSec = durationMs / 1000;
  // Start at the requested volume then ramp to near-silence to avoid clicks.
  gainNode.gain.setValueAtTime(volume, ctx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationSec);

  oscillator.start(ctx.currentTime);
  oscillator.stop(ctx.currentTime + durationSec);
}
