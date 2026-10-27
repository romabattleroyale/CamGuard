/**
 * Audio synthesizer for camera siren and chime sounds using Web Audio API
 * No external sound files or internet connection required.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

let sirenOscillator: OscillatorNode | null = null;
let sirenGain: GainNode | null = null;
let sirenInterval: any = null;

export function playSirenSound(): () => void {
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    gain.gain.setValueAtTime(0.3, ctx.currentTime);

    let high = true;
    osc.frequency.setValueAtTime(800, ctx.currentTime);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();

    sirenOscillator = osc;
    sirenGain = gain;

    sirenInterval = setInterval(() => {
      if (!sirenOscillator) return;
      const now = ctx.currentTime;
      if (high) {
        osc.frequency.exponentialRampToValueAtTime(1400, now + 0.3);
      } else {
        osc.frequency.exponentialRampToValueAtTime(750, now + 0.3);
      }
      high = !high;
    }, 350);

    return () => {
      stopSirenSound();
    };
  } catch (err) {
    console.error('Failed to play siren sound', err);
    return () => {};
  }
}

export function stopSirenSound() {
  if (sirenInterval) {
    clearInterval(sirenInterval);
    sirenInterval = null;
  }
  if (sirenOscillator) {
    try {
      sirenOscillator.stop();
      sirenOscillator.disconnect();
    } catch {
      // Ignore
    }
    sirenOscillator = null;
  }
  if (sirenGain) {
    try {
      sirenGain.disconnect();
    } catch {
      // Ignore
    }
    sirenGain = null;
  }
}

export function playChimeSound() {
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    const now = ctx.currentTime;

    osc.frequency.setValueAtTime(587.33, now); // D5
    osc.frequency.setValueAtTime(880, now + 0.12); // A5

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.5);
  } catch (err) {
    console.error('Chime error', err);
  }
}
