/**
 * Beat Engine
 * Synchronizes animations and effects to music BPM
 */

export class BeatEngine {
  constructor(eventBus) {
    this.eventBus = eventBus;
    this.bpm = null;
    this.beatInterval = null;
    this.beatTimerId = null;
    this.beatCount = 0;
    this.audioFeatures = null;
    this.isRunning = false;
  }

  /**
   * Set BPM and start beat timing
   * @param {number} bpm - Beats per minute
   * @param {object} audioFeatures - Spotify audio features (energy, valence, danceability)
   */
  setBPM(bpm, audioFeatures = {}) {
    // Validate BPM
    if (!bpm || bpm <= 0 || bpm > 300) {
      console.warn('[BeatEngine] Invalid BPM, using default 120');
      bpm = 120;
    }

    this.bpm = bpm;
    this.audioFeatures = audioFeatures;
    this.beatInterval = 60000 / bpm; // Convert BPM to milliseconds per beat

    console.log(`[BeatEngine] Set BPM: ${bpm}, beat interval: ${this.beatInterval}ms`);

    // Restart beat timing
    this.stopBeat();
    this.startBeat();
  }

  /**
   * Start emitting beat events
   */
  startBeat() {
    if (!this.bpm) {
      console.warn('[BeatEngine] Cannot start beat without BPM');
      return;
    }

    if (this.isRunning) {
      console.warn('[BeatEngine] Beat already running');
      return;
    }

    this.isRunning = true;
    this.beatCount = 0;

    // Emit immediate beat for instant sync
    this.emitBeat();

    // Set interval for continuous beats
    this.beatTimerId = setInterval(() => {
      this.emitBeat();
    }, this.beatInterval);

    console.log('[BeatEngine] Beat timing started');
  }

  /**
   * Emit a beat event via EventBus
   */
  emitBeat() {
    this.beatCount++;

    // Emit beat event with metadata
    this.eventBus.emit('beat:tick', {
      beatCount: this.beatCount,
      bpm: this.bpm,
      beatInterval: this.beatInterval,
      audioFeatures: this.audioFeatures,
      timestamp: Date.now(),
    });

    // Log every 4th beat for debugging
    if (this.beatCount % 4 === 0) {
      console.log(`[BeatEngine] Beat ${this.beatCount}, BPM: ${this.bpm}, Energy: ${this.audioFeatures?.energy?.toFixed(2)}`);
    }
  }

  /**
   * Stop beat timing
   */
  stopBeat() {
    if (this.beatTimerId) {
      clearInterval(this.beatTimerId);
      this.beatTimerId = null;
    }

    this.isRunning = false;
    this.beatCount = 0;

    console.log('[BeatEngine] Beat timing stopped');
  }

  /**
   * Get current beat state
   */
  getState() {
    return {
      isRunning: this.isRunning,
      bpm: this.bpm,
      beatInterval: this.beatInterval,
      beatCount: this.beatCount,
      audioFeatures: this.audioFeatures,
    };
  }

  /**
   * Cleanup
   */
  destroy() {
    this.stopBeat();
    this.eventBus = null;
  }
}
