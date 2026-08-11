# Discord Status Fusion

<p align="center">
  <img src="src/images/status-fusion-icon.png" alt="Discord Status Fusion" width="128" height="128">
</p>

Discord Rich Presence that displays trusted local application and music activity. Status generation is deterministic: detected apps are normalized, deduplicated, and sent to Discord without an LLM or external API.

## Features

- Detects a curated set of development, productivity, creative, and browser apps
- Recognizes ChatGPT, legacy Codex, Ghostty, VS Code, Cursor, Notion, Safari, and many others
- Shows Apple Music or Spotify tracks on macOS without launching inactive players
- Updates only when local app/music state changes, with a configurable periodic refresh
- Deduplicates app names and fits complete names within Discord's 128-character limit
- Reconnects to Discord with bounded exponential backoff
- Provides verified daemon start, stop, restart, and status commands
- Makes no LLM or status-generation network calls

## Requirements

- Node.js 22.13 or newer
- Discord desktop app and account
- A Discord application ID

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

4. Install the CLI and start the daemon:

   ```bash
   npm install -g .
   dsf start
   ```

No Google or Gemini API key is required.

## How It Works

1. `src/runtime.js` validates configuration and wires the runtime dependencies.
2. `src/core/detector.js` enumerates apps, rejects helper processes, and maps approved names through `src/core/app-catalog.js`.
3. `src/core/music.js` checks already-running Apple Music and Spotify instances on macOS.
4. `src/app.js` compares source snapshots and asks `src/core/status.js` for a deterministic payload when state changes or a refresh is due.
5. `src/core/discord.js` owns Discord IPC, retry, reconnect, activity updates, and clean shutdown.

Example:

```text
Using ChatGPT + Ghostty + Notion + Safari
   -> Working on projects
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

# Optional, in milliseconds
UPDATE_INTERVAL=10000
FORCE_UPDATE_INTERVAL=300000

# error, warn, info, debug, or verbose
LOG_LEVEL=info
```

`UPDATE_INTERVAL` has a one-second minimum. `FORCE_UPDATE_INTERVAL` has a ten-second minimum.

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
| Background daemon CLI | Yes | Yes | Yes |

macOS is the primary tested platform. Windows and Linux app detection use process-list fallbacks and do not currently expose music state.

## Troubleshooting

**ChatGPT is missing:** Run `dsf restart` after updating. The current ChatGPT desktop process maps directly to `ChatGPT`; legacy `Codex` remains supported separately.

**The daemon exits during startup:** Confirm `DISCORD_CLIENT_ID` is a 17-19 digit application ID, then inspect `discord-status-fusion.log`.

**Discord does not connect:** Ensure the Discord desktop app is running. The daemon retries connection with exponential backoff.

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
