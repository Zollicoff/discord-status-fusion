# Architecture

Discord Status Fusion has two entry points, the foreground runtime (`main.js`) and the CLI (`bin/dsf`). Both are thin. Behavior lives in modules whose external boundaries (commands, sockets, filesystem, clocks, timers, process control and logging) are injected, so they can be tested without Discord or a particular OS.

## Runtime flow

```text
main.js                      loads .env, calls run()
  -> src/runtime.js          config, instance lock, wiring, signals
     -> src/app.js           sampling loop
        -> core/detector.js      running apps, focused app, idle time  (catalog ids only)
        -> core/music.js         current track
        -> core/focus-tracker.js decayed focus scores and ranking
        -> core/presence.js      activity payload
           -> core/activity.js   category phrase
        -> core/discord.js       connection lifecycle, dedupe, resend
           -> core/discord-ipc.js  Discord RPC wire protocol
```

Each tick (`StatusFusionApp.tick`):

1. `AppDetector.sample()` returns `{ running, focused, focusSupported, idleSeconds }`, where `running` and `focused` are catalog ids. Raw process names, paths and command lines never leave the detector.
2. `FocusTracker.record()` decays every score by `0.5^(elapsed / halfLife)` and adds the elapsed time (capped at 60 s per step) to the focused app. Apps that quit are dropped. Nothing is credited while the user has been idle for 5 minutes or more.
3. `FocusTracker.rank()` orders apps by score. The current leader stays first until a challenger exceeds it by 25%, and apps under 10% of the leader's score are dropped. Without focus support it falls back to catalog order.
4. When idle time passes `IDLE_TIMEOUT`, apps are hidden and only music is shown, if any.
5. The elapsed timer restarts when the leading app (or the track, in music-only mode) changes.
6. `PresenceBuilder.build()` returns a Discord activity, or `null` to clear the presence.
7. `DiscordPresence.setActivity()` stores it as the desired state and sends it if it differs from what Discord last accepted.

## Detection

`src/core/app-catalog.js` is the only list of supported apps. Each entry has a stable `id`, a canonical `name`, a `category`, and narrowly scoped `patterns`. Catalog order is the fallback priority.

| Platform | Running apps | Focus | Idle |
|---|---|---|---|
| macOS | JXA `NSWorkspace.runningApplications` (regular apps) | `frontmostApplication` | `ioreg` `HIDIdleTime` |
| Windows | `Get-Process` with a main window | `GetForegroundWindow` | `GetLastInputInfo` |
| Linux | `ps -eo pid=,command=` | `xprop` `_NET_ACTIVE_WINDOW` → `_NET_WM_PID` | `xprintidle` |

- The Windows script runs through `-EncodedCommand`, so no quoting is involved. It prints `S:native` only if the Win32 types loaded. Without that line, focus is reported as unsupported.
- If the macOS JXA query fails, detection falls back to `ps` with focus unsupported, and warns once.
- Optional helpers that aren't installed (`ENOENT`) are remembered and never called again.
- Helper, XPC, plug-in, widget and framework processes are rejected before matching. Bundle paths resolve to the outermost `.app`.

`src/core/music.js` uses guarded AppleScript on macOS (`if application … is running`), so players are never launched. On Linux it uses `playerctl` for an allow-list of music players (browsers are excluded).

## Presence

`src/core/activity.js` maps the leading app's category to a phrase. The first supporting app (in focus order) with a known pairing refines it, for example `code+ai` → "Building with AI". Where a pairing or category has several phrasings, an FNV-1a hash of the sorted app ids picks one, so the text is stable for a given set of apps.

`src/core/presence.js` builds the wire-format payload:

- With apps: type Playing, `details` = phrase, `state` = app names (complete names, with "+ N more" when they don't fit) plus `· ♪ track` if a track is playing and there's room.
- Music only: type Listening, `details` = title, `state` = "by artist".
- Neither: `null`, which clears the presence.

Text fields are trimmed to 128 characters (counting Unicode characters) and padded to Discord's 2-character minimum. `status_display_type` controls what the member list shows. The large image defaults to the project icon by URL, so no asset uploads are needed.

## Discord connection

`src/core/discord-ipc.js` implements the local RPC protocol: frames of `int32 opcode` + `int32 length` + JSON. A HANDSHAKE is followed by the READY dispatch, then `SET_ACTIVITY` frames correlated by nonce. PINGs are answered with PONGs. Every request has a timeout, and closing rejects any pending requests.

`src/core/discord.js` (`DiscordPresence`) owns the connection lifecycle:

- Connects in the background and retries forever with backoff from 2 s up to 60 s. Startup never blocks on Discord.
- Logs the first failure at `info` and later failures at `debug`. A rejected client id is logged once as an error.
- Remembers the desired activity and re-sends it after every reconnect. Identical payloads are skipped.
- An unanswered request destroys the socket, which triggers a reconnect, so a hung Discord can't stall the loop.
- If Discord rejects the newer `type` or `status_display_type` fields, it switches permanently to the classic payload.
- On stop, clears the activity (1 s budget) and closes the socket.

## CLI and services

```text
bin/dsf -> src/cli/index.js
             -> cli/daemon.js            start/stop/restart/status (detached child)
             -> cli/service.js           launchd / systemd --user / Startup .vbs
             -> src/preview.js           one-off sample, no Discord
             -> cli/pid-store.js, cli/process-inspector.js
```

- `src/paths.js` resolves per-user state and log paths (`DSF_STATE_DIR` overrides).
- The runtime itself takes the instance lock: it writes the PID file unless another verified instance owns it, and removes it on shutdown only if it still owns it. If another instance is already running it exits with code 0, so service managers don't restart-loop.
- The CLI signals a PID only after confirming its command line contains this project's `main.js` as a complete argument.
- The launchd agent uses `KeepAlive.SuccessfulExit=false` and the systemd unit uses `Restart=on-failure`, so `dsf stop` (a clean exit) stays stopped while crashes are restarted.
- Logs rotate at 5 MB by copy-then-truncate, which is safe while a service manager holds the file open.

## Invariants

- App names shown in Discord come only from catalog `name` fields.
- Raw process data never leaves `detector.js`.
- The catalog is the single source of supported apps. Patterns must be narrow (generic executables such as `stable` must not match).
- Music queries must check that the player is running before sending it commands.
- Every Discord request has a timeout, and the connection manager never gives up reconnecting while the daemon runs.
- Never signal a PID whose command doesn't contain this project's `main.js`.

## Testing

`npm test` runs the `node:test` suite. `test/helpers/fake-discord.js` is a working Discord IPC server (Unix socket, or named pipe on Windows) used to test the protocol, reconnection, dedupe, fallbacks and shutdown end to end.

`test/smoke.js` runs real detection on the host. CI runs it on Ubuntu, macOS and Windows to check the JXA, AppleScript, `ioreg` and PowerShell paths on real systems.

## Adding an app

1. Add an entry to `src/core/app-catalog.js` with a unique id, canonical name, category and narrow pattern(s).
2. If you add a new category, give it phrases in `src/core/activity.js` (a test enforces this).
3. Add positive and false-positive cases to `test/detector.spec.js`.
4. Run `npm run check`, then `dsf preview` with the app focused.
