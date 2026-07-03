// Декоративная мебель: реальные GLB-модели (столы, стулья, шкафы, бочки...).
// Расстановка сидирована — у обоих игроков мир одинаковый. Взаимодействия нет,
// но предметы физически занимают место (круглые коллайдеры). Меши подгружаются
// асинхронно в заранее расставленные группы, коллайдеры считаются сразу.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();

function rngFactory(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// h — целевая высота, maxFoot — предел габарита по полу (модель ужмётся),
// r — радиус коллайдера после нормализации
export const PROP_DEFS = {
  desk_office:   { h: 0.78, maxFoot: 1.7, r: 0.80 },
  chair_office:  { h: 0.95, r: 0.40 },
  chair_wood:    { h: 0.95, r: 0.38 },
  armchair:      { h: 0.78, r: 0.55 },
  sofa:          { h: 0.80, maxFoot: 2.1, r: 0.90 },
  table_wood:    { h: 0.76, maxFoot: 1.7, r: 0.75 },
  chest:         { h: 0.55, r: 0.50 },
  sideboard:     { h: 1.60, r: 0.55 },
  locker:        { h: 1.95, r: 0.45 },
  bench:         { h: 0.50, maxFoot: 2.0, r: 0.85 },
  crate:         { h: 0.55, r: 0.45 },
  pallet:        { h: 0.16, maxFoot: 1.4, r: 0.65 },
  barrel_rust:   { h: 0.90, r: 0.40 },
  barrel_yellow: { h: 0.90, r: 0.40 },
  barrel_red:    { h: 0.90, r: 0.40 },
  shelf:         { h: 1.90, maxFoot: 2.0, r: 0.85 },
  covered_box:   { h: 0.85, maxFoot: 1.5, r: 0.70 },
  paper_box:     { h: 0.50, maxFoot: 1.4, r: 0.60 },
  sandbag:       { h: 0.35, r: 0.50 },
  tires:         { h: 0.75, r: 0.50 },
  cabinet_metal: { h: 1.85, r: 0.50 },
  locker_double: { h: 1.20, r: 0.50 },
  // интерактивные предметы (world.js)
  item_fusebox:   { h: 2.30, r: 0.4 },
  item_lever:     { h: 0.85, r: 0.3 },
  item_valve:     { h: 1.05, r: 0.4 },
  item_generator: { h: 1.15, r: 0.5 },
  item_key:       { h: 0.32, r: 0.2 },
};

const cache = new Map();

// Промис с нормализованной моделью: масштаб к h, пивот в центре подошвы
export function loadProp(name) {
  if (cache.has(name)) return cache.get(name);
  const def = PROP_DEFS[name];
  const p = loader.loadAsync('/models/props/' + name + '.glb').then(gltf => {
    gltf.scene.traverse(o => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
    });
    const box = new THREE.Box3().setFromObject(gltf.scene);
    let s = def.h / Math.max(0.01, box.max.y - box.min.y);
    const foot = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) * s;
    if (def.maxFoot && foot > def.maxFoot) s *= def.maxFoot / foot;
    return {
      gltf, s,
      off: {
        x: -(box.min.x + box.max.x) / 2 * s,
        y: -box.min.y * s,
        z: -(box.min.z + box.max.z) / 2 * s,
      },
    };
  });
  cache.set(name, p);
  return p;
}

// Группа с пивотом в центре подошвы; меш появится после загрузки.
// opts.cloneMats — свои материалы (для перекраски у интерактивных предметов)
// opts.onReady(model, root) — колбэк после подгрузки
export function spawnProp(name, opts = {}) {
  const g = new THREE.Group();
  loadProp(name).then(({ gltf, s, off }) => {
    const m = gltf.scene.clone();
    m.traverse(o => {
      if (!o.isMesh) return;
      o.userData.shared = true; // геометрия из кэша — world.clear() её не диспозит
      if (opts.cloneMats && o.material) o.material = o.material.clone();
    });
    m.scale.setScalar(s);
    m.position.set(off.x, off.y, off.z);
    g.add(m);
    if (opts.onReady) opts.onReady(m, g);
  }).catch(() => {});
  return g;
}

// ---------- процедурные предметы для уровня FUN (скатерть, подарки) ----------

