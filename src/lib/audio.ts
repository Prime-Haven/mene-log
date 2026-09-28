/**
 * Zero-dependency Web Audio API synthesizer for instant door scanner feedback.
 * Provides crisp audio cues for ushers without requiring external sound asset files.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioContextClass =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return null;

  if (!audioCtx) {
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/** Pre-unlock audio on user gesture (e.g. click/tap) */
export function unlockAudio() {
  const ctx = getAudioContext();
  if (ctx && ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
}

/**
 * Crisp success beep: 880Hz (A5) -> 1046.5Hz (C6) upward arpeggio
 * Fast ~140ms duration with pleasant exponential gain decay.
 */
export function playSuccessBeep() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    // Quick two-tone jump
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.setValueAtTime(1046.5, now + 0.05);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.28, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.17);
  } catch (err) {
    console.debug("[audio] Could not play success beep", err);
  }
}

/**
 * Duplicate / Already Present reminder chime:
 * Gentle warm double-chime (740Hz -> 740Hz), informing usher that member is already present.
 */
export function playDuplicateBeep() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(740, now);
    osc.frequency.setValueAtTime(587.33, now + 0.08);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.18, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.19);
  } catch (err) {
    console.debug("[audio] Could not play duplicate beep", err);
  }
}

/**
 * Unrecognized / Error warning tone: low descending tone
 */
export function playWarningBeep() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(370, now);
    osc.frequency.linearRampToValueAtTime(260, now + 0.14);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.22, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.19);
  } catch (err) {
    console.debug("[audio] Could not play warning beep", err);
  }
}
