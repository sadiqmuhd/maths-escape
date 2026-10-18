# AGENTS.md

Instructions for coding agents working on Maths Escape. Read `README.md` first.

## What this is
A static three.js game published on start.ng (https://start.ng/docs.md). The player's start.ng character runs from Mama; answering maths questions changes the gap.

## Hard rules (from start.ng)
- **Static files only, no build step.** `index.html` at the repo root runs as-is. Never add a bundler or a step that must run before the game works.
- **Relative paths** for every file (`src/main.js`, `styles.css`), never `/src/...`.
- **No secrets, no passwords, no redirects.** start.ng handles sign-in; never add a password field or send players to another site on load.
- **Talk to start.ng only through `src/startng.js`**, and keep the `e.origin === 'https://start.ng'` and `e.source` checks.
- **The runner must be the player's start.ng character.** Draw every style field (see `normalizeStyle` in `src/character.js`); unknown values fall back to defaults. Guests use start.ng's guest look.
- Leaderboard stats sent with `startng:score` must match `startng.json` exactly: `score`, `correct`, `best_streak`, all whole numbers.
- Keep `cover.png` 16:10 and under 2 MB.

## Code rules
- Game rules live in `src/game.js` and questions in `src/maths.js`. Both are pure (no DOM, no three.js) so they stay unit-tested. Put new rules there, not in `main.js`.
- **Every change to `maths.js` or `game.js` needs tests in `test/`.** Run `npm test` and show the real output before calling a task done. Never weaken a test to make it pass.
- Answers are never negative and divisions are always exact. The tests enforce this.
- Check UI changes in a browser on both a phone-sized and a desktop-sized screen.
- Escape or use `textContent` for anything that comes from start.ng (names, accounts).

## Publishing
1. Push to the public GitHub repo.
2. `POST https://api.start.ng/games/check` with `{ "repo_url": "https://github.com/sadiqmuhd/maths-escape", "name": "maths-escape" }`. Fix every error.
3. `POST https://api.start.ng/games/publish` with the same body. The first time, the owner opens the `approve_url`. After that, start.ng updates the game on every push.
