# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Discord Status Fusion is an AI-powered Discord Rich Presence application that intelligently displays current professional applications and music. It uses Gemini 2.5 Flash-Lite Preview for ultra-fast status generation with smart change detection to minimize API calls.

## Development Commands

### Running the Application
```bash
npm start          # Run directly with verbose logging
npm start -- --verbose  # Run with detailed debug output
dsf start          # Start daemon (runs in background)
dsf stop           # Stop daemon
dsf status         # Check if daemon is running
dsf help           # Show CLI help
```

### Development & Maintenance
```bash
npm run dev        # Run with nodemon (auto-restart on changes)
npm run lint       # Run ESLint to check code quality
npm run lint:fix   # Run ESLint with automatic fixes
npm install -g .   # Install dsf CLI globally
```

### Testing
No test framework currently configured. Manual testing recommended when modifying core components.

## Architecture & Key Design Patterns

### Main Application Loop (main.js)
The `DiscordStatusFusion` class orchestrates the entire application:
- **Smart Change Detection**: Only calls LLM when apps/music actually change (10s check interval)
- **Forced Refresh**: Updates status every 5 minutes regardless of changes (prevents stale status)
- **Rate Limiting**: Enforces 2-second minimum between LLM API calls
- **Visual Feedback**: Spinner UI shows app is running (disabled in verbose mode)
- **Connection Recovery**: Auto-reconnects to Discord if connection drops

### Core Components Interaction Flow
1. **Process Detection** (`src/core/detector.js`): Scans system processes, filters to professional apps
2. **Music Detection** (`src/core/music.js`): Checks Apple Music/Spotify via AppleScript (macOS only)
3. **LLM Processing** (`src/core/llm.js`): Generates formatted status via Gemini API when changes detected
4. **Discord Update**: Sets Rich Presence with generated status

### Key Implementation Details

#### API Key Security
Google AI API key stored in system keychain (never in code/env files):
- **macOS**: `security add-generic-password -s "GOOGLE_AI_API_KEY" -a "$(whoami)" -w "your-key"`
- **Windows**: `cmdkey /add:GOOGLE_AI_API_KEY /user:discord-status-fusion /pass:your-key`
- **Linux**: `secret-tool store --label="Google AI API Key" service "GOOGLE_AI_API_KEY" username "discord-status-fusion"`

#### Professional Apps Whitelist
The `isProfessionalApp()` method in `src/core/detector.js:103-154` uses regex patterns to identify professional applications. To add support for new apps, add patterns to the `professionalApps` array.

#### LLM Prompt Engineering
The prompt in `src/core/llm.js:90-104` is carefully crafted to:
- Include ALL detected apps (no cherry-picking)
- Apply specific renames (e.g., "stable" → "Warp", "code" → "VS Code")
- Format consistently with "+" separators
- Generate appropriate secondary status line based on music presence

#### Daemon Process Management
The CLI (`bin/dsf`) uses:
- **PID file** (`dsf.pid`): Tracks running daemon process
- **nohup**: Ensures process survives terminal closure
- **Process detachment**: Unlinks child from parent process

## Environment Configuration

Create `.env` file from `.env.example`:
```bash
DISCORD_CLIENT_ID=your_discord_app_id  # Required: from Discord Developer Portal
LOG_LEVEL=info  # Optional: error, warn, info, debug, verbose
```

## Dependencies & Version Requirements

**Runtime Dependencies:**
- `discord-rpc@4.0.1`: Discord Rich Presence client
- `dotenv@16.6.1`: Environment variable management

**Development Dependencies:**
- `eslint@8.0.0`: Code quality enforcement
- `nodemon@3.0.0`: Development auto-restart

**Node.js:** Requires v16.0.0 or higher

## Platform-Specific Behavior

### macOS (Full Support)
- Process detection via `ps -eo comm`
- Music detection via AppleScript for Apple Music & Spotify
- Keychain access via `security` command

### Windows (Partial Support)
- Process detection via `wmic process get Name`
- Music detection not implemented
- Credential storage via `cmdkey`

### Linux (Partial Support)
- Process detection via `ps -eo comm`
- Music detection not implemented
- Secret storage via `secret-tool`

## Common Modifications

### Adding New Professional Apps
Edit `src/core/detector.js:115-151` and add regex patterns to the `professionalApps` array.

### Adjusting Update Intervals
Edit `main.js:72-74`:
- `updateInterval`: How often to check for changes (default: 10s)
- `forceUpdateInterval`: Maximum time between LLM calls (default: 5min)

### Customizing Status Format
Modify the prompt in `src/core/llm.js:94-103` or the parsing logic in `src/core/llm.js:160-188`.