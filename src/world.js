// The street: a Lagos-style road that scrolls past forever. The runner stays
// at x = 0 facing +x; everything else moves toward -x and is recycled ahead
// of the camera when it falls far enough behind.
import * as THREE from 'three';

const SKY = '#f9d9a8';
const SPAN = 100; // props cycle over this many metres
const BEHIND = -70; // recycle once this far behind
const BUILDING_COLORS = ['#e8a87c', '#85c7b3', '#f2d16b', '#d98880', '#a9cce3', '#f0b27a', '#c39bd3', '#f5f0e1', '#9fd3a1'];
const SIGNS = [
  ['MAMA PUT', '#c0392b'], ['POS', '#1e8449'], ['PURE WATER', '#2471a3'], ['SUYA SPOT', '#b9770e'],
  ['BARBING SALON', '#6c3483'], ['JOLLOF & CO', '#d35400'], ['PHONE REPAIRS', '#17202a'], ['CHEMIST', '#117a65'],
];

function canvasTexture(width, height, draw) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  draw(c.getContext('2d'), width, height);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** A tiled window pattern drawn over building fronts. */
const windowTexture = () =>
  canvasTexture(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(40, 52, 64, 0.85)';
    g.fillRect(28, 26, 72, 58);
    g.fillStyle = 'rgba(255, 255, 255, 0.9)';
    g.fillRect(24, 22, 80, 5);
    g.fillRect(24, 84, 80, 5);
    g.fillStyle = 'rgba(255, 255, 255, 0.25)';
    g.fillRect(34, 32, 22, 46);
  });

const signTexture = (text, color) =>
  canvasTexture(512, 128, (g, w, h) => {
    g.fillStyle = color;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#fff8e7';
    g.lineWidth = 8;
    g.strokeRect(8, 8, w - 16, h - 16);
    g.fillStyle = '#fff8e7';
    g.font = 'bold 64px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 4, w - 40);
  });

