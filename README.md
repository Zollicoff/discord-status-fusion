# Discord Status Fusion

<p align="center">
  <img src="src/images/status-fusion-icon.png" alt="Discord Status Fusion" width="128" height="128">
</p>

AI-powered Discord Rich Presence that intelligently displays your current professional applications and music.

## Preview

<p align="center">
  <img src="src/images/status-fusion-preview.png" alt="Discord Status Fusion in action" width="400">
</p>

## Features

- **AI-Powered Status Generation**: Uses Gemini 2.5 Flash-Lite for intelligent status formatting
- **Professional App Detection**: Automatically detects and displays work-relevant applications
- **Music Integration**: Shows currently playing music from Apple Music and Spotify (macOS only)
- **Smart Change Detection**: Only updates when your apps or music actually change
- **Gaming Friendly**: Does not override gaming status from Steam, Discord games, etc.
- **Simple Setup**: Minimal configuration required
- **Cross-Platform**: Supports macOS (full), Windows and Linux (partial)
- **Configurable Intervals**: Customize update and refresh intervals via environment variables
- **Exponential Backoff**: Automatic reconnection with intelligent retry logic

## Quick Start

### Prerequisites

- Node.js 16 or higher
- Discord account
- Google AI API key

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/Zollicoff/discord-status-fusion.git
   cd discord-status-fusion
   npm install
   ```

2. **Create Discord Application**
   - Go to [Discord Developer Portal](https://discord.com/developers/applications)
   - Create a new application
   - Copy the Application ID

   <p align="center">
     <img src="src/images/status-fusion-setup.png" alt="Discord Application Setup" width="600">
   </p>

3. **Get Google AI API Key**
   - Visit [Google AI Studio](https://aistudio.google.com/app/apikey)
   - Create a new API key

4. **Configure API Key (Secure)**

   **macOS:**
   ```bash
   security add-generic-password -s "GOOGLE_AI_API_KEY" -a "$(whoami)" -w "your-api-key-here"
   ```

   **Windows:**
   ```cmd
   cmdkey /add:GOOGLE_AI_API_KEY /user:discord-status-fusion /pass:your-api-key-here
   ```

   **Linux:**
   ```bash
   secret-tool store --label="Google AI API Key" service "GOOGLE_AI_API_KEY" username "discord-status-fusion"
   # Enter your API key when prompted
   ```

5. **Configure Environment**
   ```bash
   cp .env.example .env
   # Edit .env and add your Discord Application ID
   ```

6. **Install CLI**
   ```bash
   npm install -g .
   ```

7. **Run**
   ```bash
   dsf start
   ```

## How It Works

1. **Process Detection**: Scans your running applications
2. **Professional Filtering**: Identifies work-relevant software using a curated whitelist
3. **AI Formatting**: Gemini AI intelligently selects and formats the best 4 apps
4. **Music Detection**: Detects music from Apple Music and Spotify (macOS only)
5. **Discord Update**: Updates your Rich Presence with the generated status

## Supported Applications

**Development Tools:** Cursor, VS Code, Xcode, Warp Terminal, IntelliJ, PyCharm, etc.

**Creative Software:** Adobe Photoshop, Illustrator, After Effects, Figma, Sketch, etc.

**Office & Productivity:** Microsoft Office, Notion, Obsidian, Keynote, etc.

**Professional Tools:** Docker, Postman, TablePlus, Wireshark, etc.

**Browsers:** Chrome, Safari, Firefox, Arc, etc.

## Example Status

```
Using Cursor + Photoshop + Safari + Excel
   -> # Song Name by Artist on Apple Music
```

## CLI Commands

After installing globally with `npm install -g .`, you can use:

```bash
dsf start   # Start the daemon in background
dsf stop    # Stop the daemon
dsf status  # Check if running
dsf help    # Show help
```

The daemon runs in the background and survives terminal closures. Logs are written to `discord-status-fusion.log`.

## Configuration

### Environment Variables

Create a `.env` file:

```bash
# Required
DISCORD_CLIENT_ID=your_discord_application_id_here

# Optional - Update intervals (in milliseconds)
UPDATE_INTERVAL=10000        # How often to check for changes (default: 10s)
FORCE_UPDATE_INTERVAL=300000 # Force refresh interval (default: 5min)

# Optional - Logging
LOG_LEVEL=info  # Available: error, warn, info, debug, verbose
```

### Adding New Applications

To add support for a new professional application, edit the whitelist in `src/core/detector.js` and add the appropriate regex pattern.

## Platform Support

| Feature | macOS | Windows | Linux |
|---------|-------|---------|-------|
| Process Detection | Yes | Yes | Yes |
| Music Detection | Yes | No | No |
| Keychain Storage | Yes | Yes | Yes |

Note: Music detection requires AppleScript and is only available on macOS. Windows and Linux users will see a one-time informational message about this limitation.

## Troubleshooting

### Common Issues

**"DISCORD_CLIENT_ID not found"**: Ensure you've created a `.env` file with your Discord Application ID. The ID should be a 17-19 digit number.

**"No API key found"**: Ensure you've stored your Google AI API key in the system keychain using the commands above. Check the console output for specific instructions for your platform.

**"Discord connection failed"**: Make sure Discord is running and your Application ID is correct. The application will automatically retry with exponential backoff.

**"App not detected"**: Check if your application is in the professional apps whitelist in `src/core/detector.js`.

## Development

### Running Tests

```bash
npm test           # Run all tests
npm test:watch     # Run tests in watch mode
npm run lint       # Check code style
npm run lint:fix   # Fix code style issues
```

### Development Mode

```bash
npm run dev        # Run with auto-restart on file changes
npm start -- --verbose  # Run with detailed debug output
```

## Contributing

Contributions are welcome! Please focus on:

- Adding new professional applications to the whitelist
- Improving cross-platform compatibility (especially Windows/Linux music detection)
- Bug fixes and optimizations
- Documentation improvements
- Adding more test coverage

Before submitting a PR:
1. Run `npm run lint` to check code style
2. Run `npm test` to ensure all tests pass
3. Test the application manually with `dsf start`

## License

MIT License - see LICENSE file for details.

## Links

- [GitHub Repository](https://github.com/Zollicoff/discord-status-fusion)
- [Discord Developer Portal](https://discord.com/developers/applications)
- [Google AI Studio](https://aistudio.google.com/app/apikey)

---

*Intelligent Discord status generation powered by AI.*
