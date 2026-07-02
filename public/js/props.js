// Декоративная мебель: процедурные столы, стулья, кресла, тумбочки, бочки,
// подарки и т.д. Расстановка сидирована — у обоих игроков мир одинаковый.
// Взаимодействия нет, но предметы физически занимают место (круглые коллайдеры).

import * as THREE from 'three';

function rngFactory(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// общие материалы (создаются один раз)
let MATS = null;
function mats() {
  if (MATS) return MATS;
  MATS = {
    wood: new THREE.MeshStandardMaterial({ color: 0x6a4626, roughness: 0.6 }),
    woodDark: new THREE.MeshStandardMaterial({ color: 0x3a2614, roughness: 0.65 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x5a5e64, roughness: 0.45, metalness: 0.7 }),
    metalDark: new THREE.MeshStandardMaterial({ color: 0x33363a, roughness: 0.5, metalness: 0.6 }),
    fabricRed: new THREE.MeshStandardMaterial({ color: 0x6e2024, roughness: 0.95 }),
    fabricGreen: new THREE.MeshStandardMaterial({ color: 0x2e4e3a, roughness: 0.95 }),
    cloth: new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.9 }),
    plastic: new THREE.MeshStandardMaterial({ color: 0xc9c2b0, roughness: 0.55 }),
    rustyBarrel: new THREE.MeshStandardMaterial({ color: 0x5e3a22, roughness: 0.7, metalness: 0.4 }),
    blueBarrel: new THREE.MeshStandardMaterial({ color: 0x2a4a6e, roughness: 0.55, metalness: 0.3 }),
  };
  return MATS;
}

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

// ---------- предметы ----------

function table(m) {
  const g = new THREE.Group();
  g.add(box(1.4, 0.06, 0.8, m.wood, 0, 0.74, 0));
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
    g.add(box(0.07, 0.74, 0.07, m.woodDark, sx * 0.62, 0.37, sz * 0.33));
  return { g, r: 0.75 };
}

function chair(m, fabric) {
  const g = new THREE.Group();
  g.add(box(0.45, 0.05, 0.45, fabric, 0, 0.46, 0));
  g.add(box(0.45, 0.5, 0.05, fabric, 0, 0.73, -0.2));
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
    g.add(box(0.05, 0.46, 0.05, m.woodDark, sx * 0.18, 0.23, sz * 0.18));
  return { g, r: 0.35 };
}

function armchair(m, fabric) {
  const g = new THREE.Group();
  g.add(box(0.8, 0.35, 0.75, fabric, 0, 0.28, 0));         // основание
  g.add(box(0.8, 0.55, 0.18, fabric, 0, 0.62, -0.3));      // спинка
  g.add(box(0.16, 0.28, 0.6, fabric, -0.34, 0.52, 0.02));  // подлокотники
  g.add(box(0.16, 0.28, 0.6, fabric, 0.34, 0.52, 0.02));
  return { g, r: 0.55 };
}

function nightstand(m) {
  const g = new THREE.Group();
  g.add(box(0.5, 0.55, 0.42, m.wood, 0, 0.33, 0));
  g.add(box(0.4, 0.04, 0.02, m.woodDark, 0, 0.42, 0.22)); // линия ящика
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), m.metal);
  knob.position.set(0, 0.34, 0.23);
  g.add(knob);
  return { g, r: 0.38 };
}

function cabinet(m) {
  const g = new THREE.Group();
  g.add(box(0.55, 1.5, 0.45, m.metalDark, 0, 0.75, 0));
  for (let i = 0; i < 3; i++) g.add(box(0.45, 0.02, 0.02, m.metal, 0, 0.35 + i * 0.45, 0.23));
  return { g, r: 0.42 };
}

function barrel(m, mat) {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.9, 14), mat);
  b.position.y = 0.45;
  b.castShadow = true;
  g.add(b);
  for (const y of [0.15, 0.75]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.325, 0.012, 6, 16), m.metalDark);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    g.add(ring);
  }
  return { g, r: 0.4 };
}

function crate(m) {
  const g = new THREE.Group();
  const s = 0.55;
  g.add(box(s, s, s, m.wood, 0, s / 2, 0));
  g.add(box(s + 0.03, 0.05, 0.05, m.woodDark, 0, s / 2, 0));
  g.add(box(0.05, s + 0.03, 0.05, m.woodDark, 0, s / 2, 0));
  return { g, r: 0.42 };
}

function pallet(m) {
  const g = new THREE.Group();
  for (let i = 0; i < 5; i++) g.add(box(1.1, 0.04, 0.12, m.wood, 0, 0.13, -0.44 + i * 0.22));
  for (const x of [-0.45, 0, 0.45]) g.add(box(0.1, 0.1, 1.0, m.woodDark, x, 0.05, 0));
  return { g, r: 0.6 };
}

function bench(m) {
  const g = new THREE.Group();
  g.add(box(1.5, 0.06, 0.42, m.plastic, 0, 0.42, 0));
  for (const sx of [-1, 1]) g.add(box(0.08, 0.42, 0.4, m.metal, sx * 0.65, 0.21, 0));
  return { g, r: 0.78 };
}

function lounger(m) {
  const g = new THREE.Group();
  const seat = box(0.65, 0.06, 1.5, m.plastic, 0, 0.32, 0);
  g.add(seat);
  const back = box(0.65, 0.06, 0.6, m.plastic, 0, 0.52, -0.95);
  back.rotation.x = -0.6;
  g.add(back);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
    g.add(box(0.06, 0.3, 0.06, m.metal, sx * 0.28, 0.15, sz * 0.65));
  return { g, r: 0.7 };
}

