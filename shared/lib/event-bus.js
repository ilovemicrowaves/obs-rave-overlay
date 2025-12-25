/**
 * Event Bus - Cross-widget communication via BroadcastChannel API
 * Enables real-time state synchronization across all OBS browser sources
 */

export const EventTypes = {
  // Spotify events
  SPOTIFY_TRACK_UPDATE: 'spotify:track',
  SPOTIFY_PLAYBACK_STATE: 'spotify:playback',
  SPOTIFY_ERROR: 'spotify:error',

  // Home Assistant events
  HA_STATE_CHANGE: 'ha:state',
  HA_LIGHT_UPDATE: 'ha:light',
  HA_SCENE_CHANGE: 'ha:scene',
  HA_CONNECTION_STATUS: 'ha:connection',

  // Theme events
  THEME_UPDATE: 'theme:update',

  // Audio events
  AUDIO_LEVEL_UPDATE: 'audio:level',
  AUDIO_SPECTRUM_UPDATE: 'audio:spectrum',

  // Status events
  STATUS_MESSAGE_UPDATE: 'status:message',

  // System events
  HUB_READY: 'system:hub_ready',
  WIDGET_READY: 'system:widget_ready',
};

export class EventBus {
  constructor(channelName = 'obs-overlay') {
    this.channelName = channelName;
    this.channel = null;
    this.listeners = new Map();
    this.messageHistory = new Map(); // For deduplication
    this.deduplicationWindow = 100; // ms

    this.connect();
  }

  connect() {
    try {
      this.channel = new BroadcastChannel(this.channelName);

      this.channel.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.channel.onmessageerror = (event) => {
        console.error('[EventBus] Message error:', event);
      };

      console.log(`[EventBus] Connected to channel: ${this.channelName}`);
    } catch (error) {
      console.error('[EventBus] Failed to create BroadcastChannel:', error);
    }
  }

  handleMessage(message) {
    if (!message || !message.type) return;

    // Message deduplication
    const messageKey = `${message.type}-${message.timestamp}`;
    if (this.messageHistory.has(messageKey)) {
      return; // Skip duplicate
    }

    this.messageHistory.set(messageKey, true);

    // Clean up old messages
    setTimeout(() => {
      this.messageHistory.delete(messageKey);
    }, this.deduplicationWindow);

    // Dispatch to listeners
    const listeners = this.listeners.get(message.type);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(message.data, message.type);
        } catch (error) {
          console.error(`[EventBus] Error in listener for ${message.type}:`, error);
        }
      });
    }

    // Also dispatch to wildcard listeners
    const wildcardListeners = this.listeners.get('*');
    if (wildcardListeners) {
      wildcardListeners.forEach(callback => {
        try {
          callback(message.data, message.type);
        } catch (error) {
          console.error('[EventBus] Error in wildcard listener:', error);
        }
      });
    }
  }

  /**
   * Listen to events
   * @param {string|string[]} eventTypes - Event type(s) to listen to, or '*' for all
   * @param {function} callback - Function to call when event is received
   */
  on(eventTypes, callback) {
    const types = Array.isArray(eventTypes) ? eventTypes : [eventTypes];

    types.forEach(type => {
      if (!this.listeners.has(type)) {
        this.listeners.set(type, new Set());
      }
      this.listeners.get(type).add(callback);
    });

    return () => this.off(eventTypes, callback);
  }

  /**
   * Remove event listener
   */
  off(eventTypes, callback) {
    const types = Array.isArray(eventTypes) ? eventTypes : [eventTypes];

    types.forEach(type => {
      const listeners = this.listeners.get(type);
      if (listeners) {
        listeners.delete(callback);
      }
    });
  }

  /**
   * Emit an event to all widgets
   * @param {string} type - Event type (use EventTypes constants)
   * @param {*} data - Data to send with the event
   */
  emit(type, data) {
    if (!this.channel) {
      console.error('[EventBus] Channel not connected');
      return;
    }

    const message = {
      type,
      data,
      timestamp: Date.now(),
    };

    try {
      this.channel.postMessage(message);
    } catch (error) {
      console.error('[EventBus] Failed to emit event:', error);
    }
  }

  /**
   * Disconnect from the event bus
   */
  disconnect() {
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
    this.listeners.clear();
    this.messageHistory.clear();
    console.log('[EventBus] Disconnected');
  }
}

export default EventBus;
