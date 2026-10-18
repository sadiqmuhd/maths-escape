// Quick mental-maths questions. Pure functions, no DOM or three.js, so they're
// unit-tested in test/maths.test.js.
//
// Levels get harder as the player gets more right:
//   1  add / subtract within 20
//   2  add / subtract within 100
//   3  times tables up to 5×, plus level 2
//   4  times tables up to 12×, exact division
//   5+ a mix of everything
// Answers are never negative and divisions never leave a remainder.

/** Small seeded random generator (mulberry32), so tests can repeat a run. */
export function seededRandom(seed = Date.now()) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const int = (random, min, max) => min + Math.floor(random() * (max - min + 1));

function addSub(random, max) {
  if (random() < 0.5) {
    const a = int(random, Math.ceil(max / 10), max - Math.ceil(max / 10));
    const b = int(random, 1, max - a);
    return { a, b, op: '+', answer: a + b };
  }
  const a = int(random, Math.ceil(max / 4), max);
  const b = int(random, 1, a - 1);
  return { a, b, op: '−', answer: a - b };
}

function times(random, maxTable) {
  const a = int(random, 2, maxTable);
  const b = int(random, 2, maxTable === 5 ? 10 : 12);
  return random() < 0.5 ? { a, b, op: '×', answer: a * b } : { a: b, b: a, op: '×', answer: a * b };
}

function divide(random) {
  const b = int(random, 2, 12);
  const answer = int(random, 2, 12);
  return { a: b * answer, b, op: '÷', answer };
}

/** The four kinds of question a level can ask, with how often each comes up. */
function makers(level) {
  if (level <= 1) return [[1, (r) => addSub(r, 20)]];
  if (level === 2) return [[1, (r) => addSub(r, 100)]];
  if (level === 3) return [[3, (r) => times(r, 5)], [2, (r) => addSub(r, 100)]];
  if (level === 4) return [[3, (r) => times(r, 12)], [2, divide], [1, (r) => addSub(r, 100)]];
  return [[2, (r) => times(r, 12)], [2, divide], [2, (r) => addSub(r, 100)], [1, (r) => addSub(r, 20)]];
}

/** Three wrong answers that are close enough to make you think. */
export function distractors(q, random) {
  const { a, b, op, answer } = q;
  const near = [answer + 1, answer - 1, answer + 2, answer - 2, answer + 10, answer - 10];
  if (op === '×') near.push((a + 1) * b, (a - 1) * b, a * (b + 1), a * (b - 1), a + b);
  if (op === '÷') near.push(answer + 3, answer - 3, a - b);
  if (op === '+') near.push(Math.abs(a - b), answer + 11, answer - 9);
  if (op === '−') near.push(a + b, answer + 9, answer - 11);

  const pool = [...new Set(near)].filter((n) => Number.isInteger(n) && n >= 0 && n !== answer);
  const chosen = [];
  while (chosen.length < 3 && pool.length) {
    chosen.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
  }
  for (let n = answer + 3; chosen.length < 3; n++) if (!chosen.includes(n)) chosen.push(n);
  return chosen;
}

/** Shuffle a copy of a list (Fisher–Yates). */
function shuffled(list, random) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * A new question for `level`, never the same as `previous`.
 * Returns { a, b, op, answer, text, choices: [4 numbers, one of them the answer] }.
 */
export function makeQuestion(level, random = Math.random, previous = null) {
  const options = makers(Math.max(1, Math.floor(level)));
  const total = options.reduce((sum, [weight]) => sum + weight, 0);
  for (let attempt = 0; ; attempt++) {
    let roll = random() * total;
    const [, make] = options.find(([weight]) => (roll -= weight) < 0) ?? options[0];
    const q = make(random);
    q.text = `${q.a} ${q.op} ${q.b}`;
    if (previous && q.text === previous.text && attempt < 20) continue;
    q.choices = shuffled([q.answer, ...distractors(q, random)], random);
    return q;
  }
}
