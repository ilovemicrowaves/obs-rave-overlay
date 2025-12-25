/**
 * Theme Engine - Dynamic theming based on genre, album art, and Home Assistant
 * Creates immersive visual experiences that adapt to music and environment
 */

import { extractColors, rgbToString, getComplementary } from './color-extractor.js';
import { BeatEngine } from './beat-engine.js';

// Genre theme mappings
const GENRE_THEMES = {
  trance: {
    name: 'Ethereal Trance',
    baseColors: {
      primary: { r: 139, g: 92, b: 246 }, // Purple
      secondary: { r: 236, g: 72, b: 153 }, // Pink
      accent: { r: 6, g: 182, b: 212 }, // Cyan
    },
    effects: {
      glowIntensity: '30px',
      animationSpeed: '2s',
      blurStrength: '12px',
    },
  },
  hardcore: {
    name: 'Hardcore Energy',
    baseColors: {
      primary: { r: 239, g: 68, b: 68 }, // Red
      secondary: { r: 249, g: 115, b: 22 }, // Orange
      accent: { r: 251, g: 191, b: 36 }, // Yellow
    },
    effects: {
      glowIntensity: '35px',
      animationSpeed: '0.5s',
      blurStrength: '8px',
    },
  },
  hardstyle: {
    name: 'Hardstyle Power',
    baseColors: {
      primary: { r: 239, g: 68, b: 68 }, // Red
      secondary: { r: 249, g: 115, b: 22 }, // Orange
      accent: { r: 251, g: 191, b: 36 }, // Yellow
    },
    effects: {
      glowIntensity: '32px',
      animationSpeed: '0.6s',
      blurStrength: '10px',
    },
  },
  techno: {
    name: 'Techno Minimal',
    baseColors: {
      primary: { r: 59, g: 130, b: 246 }, // Blue
      secondary: { r: 139, g: 92, b: 246 }, // Purple
      accent: { r: 236, g: 72, b: 153 }, // Pink
    },
    effects: {
      glowIntensity: '20px',
      animationSpeed: '1.2s',
      blurStrength: '10px',
    },
  },
  house: {
    name: 'House Groove',
    baseColors: {
      primary: { r: 16, g: 185, b: 129 }, // Green
      secondary: { r: 6, g: 182, b: 212 }, // Cyan
      accent: { r: 139, g: 92, b: 246 }, // Purple
    },
    effects: {
      glowIntensity: '22px',
      animationSpeed: '1.5s',
      blurStrength: '10px',
    },
  },
  dnb: {
    name: 'Drum & Bass',
    baseColors: {
      primary: { r: 236, g: 72, b: 153 }, // Pink
      secondary: { r: 6, g: 182, b: 212 }, // Cyan
      accent: { r: 251, g: 191, b: 36 }, // Yellow
    },
    effects: {
      glowIntensity: '25px',
      animationSpeed: '0.8s',
      blurStrength: '10px',
    },
  },
  default: {
    name: 'Default',
    baseColors: {
      primary: { r: 139, g: 92, b: 246 }, // Purple
      secondary: { r: 236, g: 72, b: 153 }, // Pink
      accent: { r: 6, g: 182, b: 212 }, // Cyan
    },
    effects: {
      glowIntensity: '20px',
      animationSpeed: '1s',
      blurStrength: '10px',
    },
  },
};

// Genre detection mapping
const GENRE_MAP = {
  // Trance variants
  'trance': 'trance',
  'progressive trance': 'trance',
  'uplifting trance': 'trance',
  'vocal trance': 'trance',
  'psytrance': 'trance',
  'psy trance': 'trance',

  // Hardcore variants
  'hardcore': 'hardcore',
  'frenchcore': 'hardcore',
  'speedcore': 'hardcore',
  'uptempo hardcore': 'hardcore',
  'gabber': 'hardcore',
  'industrial hardcore': 'hardcore',

  // Hardstyle
  'hardstyle': 'hardstyle',
  'rawstyle': 'hardstyle',
  'euphoric hardstyle': 'hardstyle',

  // Techno
  'techno': 'techno',
  'minimal techno': 'techno',
  'acid techno': 'techno',
  'detroit techno': 'techno',

  // House
  'house': 'house',
  'tech house': 'house',
  'deep house': 'house',
  'progressive house': 'house',
  'electro house': 'house',

  // DnB
  'drum and bass': 'dnb',
  'dnb': 'dnb',
  'jungle': 'dnb',
  'neurofunk': 'dnb',
  'liquid dnb': 'dnb',
};

export class ThemeEngine {
  constructor(eventBus) {
    this.eventBus = eventBus;
    this.currentTheme = null;
    this.syncWithHA = false;
    this.albumArtColors = null;
    this.haLightColors = null;
    this.beatEngine = new BeatEngine(eventBus);
    this.currentBPM = null;
    this.audioFeatures = null;
  }

  /**
   * Detect genre theme from genre string(s)
   */
  detectGenreTheme(genres) {
    if (!genres || genres.length === 0) {
      return 'default';
    }

    // Normalize and search
    for (const genre of genres) {
      const normalized = genre.toLowerCase().trim();

      if (GENRE_MAP[normalized]) {
        return GENRE_MAP[normalized];
      }

      // Partial matching
      for (const [key, value] of Object.entries(GENRE_MAP)) {
        if (normalized.includes(key) || key.includes(normalized)) {
          return value;
        }
      }
    }

    return 'default';
  }

