// Little sound effects made with the Web Audio API: no sound files to load.
// The context starts on the first tap or key press (browsers require that).

let ctx = null;
let muted = false;
try {
  muted = localStorage.getItem('maths-escape.muted') === '1';
} catch {
  /* storage blocked */
}

function audio() {
  if (muted) return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, { at = 0, length = 0.15, type = 'sine', volume = 0.18, slide = 0 } = {}) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + at;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + length);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(volume, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  osc.connect(gain).connect(a.destination);
  osc.start(t);
  osc.stop(t + length + 0.02);
}

function noise({ at = 0, length = 0.25, volume = 0.2, from = 2000, to = 300 } = {}) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + at;
  const buffer = a.createBuffer(1, Math.ceil(a.sampleRate * length), a.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buffer;
  const filter = a.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(from, t);
  filter.frequency.exponentialRampToValueAtTime(to, t + length);
  const gain = a.createGain();
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  src.connect(filter).connect(gain).connect(a.destination);
  src.start(t);
}

export const sound = {
  /** Call from a tap/keypress so later sounds are allowed to play. */
  unlock: () => audio(),
  get muted() {
    return muted;
  },
  setMuted(value) {
    muted = value;
    try {
      localStorage.setItem('maths-escape.muted', value ? '1' : '0');
    } catch {
      /* storage blocked */
    }
  },
  correct: () => {
    tone(660, { length: 0.1, type: 'triangle' });
    tone(880, { at: 0.08, length: 0.14, type: 'triangle' });
  },
  fast: () => {
    tone(784, { length: 0.08, type: 'triangle' });
    tone(1046, { at: 0.06, length: 0.08, type: 'triangle' });
    tone(1318, { at: 0.12, length: 0.16, type: 'triangle' });
  },
  wrong: () => {
    tone(180, { length: 0.28, type: 'sawtooth', volume: 0.12, slide: -60 });
    noise({ length: 0.12, volume: 0.08, from: 800, to: 200 });
  },
  levelUp: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, { at: i * 0.09, length: 0.16, type: 'square', volume: 0.08 })),
  whoosh: () => noise({ length: 0.35, volume: 0.14, from: 3000, to: 400 }),
  count: (last = false) => tone(last ? 880 : 440, { length: last ? 0.3 : 0.14, type: 'square', volume: 0.09 }),
  caught: () => {
    noise({ length: 0.08, volume: 0.35, from: 2500, to: 1200 }); // smack!
    tone(320, { at: 0.08, length: 0.7, type: 'sawtooth', volume: 0.1, slide: -220 });
  },
};
