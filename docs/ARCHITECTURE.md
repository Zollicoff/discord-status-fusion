# Architecture

Discord Status Fusion has two entry points: the foreground runtime and the daemon CLI. Both entry points are intentionally thin; behavior lives in modules that can be tested without Discord, process signals, or real timers.

## Runtime Flow

```text
main.js
  -> src/runtime.js
     -> src/app.js
        -> src/core/detector.js
        -> src/core/music.js
        -> src/core/status-generator.js
           -> src/core/gemini.js
           -> src/core/status-decision.js
           -> src/core/status.js
        -> src/core/discord.js
```

1. `main.js` loads `.env` and delegates to `run()`.
2. `src/runtime.js` validates configuration, creates dependencies, and registers shutdown handlers.
3. `src/app.js` samples app and music state, compares it with the last successful snapshot, and decides when to publish.
4. `src/core/status-generator.js` requests and validates an AI decision, renders canonical app names, and caches the result for unchanged source state.
5. `src/core/status.js` creates a rule-based activity whenever Gemini is disabled, unavailable, or rejected.
6. `src/core/discord.js` owns Discord IPC connection, retry, reconnect, activity, and shutdown behavior.

The application records a snapshot only after Discord accepts the activity. A failed update is retried on the next poll.

## Detection

`src/core/app-catalog.js` is the only source of approved app aliases and display priority. Every entry has a narrowly scoped pattern and a canonical `displayName`.

`src/core/detector.js` owns platform enumeration and normalization:

- macOS uses JXA and `NSWorkspace.runningApplications`, restricted to regular foreground-capable apps.
- Windows uses non-interactive PowerShell process names.
- Linux uses full `ps` command lines.
- Fallback command lines remain intact until helper, framework, plug-in, and widget paths are rejected.
- Approved apps are mapped through the catalog, deduplicated case-insensitively, and sorted by catalog priority.

`src/core/music.js` checks Apple Music and Spotify on macOS. Each AppleScript first verifies that the application is already running, so a status check never launches a player.

## AI Decision Boundary

`src/core/status-decision.js` converts normalized apps into stable IDs such as `app_1`. Gemini receives those IDs, canonical display names, and the current music description. It returns structured JSON containing an ordered ID selection, a short generic summary, and whether exact detected music should be shown.

The model never renders the details line. Local code resolves selected IDs back to canonical detector names and rejects:

- IDs absent from the current source snapshot
- duplicate IDs or too many selected apps
- application names, URLs, or line breaks in the generated summary
- music selection when no music was detected
- malformed JSON or incomplete API responses

`src/core/status-generator.js` caches the validated activity by normalized source snapshot. A forced Discord refresh reuses that decision. API-key absence, request failure, or rejected output uses `src/core/status.js` without interrupting the daemon.

`src/core/api-key.js` reads `GEMINI_API_KEY` or the legacy `GOOGLE_AI_API_KEY` from the environment. On macOS it can also read either service name from Keychain. Secrets are sent in the `x-goog-api-key` header and are never placed in request URLs or logs.

## Daemon CLI

```text
bin/dsf
  -> src/cli/index.js
     -> src/cli/daemon.js
        -> src/cli/pid-store.js
        -> src/cli/process-inspector.js
```

`src/cli/daemon.js` coordinates start, stop, restart, and status operations. PID file parsing and writing belong to `src/cli/pid-store.js`; process existence and command verification belong to `src/cli/process-inspector.js`.

Before sending a signal, the CLI verifies that the recorded PID is alive and that its command contains this repository's resolved `main.js` path as a complete argument. Stale or unrelated PID records are removed without signaling the process.

## Shared Utilities

- `src/config.js`: environment parsing, defaults, and validation
- `src/logger.js`: leveled output with injectable sinks
- `src/ui/spinner.js`: optional TTY progress display
- `src/cli/paths.js`: resolved runtime, PID, and log paths

## Testing

Tests live in `test/` and use Node's built-in `node:test` runner. External boundaries are injected: command execution, credential loading, Gemini requests, Discord clients, filesystem operations, process control, clocks, timers, waits, logging, and terminal output can all be replaced with test doubles.

Run the complete local gate with:

```bash
npm run check
```

Detector changes also require a live `getRunningProcesses()` and `getInterestingApps()` snapshot on the target platform.

## Extension Rules

To support another application:

1. Add a narrow alias with a canonical `displayName` to `src/core/app-catalog.js`.
2. Place it at the intended display priority.
3. Add positive and false-positive regression cases to `test/detector.spec.js`.
4. Run `npm run check` and a live detector snapshot.

Gemini may reason over normalized detector output, but it must never receive raw process data or directly render application names. Preserve structured IDs, validation, caching, and rule-based fallback when changing the AI layer.