export function buildWorld(scene) {
  const disposables = [];
  const keep = (o) => (disposables.push(o), o);
  const std = (color, rough = 0.85) => keep(new THREE.MeshStandardMaterial({ color, roughness: rough }));

  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 30, 78);

  // ---- light: warm late-afternoon sun, shadows only near the action
  scene.add(new THREE.HemisphereLight('#fff4e0', '#b59a76', 1.45));
  const sun = new THREE.DirectionalLight('#ffe7c2', 2.4);
  sun.position.set(6, 12, 8);
  sun.target.position.set(-4, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -16, right: 8, top: 6, bottom: -6, near: 1, far: 40 });
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);

  // ---- fixed ground: road, pavements, earth beyond
  const ground = new THREE.Group();
  scene.add(ground);
  const plane = (w, d, color, y, z) => {
    const m = new THREE.Mesh(keep(new THREE.PlaneGeometry(w, d)), std(color, 0.95));
    m.rotation.x = -Math.PI / 2;
    m.position.set(-25, y, z);
    m.receiveShadow = true;
    ground.add(m);
    return m;
  };
  plane(220, 7, '#3d4046', 0, 0); // road
  for (const side of [-1, 1]) {
    const kerbTop = new THREE.Mesh(keep(new THREE.BoxGeometry(220, 0.14, 2.6)), std('#cdbb9f', 0.95));
    kerbTop.position.set(-25, 0.07, side * 4.8);
    kerbTop.receiveShadow = true;
    ground.add(kerbTop);
    plane(220, 30, '#b8956a', -0.01, side * 21); // red earth
  }

  // ---- things that scroll: road markings, kerb stripes, buildings, palms, poles, a danfo
  const movers = [];
  const addMover = (object, x, recycle) => {
    object.position.x = x;
    scene.add(object);
    movers.push({ object, recycle });
  };

  // dashed centre line + yellow/black kerb blocks
  const dashGeo = keep(new THREE.BoxGeometry(2.2, 0.02, 0.16));
  const dashMat = std('#f4f1e8', 0.6);
  const kerbGeo = keep(new THREE.BoxGeometry(1, 0.16, 0.18));
  const yellow = std('#f2c230', 0.6);
  const black = std('#22201e', 0.6);
  for (let x = BEHIND; x < BEHIND + SPAN; x += 4) {
    const d = new THREE.Mesh(dashGeo, dashMat);
    d.position.y = 0.012;
    addMover(d, x);
  }
  for (let i = 0, x = BEHIND; x < BEHIND + SPAN; x += 1, i++) {
    for (const side of [-1, 1]) {
      const k = new THREE.Mesh(kerbGeo, i % 2 ? yellow : black);
      k.position.set(0, 0.08, side * 3.55);
      addMover(k, x);
    }
  }

  const windows = keep(windowTexture());
  const signs = SIGNS.map(([text, color]) => keep(signTexture(text, color)));
  const random = Math.random;

  function makeBuilding(side) {
    const g = new THREE.Group();
    const w = 5 + random() * 4;
    const h = 3.2 + Math.floor(random() * 3) * 2.6;
    const d = 5;
    const color = BUILDING_COLORS[Math.floor(random() * BUILDING_COLORS.length)];
    const box = new THREE.Mesh(keep(new THREE.BoxGeometry(w, h, d)), std(color));
    box.position.y = h / 2;
    box.castShadow = true;
    box.receiveShadow = true;
    g.add(box);
    // windows on the street side
    const tex = windows.clone();
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(Math.round(w / 1.6), Math.round(h / 2.6));
    tex.needsUpdate = true;
    keep(tex);
    const front = new THREE.Mesh(keep(new THREE.PlaneGeometry(w - 0.4, h - 0.8)), keep(new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.6 })));
    front.position.set(0, h / 2 + 0.3, (-side * d) / 2 - 0.01 * side);
    front.rotation.y = side > 0 ? Math.PI : 0;
    g.add(front);
    // roof parapet
    const roof = new THREE.Mesh(keep(new THREE.BoxGeometry(w + 0.2, 0.3, d + 0.2)), std('#efe6d6'));
    roof.position.y = h + 0.15;
    g.add(roof);
    // a shop sign at ground level on some buildings
    if (random() < 0.7) {
      const sign = new THREE.Mesh(keep(new THREE.PlaneGeometry(3.4, 0.85)), keep(new THREE.MeshStandardMaterial({ map: signs[Math.floor(random() * signs.length)], roughness: 0.5 })));
      sign.position.set(0, 2.55, (-side * d) / 2 - 0.06 * side);
      sign.rotation.y = side > 0 ? Math.PI : 0;
      g.add(sign);
    }
    g.position.z = side * (8.6 + random() * 1.5);
    return { g, w };
  }

  // buildings in a row on each side, recycled with new looks
  for (const side of [-1, 1]) {
    let x = BEHIND;
    while (x < BEHIND + SPAN) {
      const { g, w } = makeBuilding(side);
      addMover(g, x + w / 2);
      x += w + 0.4 + random() * 1.2;
    }
  }

  const trunkMat = std('#8a6a48');
  const frondMat = keep(new THREE.MeshStandardMaterial({ color: '#3f8f3a', roughness: 0.8, side: THREE.DoubleSide }));
  function makePalm() {
    const g = new THREE.Group();
    const h = 4.5 + random() * 2;
    let y = 0;
    for (let i = 0; i < 6; i++) {
      const seg = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.16 - i * 0.012, 0.19 - i * 0.012, h / 6, 8)), trunkMat);
      seg.position.set(i * i * 0.012, y + h / 12, 0);
      seg.castShadow = true;
      g.add(seg);
      y += h / 6;
    }
    for (let i = 0; i < 8; i++) {
      const frond = new THREE.Mesh(keep(new THREE.ConeGeometry(0.32, 2.4, 4, 1, true)), frondMat);
      frond.scale.set(1, 1, 0.12);
      const a = (i / 8) * Math.PI * 2;
      frond.position.set(0.3 + Math.cos(a) * 0.9, y - 0.15, Math.sin(a) * 0.9);
      frond.rotation.set(Math.sin(a) * 1.15, -a, -Math.cos(a) * 1.15 - 0.2);
      frond.castShadow = true;
      g.add(frond);
    }
    return g;
  }
  const poleMat = std('#6d6458');
  function makePole() {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.09, 0.12, 7.5, 8)), poleMat);
    pole.position.y = 3.75;
    pole.castShadow = true;
    g.add(pole);
    const bar = new THREE.Mesh(keep(new THREE.BoxGeometry(0.1, 0.1, 1.6)), poleMat);
    bar.position.y = 7;
    g.add(bar);
    return g;
  }
  for (const side of [-1, 1]) {
    for (let x = BEHIND + 3; x < BEHIND + SPAN; x += 9 + random() * 6) {
      const palm = random() < 0.55;
      const prop = palm ? makePalm() : makePole();
      prop.position.z = side * (5.1 + random() * 0.6);
      prop.rotation.y = random() * Math.PI;
      addMover(prop, x);
    }
  }

  // a yellow danfo parked on the far pavement now and then
  function makeDanfo() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(keep(new THREE.BoxGeometry(4.6, 1.9, 2)), std('#f4c430', 0.5));
    body.position.y = 1.3;
    body.castShadow = true;
    g.add(body);
    for (const y of [0.85, 1.75]) {
      const stripe = new THREE.Mesh(keep(new THREE.BoxGeometry(4.62, 0.12, 2.02)), std('#1b1b1b', 0.5));
      stripe.position.y = y;
      g.add(stripe);
    }
    const glass = new THREE.Mesh(keep(new THREE.BoxGeometry(3.6, 0.6, 2.04)), std('#2b3a4a', 0.2));
    glass.position.set(-0.3, 1.85, 0);
    g.add(glass);
    for (const x of [-1.5, 1.5]) for (const z of [-1, 1]) {
      const wheel = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.38, 0.38, 0.28, 14)), std('#1d1d1d'));
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(x, 0.38, z * 0.95);
      g.add(wheel);
    }
    g.position.z = -5.9;
    return g;
  }
  addMover(makeDanfo(), -30);

  /** Scroll the street by `distance` metres (the runner's speed × dt). */
  function update(distance) {
    for (const m of movers) {
      m.object.position.x -= distance;
      if (m.object.position.x < BEHIND) m.object.position.x += SPAN;
    }
  }

  return {
    sun,
    update,
    dispose() {
      disposables.forEach((d) => d.dispose?.());
    },
  };
}
