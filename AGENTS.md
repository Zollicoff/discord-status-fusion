# Repository Guidelines

## Project Structure & Module Organization
Core runtime orchestration lives in `main.js`, which wires the Discord RPC client, detector, and LLM formatter. Feature modules sit in `src/core`: `detector.js` maintains the professional app whitelist, `llm.js` consumes Gemini prompts from `src/documents`, and `music.js` integrates Apple Music and Spotify. CLI assets reside in `bin/dsf`, and graphical assets live in `src/images`. Runtime artifacts (`.env`, `discord-status-fusion.log`, `dsf.pid`) stay in the repository root and should remain untracked.

## Build, Test, and Development Commands
- `npm install`: install runtime and dev dependencies.
- `npm run dev`: start `main.js` with nodemon for rapid iteration.
- `npm run start`: launch the Discord Rich Presence once.
- `npm run start:daemon`: background the service; check `discord-status-fusion.log`.
- `npm run stop:daemon`: stop the background daemon.
- `npm run lint` / `npm run lint:fix`: run ESLint, optionally autofixing.
- After a global install (`npm install -g .`), use `dsf start|stop|status` for end-to-end validation.

## Coding Style & Naming Conventions
Target Node.js ≥16 and CommonJS modules. Follow `.eslintrc.js`: two-space indentation, single quotes, semicolons, no dangling commas. Prefer `const`, avoid `var`, and use `console` only for structured logging. Name modules with lowercase hyphenated filenames (e.g., `status-formatter.js`) and exported functions with active verbs (`formatPresence`, `detectApps`).

## Testing Guidelines
No automated suite exists yet; contributions should include smoke instructions or new specs. Prefer `node:test` or Jest unit tests colocated in `src/core/__tests__` with `*.spec.js` filenames, and add an `npm test` script when the first suite lands. Before opening a PR, run `npm run lint`, exercise `npm run dev` or `dsf start`, and confirm Discord Rich Presence updates cleanly while logs stay error-free.

## Commit & Pull Request Guidelines
Commit history favors short, imperative subjects (e.g., "Add CLI daemon support"), so keep lines under ~72 characters and reserve the body for rationale. Group related code into cohesive commits. Pull requests should outline user impact, list verification steps, and link issues. Attach screenshots or log excerpts when status formatting or detector behavior changes.

## Security & Configuration Tips
Never hardcode sensitive tokens; store the Google AI key in the system keychain and load it via `dotenv`. Keep `.env` out of version control and document new configuration knobs in `README.md` and `src/documents`. When adjusting detection patterns, double-check regex safety and platform portability before shipping.
