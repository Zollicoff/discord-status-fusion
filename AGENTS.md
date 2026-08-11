# AGENTS.md

Guidance for coding agents working in this repository.

## Project Overview

Discord Status Fusion is a local-first Discord Rich Presence daemon. It detects approved foreground applications and music, builds a deterministic activity payload, and updates Discord only when the source state changes or a refresh is due.

The runtime does not call an LLM or require an AI API key. Application and music detection are the source of truth; status formatting must never invent or rename detected apps.

## Commands

```bash
npm start               # Run in the foreground
npm start -- --verbose  # Run with verbose state logs
dsf start               # Start the background daemon
dsf stop                # Stop the daemon
dsf restart             # Restart the daemon
dsf status              # Check daemon state

npm run dev             # Run with nodemon
npm run lint            # Run ESLint
npm test                # Run node:test suite
npm run check           # Lint, test, and production dependency audit
npm install -g .        # Refresh the global dsf CLI link
```

## Architecture

- `main.js`: `.env` bootstrap and runtime entry point only
- `src/runtime.js`: configuration, dependency wiring, process signals, and startup failures
- `src/app.js`: source snapshots, change detection, refresh scheduling, and shutdown coordination
- `src/core/app-catalog.js`: approved app aliases, canonical names, and display priority
- `src/core/detector.js`: platform app enumeration, helper rejection, catalog lookup, and deduplication
- `src/core/music.js`: non-launching Apple Music and Spotify queries on macOS
- `src/core/status.js`: deterministic Discord payload formatting and 128-character fitting
- `src/core/discord.js`: Discord IPC, retry, reconnect, activity, and shutdown
- `src/cli/`: daemon lifecycle, PID storage, process verification, paths, and command routing
- `test/`: unit and regression tests using `node:test`

See `docs/ARCHITECTURE.md` for the complete module map and extension workflow.

## Invariants

- Add app aliases to `APP_CATALOG` with a canonical `displayName`.
- Catalog order is display priority. Keep ChatGPT and development tools near the top.
- Preserve full fallback command paths until helper, framework, plug-in, and widget filters run.
- Generic executable names such as `stable` must not be inferred as branded apps.
- Music queries must check `application ... is running` before sending player commands.
- Status details must be derived only from normalized detector output and must fit complete names when possible.
- Never signal a PID from `dsf.pid` until its command contains this project's resolved `main.js` path as a complete argument.

## Configuration

Create `.env` from `.env.example`:

```dotenv
DISCORD_CLIENT_ID=your_discord_application_id_here
UPDATE_INTERVAL=10000
FORCE_UPDATE_INTERVAL=300000
LOG_LEVEL=info
```

`DISCORD_CLIENT_ID` is required and must be a 17-19 digit Discord application ID.

## Platform Behavior

- macOS: foreground-capable apps through JXA `NSWorkspace`; Apple Music and Spotify through guarded AppleScript
- Windows: process names through non-interactive PowerShell; no music detection
- Linux: full command lines through `ps`; no music detection

## Requirements

- Node.js 22.13 or newer
- `discord-rpc` for Discord IPC
- `dotenv` for local configuration
- ESLint flat configuration in `eslint.config.js`

Run `npm run check` after behavioral changes. For detector changes, also run a live `getRunningProcesses()` and `getInterestingApps()` snapshot on the target platform.
