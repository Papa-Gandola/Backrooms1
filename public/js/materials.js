// Процедурный PBR-генератор: каждая поверхность получает diffuse + normal + roughness,
// с запечёнными потёками, швами, трещинами и затемнением в углублениях.

import * as THREE from 'three';
import { vnoise, fbm, ridged, spots, clamp01, mix } from './noise.js';

// ---------- базовый бейкер ----------
// fn(u, v, out): заполняет out.h (высота 0..1), out.r/g/b (0..255), out.rough (0..1)

function bake(size, fn, normalStrength = 1.5) {
  const n = size * size;
  const H = new Float32Array(n);
  const C = new Uint8ClampedArray(n * 4);
  const R = new Uint8ClampedArray(n * 4);
  const out = { h: 0, r: 0, g: 0, b: 0, rough: 0.9 };

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      fn(u, v, out);
      const i = y * size + x;
      H[i] = out.h;
      C[i * 4] = out.r; C[i * 4 + 1] = out.g; C[i * 4 + 2] = out.b; C[i * 4 + 3] = 255;
      const rr = clamp01(out.rough) * 255;
      R[i * 4] = rr; R[i * 4 + 1] = rr; R[i * 4 + 2] = rr; R[i * 4 + 3] = 255;
    }
  }

  // нормали из высот (с заворачиванием) + полостное затемнение в diffuse
  const N = new Uint8ClampedArray(n * 4);
  const at = (x, y) => H[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const dx = (at(x - 1, y) - at(x + 1, y)) * normalStrength;
      const dy = (at(x, y - 1) - at(x, y + 1)) * normalStrength;
      const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      N[i * 4] = (dx * inv * 0.5 + 0.5) * 255;
      N[i * 4 + 1] = (dy * inv * 0.5 + 0.5) * 255;
      N[i * 4 + 2] = inv * 255;
      N[i * 4 + 3] = 255;
      // лёгкое запекание AO: углубления темнее
      const avg = (at(x - 2, y) + at(x + 2, y) + at(x, y - 2) + at(x, y + 2)) * 0.25;
      const cavity = clamp01((avg - H[i]) * 2.2);
      const k = 1 - cavity * 0.45;
      C[i * 4] *= k; C[i * 4 + 1] *= k; C[i * 4 + 2] *= k;
    }
  }

  const tex = (data, srgb) => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    cv.getContext('2d').putImageData(new ImageData(data, size, size), 0, 0);
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  };
  return { map: tex(C, true), normalMap: tex(N, false), roughnessMap: tex(R, false) };
}

function std(maps, opts = {}) {
  const m = new THREE.MeshStandardMaterial({
    map: maps.map, normalMap: maps.normalMap, roughnessMap: maps.roughnessMap,
    roughness: 1.0, ...opts,
  });
  return m;
}

function setRepeat(mat, rx, ry) {
  for (const t of [mat.map, mat.normalMap, mat.roughnessMap]) {
    if (t) t.repeat.set(rx, ry);
  }
  return mat;
}

