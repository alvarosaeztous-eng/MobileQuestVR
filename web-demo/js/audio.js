/**
 * Procedural Web Audio API synthesizer for responsive spatial/UI feedback in Android Chrome.
 * Auto-unlocks cleanly on the first touch or click gesture without loading external sound files.
 */
export class ProceduralAudio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  unlock() {
    if (!this.enabled) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    if (!this.ctx) {
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  play(effect) {
    if (!this.enabled) return;
    if (!this.ctx || this.ctx.state !== 'running') return;

    const now = this.ctx.currentTime;
    switch (effect) {
      case 'hover':
        this._tone(640, 780, 0.045, 0.05, 'sine', now);
        break;
      case 'select':
        this._tone(520, 880, 0.09, 0.11, 'triangle', now);
        break;
      case 'grab':
        this._tone(290, 520, 0.09, 0.11, 'sine', now);
        break;
      case 'release':
        this._tone(440, 220, 0.09, 0.10, 'sine', now);
        break;
      case 'toggle':
        this._chord([523.25, 659.25], 0.14, 0.09, 'triangle', now);
        break;
      case 'recenter':
        this._chord([440, 554.37, 659.25], 0.22, 0.09, 'sine', now);
        break;
      case 'chime':
        this._chord([587.33, 880, 1174.66, 1318.51], 0.55, 0.08, 'sine', now);
        break;
      default:
        this._tone(500, 500, 0.06, 0.06, 'sine', now);
    }
  }

  _tone(startFreq, endFreq, duration, volume, type, startTime) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(startFreq, startTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), startTime + duration);

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(volume, startTime + Math.min(0.015, duration * 0.25));
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.01);
  }

  _chord(freqs, duration, volumePerVoice, type, startTime) {
    for (let i = 0; i < freqs.length; i++) {
      this._tone(freqs[i], freqs[i] * 1.005, duration, volumePerVoice, type, startTime + i * 0.018);
    }
  }
}
