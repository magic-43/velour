import { triggerHaptic } from './haptics';

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new AudioContextClass();
  }
  return audioCtx;
}

/**
 * Synthesizes a clean, pleasant notification chime using the Web Audio API.
 * Ensures zero missing asset 404 network errors across all platforms.
 */
export async function playNotificationSound(): Promise<void> {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    const now = ctx.currentTime;

    // Pleasant dual chime: 587.33 Hz (D5) glides up to 880 Hz (A5)
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.12);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.22, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.36);
  } catch (err) {
    console.debug('Web audio playback suppressed or awaiting user gesture:', err);
  }
}

/**
 * Triggers sound and subtle haptic vibration simultaneously.
 */
export async function triggerNotificationFeedback(): Promise<void> {
  await Promise.allSettled([
    playNotificationSound(),
    triggerHaptic('light'),
  ]);
}
