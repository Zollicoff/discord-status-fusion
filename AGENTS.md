# Repository Guidelines

## Project Structure & Module Organization
Core runtime orchestration lives in `main.js`, which wires the Discord RPC client, detector, and LLM formatter. Feature modules sit in `src/core`: `detector.js` maintains the professional app whitelist using `execFile` for secure process execution, `llm.js` handles Gemini API calls with improved keychain error handling, and `music.js` integrates Apple Music and Spotify (macOS only, with platform warnings). CLI assets reside in `bin/dsf`, test files in `src/core/__tests__`, and graphical assets live in `src/images`. Runtime artifacts (`.env`, `discord-status-fusion.log`, `dsf.pid`) stay in the repository root and should remain untracked.

## Build, Test, and Development Commands
- `npm install`: install runtime and dev dependencies.
- `npm run dev`: start `main.js` with nodemon for rapid iteration.
- `npm run start`: launch the Discord Rich Presence once.
- `npm run start:daemon`: background the service; check `discord-status-fusion.log`.
- `npm run stop:daemon`: stop the background daemon.
- `npm run lint` / `npm run lint:fix`: run ESLint, optionally autofixing.
- `npm test`: run all unit tests using Node.js built-in test runner.
- `npm run test:watch`: run tests in watch mode for development.
- After a global install (`npm install -g .`), use `dsf start|stop|status` for end-to-end validation.

## Coding Style & Naming Conventions
Target Node.js >=16 and CommonJS modules. Follow `.eslintrc.js`: two-space indentation, single quotes, semicolons, no dangling commas. Prefer `const`, avoid `var`, and use structured logging with prefixes like `[INFO]`, `[WARN]`, `[ERROR]`. Name modules with lowercase hyphenated filenames (e.g., `status-formatter.js`) and exported functions with active verbs (`formatPresence`, `detectApps`). Avoid emojis in code output and documentation.

## Testing Guidelines
The project uses Node.js built-in test runner (`node:test`). Tests are colocated in `src/core/__tests__` with `*.spec.js` filenames. When adding new features:
1. Add corresponding tests in the appropriate spec file
2. Run `npm test` to ensure all tests pass (currently 42 tests)
3. Run `npm run lint` before committing

Test coverage includes:
- `detector.spec.js`: Process detection, app filtering, path extraction
- `llm.spec.js`: Prompt building, response parsing, truncation, fallback status
- `music.spec.js`: Platform detection, music retrieval

## Commit & Pull Request Guidelines
Commit history favors short, imperative subjects (e.g., "Add CLI daemon support"), so keep lines under ~72 characters and reserve the body for rationale. Group related code into cohesive commits. Pull requests should outline user impact, list verification steps, and link issues. Attach screenshots or log excerpts when status formatting or detector behavior changes.

## Security & Configuration Tips
Never hardcode sensitive tokens; store the Google AI key in the system keychain and load it via the LLM client's secure keychain integration. Keep `.env` out of version control and document new configuration knobs in `README.md` and `.env.example`. The application validates `DISCORD_CLIENT_ID` format on startup and provides helpful error messages.

When adjusting detection patterns, double-check regex safety and platform portability before shipping. Use `execFile` instead of `exec` for shell commands to improve security.

## Configuration Options
The application supports these environment variables:
- `DISCORD_CLIENT_ID` (required): Your Discord Application ID (17-19 digits)
- `UPDATE_INTERVAL` (optional): Check interval in ms (default: 10000)
- `FORCE_UPDATE_INTERVAL` (optional): Force refresh interval in ms (default: 300000)
- `LOG_LEVEL` (optional): Logging verbosity (error, warn, info, debug, verbose)