// резкий порог с мягкой кромкой
function step(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

// ---------- поверхности ----------

function wallpaper() {
  const colCache = new Map();
  const colOf = (u) => {
    let c = colCache.get(u);
    if (c === undefined) { c = Math.pow(fbm(u, 0.0, 48, 3), 3.5); colCache.set(u, c); }
    return c;
  };
  return bake(512, (u, v, o) => {
    // полосы обоев двух тонов
    const stripe = 0.5 + 0.5 * Math.sin(u * Math.PI * 2 * 14);
    const sMask = step(0.35, 0.65, stripe);
    const mottle = fbm(u, v, 6, 4);
    const grain = fbm(u, v, 96, 3);
    // потёки сверху: тёмные колонны, затухающие вниз
    const drip = colOf(u) * step(1.0, 0.35, v) * 1.6;
    // общая грязь по низу
    const lowGrime = step(0.75, 1.0, v) * 0.35 * (0.5 + mottle);
    const age = clamp01(drip + lowGrime + Math.pow(fbm(u + 0.31, v + 0.7, 5, 4), 3) * 0.8);

    let r = 200, g = 176, b = 86;
    const tone = mix(0.9, 1.06, sMask) * mix(0.86, 1.1, mottle) * mix(1, 0.92, grain);
    r *= tone; g *= tone; b *= tone * 0.96;
    r = mix(r, 58, age * 0.6); g = mix(g, 47, age * 0.6); b = mix(b, 22, age * 0.6);
    o.r = r; o.g = g; o.b = b;
    o.h = 0.5 + (sMask - 0.5) * 0.08 + grain * 0.12 + mottle * 0.05 - age * 0.1;
    o.rough = 0.93 - age * 0.25 + grain * 0.05;
  }, 1.1);
}

function carpet() {
  return bake(384, (u, v, o) => {
    const fiber = vnoise(u, v, 220) * 0.6 + vnoise(u + 0.5, v + 0.5, 110) * 0.4;
    const patch = fbm(u, v, 5, 4);
    const blotch = 1 - step(0.06, 0.22, spots(u, v, 7, 11)); // влажные пятна
    const dirt = Math.pow(fbm(u + 0.2, v + 0.8, 8, 4), 2.4);

    let r = 141, g = 117, b = 53;
    const tone = mix(0.8, 1.12, fiber) * mix(0.85, 1.05, patch);
    r *= tone; g *= tone; b *= tone;
    r = mix(r, 38, blotch * 0.7 + dirt * 0.5);
    g = mix(g, 30, blotch * 0.7 + dirt * 0.5);
    b = mix(b, 12, blotch * 0.7 + dirt * 0.5);
    o.r = r; o.g = g; o.b = b;
    o.h = fiber * 0.55 + patch * 0.25 - blotch * 0.2;
    o.rough = 0.97 - blotch * 0.45;
  }, 1.4);
}

function ceilingTiles() {
  return bake(384, (u, v, o) => {
    const gx = u * 4, gy = v * 4;
    const fx = gx - Math.floor(gx), fy = gy - Math.floor(gy);
    const edge = Math.min(fx, 1 - fx, fy, 1 - fy);
    const grout = 1 - step(0.015, 0.05, edge);
    const grain = fbm(u, v, 64, 3);
    // ржавые разводы от воды
    const stain = Math.pow(fbm(u + 0.6, v + 0.1, 4, 4), 2.6) * 1.5;

    let r = 208, g = 199, b = 168;
    const tone = mix(0.92, 1.05, grain);
    r *= tone; g *= tone; b *= tone;
    r = mix(r, 122, clamp01(stain)); g = mix(g, 88, clamp01(stain)); b = mix(b, 42, clamp01(stain));
    r = mix(r, 60, grout * 0.8); g = mix(g, 56, grout * 0.8); b = mix(b, 48, grout * 0.8);
    o.r = r; o.g = g; o.b = b;
    o.h = 0.6 - grout * 0.5 + grain * 0.1 - stain * 0.05;
    o.rough = 0.95;
  }, 1.6);
}

function concrete() {
  return bake(384, (u, v, o) => {
    const patch = fbm(u, v, 5, 5);
    const grain = fbm(u + 0.4, v + 0.9, 80, 3);
    const crack = step(0.86, 0.97, ridged(u, v, 5, 4)) * step(0.45, 0.55, fbm(u, v, 9, 2));
    const oil = 1 - step(0.05, 0.16, spots(u, v, 5, 23));

    let c = 86 * mix(0.75, 1.2, patch) * mix(0.9, 1.08, grain);
    let r = c, g = c, b = c * 1.06;
    r = mix(r, 22, crack); g = mix(g, 22, crack); b = mix(b, 24, crack);
    r = mix(r, 26, oil * 0.8); g = mix(g, 25, oil * 0.8); b = mix(b, 24, oil * 0.8);
    o.r = r; o.g = g; o.b = b;
    o.h = 0.5 + patch * 0.2 + grain * 0.12 - crack * 0.45 - oil * 0.06;
    o.rough = 0.92 - oil * 0.5 + grain * 0.06;
  }, 1.7);
}

function corrugatedMetal() {
  const colCache = new Map();
  const colOf = (u) => {
    let c = colCache.get(u);
    if (c === undefined) { c = Math.pow(fbm(u, 0.0, 36, 3), 3); colCache.set(u, c); }
    return c;
  };
  return bake(384, (u, v, o) => {
    // гофрированные рёбра
    const wave = Math.abs(Math.sin(u * Math.PI * 18));
    const ridge = Math.pow(wave, 0.6);
    const scratches = step(0.93, 1.0, vnoise(u * 0.3 + 0.7, v, 180));
    // ржавые потёки сверху
    const rust = clamp01(colOf(u) * step(1.0, 0.25, v) * 2 + Math.pow(fbm(u + 0.8, v + 0.3, 7, 4), 3.2) * 1.4);

    let r = 62, g = 67, b = 74;
    const tone = mix(0.7, 1.15, ridge);
    r *= tone; g *= tone; b *= tone;
    r = mix(r, 96, rust); g = mix(g, 56, rust); b = mix(b, 28, rust);
    r = mix(r, 150, scratches * 0.5); g = mix(g, 150, scratches * 0.5); b = mix(b, 152, scratches * 0.5);
    o.r = r; o.g = g; o.b = b;
    o.h = ridge * 0.85 + fbm(u, v, 40, 2) * 0.1;
    o.rough = mix(0.5, 0.92, rust) + scratches * -0.2;
  }, 2.2);
}

function rustPlates() {
  return bake(384, (u, v, o) => {
    // листы с заклёпками
    const gx = u * 3, gy = v * 3;
    const fx = gx - Math.floor(gx), fy = gy - Math.floor(gy);
    const seam = 1 - step(0.01, 0.04, Math.min(fx, 1 - fx, fy, 1 - fy));
    // заклёпки по периметру листов
    const rs = 12;
    const rx = (u * rs) - Math.floor(u * rs) - 0.5;
    const ry = (v * rs) - Math.floor(v * rs) - 0.5;
    const nearSeam = Math.min(fx, 1 - fx, fy, 1 - fy) < 0.1;
    const rivet = nearSeam ? 1 - step(0.1, 0.2, Math.sqrt(rx * rx + ry * ry)) : 0;

    const deep = fbm(u, v, 5, 5);
    const flake = ridged(u + 0.3, v + 0.6, 14, 3);
    const rust = clamp01(Math.pow(deep, 1.4) + flake * 0.35);

    let r = mix(38, 132, rust), g = mix(30, 70, rust), b = mix(26, 34, rust);
    const hl = step(0.78, 0.95, flake);
    r = mix(r, 190, hl * 0.4); g = mix(g, 120, hl * 0.4); b = mix(b, 60, hl * 0.4);
    r = mix(r, 18, seam); g = mix(g, 16, seam); b = mix(b, 14, seam);
    r = mix(r, 70, rivet); g = mix(g, 48, rivet); b = mix(b, 30, rivet);
    o.r = r; o.g = g; o.b = b;
    o.h = 0.5 + flake * 0.3 - seam * 0.4 + rivet * 0.5 + deep * 0.1;
    o.rough = mix(0.6, 0.95, rust);
  }, 2.0);
}

function whiteTiles() {
  return bake(512, (u, v, o) => {
    const T = 8;
    const gx = u * T, gy = v * T;
    const tx = Math.floor(gx), ty = Math.floor(gy);
    const fx = gx - tx, fy = gy - ty;
    const edge = Math.min(fx, 1 - fx, fy, 1 - fy);
    const grout = 1 - step(0.02, 0.06, edge);
    const tileHash = vnoise((tx + 0.5) / T, (ty + 0.5) / T, T);
    const grain = fbm(u, v, 90, 3);
    const grime = Math.pow(fbm(u + 0.5, v + 0.2, 6, 4), 3) * 1.2 + grout * 0.3;

    let r = 212, g = 222, b = 218;
    const tone = mix(0.95, 1.04, tileHash) * mix(0.97, 1.02, grain);
    r *= tone; g *= tone; b *= tone * 1.01;
    r = mix(r, 96, clamp01(grime) * 0.6); g = mix(g, 116, clamp01(grime) * 0.6); b = mix(b, 110, clamp01(grime) * 0.6);
    r = mix(r, 118, grout); g = mix(g, 126, grout); b = mix(b, 122, grout);
    o.r = r; o.g = g; o.b = b;
    o.h = 0.62 - grout * 0.55 + grain * 0.03 + tileHash * 0.04;
    o.rough = 0.18 + grime * 0.5 + grout * 0.5;
  }, 1.8);
}

function officeWall() {
  return bake(384, (u, v, o) => {
    const base = fbm(u, v, 6, 4);
    // ободранные участки до штукатурки
    const torn = step(0.62, 0.7, fbm(u + 0.15, v + 0.45, 4, 4));
    // следы когтей: косые тройные борозды
    const cu = u * 7 + v * 2.4;
    const clawLine = Math.abs(Math.sin(cu * Math.PI * 3));
    const clawMask = 1 - step(0.05, 0.18, spots(u, v, 6, 31));
    const claw = step(0.88, 0.97, clawLine) * clawMask;

    let r = 46, g = 22, b = 26;
    const tone = mix(0.7, 1.2, base);
    r *= tone; g *= tone; b *= tone;
    r = mix(r, 122, torn); g = mix(g, 104, torn); b = mix(b, 84, torn);
    r = mix(r, 14, claw); g = mix(g, 8, claw); b = mix(b, 9, claw);
    o.r = r; o.g = g; o.b = b;
    o.h = 0.5 + base * 0.15 - torn * 0.25 - claw * 0.4;
    o.rough = 0.9 - torn * 0.15;
  }, 1.6);
}

function darkCarpet() {
  return bake(384, (u, v, o) => {
    const fiber = vnoise(u, v, 200);
    const patch = fbm(u, v, 6, 4);
    const stain = Math.pow(fbm(u + 0.7, v + 0.4, 5, 4), 2.6) * 1.4;
    let r = 44, g = 30, b = 32;
    const tone = mix(0.8, 1.15, fiber) * mix(0.9, 1.05, patch);
    r *= tone; g *= tone; b *= tone;
    r = mix(r, 14, clamp01(stain)); g = mix(g, 6, clamp01(stain)); b = mix(b, 7, clamp01(stain));
    o.r = r; o.g = g; o.b = b;
    o.h = fiber * 0.5 + patch * 0.2;
    o.rough = 0.97 - stain * 0.3;
  }, 1.2);
}

// нормали воды (используется как скроллящийся normalMap)
export function waterNormalTexture() {
  const maps = bake(256, (u, v, o) => {
    o.h = fbm(u, v, 6, 4) * 0.6 + fbm(u + 0.37, v + 0.61, 12, 3) * 0.4;
    o.r = o.g = o.b = 128;
    o.rough = 0.1;
  }, 2.6);
  maps.map.dispose(); maps.roughnessMap.dispose();
  return maps.normalMap;
}

// ---------- плоть и ткань для сущностей ----------

export function fleshMaterial(base, veinTint, wet = 0.4) {
  const br = (base >> 16) & 255, bg = (base >> 8) & 255, bb = base & 255;
  const vr = (veinTint >> 16) & 255, vg = (veinTint >> 8) & 255, vb = veinTint & 255;
  const maps = bake(256, (u, v, o) => {
    const mottle = fbm(u, v, 8, 4);
    const pores = vnoise(u, v, 160);
    const veins = step(0.82, 0.95, ridged(u, v, 7, 4));
    let r = br * mix(0.75, 1.2, mottle), g = bg * mix(0.75, 1.2, mottle), b = bb * mix(0.75, 1.2, mottle);
    r = mix(r, vr, veins * 0.7); g = mix(g, vg, veins * 0.7); b = mix(b, vb, veins * 0.7);
    o.r = r; o.g = g; o.b = b;
    o.h = 0.5 + mottle * 0.3 + pores * 0.15 - veins * 0.25;
    o.rough = wet + mottle * 0.25;
  }, 2.0);
  return std(maps);
}

export function clothMaterial(base) {
  const br = (base >> 16) & 255, bg = (base >> 8) & 255, bb = base & 255;
  const maps = bake(256, (u, v, o) => {
    const weave = (vnoise(u, v, 110) + Math.abs(Math.sin(u * 400)) * 0.2 + Math.abs(Math.sin(v * 400)) * 0.2) / 1.4;
    const folds = fbm(u, v, 5, 4);
    const tone = mix(0.7, 1.25, folds) * mix(0.9, 1.08, weave);
    o.r = br * tone; o.g = bg * tone; o.b = bb * tone;
    o.h = folds * 0.7 + weave * 0.3;
    o.rough = 0.95;
  }, 1.8);
  return std(maps);
}

// искажение геометрии шумом — узловатая органика вместо гладких капсул
export function gnarl(geometry, amp = 0.03, freq = 9, seed = 0) {
  const pos = geometry.attributes.position;
  const nrm = geometry.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = Math.sin(x * freq + seed) * Math.cos(y * freq * 1.3 + seed * 2) +
              Math.sin(z * freq * 0.8 + y * freq + seed) * 0.6;
    const d = n * 0.4 * amp + (vnoise((x + 10) * 0.13, (y + z) * 0.13, 64) - 0.5) * amp;
    pos.setXYZ(i, x + nrm.getX(i) * d, y + nrm.getY(i) * d, z + nrm.getZ(i) * d);
  }
  geometry.computeVertexNormals();
  return geometry;
}

