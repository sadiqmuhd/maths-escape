// Maths Escape: wires the game rules (game.js), the 3D street (world.js),
// the player's start.ng character (character.js), Mama (mama.js), sounds and
// the start.ng connection together.
import * as THREE from 'three';

import { sound } from './audio.js';
import { buildCharacter, DEFAULT_STYLE, normalizeStyle } from './character.js';
import { answer, newGame, RULES, statsFor, tick } from './game.js';
import { buildMama, throwSlipper } from './mama.js';
import { leaderboard, ON_START_NG, OPENED_AS_GUEST, saveRun, signIn, whoAmI } from './startng.js';
import { buildWorld } from './world.js';

const $ = (id) => document.getElementById(id);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------------------ scene */

const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 120);
const world = buildWorld(scene);

const RUN_SPEED = 6.5; // metres a second the street scrolls at normal pace
const FACING_X = Math.PI / 2; // characters are built facing +z; the chase runs along +x

let player = null;
let playerStyleKey = '';
function setPlayerStyle(style) {
  const s = normalizeStyle(style);
  const key = JSON.stringify(s);
  if (key === playerStyleKey) return;
  playerStyleKey = key;
  const mode = player?.mode ?? 'idle';
  if (player) {
    scene.remove(player.root);
    player.dispose();
  }
  player = buildCharacter(s);
  player.root.rotation.y = FACING_X;
  player.setMode(mode);
  scene.add(player.root);
}
setPlayerStyle(DEFAULT_STYLE);

const mama = buildMama();
mama.root.rotation.y = FACING_X;
mama.root.position.x = -16;
mama.setMode('idle');
scene.add(mama.root);

/* ---------------------------------------------------------- start.ng player */

const me = { user: null, name: 'Guest', account: null, face: null };

function renderCard() {
  $('player-name').textContent = me.name;
  $('player-account').textContent = me.user ? `@${me.account}` : ON_START_NG ? 'Not signed in' : 'Playing offline';
  $('face').hidden = !me.face;
  if (me.face) $('face').src = me.face;
  $('face-fallback').hidden = Boolean(me.face);
  $('face-fallback').textContent = (me.name[0] ?? '?').toUpperCase();
  const canSignIn = ON_START_NG && !me.user;
  $('sign-in').hidden = !canSignIn || state === 'playing';
  $('menu-guest').hidden = !canSignIn || OPENED_AS_GUEST;
}

let asking = null;
async function refreshPlayer() {
  asking ??= whoAmI().finally(() => (asking = null));
  const who = await asking;
  if (who) {
    const p = who.user ?? who.guest;
    me.user = who.user;
    me.name = p?.name || 'Guest';
    me.account = who.user?.account ?? null;
    me.face = p?.face ?? null;
    // Don't swap the character mid-run; it'll update on the next menu.
    if (p?.style && state !== 'playing' && state !== 'countdown') setPlayerStyle(p.style);
  }
  renderCard();
}

/* ----------------------------------------------------------- game state */

// menu → countdown → playing (⇄ paused) → caught → over → countdown …
let state = 'menu';
let game = null;
let paused = false;
let displayGap = RULES.startGap;
let burst = 0; // extra speed after a fast answer, fades out
let stumble = 0; // seconds of stumbling left
let shake = 0;
let slipper = null;
let nextThrow = 0;
let nextShout = 0;
let caughtAt = 0;
let clock = 0;
let answerLock = 0;

const LEVEL_NAMES = ['', 'Warm-up: + and −', 'Bigger numbers', 'Times tables!', 'Tables & division', 'Everything mixed!'];
const SHOUTS = ['Come back here!', 'Where is your homework?!', 'You think you can run?', 'Ehen! I’m coming!', 'Maths is not hard!', 'Wait for me there!', 'I will catch you!'];

function show(id, visible) {
  $(id).hidden = !visible;
}