function present(m, rng) {
  const g = new THREE.Group();
  const col = new THREE.Color().setHSL(rng(), 0.7, 0.5);
  const mat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.5 });
  const s = 0.35 + rng() * 0.25;
  g.add(box(s, s, s, mat, 0, s / 2, 0));
  const ribbon = new THREE.MeshStandardMaterial({ color: 0xf0e6c8, roughness: 0.4 });
  g.add(box(s + 0.02, s + 0.02, 0.07, ribbon, 0, s / 2, 0));
  g.add(box(0.07, s + 0.02, s + 0.02, ribbon, 0, s / 2, 0));
  return { g, r: s * 0.8 };
}

function partyTable(m) {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.05, 16), m.cloth);
  top.position.y = 0.76;
  g.add(top);
  // свисающая скатерть
  const cloth = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.52, 0.5, 16, 1, true), m.cloth);
  cloth.position.y = 0.5;
  cloth.material.side = THREE.DoubleSide;
  g.add(cloth);
  g.add(box(0.1, 0.5, 0.1, m.metalDark, 0, 0.25, 0));
  return { g, r: 0.65 };
}

function plant(m) {
  const g = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.14, 0.3, 10), m.fabricRed);
  pot.position.y = 0.15;
  g.add(pot);
  const leavesMat = new THREE.MeshStandardMaterial({ color: 0x2e5e2e, roughness: 0.9 });
  for (let i = 0; i < 4; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.7, 6), leavesMat);
    leaf.position.set(Math.sin(i * 1.7) * 0.07, 0.6 + i * 0.06, Math.cos(i * 1.7) * 0.07);
    leaf.rotation.set(Math.sin(i) * 0.3, 0, Math.cos(i * 2) * 0.3);
    g.add(leaf);
  }
  return { g, r: 0.25 };
}

// ---------- наборы по темам ----------

const THEME_PROPS = {
  yellow: { count: 8, make: (m, rng) => {
    const r = rng();
    if (r < 0.3) return table(m);
    if (r < 0.6) return chair(m, m.plastic);
    if (r < 0.85) return cabinet(m);
    return plant(m);
  } },
  warehouse: { count: 28, make: (m, rng) => {
    const r = rng();
    if (r < 0.4) return barrel(m, m.rustyBarrel);
    if (r < 0.65) return crate(m);
    if (r < 0.85) return pallet(m);
    return cabinet(m);
  } },
  pipes: { count: 5, make: (m, rng) => rng() < 0.7 ? barrel(m, m.rustyBarrel) : crate(m) },
  pools: { count: 18, make: (m, rng) => {
    const r = rng();
    if (r < 0.45) return bench(m);
    if (r < 0.8) return lounger(m);
    return barrel(m, m.blueBarrel);
  } },
  hotel: { count: 30, make: (m, rng) => {
    const r = rng();
    if (r < 0.3) return nightstand(m);
    if (r < 0.55) return armchair(m, m.fabricRed);
    if (r < 0.75) return table(m);
    if (r < 0.9) return plant(m);
    return chair(m, m.fabricGreen);
  } },
  party: { count: 30, make: (m, rng) => {
    const r = rng();
    if (r < 0.3) return partyTable(m);
    if (r < 0.55) return chair(m, m.cloth);
    if (r < 0.9) return present(m, rng);
    return table(m);
  } },
  mall: { count: 20, make: (m, rng) => {
    const r = rng();
    if (r < 0.35) return cabinet(m);   // стеллажи-витрины
    if (r < 0.6) return table(m);      // прилавки
    if (r < 0.8) return crate(m);      // коробки товара
    return bench(m);
  } },
  lightsout: { count: 14, make: (m, rng) => {
    const r = rng();
    if (r < 0.45) return barrel(m, m.rustyBarrel);
    if (r < 0.75) return crate(m);
    return cabinet(m);
  } },
  final: { count: 10, make: (m, rng) => {
    // опрокинутая мебель
    const p = rng() < 0.5 ? chair(m, m.fabricRed) : cabinet(m);
    p.g.rotation.z = Math.PI / 2;
    p.g.position.y = 0.25;
    p.r *= 1.2;
    return p;
  } },
};

// Расставляет мебель; возвращает круглые коллайдеры [{x, z, r}]
export function scatterProps(group, theme, grid, cell, seedVal, avoid) {
  const cfg = THEME_PROPS[theme];
  if (!cfg) return [];
  const rng = rngFactory(seedVal ^ 0x9e3779b9);
  const m = mats();
  const colliders = [];
  let placed = 0;
  for (let tries = 0; tries < 600 && placed < cfg.count; tries++) {
    const gx = 1 + Math.floor(rng() * (grid.w - 2));
    const gz = 1 + Math.floor(rng() * (grid.h - 2));
    if (grid.cells[gz * grid.w + gx] !== 0) continue; // только пол (не вода)
    const x = (gx + 0.5) * cell + (rng() - 0.5) * 0.7;
    const z = (gz + 0.5) * cell + (rng() - 0.5) * 0.7;
    let ok = true;
    for (const a of avoid) {
      const d = Math.hypot(a.x - x, a.z - z);
      if (d < a.r) { ok = false; break; }
    }
    if (!ok) continue;
    for (const c of colliders) {
      if (Math.hypot(c.x - x, c.z - z) < c.r + 1.0) { ok = false; break; }
    }
    if (!ok) continue;
    const prop = cfg.make(m, rng);
    prop.g.position.x = x;
    prop.g.position.z = z;
    prop.g.rotation.y = rng() * Math.PI * 2;
    group.add(prop.g);
    colliders.push({ x, z, r: prop.r });
    placed++;
  }
  return colliders;
}