// ---------- темы уровней ----------

const cache = new Map();

export function themeMaterials(theme) {
  if (cache.has(theme)) return cache.get(theme);
  let m;
  if (theme === 'yellow') {
    m = {
      wall: setRepeat(std(wallpaper()), 1, 1),
      floor: setRepeat(std(carpet()), 22, 22),
      ceiling: setRepeat(std(ceilingTiles()), 22, 22),
      trim: new THREE.MeshStandardMaterial({ color: 0x6e5e2e, roughness: 0.7 }),
      lightColor: new THREE.Color(0xfff2b8),
      lightIntensity: 26,
    };
  } else if (theme === 'warehouse') {
    m = {
      wall: setRepeat(std(corrugatedMetal(), { metalness: 0.55 }), 1, 1.6),
      floor: setRepeat(std(concrete()), 16, 16),
      ceiling: new THREE.MeshStandardMaterial({ color: 0x16181c, roughness: 0.9 }),
      trim: new THREE.MeshStandardMaterial({ color: 0x22262c, roughness: 0.6, metalness: 0.5 }),
      lightColor: new THREE.Color(0xbfd4ff),
      lightIntensity: 7,
    };
  } else if (theme === 'pipes') {
    const rust = std(rustPlates(), { metalness: 0.45 });
    m = {
      wall: setRepeat(rust, 1, 1),
      floor: setRepeat(std(rustPlates(), { metalness: 0.45 }), 14, 14),
      ceiling: setRepeat(rust.clone(), 14, 14),
      trim: new THREE.MeshStandardMaterial({ color: 0x3a2618, roughness: 0.6, metalness: 0.6 }),
      lightColor: new THREE.Color(0xffb46b),
      lightIntensity: 9,
    };
  } else if (theme === 'pools') {
    m = {
      wall: setRepeat(std(whiteTiles()), 1, 1),
      floor: setRepeat(std(whiteTiles()), 18, 18),
      ceiling: setRepeat(std(whiteTiles()), 18, 18),
      trim: new THREE.MeshStandardMaterial({ color: 0x9fb4ae, roughness: 0.3 }),
      lightColor: new THREE.Color(0xd8f4f0),
      lightIntensity: 26,
    };
  } else {
    m = {
      wall: setRepeat(std(officeWall()), 1, 1),
      floor: setRepeat(std(darkCarpet()), 18, 18),
      ceiling: new THREE.MeshStandardMaterial({ color: 0x0d0608, roughness: 0.95 }),
      trim: new THREE.MeshStandardMaterial({ color: 0x1a0d10, roughness: 0.8 }),
      lightColor: new THREE.Color(0xff2a1a),
      lightIntensity: 8,
    };
  }
  cache.set(theme, m);
  return m;
}