function startCountdown() {
  sound.unlock();
  game = newGame();
  displayGap = game.gap;
  burst = stumble = shake = 0;
  nextThrow = 0;
  nextShout = 2;
  state = 'countdown';
  show('menu', false);
  show('over', false);
  show('sign-in', false);
  show('countdown', true);
  player.setMode('idle');
  mama.setMode('chase');
  mama.setHolding(true);
  renderHud();
  let n = 3;
  const step = () => {
    if (state !== 'countdown') return;
    const el = $('count');
    el.textContent = n > 0 ? n : 'RUN!';
    el.classList.remove('tick');
    void el.offsetWidth;
    el.classList.add('tick');
    sound.count(n === 0);
    if (n === 0) {
      setTimeout(beginRun, 450);
      return;
    }
    n -= 1;
    setTimeout(step, 700);
  };
  step();
}

function beginRun() {
  if (state !== 'countdown') return;
  show('countdown', false);
  show('hud', true);
  show('pause-btn', true);
  state = 'playing';
  player.setMode('run');
  game.askedAt = game.elapsed;
  renderQuestion();
}

function renderQuestion() {
  const q = game.question;
  const el = $('question');
  el.textContent = `${q.text} = ?`;
  el.classList.remove('pop');
  void el.offsetWidth;
  el.classList.add('pop');
  document.querySelectorAll('.answer').forEach((btn, i) => {
    btn.querySelector('span').textContent = q.choices[i];
    btn.setAttribute('aria-label', `Answer ${i + 1}: ${q.choices[i]}`);
    btn.classList.remove('right', 'wrong');
  });
}

function renderHud() {
  if (!game) return;
  $('level').textContent = `Level ${game.level}`;
  $('streak').textContent = `🔥 ${game.streak}`;
  $('streak').classList.toggle('hot', game.streak >= RULES.streakEvery);
  $('score').textContent = `${game.score} pts`;
}

function flash(text, good) {
  const el = $('feedback');
  el.textContent = text;
  el.className = `feedback ${good ? 'good' : 'bad'}`;
  void el.offsetWidth;
  el.classList.add('show');
}

function banner(text) {
  const el = $('banner');
  el.textContent = text;
  el.className = 'banner';
  void el.offsetWidth;
  el.classList.add('show');
}

function choose(index) {
  // Real time, not the render clock: taps must work even if frames stall.
  const now = performance.now();
  if (state !== 'playing' || paused || now < answerLock) return;
  answerLock = now + 120; // ignore an accidental double tap
  const btn = document.querySelectorAll('.answer')[index];
  const value = game.question.choices[index];
  const r = answer(game, value);
  if (!r) return;
  btn.classList.add(r.correct ? 'right' : 'wrong');
  setTimeout(() => btn.classList.remove('right', 'wrong'), 180);

  if (r.correct) {
    burst = r.fast ? 1 : 0.45;
    if (r.fast) sound.fast();
    else sound.correct();
    const bonus = r.streakBonus ? '  🔥 Streak!' : '';
    const gained = r.gapChange >= 0.5 ? `+${r.gapChange.toFixed(0)} m` : 'Max lead!';
    flash(`${gained}${r.fast ? ' ⚡ Fast!' : ' ✓'}${bonus}`, true);
    if (r.levelUp) {
      sound.levelUp();
      banner(`Level ${game.level}: ${LEVEL_NAMES[Math.min(5, game.level)]}`);
    }
  } else {
    stumble = 0.6;
    shake = 0.35;
    player.setMode('stumble');
    sound.wrong();
    flash(`−3 m  ✗  It was ${r.answer}`, false);
    if (!r.caught) say('Wrong!! 😤', 1.2);
  }
  renderHud();
  if (game.over) caught();
  else renderQuestion();
}

function caught() {
  state = 'caught';
  caughtAt = clock;
  show('pause-btn', false);
  show('hud', false);
  player.setMode('caught');
  mama.setMode('cheer');
  sound.caught();
  shake = 0.5;
  say('I caught you! 🩴', 2.2);
  setTimeout(showOver, 1700);
}