let MATS = null;
function mats() {
  if (MATS) return MATS;
  MATS = {
    cloth: new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.9 }),
    metalDark: new THREE.MeshStandardMaterial({ color: 0x33363a, roughness: 0.5, metalness: 0.6 }),
  };
  return MATS;
}

function partyTable(m) {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.05, 16), m.cloth);
  top.position.y = 0.76;
  top.castShadow = true;
  g.add(top);
  const cloth = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.52, 0.5, 16, 1, true), m.cloth);
  cloth.position.y = 0.5;
  cloth.material = cloth.material.clone();
  cloth.material.side = THREE.DoubleSide;
  g.add(cloth);
  const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.1), m.metalDark);
  leg.position.y = 0.25;
  g.add(leg);
  return { g, r: 0.65 };
}

function present(rng) {
  const g = new THREE.Group();
  const col = new THREE.Color().setHSL(rng(), 0.7, 0.5);
  const s = 0.35 + rng() * 0.25;
  const bx = new THREE.Mesh(new THREE.BoxGeometry(s, s, s),
    new THREE.MeshStandardMaterial({ color: col, roughness: 0.5 }));
  bx.position.y = s / 2;
  bx.castShadow = true;
  g.add(bx);
  const ribbon = new THREE.MeshStandardMaterial({ color: 0xf0e6c8, roughness: 0.4 });
  for (const [w, d] of [[s + 0.02, 0.07], [0.07, s + 0.02]]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(w, s + 0.02, d), ribbon);
    r.position.y = s / 2;
    g.add(r);
  }
  return { g, r: s * 0.8 };
}

// ---------- наборы по темам: [модель, вес] ----------

const THEME_SETS = {
  yellow: { count: 8, set: [
    ['desk_office', 3], ['chair_office', 3], ['locker', 2], ['paper_box', 2],
  ] },
  warehouse: { count: 28, set: [
    ['shelf', 5], ['barrel_yellow', 3], ['barrel_red', 3], ['crate', 4],
    ['pallet', 4], ['covered_box', 3], ['tires', 2], ['sandbag', 2], ['locker_double', 2],
  ] },
  pipes: { count: 5, set: [
    ['barrel_rust', 4], ['sandbag', 2], ['crate', 2],
  ] },
  pools: { count: 18, set: [
    ['bench', 6], ['barrel_yellow', 3], ['covered_box', 3], ['paper_box', 2],
  ] },
  hotel: { count: 30, set: [
    ['armchair', 6], ['sofa', 4], ['chair_wood', 5], ['table_wood', 5],
    ['chest', 4], ['sideboard', 3],
  ] },
  party: { count: 30, set: [
    ['@partyTable', 8], ['chair_wood', 7], ['@present', 10], ['table_wood', 3],
  ] },
  mall: { count: 20, set: [
    ['shelf', 7], ['paper_box', 4], ['covered_box', 3], ['bench', 3], ['crate', 3],
  ] },
  lightsout: { count: 14, set: [
    ['cabinet_metal', 4], ['locker_double', 3], ['barrel_red', 3], ['crate', 2], ['sandbag', 2],
  ] },
  final: { count: 10, set: [
    ['!chair_wood', 4], ['locker', 3], ['paper_box', 3], // ! — опрокинутый
  ] },
};

function pickWeighted(set, rng) {
  let total = 0;
  for (const [, w] of set) total += w;
  let x = rng() * total;
  for (const [name, w] of set) {
    x -= w;
    if (x <= 0) return name;
  }
  return set[0][0];
}

// Расставляет мебель; возвращает круглые коллайдеры [{x, z, r}]
export function scatterProps(group, theme, grid, cell, seedVal, avoid) {
  const cfg = THEME_SETS[theme];
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

    let name = pickWeighted(cfg.set, rng);
    const overturned = name.startsWith('!');
    if (overturned) name = name.slice(1);

    let g, r;
    if (name === '@partyTable') {
      ({ g, r } = partyTable(m));
    } else if (name === '@present') {
      ({ g, r } = present(rng));
    } else {
      g = spawnProp(name);
      r = PROP_DEFS[name].r;
    }
    g.position.set(x, 0, z);
    g.rotation.y = rng() * Math.PI * 2;
    if (overturned) {
      g.rotation.z = Math.PI / 2;
      g.position.y = PROP_DEFS[name].r * 0.55;
      r *= 1.2;
    }
    group.add(g);
    colliders.push({ x, z, r });
    placed++;
  }
  return colliders;
}
