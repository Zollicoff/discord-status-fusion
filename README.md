# Discord Status Fusion

<p align="center">
  <img src="src/images/status-fusion-icon.png" alt="Discord Status Fusion" width="128" height="128">
</p>

Discord Status Fusion sets your Discord Rich Presence from what you're actually working on. It tracks which app has focus, keeps a running tally of focus time that fades over a few minutes, and shows your main apps with a short summary of the activity:

```text
Building with AI
Cursor + ChatGPT + Ghostty · ♪ Midnight City — M83
```

Everything runs locally. Nothing about your activity leaves your machine except the presence it sends to Discord, and there are no runtime dependencies.

## Features

- **Focus-ranked status.** Shows the apps you've been using lately, not every app that happens to be open. A brief switch to another app doesn't knock your main app off the top.
- **Activity summaries.** Each supported app has a category (code, AI, design, video, and so on), and the combination of your top apps picks a phrase like "Building with AI", "Designing and building" or "Producing video". The phrase doesn't change between polls.
- **Music.** Shows the current Apple Music or Spotify track on macOS, or any MPRIS player on Linux (via `playerctl`). With music but no apps, the status switches to a "Listening to" activity.
- **Idle detection.** App activity is hidden after 10 minutes without keyboard or mouse input, so you don't show as "Writing code" all night.
- **Reconnects to Discord.** Can start before Discord, keeps retrying if Discord isn't running, and restores your presence when Discord restarts.
- **Starts at login.** `dsf install` sets up a launchd agent (macOS), a systemd user service (Linux) or a Startup item (Windows).
- **Privacy controls.** Hide specific apps with `HIDE_APPS` and turn music off with `SHOW_MUSIC=false`. App names always come from a built-in catalog, never from raw process data.

## Requirements

- Node.js 22 or newer
- The Discord desktop app
- A Discord application ID (free; takes about a minute to create)

## Setup

1. **Install**

   ```bash
   git clone https://github.com/Zollicoff/discord-status-fusion.git
   cd discord-status-fusion
   npm install -g .
   ```

