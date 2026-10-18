import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, newGame, tick, answer, chaseRate, levelFor, multiplierFor, pointsFor, statsFor } from '../src/game.js';
import { seededRandom } from '../src/maths.js';

const game = () => newGame(seededRandom(123));
const wrongChoice = (g) => g.question.choices.find((c) => c !== g.question.answer);

test('a run starts 10 m ahead at level 1 with a question', () => {
  const g = game();
  assert.equal(g.gap, 10);
  assert.equal(g.level, 1);
  assert.equal(g.score, 0);
  assert.equal(g.over, false);
  assert.ok(g.question.choices.includes(g.question.answer));
});

test('Mama closes in over time and catches you at 0 m', () => {
  const g = game();
  tick(g, 5);
  assert.ok(Math.abs(g.gap - (10 - 0.6 * 5)) < 1e-9);
  let caught = false;
  for (let i = 0; i < 100 && !caught; i++) caught = tick(g, 0.5);
  assert.equal(caught, true);
  assert.equal(g.over, true);
  assert.equal(g.gap, 0);
  assert.equal(tick(g, 1), false, 'nothing happens once caught');
});

test('a correct answer gains 3 m, a fast one 5 m', () => {
  const g = game();
  tick(g, 3); // slow: 3 s
  const before = g.gap;
  const slow = answer(g, g.question.answer);
  assert.equal(slow.correct, true);
  assert.equal(slow.fast, false);
  assert.ok(Math.abs(slow.gapChange - RULES.correct) < 1e-9);
  assert.ok(Math.abs(g.gap - (before + 3)) < 1e-9);

  tick(g, 1); // fast: 1 s
  const fast = answer(g, g.question.answer);
  assert.equal(fast.fast, true);
  assert.ok(Math.abs(fast.gapChange - RULES.fastCorrect) < 1e-9);
});

test('a wrong answer loses 3 m and breaks the streak', () => {
  const g = game();
  answer(g, g.question.answer);
  answer(g, g.question.answer);
  assert.equal(g.streak, 2);
  const before = g.gap;
  const r = answer(g, wrongChoice(g));
  assert.equal(r.correct, false);
  assert.equal(r.gapChange, -3);
  assert.equal(g.gap, before - 3);
  assert.equal(g.streak, 0);
  assert.equal(g.bestStreak, 2);
  assert.equal(g.wrong, 1);
});

test('a wrong answer when Mama is close gets you caught', () => {
  const g = game();
  g.gap = 2;
  const r = answer(g, wrongChoice(g));
  assert.equal(r.caught, true);
  assert.equal(g.over, true);
  assert.equal(g.gap, 0);
  assert.equal(answer(g, 1), null, 'no answers after being caught');
});

test('you can never get more than 20 m ahead', () => {
  const g = game();
  for (let i = 0; i < 20; i++) answer(g, g.question.answer);
  assert.equal(g.gap, RULES.maxGap);
});

test('every 5 in a row gives 2 extra metres', () => {
  const g = game();
  const results = [];
  for (let i = 0; i < 5; i++) {
    g.gap = 5; // room to gain without hitting the 20 m cap
    tick(g, 3); // slow answers: 3 m each
    results.push(answer(g, g.question.answer));
  }
  assert.deepEqual(results.map((r) => r.streakBonus), [false, false, false, false, true]);
  assert.ok(Math.abs(results[4].gapChange - (RULES.correct + RULES.streakBonus)) < 1e-9);
});

test('levels go up every 8 correct answers and Mama speeds up', () => {
  const g = game();
  const ups = [];
  for (let i = 0; i < 24; i++) {
    g.gap = 10;
    ups.push(answer(g, g.question.answer).levelUp);
  }
  assert.equal(g.level, 4);
  assert.deepEqual(ups.map((u, i) => (u ? i + 1 : null)).filter(Boolean), [8, 16, 24]);
  assert.ok(chaseRate(4) > chaseRate(1));
  assert.equal(chaseRate(100), RULES.maxChase, 'Mama has a top speed');
  assert.equal(levelFor(0), 1);
  assert.equal(levelFor(7), 1);
  assert.equal(levelFor(8), 2);
});

test('points reward speed and streaks', () => {
  assert.equal(pointsFor(0, 1), 20, 'instant: 10 + 10 speed');
  assert.equal(pointsFor(4, 1), 10, 'slow: just 10');
  assert.equal(pointsFor(10, 1), 10, 'never below 10');
  assert.equal(multiplierFor(4), 1);
  assert.equal(multiplierFor(5), 2);
  assert.equal(multiplierFor(10), 3);
  assert.equal(multiplierFor(99), 5, 'capped at ×5');
  assert.equal(pointsFor(0, 5), 40);
});

test('score adds up and stats match startng.json', () => {
  const g = game();
  tick(g, 1);
  const a = answer(g, g.question.answer);
  answer(g, wrongChoice(g));
  tick(g, 4);
  const b = answer(g, g.question.answer);
  assert.equal(g.score, a.points + b.points);
  assert.deepEqual(statsFor(g), { score: g.score, correct: 2, best_streak: 1 });
});

test('each new question differs from the last', () => {
  const g = game();
  let prev = g.question.text;
  for (let i = 0; i < 200; i++) {
    g.gap = 10;
    answer(g, g.question.answer);
    assert.notEqual(g.question.text, prev);
    prev = g.question.text;
  }
});