  /**
   * Generate theme from Spotify track data
   */
  async generateThemeFromTrack(trackData) {
    if (!trackData || !trackData.track) {
      return null;
    }

    // Detect genre theme
    const genreKey = this.detectGenreTheme(trackData.genres || []);
    const genreTheme = GENRE_THEMES[genreKey] || GENRE_THEMES.default;

    // Extract colors from album art
    let colors = genreTheme.baseColors;

    if (trackData.track.albumArt) {
      try {
        const extracted = await extractColors(trackData.track.albumArt);
        this.albumArtColors = extracted;

        // Use extracted colors as primary/secondary
        colors = {
          primary: extracted.dominant,
          secondary: extracted.palette[1] || extracted.dominant,
          accent: genreTheme.baseColors.accent, // Keep genre-specific accent
        };
      } catch (error) {
        console.error('[ThemeEngine] Color extraction failed:', error);
      }
    }

    // Override with HA light colors if enabled
    if (this.syncWithHA && this.haLightColors) {
      colors.primary = this.haLightColors;
    }

    // Extract BPM and audio features
    const bpm = trackData.features?.bpm || 120; // Default to 120 BPM if missing
    const audioFeatures = {
      energy: trackData.features?.energy || 0.5,
      valence: trackData.features?.valence || 0.5,
      danceability: trackData.features?.danceability || 0.5,
    };

    this.currentBPM = bpm;
    this.audioFeatures = audioFeatures;

    // Start beat engine with BPM
    if (bpm && bpm > 0) {
      this.beatEngine.setBPM(bpm, audioFeatures);
    }

    // Calculate beat duration in milliseconds
    const beatDuration = bpm ? `${Math.round(60000 / bpm)}ms` : '1000ms';

    // Calculate intensity level from energy
    let intensityClass = 'medium';
    if (audioFeatures.energy < 0.4) {
      intensityClass = 'low';
    } else if (audioFeatures.energy > 0.7) {
      intensityClass = 'high';
    }

    // Build theme object
    const theme = {
      source: this.syncWithHA && this.haLightColors ? 'homeassistant' : 'spotify',
      genre: genreKey,
      genreName: genreTheme.name,
      colors: {
        primary: rgbToString(colors.primary),
        secondary: rgbToString(colors.secondary),
        accent: rgbToString(colors.accent),
        background: 'rgba(0, 0, 0, 0.7)',
        text: '#ffffff',
        textSecondary: 'rgba(255, 255, 255, 0.7)',
      },
      effects: {
        ...genreTheme.effects,
        beatDuration: beatDuration,
      },
      audioFeatures: audioFeatures,
      bpm: bpm,
      intensityClass: intensityClass,
      timestamp: Date.now(),
    };

    this.currentTheme = theme;
    return theme;
  }

  /**
   * Apply theme to document (update CSS custom properties)
   */
  applyTheme(theme) {
    if (!theme) return;

    const root = document.documentElement;

    // Apply color variables
    root.style.setProperty('--color-primary', theme.colors.primary);
    root.style.setProperty('--color-secondary', theme.colors.secondary);
    root.style.setProperty('--color-accent', theme.colors.accent);
    root.style.setProperty('--color-bg', theme.colors.background);
    root.style.setProperty('--color-text', theme.colors.text);
    root.style.setProperty('--color-text-secondary', theme.colors.textSecondary);

    // Apply effect variables
    root.style.setProperty('--glow-intensity', theme.effects.glowIntensity);
    root.style.setProperty('--animation-speed', theme.effects.animationSpeed);
    root.style.setProperty('--blur-strength', theme.effects.blurStrength);

    // Apply beat-specific variables
    root.style.setProperty('--beat-duration', theme.effects.beatDuration || '1000ms');
    root.style.setProperty('--energy', theme.audioFeatures?.energy || 0.5);
    root.style.setProperty('--valence', theme.audioFeatures?.valence || 0.5);
    root.style.setProperty('--danceability', theme.audioFeatures?.danceability || 0.5);

    // Apply genre class to root for CSS targeting
    root.className = `theme-${theme.genre}`;

    console.log(`[ThemeEngine] Applied theme: ${theme.genreName} (${theme.source}), BPM: ${theme.bpm}, Energy: ${theme.audioFeatures?.energy?.toFixed(2)}`);
  }

  /**
   * Broadcast theme update to all widgets
   */
  broadcastTheme(theme) {
    if (!this.eventBus || !theme) return;

    this.eventBus.emit('theme:update', theme);
  }

  /**
   * Update theme from Home Assistant light state
   */
  updateFromHomeAssistant(lightState) {
    if (!lightState || !lightState.rgb_color) {
      this.haLightColors = null;
      return;
    }

    const [r, g, b] = lightState.rgb_color;
    this.haLightColors = { r, g, b };

    console.log('[ThemeEngine] Updated HA light colors:', this.haLightColors);

    // Regenerate theme if we have track data
    if (this.currentTheme) {
      // Trigger theme regeneration (caller should call generateThemeFromTrack again)
      return true;
    }

    return false;
  }

  /**
   * Enable/disable sync with Home Assistant
   */
  setSyncWithHomeAssistant(enabled) {
    this.syncWithHA = enabled;
    console.log(`[ThemeEngine] HA sync: ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Get current theme
   */
  getCurrentTheme() {
    return this.currentTheme;
  }

  /**
   * Get available genre themes
   */
  getAvailableThemes() {
    return Object.entries(GENRE_THEMES).map(([key, theme]) => ({
      key,
      name: theme.name,
    }));
  }
}

export default ThemeEngine;
