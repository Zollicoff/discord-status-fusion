# AGENTS.md

Guidance for coding agents working in this repository.

## Project Overview

Discord Status Fusion is an AI-curated Discord Rich Presence daemon. It detects approved foreground applications and music locally, asks Gemini to choose the most relevant activity and context, validates the structured decision, and updates Discord only when source state changes or a refresh is due.

The LLM is an intentional part of the product, not an optional novelty to remove. Application and music detection remain the source of truth: Gemini may select canonical application IDs and write a generic summary, but code renders names and rejects ungrounded output. Rule-based formatting is the availability fallback.

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
- `src/core/api-key.js`: environment and macOS Keychain Gemini credential loading
- `src/core/gemini.js`: schema-constrained Gemini REST requests
- `src/core/status-decision.js`: trusted context, prompt/schema, and decision validation
- `src/core/status-generator.js`: AI decision caching, rendering, and fallback coordination
- `src/core/status.js`: rule-based fallback formatting and 128-character fitting
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
- Send Gemini only normalized approved app names and current music, never raw process paths.
- Gemini selects only structured application IDs. Code must render their canonical names.
- Reject unknown or duplicate IDs, application names in summaries, phantom music, URLs, multiline text, and malformed output.
- Cache valid decisions by normalized source snapshot; forced Discord refreshes must not cause duplicate LLM calls.
- Rule-based fallback details must be derived only from normalized detector output and fit complete names when possible.
- Never signal a PID from `dsf.pid` until its command contains this project's resolved `main.js` path as a complete argument.

## Configuration

Create `.env` from `.env.example`:

```dotenv
DISCORD_CLIENT_ID=your_discord_application_id_here
LLM_ENABLED=true
GEMINI_MODEL=gemini-2.5-flash-lite
# GEMINI_API_KEY=your-api-key
UPDATE_INTERVAL=10000
FORCE_UPDATE_INTERVAL=300000
LOG_LEVEL=info
```

`DISCORD_CLIENT_ID` is required and must be a 17-19 digit Discord application ID. `GEMINI_API_KEY` may come from the environment or `.env`; on macOS, `GEMINI_API_KEY` and the legacy `GOOGLE_AI_API_KEY` Keychain service names are supported. Missing credentials must degrade to fallback rather than stop the daemon.

## Platform Behavior

- macOS: foreground-capable apps through JXA `NSWorkspace`; Apple Music and Spotify through guarded AppleScript
- Windows: process names through non-interactive PowerShell; no music detection
- Linux: full command lines through `ps`; no music detection

## Requirements

- Node.js 22.13 or newer
- `discord-rpc` for Discord IPC
- `dotenv` for local configuration
- Native `fetch` for Gemini REST calls
- ESLint flat configuration in `eslint.config.js`

Run `npm run check` after behavioral changes. For detector changes, also run a live `getRunningProcesses()` and `getInterestingApps()` snapshot on the target platform.
