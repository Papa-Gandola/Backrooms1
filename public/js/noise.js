// Бесшовный value-noise / fbm для генерации PBR-текстур.

const PERM = new Uint8Array(512);
{
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  let s = 1337;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
}

function latticeHash(x, y, period) {
  const xi = ((x % period) + period) % period;
  const yi = ((y % period) + period) % period;
  return PERM[(PERM[xi & 255] + yi) & 255] / 255;
}

function smooth(t) { return t * t * (3 - 2 * t); }

// Бесшовный value noise: координаты u,v в [0,1), scale — число ячеек на текстуру
export function vnoise(u, v, scale) {
  const x = u * scale, y = v * scale;
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = smooth(x - x0), fy = smooth(y - y0);
  const a = latticeHash(x0, y0, scale);
  const b = latticeHash(x0 + 1, y0, scale);
  const c = latticeHash(x0, y0 + 1, scale);
  const d = latticeHash(x0 + 1, y0 + 1, scale);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

// Бесшовный fbm
export function fbm(u, v, scale, octaves = 5, gain = 0.5, lac = 2) {
  let amp = 1, sum = 0, norm = 0, sc = scale;
  for (let o = 0; o < octaves; o++) {
    sum += vnoise(u, v, sc) * amp;
    norm += amp;
    amp *= gain;
    sc = Math.round(sc * lac);
  }
  return sum / norm;
}

// «Хребтовый» шум для прожилок/трещин
export function ridged(u, v, scale, octaves = 4) {
  let amp = 1, sum = 0, norm = 0, sc = scale;
  for (let o = 0; o < octaves; o++) {
    sum += (1 - Math.abs(vnoise(u, v, sc) * 2 - 1)) * amp;
    norm += amp;
    amp *= 0.5;
    sc = Math.round(sc * 2);
  }
  return sum / norm;
}

// Worley-подобные «пятна» (расстояние до случайных точек), бесшовно
export function spots(u, v, count, seed = 7) {
  let minD = 10;
  for (let i = 0; i < count; i++) {
    const px = latticeHash(i * 13 + seed, i * 7 + seed * 3, 256);
    const py = latticeHash(i * 29 + seed * 5, i * 17 + seed, 256);
    let dx = Math.abs(u - px); if (dx > 0.5) dx = 1 - dx;
    let dy = Math.abs(v - py); if (dy > 0.5) dy = 1 - dy;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < minD) minD = d;
  }
  return minD;
}

export function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
export function mix(a, b, t) { return a + (b - a) * t; }
