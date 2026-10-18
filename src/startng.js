// Talks to start.ng through its hidden connect page (see https://start.ng/docs.md):
// who's playing, sign-in, saving a run and reading the leaderboard.
// The connect page only answers games served from *.start.ng, so anywhere else
// (a local file, a dev server) the game runs as a guest without waiting.

const START_NG = 'https://start.ng';
export const ON_START_NG = location.hostname.endsWith('.start.ng');

let frame;

function connectFrame() {
  frame ??= new Promise((resolve, reject) => {
    const el = document.createElement('iframe');
    el.src = `${START_NG}/connect`;
    el.hidden = true;
    el.title = 'start.ng';
    el.onload = () => resolve(el);
    el.onerror = reject;
    document.body.append(el);
  });
  return frame;
}

/** Sends a message to start.ng and resolves to its reply, or null if it didn't answer. */
async function askStartNg(message, replyType, timeoutMs = 5000) {
  if (!ON_START_NG) return null;
  let el;
  try {
    el = await connectFrame();
  } catch {
    return null;
  }
  return new Promise((resolve) => {
    const requestId = Math.random().toString(36).slice(2);
    const done = (reply) => {
      clearTimeout(timer);
      removeEventListener('message', onMessage);
      resolve(reply);
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    function onMessage(e) {
      // Only trust replies from start.ng's own connect frame.
      if (e.origin !== START_NG || e.source !== el.contentWindow) return;
      if (e.data?.type === replyType && e.data.requestId === requestId) done(e.data);
    }
    addEventListener('message', onMessage);
    el.contentWindow.postMessage({ ...message, requestId }, START_NG);
  });
}

/**
 * Who's playing: { user, guest } from start.ng, where user is null for guests.
 * Returns null when start.ng can't be reached (e.g. not on *.start.ng).
 */
export async function whoAmI() {
  const reply = await askStartNg({ type: 'startng:whoami' }, 'startng:user');
  if (!reply) return null;
  return { user: reply.user ?? null, guest: reply.guest ?? null };
}

/** Send the player to start.ng to sign in; they come straight back here. */
export function signIn() {
  location.href = `${START_NG}/?return_to=${encodeURIComponent(location.origin + location.pathname)}`;
}

/** Save a run (signed-in players). Resolves to { ok, result | error } or null. */
export function saveRun(stats) {
  return askStartNg({ type: 'startng:score', stats }, 'startng:scoreSaved', 8000);
}

/** The top players. Resolves to an array of entries (empty if unavailable). */
export async function leaderboard(limit = 10) {
  const reply = await askStartNg({ type: 'startng:leaderboard', limit }, 'startng:leaderboardData', 8000);
  return reply?.ok && Array.isArray(reply.entries) ? reply.entries : [];
}

/** True when start.ng opened the game for a guest (`?guest`). */
export const OPENED_AS_GUEST = new URLSearchParams(location.search).has('guest');
