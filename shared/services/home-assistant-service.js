/**
 * Home Assistant Service - WebSocket and REST API integration
 * First-class integration for Yeelight sync and sensor data
 */

export class HomeAssistantService {
  constructor(serverUrl = window.location.origin) {
    this.serverUrl = serverUrl;
    this.ws = null;
    this.wsUrl = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 1000; // Start at 1 second
    this.maxReconnectDelay = 30000; // Max 30 seconds
    this.listeners = new Map();
    this.messageId = 1;
    this.pendingMessages = new Map();
    this.subscriptions = new Set();
  }

  /**
   * Connect to Home Assistant WebSocket API
   */
  async connect() {
    try {
      // Get HA configuration from server
      const response = await fetch(`${this.serverUrl}/api/config`);
      const config = await response.json();

      if (!config.homeAssistant.configured) {
        console.warn('[HA Service] Home Assistant not configured');
        return false;
      }

      // Connect to HA WebSocket (direct connection, not proxied)
      const haUrl = config.homeAssistant.url;
      this.wsUrl = haUrl.replace('http://', 'ws://').replace('https://', 'wss://') + '/api/websocket';

      await this.connectWebSocket();
      return true;
    } catch (error) {
      console.error('[HA Service] Connection failed:', error);
      return false;
    }
  }

  /**
   * Connect to WebSocket
   */
  connectWebSocket() {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.wsUrl);

        this.ws.onopen = () => {
          console.log('[HA Service] WebSocket connected');
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(JSON.parse(event.data));
        };

        this.ws.onerror = (error) => {
          console.error('[HA Service] WebSocket error:', error);
          reject(error);
        };

        this.ws.onclose = () => {
          console.log('[HA Service] WebSocket closed');
          this.isConnected = false;
          this.handleReconnect();
        };

        // Set a timeout for initial connection
        setTimeout(() => {
          if (!this.isConnected) {
            reject(new Error('WebSocket connection timeout'));
          }
        }, 10000);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Handle incoming WebSocket messages
   */
  async handleMessage(message) {
    // Initial auth message
    if (message.type === 'auth_required') {
      await this.authenticate();
      return;
    }

    // Auth success
    if (message.type === 'auth_ok') {
      console.log('[HA Service] Authenticated successfully');
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.reconnectDelay = 1000;

      // Subscribe to state changes
      await this.subscribeToEvents();
      return;
    }

    // Auth failed
    if (message.type === 'auth_invalid') {
      console.error('[HA Service] Authentication failed');
      this.ws.close();
      return;
    }

    // Handle pending requests
    if (message.id && this.pendingMessages.has(message.id)) {
      const { resolve, reject } = this.pendingMessages.get(message.id);
      this.pendingMessages.delete(message.id);

      if (message.success) {
        resolve(message.result);
      } else {
        reject(message.error);
      }
      return;
    }

    // Handle events
    if (message.type === 'event') {
      this.handleEvent(message.event);
    }
  }

  /**
   * Authenticate with Home Assistant
   */
  async authenticate() {
    try {
      const response = await fetch(`${this.serverUrl}/api/config`);
      const config = await response.json();

      // Get HA token from server (proxied)
      const haResponse = await fetch(`${this.serverUrl}/api/ha/states/sun.sun`);
      const token = haResponse.headers.get('X-HA-Token'); // If server exposes it

      // For now, use REST API proxy instead of direct WS auth
      // This avoids exposing the HA token to the client

      console.log('[HA Service] Using REST API proxy for authentication');
      this.isConnected = true;
      this.startPolling();
    } catch (error) {
      console.error('[HA Service] Authentication error:', error);
    }
  }

  /**
   * Subscribe to state change events
   */
  async subscribeToEvents() {
    return this.sendMessage({
      type: 'subscribe_events',
      event_type: 'state_changed',
    });
  }

  /**
   * Send a message to Home Assistant
   */
  sendMessage(message) {
    return new Promise((resolve, reject) => {
      if (!this.ws || !this.isConnected) {
        reject(new Error('Not connected'));
        return;
      }

      const id = this.messageId++;
      const fullMessage = { ...message, id };

      this.pendingMessages.set(id, { resolve, reject });

      this.ws.send(JSON.stringify(fullMessage));

      // Timeout after 10 seconds
      setTimeout(() => {
        if (this.pendingMessages.has(id)) {
          this.pendingMessages.delete(id);
          reject(new Error('Message timeout'));
        }
      }, 10000);
    });
  }