2. **Create a Discord application** in the [Developer Portal](https://discord.com/developers/applications). Its name is what Discord shows as "Playing …", so name it something like *Status Fusion* or *Working*. Copy the **Application ID**.

3. **Configure**

   ```bash
   cp .env.example .env
   ```

   Set `DISCORD_CLIENT_ID` in `.env`. No image uploads are needed; the project icon is loaded by URL.

4. **Check detection**

   ```bash
   dsf preview
   ```

   This prints the detected apps, the focused app, idle time, music, and exactly what Discord would show. It doesn't connect to Discord.

5. **Start it**

   ```bash
   dsf install   # start now and at every login (recommended)
   # or
   dsf start     # run in the background until you stop it
   ```

## CLI

```bash
dsf start       # Start the background daemon
dsf stop        # Stop it (clears your presence)
dsf restart     # Restart it
dsf status      # Is it running? Is the login service installed?
dsf preview     # Show what Discord would display right now
dsf logs [n]    # Print the last n log lines
dsf install     # Start automatically at login
dsf uninstall   # Remove the login service
```

Only one instance runs at a time. The PID file and logs live in your per-user state directory:

| | Logs | State |
|---|---|---|
| macOS | `~/Library/Logs/discord-status-fusion.log` | `~/Library/Application Support/discord-status-fusion/` |
| Linux | `$XDG_STATE_HOME/discord-status-fusion/` (default `~/.local/state/…`) | same |
| Windows | `%LOCALAPPDATA%\discord-status-fusion\` | same |

Logs rotate at 5 MB.

## Configuration

All settings are optional except `DISCORD_CLIENT_ID`. See [`.env.example`](.env.example) for the annotated template.

| Setting | Default | Description |
|---|---|---|
| `DISCORD_CLIENT_ID` | (required) | Your Discord application ID |
| `UPDATE_INTERVAL` | `10000` | Sampling interval in ms (minimum 1000) |
| `IDLE_TIMEOUT` | `600000` | Hide app activity after this many ms without input (`0` disables) |
| `FOCUS_HALF_LIFE` | `600000` | How quickly focus time fades, in ms. Lower values react faster |
| `MAX_APPS` | `3` | Apps shown on the status line (1–6) |
| `SHOW_MUSIC` | `true` | Include the current track |
| `HIDE_APPS` | (none) | Comma-separated app names or ids to never show |
| `STATUS_DISPLAY` | `details` | Member-list text: `details` (activity), `state` (apps), or `name` (application name) |
| `LARGE_IMAGE` | project icon | https URL or Discord asset key for the large image |
| `APP_ICON_URL` | (none) | Per-app icon URL template, for example `https://example.com/icons/{id}.png` |
| `LOG_LEVEL` | `info` | `error`, `warn`, `info`, `debug`, or `verbose` |

Settings are read from the environment first, then from `.env` in the project folder (or the file named by `DSF_ENV_FILE`).

## How it works

```text
every 10s:  detect apps + focused app + idle time ─┐
            detect current track ──────────────────┤
                                                   ▼
            focus tracker: add elapsed time to the focused app, decay all scores
                                                   ▼
            rank: top apps by recent focus (leader kept unless clearly overtaken)
                                                   ▼
            presence: category phrase + app list + track
                                                   ▼
            Discord IPC: send if changed, re-send after reconnect
```

| Platform | Apps | Focus | Idle | Music |
|---|---|---|---|---|
| macOS | `NSWorkspace` (no permissions needed) | yes | yes (`ioreg`) | Apple Music, Spotify |
| Windows | processes with windows | yes | yes | no |
| Linux | process list | X11 via `xprop` | X11 via `xprintidle` | MPRIS via `playerctl` |

When focus isn't available (for example on Wayland, or on Linux without `xprop`), the status falls back to open apps in catalog order. On macOS the first music query may ask for permission to control Music or Spotify. Players that aren't running are never launched.

## Supported apps

Over 100 apps across these categories:

- **AI:** ChatGPT, Claude, Codex, T3 Code
- **Code:** Cursor, VS Code, Windsurf, Zed, Xcode, Android Studio, Visual Studio, JetBrains IDEs, Sublime Text, Nova, Neovim, Vim, Emacs
- **Terminals:** Ghostty, Warp, iTerm, Terminal, kitty, Alacritty, WezTerm, Hyper, Windows Terminal
- **Design and photo:** Figma, Sketch, Adobe Illustrator, InDesign, Photoshop, Lightroom, Canva, Affinity
- **Video, audio, 3D:** Premiere Pro, After Effects, Final Cut Pro, DaVinci Resolve, Logic Pro, Ableton Live, Pro Tools, Blender, Cinema 4D, Maya
- **Writing and office:** Word, Pages, Notion, Obsidian, Logseq, Excel, Numbers, PowerPoint, Keynote, Outlook, Linear
- **Engineering:** TablePlus, DBeaver, DataGrip, Postman, Insomnia, Docker Desktop, AutoCAD, SolidWorks, Fusion 360, Unity, Unreal Engine, Godot, GitHub Desktop, GitKraken
- **Browsers:** Chrome, Safari, Firefox, Edge, Brave, Arc, Zen, Opera, Vivaldi

To add an app, add one line to [`src/core/app-catalog.js`](src/core/app-catalog.js) with an id, display name, category and a narrow name pattern, plus a test in `test/detector.spec.js`.

## Troubleshooting

**Nothing shows in Discord.** Run `dsf logs`. "Waiting for Discord" means the Discord desktop app isn't running, or is running in a sandbox Discord Status Fusion can't reach. Also check that *Settings → Activity Privacy → Share your activity status* is enabled in Discord.

**"Discord rejected DISCORD_CLIENT_ID".** Copy the *Application ID* (not the public key) from the Developer Portal.

**The wrong app is on top.** Focus time fades with a 10-minute half-life by default. Lower `FOCUS_HALF_LIFE` to react faster, and use `dsf preview` to see what's detected.

**An app is missing.** Run `dsf preview` while it's focused. If it isn't listed under running apps, add a catalog entry.

**Linux shows open apps instead of the focused one.** Install `xprop` (and `xprintidle` for idle detection) and run under X11 or XWayland. For the systemd service, make sure the user session has `DISPLAY` set: `systemctl --user import-environment DISPLAY`.

## Development

```bash
npm start               # Run in the foreground
npm start -- --verbose  # Include per-sample detail
npm run dev             # Restart on file changes
npm run preview         # One-off detection preview
npm test                # node:test suite (includes a fake Discord IPC server)
npm run check           # Lint, test, and production dependency audit
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the module map, invariants and test strategy.

## License

MIT License. See [LICENSE](LICENSE).
