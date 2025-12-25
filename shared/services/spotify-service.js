/**
 * Spotify Service - Client-side Spotify API integration
 * Communicates with server proxy for authentication and API calls
 */

export class SpotifyService {
  constructor(serverUrl = window.location.origin) {
    this.serverUrl = serverUrl;
    this.cache = new Map();
    this.cacheTTL = 5000; // 5 seconds
    this.isPolling = false;
    this.pollInterval = null;
    this.currentTrackId = null;
  }

  /**
   * Check if user is authenticated
   */
  async isAuthenticated() {
    try {
      const response = await fetch(`${this.serverUrl}/api/config`);
      const config = await response.json();
      return config.spotify.authenticated;
    } catch (error) {
      console.error('[SpotifyService] Auth check failed:', error);
      return false;
    }
  }

  /**
   * Get currently playing track
   */
  async getCurrentTrack() {
    const cacheKey = 'current_track';
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }

    try {
      const response = await fetch(`${this.serverUrl}/api/spotify/current-track`);

      if (response.status === 401) {
        throw new Error('Not authenticated');
      }

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();

      // Cache the result
      this.cache.set(cacheKey, {
        data,
        timestamp: Date.now(),
      });

      return data;
    } catch (error) {
      console.error('[SpotifyService] Get current track failed:', error);
      throw error;
    }
  }

  /**
   * Get audio features for a track (BPM, energy, etc.)
   */
  async getAudioFeatures(trackId) {
    if (!trackId) return null;

    const cacheKey = `audio_features_${trackId}`;
    const cached = this.cache.get(cacheKey);

    if (cached) {
      return cached;
    }

    try {
      const response = await fetch(`${this.serverUrl}/api/spotify/audio-features/${trackId}`);

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();

      // Cache forever (audio features don't change)
      this.cache.set(cacheKey, data);

      return data;
    } catch (error) {
      console.error('[SpotifyService] Get audio features failed:', error);
      return null;
    }
  }

  /**
   * Get artist information (including genres)
   */
  async getArtist(artistId) {
    if (!artistId) return null;

    const cacheKey = `artist_${artistId}`;
    const cached = this.cache.get(cacheKey);

    if (cached) {
      return cached;
    }

    try {
      const response = await fetch(`${this.serverUrl}/api/spotify/artist/${artistId}`);

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();

      // Cache forever (artist info rarely changes)
      this.cache.set(cacheKey, data);

      return data;
    } catch (error) {
      console.error('[SpotifyService] Get artist failed:', error);
      return null;
    }
  }

  /**
   * Get comprehensive track data (track + features + artist)
   */
  async getTrackData() {
    try {
      const currentTrack = await this.getCurrentTrack();

      if (!currentTrack || !currentTrack.item) {
        return null;
      }

      const trackId = currentTrack.item.id;
      const artistId = currentTrack.item.artists[0]?.id;

      // Fetch audio features and artist data in parallel
      const [audioFeatures, artistData] = await Promise.all([
        this.getAudioFeatures(trackId),
        this.getArtist(artistId),
      ]);

      // Extract genres
      const genres = artistData?.genres || [];
      const primaryGenre = genres[0] || 'Unknown';

      return {
        track: {
          id: currentTrack.item.id,
          name: currentTrack.item.name,
          artist: currentTrack.item.artists.map(a => a.name).join(', '),
          album: currentTrack.item.album.name,
          albumArt: currentTrack.item.album.images[0]?.url,
          duration_ms: currentTrack.item.duration_ms,
          progress_ms: currentTrack.progress_ms,
        },
        features: {
          bpm: audioFeatures ? Math.round(audioFeatures.tempo) : null,
          energy: audioFeatures?.energy,
          valence: audioFeatures?.valence,
          danceability: audioFeatures?.danceability,
        },
        artist: {
          name: currentTrack.item.artists[0]?.name,
          genres: genres,
        },
        genre: primaryGenre,
        genres: genres,
        isPlaying: currentTrack.is_playing,
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error('[SpotifyService] Get track data failed:', error);
      return null;
    }
  }

  /**
   * Start polling for track updates
   */
  startPolling(callback, interval = 5000) {
    if (this.isPolling) {
      console.warn('[SpotifyService] Already polling');
      return;
    }

    this.isPolling = true;

    const poll = async () => {
      try {
        const trackData = await this.getTrackData();

        if (trackData) {
          // Check if track changed
          const trackChanged = trackData.track.id !== this.currentTrackId;
          this.currentTrackId = trackData.track.id;

          callback(trackData, trackChanged);

          // Adjust polling interval based on playback state
          if (this.pollInterval) {
            clearInterval(this.pollInterval);
          }

          const nextInterval = trackData.isPlaying ? interval : interval * 6; // 30s when paused
          this.pollInterval = setInterval(poll, nextInterval);
        }
      } catch (error) {
        if (error.message === 'Not authenticated') {
          console.error('[SpotifyService] Not authenticated - stopping poll');
          this.stopPolling();
          callback({ error: 'not_authenticated' });
        }
      }
    };

    // Initial poll
    poll();
  }

  /**
   * Stop polling
   */
  stopPolling() {
    this.isPolling = false;

    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }
}

export default SpotifyService;