  /**
   * Handle state change events
   */
  handleEvent(event) {
    if (event.event_type === 'state_changed') {
      const entityId = event.data.entity_id;
      const newState = event.data.new_state;

      // Notify listeners
      const listeners = this.listeners.get(entityId) || [];
      listeners.forEach(callback => callback(newState));

      // Notify wildcard listeners
      const wildcardListeners = this.listeners.get('*') || [];
      wildcardListeners.forEach(callback => callback(newState, entityId));
    }
  }

  /**
   * Listen to entity state changes
   */
  on(entityId, callback) {
    if (!this.listeners.has(entityId)) {
      this.listeners.set(entityId, []);
    }

    this.listeners.get(entityId).push(callback);

    return () => this.off(entityId, callback);
  }

  /**
   * Remove listener
   */
  off(entityId, callback) {
    const listeners = this.listeners.get(entityId);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * Get current state of an entity (REST API)
   */
  async getState(entityId) {
    try {
      const response = await fetch(`${this.serverUrl}/api/ha/states/${entityId}`);

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`[HA Service] Get state failed for ${entityId}:`, error);
      return null;
    }
  }

  /**
   * Call a service (REST API)
   */
  async callService(domain, service, data = {}) {
    try {
      const response = await fetch(`${this.serverUrl}/api/ha/services/${domain}/${service}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`[HA Service] Call service failed:`, error);
      return null;
    }
  }

  /**
   * Get Yeelight states
   */
  async getYeelights() {
    try {
      const response = await fetch(`${this.serverUrl}/api/config`);
      const config = await response.json();
      const entities = config.yeelightEntities || [];

      const states = await Promise.all(
        entities.map(entityId => this.getState(entityId))
      );

      return states.filter(s => s !== null).map(state => ({
        entity_id: state.entity_id,
        state: state.state,
        brightness: state.attributes.brightness,
        rgb_color: state.attributes.rgb_color,
        color_temp: state.attributes.color_temp,
        friendly_name: state.attributes.friendly_name,
      }));
    } catch (error) {
      console.error('[HA Service] Get Yeelights failed:', error);
      return [];
    }
  }

  /**
   * Pulse light brightness (for beat synchronization)
   * @param {string} entityId - Light entity ID
   * @param {number} targetBrightness - Target brightness (0-255)
   * @param {number} transitionMs - Transition duration in milliseconds
   */
  async pulseBrightness(entityId, targetBrightness, transitionMs = 100) {
    try {
      const transitionSeconds = transitionMs / 1000;

      return await this.callService('light', 'turn_on', {
        entity_id: entityId,
        brightness: Math.round(targetBrightness),
        transition: transitionSeconds,
      });
    } catch (error) {
      console.error(`[HA Service] Pulse brightness failed for ${entityId}:`, error);
      return null;
    }
  }

  /**
   * Flash light (quick on/off for track changes)
   * @param {string} entityId - Light entity ID
   * @param {string} flashType - 'short' or 'long'
   */
  async flashLight(entityId, flashType = 'short') {
    try {
      return await this.callService('light', 'turn_on', {
        entity_id: entityId,
        flash: flashType,
      });
    } catch (error) {
      console.error(`[HA Service] Flash failed for ${entityId}:`, error);
      return null;
    }
  }

  /**
   * Handle reconnection with exponential backoff
   */
  handleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[HA Service] Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      this.maxReconnectDelay
    );

    console.log(`[HA Service] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      this.connectWebSocket().catch(error => {
        console.error('[HA Service] Reconnection failed:', error);
      });
    }, delay);
  }

  /**
   * Start polling (fallback when WebSocket is not available)
   */
  startPolling(interval = 10000) {
    console.log('[HA Service] Starting REST API polling');

    this.pollingInterval = setInterval(async () => {
      // Poll Yeelight states
      const yeelights = await this.getYeelights();

      yeelights.forEach(light => {
        const listeners = this.listeners.get(light.entity_id) || [];
        listeners.forEach(callback => callback(light));
      });
    }, interval);
  }

  /**
   * Stop polling
   */
  stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  /**
   * Disconnect
   */
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.stopPolling();
    this.listeners.clear();
    this.pendingMessages.clear();
    this.isConnected = false;
  }
}

export default HomeAssistantService;
