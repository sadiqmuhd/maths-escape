// A start.ng character in 3D, built from the player's start.ng `style`
// (body, colours, hair, hat, accessory), with running, stumbling, being
// caught and cheering. About 1.7 m tall, facing +z, feet at y = 0.
//
// Every style field from the start.ng docs is drawn; unknown or missing values
// fall back to sensible defaults, as the docs ask.
import * as THREE from 'three';

const PI = Math.PI;
const GOLD = '#e8b84a';
const SHOE = '#2a211b';

export const DEFAULT_STYLE = {
  body: 'female',
  primaryColor: '#4b7bec',
  secondaryColor: '#2b2f4a',
  skinColor: '#8d5524',
  hairColor: '#17120f',
  hair: 'short',
  hat: 'none',
  accessory: 'none',
};

const HAIRS = ['short', 'afro', 'braids', 'bun', 'ponytail', 'dreads', 'bald'];
const HATS = ['none', 'cap', 'beanie', 'tophat', 'crown'];
const ACCESSORIES = ['none', 'glasses', 'earrings', 'beard', 'scarf', 'backpack'];
const HEX = /^#[0-9a-f]{6}$/i;

/** A complete, valid style: start.ng's values where they're usable, defaults otherwise. */
export function normalizeStyle(style) {
  const s = { ...DEFAULT_STYLE };
  if (!style || typeof style !== 'object') return s;
  if (style.body === 'male' || style.body === 'female') s.body = style.body;
  for (const key of ['primaryColor', 'secondaryColor', 'skinColor', 'hairColor']) {
    if (HEX.test(style[key] ?? '')) s[key] = style[key];
  }
  if (HAIRS.includes(style.hair)) s.hair = style.hair;
  if (HATS.includes(style.hat)) s.hat = style.hat;
  if (ACCESSORIES.includes(style.accessory)) s.accessory = style.accessory;
  return s;
}

/** A sphere with a bumpy surface, for curly hair and pom-poms. */
function curly(radius, bumps = 0.06) {
  const g = new THREE.IcosahedronGeometry(radius, 4);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 90) * Math.sin(v.y * 95) * Math.sin(v.z * 85);
    v.multiplyScalar(1 + n * bumps);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/** A tapered limb hanging down from its joint (length `len`). */
function limbGeo(rTop, rBottom, len) {
  const g = new THREE.CylinderGeometry(rTop, rBottom, len, 14, 1);
  g.translate(0, -len / 2, 0);
  return g;
}

/**
 * Build a character. Options:
 *   wrapper: true   a long wrapper skirt instead of trousers (for Mama)
 *   gele: '#hex'    a tall Nigerian head-tie (for Mama)
 *   scale: n        overall size
 * Returns { root, head, hands, setMode(mode), setSpeed(n), update(dt), dispose() }.
 * Modes: 'idle', 'run', 'stumble', 'caught', 'cheer', 'chase' (Mama: slipper raised).
 */
