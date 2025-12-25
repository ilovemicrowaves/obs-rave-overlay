import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// In-memory token storage (reset on server restart)
let spotifyTokens = {
  access_token: null,
  refresh_token: null,
  expires_at: null,
};

// CORS configuration
const allowedOrigins = [
  `http://localhost:${PORT}`,
  `http://127.0.0.1:${PORT}`,
  // Add your Ubuntu server IP here when deploying
  'http://192.168.1.100:3000',
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.some(allowed => origin.startsWith(allowed.split(':').slice(0, 2).join(':')))) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

app.use(express.json());
app.use(express.static('.'));

// ==================== SPOTIFY OAUTH ====================

app.get('/auth/spotify/login', (req, res) => {
  const scope = 'user-read-currently-playing user-read-playback-state';
  const authUrl = `https://accounts.spotify.com/authorize?` +
    `client_id=${process.env.SPOTIFY_CLIENT_ID}` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(process.env.SPOTIFY_REDIRECT_URI)}` +
    `&scope=${encodeURIComponent(scope)}`;

  res.redirect(authUrl);
});

app.get('/auth/spotify/callback', async (req, res) => {
  const code = req.query.code;

  if (!code) {
    return res.redirect('/?error=no_code');
  }

  try {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(
          process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET
        ).toString('base64'),
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: process.env.SPOTIFY_REDIRECT_URI,
      }),
    });

    const data = await response.json();

    if (data.access_token) {
      spotifyTokens.access_token = data.access_token;
      spotifyTokens.refresh_token = data.refresh_token;
      spotifyTokens.expires_at = Date.now() + (data.expires_in * 1000);

      console.log('[Spotify] Authentication successful');
      res.redirect('/?spotify_auth=success');
    } else {
      console.error('[Spotify] Auth error:', data);
      res.redirect('/?error=spotify_auth_failed');
    }
  } catch (error) {
    console.error('[Spotify] Auth error:', error);
    res.redirect('/?error=spotify_auth_failed');
  }
});

app.post('/auth/spotify/refresh', async (req, res) => {
  if (!spotifyTokens.refresh_token) {
    return res.status(401).json({ error: 'No refresh token available' });
  }

  try {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(
          process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET
        ).toString('base64'),
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: spotifyTokens.refresh_token,
      }),
    });

    const data = await response.json();

    if (data.access_token) {
      spotifyTokens.access_token = data.access_token;
      spotifyTokens.expires_at = Date.now() + (data.expires_in * 1000);

      console.log('[Spotify] Token refreshed');
      res.json({ success: true });
    } else {
      console.error('[Spotify] Refresh error:', data);
      res.status(401).json({ error: 'Token refresh failed' });
    }
  } catch (error) {
    console.error('[Spotify] Refresh error:', error);
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

// Auto-refresh token before expiry
setInterval(async () => {
  if (spotifyTokens.refresh_token && spotifyTokens.expires_at) {
    const timeUntilExpiry = spotifyTokens.expires_at - Date.now();

    // Refresh 5 minutes before expiry
    if (timeUntilExpiry < 5 * 60 * 1000 && timeUntilExpiry > 0) {
      console.log('[Spotify] Auto-refreshing token...');
      try {
        const response = await fetch(`http://localhost:${PORT}/auth/spotify/refresh`, {
          method: 'POST',
        });
        if (response.ok) {
          console.log('[Spotify] Token auto-refreshed successfully');
        }
      } catch (error) {
        console.error('[Spotify] Auto-refresh failed:', error);
      }
    }
  }
}, 60 * 1000); // Check every minute

// ==================== SPOTIFY API PROXY ====================

