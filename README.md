# OBS Rave Overlay System

A **modular, dynamic overlay system** for OBS with Spotify integration, Home Assistant sync, and genre-adaptive theming. Perfect for Discord streaming with an ultra-wide camera setup.

## 🎨 Features

- **Modular Widgets**: Each widget is independent (separate OBS browser source)
- **Spotify Integration**: Now playing, album art, BPM, genre detection
- **Home Assistant Sync**: Yeelight color sync, sensor data, real-time updates
- **Dynamic Theming**: Adapts to music genre and album art colors
- **Genre-Based Aesthetics**: Different visual styles for trance, hardcore, techno, etc.
- **Cross-Widget Communication**: Real-time state sync via BroadcastChannel API
- **Extensible**: Easy to add new widgets

## 📁 Project Structure

```
/
├── server.js                   # Node.js server (OAuth, API proxy)
├── package.json                # Dependencies
├── .env                        # Configuration (create from .env.example)
│
├── widgets/                    # Individual OBS browser sources
│   ├── hub.html                # Central coordinator (must run)
│   ├── now-playing.html        # Spotify now playing
│   ├── clock.html              # Clock + uptime
│   ├── yeelight-sync.html      # Yeelight visualization
│   └── ...
│
├── shared/                     # Shared libraries (ES modules)
│   ├── lib/
│   │   ├── event-bus.js        # Cross-widget communication
│   │   ├── theme-engine.js     # Dynamic theming
│   │   └── color-extractor.js  # Album art color extraction
│   │
│   └── services/
│       ├── spotify-service.js  # Spotify API client
│       └── home-assistant-service.js # HA integration
│
└── styles/
    └── base.css                # Shared styles
```

## 🚀 Quick Start

### 1. Prerequisites