export function buildCharacter(style, { wrapper = false, gele = null, scale = 1 } = {}) {
  const s = normalizeStyle(style);
  const female = s.body === 'female';
  const geometries = [];
  const materials = new Map();

  const mat = (color, { metal = 0, rough = 0.7 } = {}) => {
    const key = `${color}|${metal}|${rough}`;
    if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough }));
    return materials.get(key);
  };
  const add = (parent, geometry, material, x = 0, y = 0, z = 0) => {
    geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const sphere = (parent, r, material, x, y, z, sx = 1, sy = 1, sz = 1) => {
    const m = add(parent, new THREE.SphereGeometry(r, 20, 14), material, x, y, z);
    m.scale.set(sx, sy, sz);
    return m;
  };
  const group = (parent, x = 0, y = 0, z = 0) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  };

  const skin = mat(s.skinColor, { rough: 0.55 });
  const top = mat(s.primaryColor, { rough: 0.75 });
  const bottoms = mat(s.secondaryColor, { rough: 0.85 });
  const hair = mat(s.hairColor, { rough: 0.85 });
  const shoe = mat(SHOE, { rough: 0.45 });

  const root = new THREE.Group();
  root.scale.setScalar(scale);
  const body = group(root); // tilts as a whole when falling
  const hipY = female ? 0.88 : 0.92;
  const hips = group(body, 0, hipY, 0);

  // ---- pelvis and legs
  const pelvis = add(hips, new THREE.SphereGeometry(female ? 0.16 : 0.15, 20, 14), bottoms, 0, -0.02, 0);
  pelvis.scale.set(1, 0.7, 0.72);
  const legs = [];
  const thigh = 0.43;
  const shin = 0.41;
  for (const side of [-1, 1]) {
    const hip = group(hips, side * 0.085, -0.04, 0);
    add(hip, limbGeo(0.075, 0.055, thigh), bottoms);
    const knee = group(hip, 0, -thigh, 0);
    add(knee, limbGeo(0.055, 0.042, shin), bottoms);
    const foot = sphere(knee, 0.05, shoe, 0, -shin - 0.02, 0.045, 0.95, 0.65, 2.1);
    foot.castShadow = true;
    legs.push({ hip, knee });
  }

  // ---- torso
  const spine = group(hips, 0, 0.02, 0);
  const torsoPts = female
    ? [[0.15, -0.04], [0.14, 0.08], [0.12, 0.18], [0.135, 0.28], [0.145, 0.36], [0.135, 0.42], [0.09, 0.47], [0.05, 0.49]]
    : [[0.145, -0.04], [0.145, 0.08], [0.15, 0.2], [0.17, 0.32], [0.18, 0.4], [0.16, 0.46], [0.1, 0.51], [0.055, 0.53]];
  const torsoGeo = new THREE.LatheGeometry(torsoPts.map(([r, y]) => new THREE.Vector2(r, y)), 24);
  const torso = add(spine, torsoGeo, top);
  torso.scale.z = 0.68;
  if (female) for (const side of [-1, 1]) sphere(spine, 0.055, top, side * 0.055, 0.31, 0.05, 1, 0.85, 0.75);
  const neckTop = female ? 0.6 : 0.64;
  add(spine, limbGeo(0.045, 0.05, 0.14), skin, 0, neckTop, 0);

  // A long wrapper (Mama): hides the legs, flares at the hem.
  if (wrapper) {
    const pts = [[0.165, 0.02], [0.2, -0.3], [0.25, -0.62], [0.27, -0.84], [0.2, -0.86]];
    const skirt = add(hips, new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 24), bottoms);
    skirt.scale.z = 0.8;
  }

  // ---- arms
  const arms = [];
  const shoulderY = female ? 0.42 : 0.46;
  const hands = [];
  for (const side of [-1, 1]) {
    const shoulder = group(spine, side * (female ? 0.16 : 0.19), shoulderY, 0);
    sphere(shoulder, female ? 0.055 : 0.065, top, 0, -0.01, 0);
    add(shoulder, limbGeo(female ? 0.055 : 0.064, 0.05, 0.13), top);
    add(shoulder, limbGeo(0.045, 0.036, 0.29), skin);
    const elbow = group(shoulder, 0, -0.29, 0);
    add(elbow, limbGeo(0.036, 0.028, 0.25), skin);
    const hand = group(elbow, 0, -0.27, 0);
    sphere(hand, 0.032, skin, 0, -0.01, 0, 1, 1.35, 0.7);
    arms.push({ shoulder, elbow });
    hands.push(hand);
  }

  // ---- head and face
  const head = group(spine, 0, neckTop + 0.12, 0.005);
  const hw = female ? 0.86 : 0.9; // head width
  sphere(head, 0.105, skin, 0, 0, 0, hw, 1.12, 1);
  sphere(head, 0.072, skin, 0, -0.05, 0.016, female ? 0.9 : 1, 0.75, 0.95); // jaw
  const white = mat('#f6f1ea', { rough: 0.3 });
  const iris = mat('#2a1a10', { rough: 0.2 });
  for (const side of [-1, 1]) {
    sphere(head, 0.022, skin, side * 0.092 * hw, -0.005, -0.005, 0.45, 1, 0.75); // ear
    sphere(head, 0.015, white, side * 0.035, 0.012, 0.085, 1.3, 0.8, 0.6);
    sphere(head, 0.009, iris, side * 0.035, 0.012, 0.094);
    const brow = sphere(head, 0.018, hair, side * 0.037, 0.042, 0.09, 1.25, female ? 0.22 : 0.32, 0.4);
    brow.rotation.z = side * (female ? -0.18 : -0.06);
  }
  sphere(head, 0.016, skin, 0, -0.012, 0.1, 0.85, 1.4, 1.1); // nose
  const lips = mat(female ? '#9e4a52' : new THREE.Color(s.skinColor).multiplyScalar(0.72).getStyle(), { rough: 0.4 });
  const mouth = sphere(head, 0.02, lips, 0, -0.048, s.accessory === 'beard' ? 0.098 : 0.092, 1, 0.32, 0.55);

  // ---- hair (strands that sway are collected in `sway`)
  const sway = [];
  const capHair = () => {
    const cap = add(head, new THREE.SphereGeometry(0.11, 24, 12, 0, 2 * PI, 0, PI * 0.52), hair, 0, 0.012, -0.012);
    cap.scale.set(hw + 0.02, 1.14, 1.04);
    cap.rotation.x = -0.4;
  };
  if (s.hair !== 'bald') capHair();
  if (s.hair === 'afro') {
    const afro = add(head, curly(0.16, 0.05), hair, 0, 0.06, -0.06);
    afro.scale.set(1.03, 0.92, 0.88);
  }
  if (s.hair === 'bun') add(head, curly(0.055, 0.05), hair, 0, 0.115, -0.07);
  if (s.hair === 'ponytail') {
    const tail = group(head, 0, 0.03, -0.1);
    sphere(tail, 0.028, hair, 0, 0, 0);
    const strand = add(tail, limbGeo(0.04, 0.015, 0.26), hair);
    strand.rotation.x = 0.2;
    sway.push(tail);
  }
  if (s.hair === 'braids' || s.hair === 'dreads') {
    const braids = s.hair === 'braids';
    const count = braids ? 16 : 18;
    const len = braids ? 0.34 : 0.22;
    for (let i = 0; i < count; i++) {
      const a = PI * 0.1 + (i / (count - 1)) * PI * 0.8;
      const strand = group(head, Math.cos(a) * 0.088 * hw, 0.02, -Math.sin(a) * 0.092);
      strand.rotation.z = Math.cos(a) * 0.12;
      add(strand, limbGeo(braids ? 0.011 : 0.015, braids ? 0.008 : 0.013, len), hair);
      sway.push(strand);
    }
  }

  // ---- face accessories
  if (s.accessory === 'beard') {
    const beard = add(head, new THREE.SphereGeometry(0.106, 24, 12, 0, 2 * PI, PI * 0.64, PI * 0.36), hair, 0, -0.008, 0.006);
    beard.scale.set(hw + 0.02, 1.12, 1.02);
    sphere(head, 0.03, hair, 0, -0.034, 0.09, 1.3, 0.35, 0.5); // moustache
  }
  if (s.accessory === 'glasses') {
    const frame = mat('#1d1b19', { metal: 0.4, rough: 0.35 });
    for (const side of [-1, 1]) {
      add(head, new THREE.TorusGeometry(0.024, 0.0045, 8, 20), frame, side * 0.036, 0.012, 0.102);
      const arm = add(head, new THREE.BoxGeometry(0.004, 0.004, 0.1), frame, side * 0.086 * hw, 0.014, 0.05);
      arm.castShadow = false;
    }
    add(head, new THREE.TorusGeometry(0.011, 0.0035, 6, 12, PI), frame, 0, 0.014, 0.104);
  }
  if (s.accessory === 'earrings') {
    for (const side of [-1, 1]) add(head, new THREE.TorusGeometry(0.013, 0.0035, 8, 18), mat(GOLD, { metal: 0.85, rough: 0.25 }), side * 0.09 * hw, -0.042, 0);
  }

  // ---- hats (a little higher over an afro)
  const lift = s.hair === 'afro' ? 0.075 : 0;
  if (s.hat === 'cap') {
    const dome = add(head, new THREE.SphereGeometry(0.115, 24, 10, 0, 2 * PI, 0, PI / 2), top, 0, 0.02 + lift * 0.5, -0.006);
    dome.scale.set(hw + 0.05, 1.16, 1.08);
    const brim = add(head, new THREE.CylinderGeometry(0.078, 0.078, 0.01, 20, 1, false, -PI / 2, PI), top, 0, 0.032 + lift * 0.5, 0.088);
    brim.rotation.x = 0.12;
  }
  if (s.hat === 'beanie') {
    const dome = add(head, new THREE.SphereGeometry(0.117, 24, 12, 0, 2 * PI, 0, PI / 2), top, 0, 0.024 + lift * 0.5, -0.004);
    dome.scale.set(hw + 0.05, 1.05, 1.07);
    const cuff = add(head, new THREE.TorusGeometry(0.102, 0.021, 10, 28), bottoms, 0, 0.03 + lift * 0.5, -0.004);
    cuff.rotation.x = PI / 2;
    cuff.scale.set(hw + 0.07, 1.08, 1);
    add(head, curly(0.032, 0.08), top, 0, 0.155 + lift * 0.5, -0.01);
  }
  if (s.hat === 'tophat') {
    const black = mat('#1b1a18', { rough: 0.45 });
    const hat = group(head, 0, 0.1 + lift, -0.005);
    hat.rotation.z = -0.08;
    add(hat, new THREE.CylinderGeometry(0.135, 0.135, 0.012, 28), black);
    add(hat, new THREE.CylinderGeometry(0.085, 0.092, 0.17, 28), black, 0, 0.09, 0);
    add(hat, new THREE.CylinderGeometry(0.094, 0.094, 0.03, 28), top, 0, 0.025, 0);
  }
  if (s.hat === 'crown') {
    const gold = mat(GOLD, { metal: 0.85, rough: 0.28 });
    const crown = group(head, 0, 0.1 + lift, -0.005);
    add(crown, new THREE.CylinderGeometry(0.086, 0.08, 0.05, 28, 1, true), gold);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI * 2;
      add(crown, new THREE.ConeGeometry(0.018, 0.05, 10), gold, Math.sin(a) * 0.08, 0.045, Math.cos(a) * 0.08);
    }
    add(crown, new THREE.OctahedronGeometry(0.013), mat('#d6263b', { metal: 0.2, rough: 0.15 }), 0, 0.005, 0.087);
  }

  // A gele (Mama's head-tie): tall folded fabric fanning out at the back.
  if (gele) {
    const cloth = mat(gele, { metal: 0.15, rough: 0.5 });
    const g = group(head, 0, 0.07, -0.02);
    const band = add(g, new THREE.TorusGeometry(0.105, 0.035, 10, 28), cloth);
    band.rotation.x = PI / 2 - 0.25;
    band.scale.set(hw + 0.08, 1.05, 1);
    for (let i = 0; i < 5; i++) {
      const fold = add(g, new THREE.SphereGeometry(0.1, 16, 10), cloth, (i - 2) * 0.045, 0.1 + Math.abs(i - 2) * -0.015, -0.04 - Math.abs(i - 2) * 0.012);
      fold.scale.set(0.45, 1.05, 0.9);
      fold.rotation.z = (i - 2) * -0.28;
    }
    sphere(g, 0.06, cloth, 0, 0.03, -0.12, 1.4, 0.8, 0.9); // the knot
  }

  // ---- body accessories
  if (s.accessory === 'scarf') {
    const red = mat('#c8442f', { rough: 0.9 });
    const ring = add(spine, new THREE.TorusGeometry(0.068, 0.031, 12, 24), red, 0, neckTop - 0.0, 0.005);
    ring.rotation.x = PI / 2 - 0.15;
    ring.scale.set(1.1, 0.85, 1);
    const tail = add(spine, new THREE.CapsuleGeometry(0.027, 0.17, 4, 10), red, 0.06, neckTop - 0.13, 0.085);
    tail.scale.z = 0.45;
    tail.rotation.z = 0.08;
  }
  if (s.accessory === 'backpack') {
    const leather = mat('#6b4a2f', { rough: 0.65 });
    const back = female ? -0.1 : -0.115;
    const bag = add(spine, new THREE.CapsuleGeometry(0.11, 0.12, 6, 14), leather, 0, 0.3, back - 0.06);
    bag.scale.set(1.15, 1, 0.55);
    for (const side of [-1, 1]) {
      const strap = add(spine, new THREE.CapsuleGeometry(0.012, 0.32, 4, 8), leather, side * 0.085, 0.29, female ? 0.085 : 0.095);
      strap.scale.x = 1.6;
      strap.rotation.x = -0.12;
    }
  }

  // ---- animation
  let mode = 'idle';
  let modeTime = 0;
  let speed = 1; // stride speed: 1 running, up to ~1.6 sprinting
  let phase = 0;
  let clock = 0;
  const restArm = female ? 0.1 : 0.13;
  const lerp = THREE.MathUtils.lerp;

  function setMode(next) {
    if (next !== mode) {
      mode = next;
      modeTime = 0;
    }
  }

  function update(dt) {
    clock += dt;
    modeTime += dt;
    const running = mode === 'run' || mode === 'chase' || mode === 'stumble';
    if (running) phase += dt * PI * 2 * 1.45 * speed;

    // reset the pose each frame, then apply the mode
    body.rotation.set(0, 0, 0);
    body.position.set(0, 0, 0);
    hips.position.set(0, hipY, 0);
    spine.rotation.set(0, 0, 0);
    head.rotation.set(0, 0, 0);
    mouth.scale.y = 0.32;

    if (running) {
      const stride = Math.sin(phase);
      const amp = Math.min(1.25, 0.85 + (speed - 1) * 0.6);
      legs.forEach(({ hip, knee }, i) => {
        const st = i === 0 ? stride : -stride;
        hip.rotation.set(-st * 0.75 * amp, 0, 0);
        knee.rotation.x = Math.max(0, Math.sin(phase + (i === 0 ? 0 : PI) + PI / 2)) * 1.45 * amp + 0.15;
      });
      arms.forEach(({ shoulder, elbow }, i) => {
        const side = i === 0 ? -1 : 1;
        const st = i === 0 ? -stride : stride;
        shoulder.rotation.set(-st * 0.7 * amp, 0, side * (restArm + 0.08));
        elbow.rotation.set(-1.35, 0, 0);
      });
      spine.rotation.x = 0.16 + (speed - 1) * 0.12;
      head.rotation.x = -0.12 - (speed - 1) * 0.08;
      hips.position.y = hipY + (Math.abs(Math.cos(phase)) - 0.55) * 0.06 * amp;
    } else {
      const breathe = Math.sin(clock * 1.6);
      legs.forEach(({ hip, knee }) => {
        hip.rotation.set(0, 0, 0);
        knee.rotation.x = 0.02;
      });
      arms.forEach(({ shoulder, elbow }, i) => {
        const side = i === 0 ? -1 : 1;
        shoulder.rotation.set(Math.sin(clock * 0.8 + i * PI) * 0.04, 0, side * restArm);
        elbow.rotation.set(-0.15, 0, 0);
      });
      hips.position.y = hipY + breathe * 0.004;
      head.rotation.y = Math.sin(clock * 0.45) * 0.3;
    }

    if (mode === 'chase') {
      // Mama: right arm up, slipper shaking; mouth open, shouting.
      const { shoulder, elbow } = arms[1];
      shoulder.rotation.set(-0.6, 0, 2.5);
      elbow.rotation.set(-0.5 + Math.sin(clock * 14) * 0.35, 0, 0);
      mouth.scale.y = 0.55 + Math.abs(Math.sin(clock * 6)) * 0.4;
    }

    if (mode === 'stumble') {
      // A trip: pitch forward, arms flung out, recover within ~0.6 s.
      const k = Math.sin(Math.min(1, modeTime / 0.6) * PI);
      spine.rotation.x += 0.55 * k;
      head.rotation.x -= 0.3 * k;
      arms.forEach(({ shoulder }, i) => {
        shoulder.rotation.z = (i === 0 ? -1 : 1) * lerp(restArm, 1.3, k);
        shoulder.rotation.x = lerp(shoulder.rotation.x, -1.2, k);
      });
      body.position.y = -0.06 * k;
      if (modeTime > 0.6) setMode('run');
    }

    if (mode === 'caught') {
      // Fall flat on the face, legs kick up.
      const k = Math.min(1, modeTime / 0.45);
      const e = k * k * (3 - 2 * k);
      body.rotation.x = e * (PI / 2 - 0.05);
      body.position.y = e * 0.16;
      body.position.z = -e * 0.15;
      legs.forEach(({ hip, knee }, i) => {
        hip.rotation.set(0.15, 0, 0);
        knee.rotation.x = 0.4 + e * 1.4 + (i ? Math.sin(clock * 9) * 0.2 * e : 0);
      });
      arms.forEach(({ shoulder, elbow }, i) => {
        shoulder.rotation.set(-PI * 0.9 * e, 0, (i === 0 ? -1 : 1) * 0.35);
        elbow.rotation.set(-0.2, 0, 0);
      });
      mouth.scale.y = 0.7;
    }

    if (mode === 'cheer') {
      const bounce = Math.abs(Math.sin(clock * 5));
      hips.position.y = hipY + bounce * 0.05;
      arms.forEach(({ shoulder, elbow }, i) => {
        shoulder.rotation.set(-0.2, 0, (i === 0 ? -1 : 1) * (2.6 + Math.sin(clock * 10 + i) * 0.15));
        elbow.rotation.set(-0.3, 0, 0);
      });
      mouth.scale.y = 0.6;
    }

    for (let i = 0; i < sway.length; i++) sway[i].rotation.x = Math.sin(clock * 9 + i * 0.4) * (running ? 0.18 : 0.04) + (running ? 0.35 : 0);
  }
  update(0);

  return {
    root,
    head,
    hands,
    get mode() {
      return mode;
    },
    setMode,
    /** 1 running, up to about 1.6 sprinting. */
    setSpeed(n) {
      speed = n;
    },
    update,
    dispose() {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
