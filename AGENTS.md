# AGENTS.md

Guidance for coding agents working in this repository.

## Project overview

Discord Status Fusion is a local Discord Rich Presence daemon. It samples running apps, the focused app, idle time and music. It ranks apps by recent focus time and builds a presence from a deterministic category phrase plus canonical app names, then keeps Discord in sync over a built-in IPC client that reconnects forever. It has no runtime dependencies and makes no network calls other than to the local Discord client.

## Commands

```bash
npm start               # Run in the foreground
npm start -- --verbose  # Per-sample detail
npm run dev             # node --watch
npm run preview         # One-off detection preview (no Discord)
npm run lint            # ESLint
npm test                # node:test suite
npm run check           # Lint, test, production audit
node test/smoke.js      # Real detection on this machine (CI runs it per OS)

dsf start | stop | restart | status | preview | logs [n] | install | uninstall
npm install -g .        # Link the dsf CLI
```

## Architecture

- `main.js`: loads `.env` (project root or `DSF_ENV_FILE`) and calls `run()`
- `src/runtime.js`: config, instance lock, dependency wiring, signals, `--log-file`
- `src/app.js`: sampling loop, idle handling, elapsed-timer sessions
- `src/paths.js`: per-user state and log paths
- `src/preview.js`: single sample rendered for humans
- `src/core/app-catalog.js`: supported apps (`id`, `name`, `category`, `patterns`), with order as fallback priority
- `src/core/detector.js`: per-platform apps, focus and idle; returns catalog ids only
- `src/core/focus-tracker.js`: decayed focus scores, leader hysteresis
- `src/core/activity.js`: category and pair phrases, stable selection
- `src/core/presence.js`: Discord activity payloads and text fitting
- `src/core/music.js`: AppleScript (macOS) and playerctl (Linux) track detection
- `src/core/discord-ipc.js`: Discord RPC wire protocol
- `src/core/discord.js`: connection lifecycle, dedupe, resend, legacy fallback
- `src/cli/`: daemon control, login services, PID store, process verification
- `test/`: unit tests plus `helpers/fake-discord.js` (a real IPC server) and `smoke.js`

See `docs/ARCHITECTURE.md` for details.

## Invariants

- Displayed app names come only from catalog `name` fields. Raw process data never leaves `detector.js`.
- Add apps to `APP_CATALOG` with a unique id, a category that has phrases in `activity.js`, and narrow patterns. Generic executables such as `stable` must not match.
- Keep full fallback command paths until helper, framework, plug-in and widget filters have run.
- Music queries must check `application … is running` before sending player commands. Linux music uses an allow-list of players.
- Every Discord request has a timeout. `DiscordPresence` must keep retrying while the daemon runs and re-send the desired activity after reconnecting.
- Phrases must be deterministic for a given app set (no per-poll randomness).
- Never signal a PID unless its command contains this project's resolved `main.js` path as a complete argument.
- The runtime owns the instance lock and only removes a PID file that it owns.

## Configuration

See `.env.example`. `DISCORD_CLIENT_ID` is required (17–20 digits). Everything else is optional: `UPDATE_INTERVAL`, `IDLE_TIMEOUT`, `FOCUS_HALF_LIFE`, `MAX_APPS`, `SHOW_MUSIC`, `HIDE_APPS`, `STATUS_DISPLAY`, `LARGE_IMAGE`, `APP_ICON_URL`, `LOG_LEVEL`. Retired settings (`LLM_ENABLED`, `GEMINI_*`, `GOOGLE_AI_API_KEY`, `FORCE_UPDATE_INTERVAL`) produce a "no longer used" warning.

## Testing

Run `npm run check` after behavioral changes. For detector changes, also run `node test/smoke.js` or `dsf preview` on the target platform. CI runs tests and the smoke test on Ubuntu, macOS and Windows with Node 22 and 24.
