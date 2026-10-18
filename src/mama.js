// Mama: wrapper, buba and gele, slipper raised. She runs after the player and,
// when she's close, throws her slipper (it whizzes past, just missing).
import * as THREE from 'three';
import { buildCharacter } from './character.js';

const MAMA_STYLE = {
  body: 'female',
  primaryColor: '#e67e22', // buba (blouse)
  secondaryColor: '#7d3c98', // wrapper
  skinColor: '#6b4226',
  hairColor: '#17120f',
  hair: 'short',
  hat: 'none',
  accessory: 'earrings',
};

/** A rubber slipper: a flat sole with a Y strap. */
export function buildSlipper() {
  const g = new THREE.Group();
  const sole = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.14, 4, 12), new THREE.MeshStandardMaterial({ color: '#1f6fb2', roughness: 0.6 }));
  sole.rotation.x = Math.PI / 2;
  sole.scale.set(1.15, 1, 0.28);
  sole.castShadow = true;
  g.add(sole);
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.009, 6, 16, Math.PI), new THREE.MeshStandardMaterial({ color: '#f1f1f1', roughness: 0.5 }));
  strap.position.set(0, 0.012, 0.02);
  strap.rotation.y = Math.PI / 2;
  g.add(strap);
  return g;
}

export function buildMama() {
  const mama = buildCharacter(MAMA_STYLE, { wrapper: true, gele: '#d4a017', scale: 1.08 });
  mama.setMode('chase');
  const handSlipper = buildSlipper();
  handSlipper.position.set(0, -0.06, 0.02);
  handSlipper.rotation.z = Math.PI / 2;
  mama.hands[1].add(handSlipper);

  return {
    ...mama,
    /** Hide the slipper in her hand while one is in the air. */
    setHolding(holding) {
      handSlipper.visible = holding;
    },
  };
}

/**
 * A thrown slipper flying from Mama toward the player, spinning, landing
 * just behind their heels. Returns { mesh, update(dt) -> stillFlying }.
 */
export function throwSlipper(scene, from, to) {
  const mesh = buildSlipper();
  mesh.scale.setScalar(1.3);
  scene.add(mesh);
  const start = from.clone();
  const end = to.clone();
  const duration = 0.75;
  let t = 0;
  return {
    mesh,
    update(dt) {
      t += dt;
      const k = Math.min(1, t / duration);
      mesh.position.lerpVectors(start, end, k);
      mesh.position.y += Math.sin(k * Math.PI) * 1.3; // arc
      mesh.rotation.x += dt * 18;
      mesh.rotation.y += dt * 7;
      if (k >= 1) {
        scene.remove(mesh);
        mesh.traverse((o) => {
          if (o.isMesh) {
            o.geometry.dispose();
            o.material.dispose();
          }
        });
        return false;
      }
      return true;
    },
  };
}