- **Node.js** 18+ (for server)
- **Spotify Developer Account** ([developer.spotify.com](https://developer.spotify.com))
- **Home Assistant** (optional, for light sync)
- **OBS Studio**

### 2. Installation

```bash
# Clone or navigate to project directory
cd /path/to/overlay

# Install dependencies
npm install

# Copy environment template
cp .env.example .env
```

### 3. Configure Spotify

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Create a new app
3. Add redirect URI: `http://localhost:3000/auth/spotify/callback`
4. Copy **Client ID** and **Client Secret** to `.env`:

```env
SPOTIFY_CLIENT_ID=your_client_id_here
SPOTIFY_CLIENT_SECRET=your_client_secret_here
SPOTIFY_REDIRECT_URI=http://localhost:3000/auth/spotify/callback
```

### 4. Configure Home Assistant (Optional)

1. Go to Home Assistant → Profile → Long-Lived Access Tokens
2. Create token
3. Add to `.env`:

```env
HA_URL=http://homeassistant.local:8123
HA_TOKEN=your_token_here
YEELIGHT_ENTITIES=light.yeelight_strip,light.yeelight_bulb_1
```

### 5. Start Server

```bash
npm start
```

You should see:

```
╔════════════════════════════════════════════════════════════╗
║          OBS Rave Overlay Server                          ║
║                                                            ║
║  Server running at: http://localhost:3000                 ║
║                                                            ║
║  To authenticate Spotify:                                 ║
║  → http://localhost:3000/auth/spotify/login               ║
╚════════════════════════════════════════════════════════════╝
```

### 6. Authenticate Spotify

1. Open: `http://localhost:3000/auth/spotify/login`
2. Log in to Spotify
3. Authorize the app
4. You'll be redirected back

### 7. Add Widgets to OBS

Add each widget as a **Browser Source**:

#### Hub Widget (Required - Always Active)

```
URL: http://localhost:3000/widgets/hub.html
Width: 100
Height: 100
FPS: 5
✓ Refresh browser when scene becomes active: NO
✓ Shutdown source when not visible: NO
```

Position this off-screen or make it tiny. It must always be active to coordinate other widgets.

#### Now Playing Widget

```
URL: http://localhost:3000/widgets/now-playing.html
Width: 420
Height: 180
FPS: 30
Position: Top-left (40, 40)
```

#### More Widgets

Add other widgets similarly (clock, yeelight-sync, etc.)

## 🎭 How It Works

### Architecture

```
┌─────────────────────────────────────────────────────┐
│   Hub Widget (Always Running)                       │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│   │ Spotify  │  │   Home   │  │  Theme   │        │
│   │ Service  │  │ Assistant│  │  Engine  │        │
│   └────┬─────┘  └────┬─────┘  └────┬─────┘        │
│        │             │             │               │
│        └─────────────┴─────────────┘               │
│                      │                             │
│               ┌──────▼──────┐                      │
│               │  Event Bus  │                      │
│               │(Broadcast)  │                      │
│               └──────┬──────┘                      │
└──────────────────────┼────────────────────────────┘
                       │ BroadcastChannel API
         ┌─────────────┼─────────────┬───────────┐
         │             │             │           │
    ┌────▼────┐   ┌───▼────┐   ┌───▼────┐  ┌──▼───┐
    │  Now    │   │ Clock  │   │ Yeelight│  │ ...  │
    │ Playing │   │ Widget │   │  Sync  │  │      │
    └─────────┘   └────────┘   └────────┘  └──────┘
```

1. **Hub** polls Spotify API (every 5s) and Home Assistant
2. **Hub** extracts colors from album art
3. **Hub** detects genre and generates theme
4. **Hub** broadcasts updates via Event Bus (BroadcastChannel)
5. **All widgets** receive updates and react in real-time

### Theme System

Themes adapt based on:

1. **Genre** (detected from Spotify metadata)
   - Trance → Ethereal purples, slow animations
   - Hardcore → Aggressive reds, fast animations
   - Techno → Minimal blues, geometric
   - House → Groovy greens, smooth

2. **Album Art Colors** (extracted via k-means clustering)
   - Dominant color → Primary accent
   - Palette → Secondary colors

3. **Home Assistant Lights** (optional override)
   - Yeelight RGB → Theme colors
   - Syncs overlay with physical lighting

## 🔧 Configuration Options

### `.env` File

```env
# Spotify (Required)
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
SPOTIFY_REDIRECT_URI=http://localhost:3000/auth/spotify/callback

# Home Assistant (Optional)
HA_URL=http://homeassistant.local:8123
HA_TOKEN=
YEELIGHT_ENTITIES=light.yeelight_strip,light.yeelight_bulb_1

# Server
PORT=3000
NODE_ENV=production

# Features
ENABLE_DISCORD=false
ENABLE_AUDIO_VISUALIZER=true
SYNC_THEME_WITH_HA_LIGHTS=true  # Use Yeelight colors for theme
```

## 🎨 Creating Custom Widgets

### Basic Widget Template

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>My Widget</title>
  <link rel="stylesheet" href="../styles/base.css">
</head>
<body>
  <div id="root"></div>

  <script type="module">
    import { h, render } from 'https://esm.sh/preact@10.19.3';
    import { useState, useEffect } from 'https://esm.sh/preact@10.19.3/hooks';
    import htm from 'https://esm.sh/htm@3.1.1';
    import { EventBus, EventTypes } from '../shared/lib/event-bus.js';

    const html = htm.bind(h);

    function MyWidget() {
      const [data, setData] = useState(null);

      useEffect(() => {
        const eventBus = new EventBus();

        // Listen to Spotify updates
        eventBus.on(EventTypes.SPOTIFY_TRACK_UPDATE, (trackData) => {
          setData(trackData);
        });

        // Listen to theme updates
        eventBus.on(EventTypes.THEME_UPDATE, (theme) => {
          // Apply theme to :root
          const root = document.documentElement;
          Object.entries(theme.colors).forEach(([key, value]) => {
            root.style.setProperty(`--color-${key}`, value);
          });
        });

        return () => eventBus.disconnect();
      }, []);

      return html`
        <div class="widget">
          ${data ? html`<div>${data.track.name}</div>` : 'Loading...'}
        </div>
      `;
    }

    render(html`<${MyWidget} />`, document.getElementById('root'));
  </script>
</body>
</html>
```

### Available Events

```javascript
EventTypes.SPOTIFY_TRACK_UPDATE    // Track data + features
EventTypes.SPOTIFY_PLAYBACK_STATE  // Playing/paused
EventTypes.THEME_UPDATE            // Theme colors + effects
EventTypes.HA_LIGHT_UPDATE         // Yeelight state
EventTypes.HUB_READY               // Hub initialized
```

## 📱 Ubuntu Server Deployment

### Option 1: systemd Service

```bash
# Create service file
sudo nano /etc/systemd/system/obs-overlay.service
```

```ini
[Unit]
Description=OBS Overlay System
After=network.target

[Service]
Type=simple
User=your_username
WorkingDirectory=/path/to/overlay
Environment=NODE_ENV=production
ExecStart=/usr/bin/node server.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```bash
# Enable and start
sudo systemctl enable obs-overlay
sudo systemctl start obs-overlay

# Check status
sudo systemctl status obs-overlay
```

### Option 2: PM2 (Process Manager)

```bash
# Install PM2
npm install -g pm2

# Start overlay
pm2 start server.js --name obs-overlay

# Auto-start on boot
pm2 startup
pm2 save
```

### Access from Other Devices

Update OBS browser source URLs:

```
http://your-ubuntu-server-ip:3000/widgets/hub.html
http://192.168.1.100:3000/widgets/now-playing.html
```

## 🐛 Debugging

### Enable Debug Mode

Add `?debug=true` to widget URLs:

```
http://localhost:3000/widgets/hub.html?debug=true
```

### Check Server Logs

```bash
# If using systemd
sudo journalctl -u obs-overlay -f

# If using PM2
pm2 logs obs-overlay
```

### Common Issues

**Widgets not updating:**
- Ensure Hub widget is running in OBS
- Check browser console (F12) for errors
- Verify Event Bus connection

**Spotify not authenticating:**
- Check redirect URI matches exactly
- Verify client ID/secret in `.env`
- Clear browser cache and re-authenticate

**Home Assistant not connecting:**
- Verify HA URL is accessible from server
- Check long-lived token is valid
- Ensure entity IDs are correct

## 🎯 Roadmap

- [ ] Audio visualizer widget (FFT spectrum)
- [ ] VU meter widget
- [ ] Discord status widget
- [ ] Custom status message widget
- [ ] Weather widget
- [ ] BPM-synced animations
- [ ] Mobile control dashboard

## 📄 License

MIT

## 🙏 Acknowledgments

- Built with [Preact](https://preactjs.com/)
- Inspired by the underground rave scene
- Powered by coffee and hardstyle

---

**Have fun and keep the vibes going! 🎵✨**
