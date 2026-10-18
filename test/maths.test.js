import test from 'node:test';
import assert from 'node:assert/strict';
import { makeQuestion, distractors, seededRandom } from '../src/maths.js';

const OPS = {
  '+': (a, b) => a + b,
  '−': (a, b) => a - b,
  '×': (a, b) => a * b,
  '÷': (a, b) => a / b,
};

/** Many questions per level, from a fixed seed so failures repeat. */
function sample(level, n = 2000, seed = 42) {
  const random = seededRandom(seed + level);
  const out = [];
  let prev = null;
  for (let i = 0; i < n; i++) out.push((prev = makeQuestion(level, random, prev)));
  return out;
}

test('every answer is correct, whole and never negative', () => {
  for (const level of [1, 2, 3, 4, 5, 9]) {
    for (const q of sample(level)) {
      assert.equal(q.answer, OPS[q.op](q.a, q.b), q.text);
      assert.ok(Number.isInteger(q.answer) && q.answer >= 0, q.text);
      assert.equal(q.text, `${q.a} ${q.op} ${q.b}`);
    }
  }
});

test('each question has 4 different whole-number choices, one of them right', () => {
  for (const level of [1, 2, 3, 4, 5]) {
    for (const q of sample(level, 1000)) {
      assert.equal(q.choices.length, 4, q.text);
      assert.equal(new Set(q.choices).size, 4, `${q.text}: ${q.choices}`);
      assert.equal(q.choices.filter((c) => c === q.answer).length, 1, q.text);
      assert.ok(q.choices.every((c) => Number.isInteger(c) && c >= 0), `${q.text}: ${q.choices}`);
    }
  }
});

test('level 1 is adding and subtracting within 20', () => {
  for (const q of sample(1)) {
    assert.ok(['+', '−'].includes(q.op), q.text);
    assert.ok(q.a <= 20 && q.b <= 20 && q.answer <= 20, q.text);
    assert.ok(q.a >= 1 && q.b >= 1, q.text);
  }
});

test('level 2 is adding and subtracting within 100', () => {
  const qs = sample(2);
  for (const q of qs) {
    assert.ok(['+', '−'].includes(q.op), q.text);
    assert.ok(q.answer <= 100 && q.a <= 100, q.text);
  }
  assert.ok(qs.some((q) => q.answer > 20), 'harder than level 1');
});

test('level 3 adds times tables up to 5×', () => {
  const qs = sample(3);
  const mult = qs.filter((q) => q.op === '×');
  assert.ok(mult.length > qs.length * 0.4, 'mostly times tables');
  for (const q of mult) assert.ok(Math.min(q.a, q.b) <= 5 && Math.max(q.a, q.b) <= 10, q.text);
  assert.ok(!qs.some((q) => q.op === '÷'), 'no division yet');
});

test('level 4 has times tables to 12× and exact division', () => {
  const qs = sample(4);
  assert.ok(qs.some((q) => q.op === '×' && q.a > 5 && q.b > 5), 'bigger tables');
  const div = qs.filter((q) => q.op === '÷');
  assert.ok(div.length > 100, 'division appears');
  for (const q of div) {
    assert.equal(q.a % q.b, 0, `${q.text} divides exactly`);
    assert.ok(q.b >= 2 && q.b <= 12 && q.answer >= 2 && q.answer <= 12, q.text);
  }
  for (const q of qs.filter((x) => x.op === '×')) assert.ok(q.a <= 12 && q.b <= 12, q.text);
});

test('level 5 and above mix all four operations', () => {
  const ops = new Set(sample(5).map((q) => q.op));
  assert.deepEqual([...ops].sort(), ['+', '×', '÷', '−'].sort());
});

test('the same question is never asked twice in a row', () => {
  for (const level of [1, 3, 5]) {
    const qs = sample(level, 3000);
    for (let i = 1; i < qs.length; i++) assert.notEqual(qs[i].text, qs[i - 1].text);
  }
});

test('wrong choices are near misses or classic slips, not random numbers', () => {
  // 7 × 8: off by 1/2/10, the 6× or 9× table, the 7× or 9× row, or adding by mistake (15)
  const allowed = new Set([57, 55, 58, 54, 66, 46, 64, 48, 63, 49, 15]);
  const random = seededRandom(7);
  for (let i = 0; i < 200; i++) {
    const wrong = distractors({ a: 7, b: 8, op: '×', answer: 56 }, random);
    assert.equal(wrong.length, 3);
    for (const n of wrong) assert.ok(allowed.has(n), `${n} is a plausible slip for 7 × 8`);
  }
});

test('small answers still get 3 non-negative wrong choices', () => {
  const random = seededRandom(1);
  const q = { a: 2, b: 1, op: '−', answer: 1 };
  for (let i = 0; i < 200; i++) {
    const wrong = distractors(q, random);
    assert.equal(new Set(wrong).size, 3);
    assert.ok(wrong.every((n) => n >= 0 && n !== 1));
  }
});

test('the same seed gives the same questions', () => {
  const a = sample(4, 50, 99).map((q) => q.text);
  const b = sample(4, 50, 99).map((q) => q.text);
  assert.deepEqual(a, b);
});
