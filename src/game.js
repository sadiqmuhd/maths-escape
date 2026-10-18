// The rules of Maths Escape: the gap between you and Mama, scoring, streaks
// and levels. Pure logic (no DOM or three.js), unit-tested in test/game.test.js.
// main.js calls tick() every frame and answer() when a button is pressed.

import { makeQuestion } from './maths.js';

export const RULES = {
  startGap: 10, // metres ahead of Mama at the start
  maxGap: 20, // you can't get further ahead than this
  correct: 3, // metres gained for a right answer
  fastCorrect: 5, // ...answered within fastSeconds
  fastSeconds: 2,
  wrong: -3, // metres lost for a wrong answer
  streakEvery: 5, // every 5 right in a row...
  streakBonus: 2, // ...gives this many extra metres
  baseChase: 0.6, // Mama closes in this many metres a second at level 1
  chasePerLevel: 0.12, // ...plus this much per level
  maxChase: 1.6,
  levelEvery: 8, // correct answers per level
  points: 10, // per right answer, before bonuses
};

/** How fast Mama closes the gap at a level, in metres a second. */
export const chaseRate = (level) => Math.min(RULES.maxChase, RULES.baseChase + RULES.chasePerLevel * (level - 1));

/** Level from the number of right answers. */
export const levelFor = (correct) => 1 + Math.floor(correct / RULES.levelEvery);

/** Score multiplier from the current streak: ×1, ×2 at 5 in a row, … up to ×5. */
export const multiplierFor = (streak) => Math.min(5, 1 + Math.floor(streak / RULES.streakEvery));

/** Points for a right answer: 10, plus up to 10 for speed, times the streak multiplier. */
export function pointsFor(seconds, streak) {
  const speed = Math.max(0, Math.round(RULES.points * (1 - seconds / 4)));
  return (RULES.points + speed) * multiplierFor(streak);
}

export function newGame(random = Math.random) {
  const game = {
    random,
    gap: RULES.startGap,
    elapsed: 0, // seconds of play
    score: 0,
    correct: 0,
    wrong: 0,
    streak: 0,
    bestStreak: 0,
    level: 1,
    over: false,
    question: null,
    askedAt: 0, // elapsed time when the current question appeared
  };
  game.question = makeQuestion(1, random);
  return game;
}

/** Advance time: Mama closes in. Returns true if she caught you this tick. */
export function tick(game, dt) {
  if (game.over) return false;
  game.elapsed += dt;
  game.gap = Math.max(0, game.gap - chaseRate(game.level) * dt);
  if (game.gap <= 0) {
    game.over = true;
    return true;
  }
  return false;
}

/**
 * Answer the current question with `value`. Returns what happened, for the
 * screen to show: { correct, fast, answer, gapChange, points, streakBonus,
 * levelUp, caught }.
 */
export function answer(game, value) {
  if (game.over) return null;
  const q = game.question;
  const seconds = game.elapsed - game.askedAt;
  const correct = value === q.answer;
  const before = game.gap;
  const result = { correct, fast: false, answer: q.answer, gapChange: 0, points: 0, streakBonus: false, levelUp: false, caught: false, seconds };

  if (correct) {
    result.fast = seconds <= RULES.fastSeconds;
    game.correct += 1;
    game.streak += 1;
    game.bestStreak = Math.max(game.bestStreak, game.streak);
    result.points = pointsFor(seconds, game.streak);
    game.score += result.points;
    let gain = result.fast ? RULES.fastCorrect : RULES.correct;
    if (game.streak % RULES.streakEvery === 0) {
      gain += RULES.streakBonus;
      result.streakBonus = true;
    }
    game.gap = Math.min(RULES.maxGap, game.gap + gain);
    const level = levelFor(game.correct);
    result.levelUp = level > game.level;
    game.level = level;
  } else {
    game.wrong += 1;
    game.streak = 0;
    game.gap = Math.max(0, game.gap + RULES.wrong);
    if (game.gap <= 0) {
      game.over = true;
      result.caught = true;
    }
  }

  result.gapChange = game.gap - before;
  if (!game.over) {
    game.question = makeQuestion(game.level, game.random, q);
    game.askedAt = game.elapsed;
  }
  return result;
}

/** The run as start.ng leaderboard stats (keys match startng.json). */
export const statsFor = (game) => ({ score: game.score, correct: game.correct, best_streak: game.bestStreak });