function formatTime(seconds) {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

let personalBest = 0;
try {
  personalBest = Number(localStorage.getItem('maths-escape.best')) || 0;
} catch {
  /* storage blocked */
}

async function showOver() {
  state = 'over';
  const stats = statsFor(game);
  $('o-score').textContent = stats.score;
  $('o-correct').textContent = stats.correct;
  $('o-streak').textContent = stats.best_streak;
  $('o-time').textContent = formatTime(game.elapsed);
  show('over', true);
  $('again').focus({ preventScroll: true });
  renderCard();

  const save = $('save-msg');
  save.className = 'save';
  const newBest = stats.score > personalBest;
  if (newBest) {
    personalBest = stats.score;
    try {
      localStorage.setItem('maths-escape.best', String(stats.score));
    } catch {
      /* storage blocked */
    }
  }
  show('over-sign-in', ON_START_NG && !me.user);

  if (me.user) {
    save.textContent = 'Saving your run to start.ng…';
    const reply = await saveRun(stats);
    if (state !== 'over') return;
    if (reply?.ok) {
      const { improved, rank } = reply.result;
      save.textContent = improved ? `🏆 New best! You’re #${rank} on the leaderboard` : `Your best run is still faster. You’re #${rank}`;
      save.classList.toggle('good', improved);
    } else {
      save.textContent = reply?.error || 'Couldn’t save your run this time.';
    }
  } else {
    save.textContent = newBest && stats.score > 0 ? `🏆 New personal best on this device!` : `Your best here: ${personalBest} pts`;
    if (ON_START_NG) save.textContent += ' · Sign in to join the leaderboard';
  }
  loadBoard('over-board', 'over-lb', 10);
}

async function loadBoard(listId, boxId, limit) {
  const entries = await leaderboard(limit);
  const list = $(listId);
  if (!ON_START_NG) {
    show(boxId, false);
    return;
  }
  show(boxId, true);
  if (!entries.length) {
    list.innerHTML = '<li class="empty">No runs yet. Be the first!</li>';
    return;
  }
  list.replaceChildren(
    ...entries.map((e) => {
      const li = document.createElement('li');
      if (me.user && e.player_id === me.user.id) li.className = 'me';
      const rank = document.createElement('span');
      rank.className = 'rank';
      rank.textContent = `#${e.rank}`;
      const name = document.createElement('span');
      const dot = document.createElement('i');
      dot.className = 'dot';
      dot.style.background = /^#[0-9a-f]{6}$/i.test(e.color ?? '') ? e.color : '#ccc';
      name.append(dot, document.createTextNode(e.name ?? 'Player'));
      const sub = document.createElement('span');
      sub.className = 'sub';
      sub.textContent = `${e.stats?.correct ?? 0} ✓ · 🔥${e.stats?.best_streak ?? 0}`;
      const pts = document.createElement('span');
      pts.className = 'pts';
      pts.textContent = e.stats?.score ?? e.score ?? 0;
      li.append(rank, name, sub, pts);
      return li;
    })
  );
}

function backToMenu() {
  state = 'menu';
  player.setMode('idle');
  mama.setMode('idle');
  show('over', false);
  show('menu', true);
  renderCard();
  loadBoard('menu-board', 'menu-lb', 5);
}

function setPaused(value) {
  if (state !== 'playing' || paused === value) return;
  paused = value;
  show('paused', paused);
  if (paused) $('resume').focus({ preventScroll: true });
}

/* ----------------------------------------------------- Mama's speech bubble */

let bubbleUntil = 0;
const bubbleAnchor = new THREE.Vector3();
function say(text, seconds = 2) {
  $('bubble').textContent = text;
  bubbleUntil = clock + seconds;
}
function placeBubble() {
  const el = $('bubble');
  if (clock > bubbleUntil || (state !== 'playing' && state !== 'caught')) {
    el.hidden = true;
    return;
  }
  mama.head.getWorldPosition(bubbleAnchor);
  bubbleAnchor.y += 0.45;
  bubbleAnchor.project(camera);
  if (bubbleAnchor.z > 1) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.style.left = `${(bubbleAnchor.x * 0.5 + 0.5) * innerWidth}px`;
  el.style.top = `${(-bubbleAnchor.y * 0.5 + 0.5) * innerHeight}px`;
}

/* ------------------------------------------------------------------ camera */

const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();
const wantPos = new THREE.Vector3();
const wantLook = new THREE.Vector3();
let portrait = false;

// Camera framings: [position xyz, look-at xyz], for wide and tall screens.
const CAM = {
  menu: { wide: [[2.9, 1.5, 2.4], [-1.2, 1.05, 0.9]], tall: [[2.9, 1.5, 1.6], [-0.2, 1.15, 0]] },
  play: { wide: [[5.6, 2.45, 3.1], [-4.5, 1.55, 0]], tall: [[5.2, 3.4, 2.2], [-4.5, 0.7, 0]] },
  over: { wide: [[2.6, 2.4, 3.4], [-0.6, 0.4, 0]], tall: [[1.0, 3.7, 5.8], [0.15, 0.1, 0]] },
};

function cameraTarget() {
  // menu: close on the player's face, Mama small in the distance;
  // play: in front of the runner, looking back down the street at Mama;
  // over: both of them, above the results panel.
  const shot = state === 'menu' ? CAM.menu : state === 'over' || state === 'caught' ? CAM.over : CAM.play;
  const [pos, look] = shot[portrait ? 'tall' : 'wide'];
  wantPos.set(...pos);
  wantLook.set(...look);
}

function resize() {
  const w = innerWidth;
  const h = innerHeight;
  portrait = h > w * 1.05;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = portrait ? 62 : 45;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();
cameraTarget();
camPos.copy(wantPos);
camLook.copy(wantLook);

/* ---------------------------------------------------------------- the loop */

const handPos = new THREE.Vector3();
const lastTime = { t: performance.now() };

function frame(now) {
  const dt = Math.min(0.05, (now - lastTime.t) / 1000);
  lastTime.t = now;
  clock += dt;
  const running = state === 'playing' && !paused;

  if (running && tick(game, dt)) caught();

  // how fast the street goes by: faster after good answers, slow while stumbling
  burst = Math.max(0, burst - dt * 0.9);
  stumble = Math.max(0, stumble - dt);
  let speed = 0;
  if (running) speed = RUN_SPEED * (1 + burst * 0.6) * (stumble > 0 ? 0.45 : 1);
  if (state === 'countdown') speed = 0;
  world.update(speed * dt);
  player.setSpeed(Math.max(0.8, speed / RUN_SPEED));
  mama.setSpeed(1.15 + Math.max(0, (6 - displayGap) / 6) * 0.4);

  // Mama's position follows the gap, smoothed
  if (game) {
    const target = state === 'caught' || state === 'over' ? 0 : game.gap;
    displayGap += (target - displayGap) * Math.min(1, dt * (state === 'caught' ? 10 : 5));
  }
  mama.root.position.x = state === 'menu' ? -16 : -(displayGap + 0.75);
  if (state === 'caught' || state === 'over') mama.root.position.x = Math.max(mama.root.position.x, -1.1);

  // close calls: shouting, slipper throws, red glow
  if (running) {
    const danger = Math.max(0, Math.min(1, (6 - game.gap) / 5));
    $('vignette').style.opacity = String(danger * (0.55 + Math.sin(clock * 8) * 0.25 * danger));
    if (game.gap < 7 && clock > nextShout) {
      say(SHOUTS[Math.floor(Math.random() * SHOUTS.length)], 2.2);
      nextShout = clock + 3.5 + Math.random() * 2;
    }
    if (game.gap < 4.5 && !slipper && clock > nextThrow) {
      mama.hands[1].getWorldPosition(handPos);
      const land = new THREE.Vector3(-0.8 - Math.random() * 0.6, 0.06, (Math.random() - 0.5) * 0.9);
      slipper = throwSlipper(scene, handPos, land);
      mama.setHolding(false);
      sound.whoosh();
      nextThrow = clock + 2.4 + Math.random() * 1.5;
    }
    // the fast-answer timer bar
    const t = game.elapsed - game.askedAt;
    const fill = $('timer-fill');
    fill.style.width = `${Math.max(0, 1 - t / RULES.fastSeconds) * 100}%`;
    fill.classList.toggle('slow', t > RULES.fastSeconds);
    renderGap();
  } else if (state !== 'caught') {
    $('vignette').style.opacity = '0';
  }
  if (slipper && !slipper.update(dt)) {
    slipper = null;
    mama.setHolding(true);
  }

  player.update(dt);
  mama.update(dt);
  if (state === 'menu' && player.mode === 'idle' && Math.sin(clock * 0.5) > 0.995) player.setMode('cheer');
  if (state === 'menu' && player.mode === 'cheer' && Math.sin(clock * 0.5) < 0.9) player.setMode('idle');

  // camera: ease toward its target, plus a little shake
  cameraTarget();
  const ease = Math.min(1, dt * 2.5);
  camPos.lerp(wantPos, ease);
  camLook.lerp(wantLook, ease);
  shake = Math.max(0, shake - dt);
  camera.position.copy(camPos);
  if (shake > 0 && !reducedMotion) {
    camera.position.x += (Math.random() - 0.5) * shake * 0.35;
    camera.position.y += (Math.random() - 0.5) * shake * 0.35;
  }
  camera.lookAt(camLook);

  placeBubble();
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(frame);

function renderGap() {
  const k = game.gap / RULES.maxGap;
  $('gap-fill').style.width = `${k * 100}%`;
  $('gap-runner').style.left = `${k * 100}%`;
  $('gap-fill').style.background = game.gap > 8 ? 'var(--green)' : game.gap > 4 ? 'var(--yellow)' : 'var(--red)';
  $('gap-m').textContent = `${game.gap.toFixed(1)} m`;
}

/* ------------------------------------------------------------------ input */

document.querySelectorAll('.answer').forEach((btn) => {
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    choose(Number(btn.dataset.i));
  });
  // keyboard/screen-reader activation (Enter/Space on a focused button)
  btn.addEventListener('click', (e) => {
    if (e.detail === 0) choose(Number(btn.dataset.i));
  });
});

addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const n = '1234'.indexOf(e.key);
  if (n >= 0 && state === 'playing' && !paused) {
    const btn = document.querySelectorAll('.answer')[n];
    btn.classList.add('pressed');
    setTimeout(() => btn.classList.remove('pressed'), 90);
    choose(n);
    return;
  }
  if (e.key === 'Enter' || e.key === ' ') {
    if (state === 'menu' || state === 'over') {
      e.preventDefault();
      startCountdown();
    } else if (paused) {
      e.preventDefault();
      setPaused(false);
    }
  }
  if ((e.key === 'Escape' || e.key === 'p' || e.key === 'P') && state === 'playing') setPaused(!paused);
});

