# Discord Status Fusion

<p align="center">
  <img src="src/images/status-fusion-icon.png" alt="Discord Status Fusion" width="128" height="128">
</p>

AI-curated Discord Rich Presence built from trusted local application and music activity. Gemini decides which detected apps best represent the moment and writes a concise context line, while local validation prevents invented, renamed, or duplicated applications.

## Features

- Uses Gemini 2.5 Flash-Lite to select, order, and summarize current activity
- Detects a curated set of development, productivity, creative, and browser apps
- Recognizes ChatGPT, legacy Codex, Ghostty, VS Code, Cursor, Notion, Safari, and many others
- Constrains Gemini to structured application IDs and rejects invalid decisions
- Shows Apple Music or Spotify tracks on macOS without launching inactive players
- Reuses validated AI decisions while source activity is unchanged
- Deduplicates app names and fits complete names within Discord's 128-character limit
- Falls back to rule-based formatting when Gemini is disabled or unavailable
- Reconnects to Discord with bounded exponential backoff
- Provides verified daemon start, stop, restart, and status commands

## Requirements

- Node.js 22.13 or newer
- Discord desktop app and account
- A Discord application ID
- A Google AI API key for AI curation; the daemon can run in fallback mode without one

## Installation

1. Clone and install dependencies:

   ```bash
   git clone https://github.com/Zollicoff/discord-status-fusion.git
   cd discord-status-fusion
   npm install
   ```

2. Create an application in the [Discord Developer Portal](https://discord.com/developers/applications) and copy its Application ID.

3. Configure the project:

   ```bash
   cp .env.example .env
   ```

   Set `DISCORD_CLIENT_ID` in `.env` to the application ID.

4. Create a Gemini API key in [Google AI Studio](https://aistudio.google.com/app/apikey), then store it in macOS Keychain:

   ```bash
   security add-generic-password -U -s "GEMINI_API_KEY" -a "$(whoami)" -w "your-api-key"
   ```

   On any platform, `GEMINI_API_KEY` may instead be set in `.env` or the process environment. The legacy macOS Keychain service name `GOOGLE_AI_API_KEY` remains supported.

5. Install the CLI and start the daemon:

   ```bash
   npm install -g .
   dsf start
   ```

## How It Works

1. `src/runtime.js` validates configuration and wires the runtime dependencies.
2. `src/core/detector.js` enumerates apps, rejects helper processes, and maps approved names through `src/core/app-catalog.js`.
3. `src/core/music.js` checks already-running Apple Music and Spotify instances on macOS.
4. `src/core/gemini.js` asks Gemini for structured application IDs, a short summary, and a music decision.
5. `src/core/status-decision.js` rejects unknown IDs, duplicates, application names in summaries, URLs, and malformed output.
6. `src/core/status-generator.js` renders canonical names locally, caches valid AI decisions, and uses `src/core/status.js` as its fallback.
7. `src/core/discord.js` owns Discord IPC, retry, reconnect, activity updates, and clean shutdown.

Example:

```text
Using Ghostty + ChatGPT + Notion
   -> Building and researching
```

## CLI

```bash
dsf start    # Start the background daemon
dsf stop     # Stop the verified daemon process
dsf restart  # Restart the daemon
dsf status   # Check daemon state
dsf help     # Show CLI help
```

The PID record is stored in `dsf.pid`. Logs are appended to `discord-status-fusion.log`; both are ignored by Git. The CLI verifies that a recorded PID is running this project's resolved `main.js` before signaling it.

## Configuration

```dotenv
DISCORD_CLIENT_ID=your_discord_application_id_here

# AI curation
LLM_ENABLED=true
GEMINI_MODEL=gemini-2.5-flash-lite
# GEMINI_API_KEY=your-api-key

# Optional, in milliseconds
UPDATE_INTERVAL=10000
FORCE_UPDATE_INTERVAL=300000

# error, warn, info, debug, or verbose
LOG_LEVEL=info
```

`UPDATE_INTERVAL` has a one-second minimum. `FORCE_UPDATE_INTERVAL` has a ten-second minimum.

Gemini receives only normalized approved app names and the current music description. Raw process paths and unapproved processes are never included. Set `LLM_ENABLED=false` to keep all status generation local and rule-based.

## Supported Apps

The curated whitelist includes:

- Development and AI: ChatGPT, Codex, Cursor, VS Code, Zed, Xcode, JetBrains IDEs
- Terminals: Ghostty, Warp, iTerm, Terminal, Hyper
- Productivity: Notion, Notion Calendar, Obsidian, Microsoft Office, Pages, Numbers, Keynote
- Creative: Adobe apps, Figma, Sketch, Blender, Final Cut Pro, Logic Pro
- Browsers: Safari, Chrome, Firefox, Edge, Brave, Arc, Opera
- Engineering tools: Docker Desktop, Postman, TablePlus, Wireshark, GitHub Desktop

To add an app, add an exact or intentionally scoped pattern and canonical `displayName` to `src/core/app-catalog.js`, then add a detector test. Earlier entries have higher display priority.

## Platform Support

| Feature | macOS | Windows | Linux |
|---|---:|---:|---:|
| Application detection | Yes | Yes | Yes |
| Apple Music and Spotify detection | Yes | No | No |
| Gemini status curation | Yes | Yes | Yes |
| Background daemon CLI | Yes | Yes | Yes |

macOS is the primary tested platform. Windows and Linux app detection use process-list fallbacks and do not currently expose music state.

## Troubleshooting

**ChatGPT is missing:** Run `dsf restart` after updating. The current ChatGPT desktop process maps directly to `ChatGPT`; legacy `Codex` remains supported separately.

**The daemon exits during startup:** Confirm `DISCORD_CLIENT_ID` is a 17-19 digit application ID, then inspect `discord-status-fusion.log`.

**Discord does not connect:** Ensure the Discord desktop app is running. The daemon retries connection with exponential backoff.

**The status says `Working on projects`:** Gemini is unavailable or its response failed validation. Confirm `GEMINI_API_KEY` is configured, then inspect `discord-status-fusion.log`.

**Gemini selected the wrong emphasis:** The model may choose only four detected apps. Successful decisions record the selected canonical apps in `discord-status-fusion.log`; displayed names still come only from the local catalog.

**An app is missing:** Check its exact process/display name and add a narrowly matched whitelist entry plus a regression test.

## Development

```bash
npm start               # Run in the foreground
npm start -- --verbose  # Include verbose state logs
npm run dev             # Restart on source changes
npm run lint            # Lint source and tests
npm test                # Run the node:test suite
npm run check           # Lint, test, and production dependency audit
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for module ownership, runtime and CLI flows, test boundaries, and extension rules.

## License

MIT License. See [LICENSE](LICENSE).