async function ensureValidToken() {
  if (!spotifyTokens.access_token) {
    throw new Error('Not authenticated');
  }

  // Check if token is expired
  if (spotifyTokens.expires_at && Date.now() >= spotifyTokens.expires_at) {
    const response = await fetch(`http://localhost:${PORT}/auth/spotify/refresh`, {
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error('Token refresh failed');
    }
  }

  return spotifyTokens.access_token;
}

app.get('/api/spotify/current-track', async (req, res) => {
  try {
    const token = await ensureValidToken();

    const response = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
      headers: {
        'Authorization': 'Bearer ' + token,
      },
    });

    if (response.status === 204) {
      return res.json({ playing: false });
    }

    if (!response.ok) {
      throw new Error(`Spotify API error: ${response.status}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('[Spotify API] Error:', error.message);
    res.status(error.message.includes('Not authenticated') ? 401 : 500).json({
      error: error.message,
    });
  }
});

app.get('/api/spotify/audio-features/:trackId', async (req, res) => {
  try {
    const token = await ensureValidToken();
    const { trackId } = req.params;

    const response = await fetch(`https://api.spotify.com/v1/audio-features/${trackId}`, {
      headers: {
        'Authorization': 'Bearer ' + token,
      },
    });

    if (!response.ok) {
      throw new Error(`Spotify API error: ${response.status}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('[Spotify API] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/spotify/artist/:artistId', async (req, res) => {
  try {
    const token = await ensureValidToken();
    const { artistId } = req.params;

    const response = await fetch(`https://api.spotify.com/v1/artists/${artistId}`, {
      headers: {
        'Authorization': 'Bearer ' + token,
      },
    });

    if (!response.ok) {
      throw new Error(`Spotify API error: ${response.status}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('[Spotify API] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ==================== HOME ASSISTANT API PROXY ====================

app.get('/api/ha/states/:entityId', async (req, res) => {
  try {
    const { entityId } = req.params;
    const response = await fetch(`${process.env.HA_URL}/api/states/${entityId}`, {
      headers: {
        'Authorization': 'Bearer ' + process.env.HA_TOKEN,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HA API error: ${response.status}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('[HA API] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/ha/services/:domain/:service', async (req, res) => {
  try {
    const { domain, service } = req.params;
    const response = await fetch(`${process.env.HA_URL}/api/services/${domain}/${service}`, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + process.env.HA_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body),
    });

    if (!response.ok) {
      throw new Error(`HA API error: ${response.status}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('[HA API] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ==================== CONFIGURATION ====================

app.get('/api/config', (req, res) => {
  res.json({
    spotify: {
      authenticated: !!spotifyTokens.access_token,
      tokenExpiry: spotifyTokens.expires_at,
    },
    homeAssistant: {
      configured: !!process.env.HA_URL && !!process.env.HA_TOKEN,
      url: process.env.HA_URL,
    },
    widgets: {
      enableDiscord: process.env.ENABLE_DISCORD === 'true',
      enableAudioVisualizer: process.env.ENABLE_AUDIO_VISUALIZER === 'true',
      syncThemeWithHALights: process.env.SYNC_THEME_WITH_HA_LIGHTS === 'true',
    },
    yeelightEntities: process.env.YEELIGHT_ENTITIES?.split(',') || [],
  });
});

// ==================== START SERVER ====================

const server = app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║          OBS Rave Overlay Server                          ║
║                                                            ║
║  Server running at: http://localhost:${PORT}                 ║
║                                                            ║
║  Spotify Auth: ${spotifyTokens.access_token ? '✓ Authenticated' : '✗ Not authenticated'}                   ║
║  Home Assistant: ${process.env.HA_URL ? '✓ Configured' : '✗ Not configured'}                     ║
║                                                            ║
║  To authenticate Spotify:                                 ║
║  → http://localhost:${PORT}/auth/spotify/login               ║
║                                                            ║
║  Widgets available at:                                    ║
║  → http://localhost:${PORT}/widgets/                         ║
╚════════════════════════════════════════════════════════════╝
  `);
});

// ==================== WEBSOCKET SERVER (for HA real-time) ====================

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  console.log('[WebSocket] Client connected');

  ws.on('message', (message) => {
    console.log('[WebSocket] Received:', message.toString());
  });

  ws.on('close', () => {
    console.log('[WebSocket] Client disconnected');
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Server] SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('[Server] Server closed');
    process.exit(0);
  });
});