$('play').addEventListener('click', startCountdown);
$('again').addEventListener('click', startCountdown);
$('resume').addEventListener('click', () => setPaused(false));
$('pause-btn').addEventListener('click', () => setPaused(true));
for (const id of ['sign-in', 'menu-sign-in', 'over-sign-in']) $(id).addEventListener('click', signIn);

function renderMute() {
  $('mute').textContent = sound.muted ? '🔇' : '🔊';
  $('mute').setAttribute('aria-label', sound.muted ? 'Sound off' : 'Sound on');
}
$('mute').addEventListener('click', () => {
  sound.setMuted(!sound.muted);
  renderMute();
  if (!sound.muted) sound.correct();
});
renderMute();

// Pause when the player leaves the tab; ask start.ng again when they come back
// (they may have signed in or out on start.ng meanwhile).
document.addEventListener('visibilitychange', () => {
  if (document.hidden) setPaused(true);
  else refreshPlayer();
});
addEventListener('focus', () => refreshPlayer());

/* ------------------------------------------------------------------ start */

renderCard();
refreshPlayer().then(() => loadBoard('menu-board', 'menu-lb', 5));
$('play').focus({ preventScroll: true });

// For debugging in the console. step(seconds) runs the game loop by hand,
// which also lets automated tests play when the page isn't being painted.
window.mathsEscape = {
  get game() { return game; },
  get state() { return state; },
  backToMenu,
  cam: CAM,
  /** Where the runner and Mama appear on screen, in CSS pixels. */
  where() {
    const at = (obj, y) => {
      const v = obj.getWorldPosition(new THREE.Vector3());
      v.y += y;
      v.project(camera);
      return [Math.round((v.x * 0.5 + 0.5) * innerWidth), Math.round((-v.y * 0.5 + 0.5) * innerHeight)];
    };
    return { player: { head: at(player.root, 1.75), feet: at(player.root, 0) }, mama: { head: at(mama.root, 1.85), feet: at(mama.root, 0) }, view: [innerWidth, innerHeight] };
  },
  step(seconds = 1) {
    for (let t = 0; t < seconds; t += 1 / 60) frame(lastTime.t + 1000 / 60);
  },
};
