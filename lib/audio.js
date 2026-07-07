// Web Audio API Synthesizer for low-latency sound effects in the browser
// This script synthesizes sound effects programmatically with zero dependencies or asset loads.

let audioContext = null;

const getAudioContext = () => {
  if (typeof window === 'undefined') return null;
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
  return audioContext;
};

// Play a deep cybernetic "swoosh" representing a Bat-wing or cyber terminal transmission
export const playSwoosh = () => {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const duration = 0.35;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    // Sawtooth base oscillator starting at 120Hz sloping down to 30Hz
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + duration);

    // Lowpass filter frequency sweeping down for a dark swoosh
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(380, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(70, ctx.currentTime + duration);

    // Gain ramp from 0.08 down to silence
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (error) {
    console.warn("Audio synthesis block failed:", error);
  }
};

// Play a cyber computer alert chirp for message processing completions
export const playChirp = () => {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const duration = 0.22;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    // Fast triple-tone alert sound (sine wave frequency steps)
    osc.type = 'sine';
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(900, now);
    osc.frequency.setValueAtTime(1300, now + 0.06);
    osc.frequency.setValueAtTime(1700, now + 0.12);

    // Soft volume decay
    gain.gain.setValueAtTime(0.04, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(now + duration);
  } catch (error) {
    console.warn("Audio synthesis block failed:", error);
  }
};

// Start a continuous siren loop for Red Alert warning signals
export const startSiren = () => {
  try {
    const ctx = getAudioContext();
    if (!ctx) return null;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();

    // 1.8Hz sweep frequency speed
    lfo.frequency.value = 1.8;
    lfoGain.gain.value = 180; // Sweep range in Hz

    // Base pitch center
    osc.type = 'sawtooth';
    osc.frequency.value = 450; 

    // Steady, warning-level gain volume
    gain.gain.setValueAtTime(0.04, ctx.currentTime);

    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    osc.connect(gain);
    gain.connect(ctx.destination);

    lfo.start();
    osc.start();

    // Return handles to clear oscillators
    return {
      stop: () => {
        try {
          // Fade out volume slightly to prevent harsh clicks
          gain.gain.setValueAtTime(0.04, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2);
          setTimeout(() => {
            try {
              lfo.stop();
              osc.stop();
              lfo.disconnect();
              osc.disconnect();
            } catch(err){}
          }, 200);
        } catch(e){}
      }
    };
  } catch (error) {
    console.warn("Siren synthesis failed:", error);
    return null;
  }
};
