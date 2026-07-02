// Генерация уровней. Вся карта создаётся на сервере и отправляется обоим клиентам,
// чтобы лабиринт был одинаковым у двух игроков.

'use strict';

const CELL = 2; // размер клетки в метрах

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FLOOR = 0, WALL = 1, WATER = 2;

class Grid {
  constructor(w, h, fill = WALL) {
    this.w = w; this.h = h;
    this.cells = new Uint8Array(w * h).fill(fill);
  }
  get(x, z) {
    if (x < 0 || z < 0 || x >= this.w || z >= this.h) return WALL;
    return this.cells[z * this.w + x];
  }
  set(x, z, v) {
    if (x < 0 || z < 0 || x >= this.w || z >= this.h) return;
    this.cells[z * this.w + x] = v;
  }
  rect(x0, z0, x1, z1, v) {
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) this.set(x, z, v);
  }
  isWalkable(x, z) { const c = this.get(x, z); return c === FLOOR || c === WATER; }
}

function toWorld(gx, gz) { return { x: (gx + 0.5) * CELL, z: (gz + 0.5) * CELL }; }

// Поиск самой дальней проходимой клетки от точки (BFS) — для размещения предметов
function bfsDistances(grid, sx, sz) {
  const dist = new Int32Array(grid.w * grid.h).fill(-1);
  const q = [[sx, sz]];
  dist[sz * grid.w + sx] = 0;
  for (let i = 0; i < q.length; i++) {
    const [x, z] = q[i];
    const d = dist[z * grid.w + x];
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      if (grid.isWalkable(nx, nz) && dist[nz * grid.w + nx] === -1) {
        dist[nz * grid.w + nx] = d + 1;
        q.push([nx, nz]);
      }
    }
  }
  return dist;
}

function farthestCell(grid, sx, sz) {
  const dist = bfsDistances(grid, sx, sz);
  let best = { x: sx, z: sz, d: 0 };
  for (let z = 0; z < grid.h; z++) for (let x = 0; x < grid.w; x++) {
    const d = dist[z * grid.w + x];
    if (d > best.d) best = { x, z, d };
  }
  return best;
}

// Клетки на заданном минимальном расстоянии (по BFS) от точки
function cellsBeyond(grid, sx, sz, minD) {
  const dist = bfsDistances(grid, sx, sz);
  const out = [];
  for (let z = 0; z < grid.h; z++) for (let x = 0; x < grid.w; x++) {
    if (dist[z * grid.w + x] >= minD) out.push({ x, z, d: dist[z * grid.w + x] });
  }
  return out;
}

function ensureConnected(grid, sx, sz) {
  // Пробивает стены, пока все проходимые клетки не соединятся со spawn
  for (let guard = 0; guard < 200; guard++) {
    const dist = bfsDistances(grid, sx, sz);
    let fixed = true;
    for (let z = 1; z < grid.h - 1 && fixed; z++) for (let x = 1; x < grid.w - 1; x++) {
      if (grid.isWalkable(x, z) && dist[z * grid.w + x] === -1) {
        // ищем соседнюю стену рядом с достижимой клеткой
        outer:
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const wx = x + dx, wz = z + dz;
          if (grid.get(wx, wz) === WALL) {
            const fx = wx + dx, fz = wz + dz;
            if (grid.isWalkable(fx, fz) && dist[fz * grid.w + fx] !== -1) {
              grid.set(wx, wz, FLOOR);
              fixed = false;
              break outer;
            }
          }
        }
        if (!fixed) break;
      }
    }
    if (fixed) return;
  }
}

// ---------- генераторы планировок ----------

// Классические «комнаты» бэкрумс: сетка комнат со случайными проёмами и колоннами
function genRoomMaze(rng, w, h, roomSize, openness, pillarChance) {
  const g = new Grid(w, h, FLOOR);
  // внешние стены
  g.rect(0, 0, w - 1, 0, WALL); g.rect(0, h - 1, w - 1, h - 1, WALL);
  g.rect(0, 0, 0, h - 1, WALL); g.rect(w - 1, 0, w - 1, h - 1, WALL);
  // внутренние стены сетки комнат
  for (let z = roomSize; z < h - 1; z += roomSize) for (let x = 1; x < w - 1; x++) g.set(x, z, WALL);
  for (let x = roomSize; x < w - 1; x += roomSize) for (let z = 1; z < h - 1; z++) g.set(x, z, WALL);
  // проёмы между комнатами
  for (let z = roomSize; z < h - 1; z += roomSize) {
    for (let x = 0; x < w - 1; x += roomSize) {
      if (rng() < openness) {
        const ox = x + 1 + Math.floor(rng() * (roomSize - 2));
        g.set(Math.min(ox, w - 2), z, FLOOR);
        if (rng() < 0.5) g.set(Math.min(ox + 1, w - 2), z, FLOOR);
      }
    }
  }
  for (let x = roomSize; x < w - 1; x += roomSize) {
    for (let z = 0; z < h - 1; z += roomSize) {
      if (rng() < openness) {
        const oz = z + 1 + Math.floor(rng() * (roomSize - 2));
        g.set(x, Math.min(oz, h - 2), FLOOR);
        if (rng() < 0.5) g.set(x, Math.min(oz + 1, h - 2), FLOOR);
      }
    }
  }
  // колонны внутри комнат
  for (let z = 2; z < h - 2; z++) for (let x = 2; x < w - 2; x++) {
    if (g.get(x, z) === FLOOR && rng() < pillarChance) {
      let nearWall = false;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
        if (g.get(x + dx, z + dz) === WALL) nearWall = true;
      if (!nearWall) g.set(x, z, WALL);
    }
  }
  return g;
}

// Узкий лабиринт (recursive backtracker) — для уровня труб
function genNarrowMaze(rng, cw, ch) {
  const w = cw * 2 + 1, h = ch * 2 + 1;
  const g = new Grid(w, h, WALL);
  const visited = new Uint8Array(cw * ch);
  const stack = [[0, 0]];
  visited[0] = 1;
  g.set(1, 1, FLOOR);
  while (stack.length) {
    const [cx, cz] = stack[stack.length - 1];
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].sort(() => rng() - 0.5);
    let moved = false;
    for (const [dx, dz] of dirs) {
      const nx = cx + dx, nz = cz + dz;
      if (nx >= 0 && nz >= 0 && nx < cw && nz < ch && !visited[nz * cw + nx]) {
        visited[nz * cw + nx] = 1;
        g.set(nx * 2 + 1, nz * 2 + 1, FLOOR);
        g.set(cx * 2 + 1 + dx, cz * 2 + 1 + dz, FLOOR);
        stack.push([nx, nz]);
        moved = true;
        break;
      }
    }
    if (!moved) stack.pop();
  }
  // немного петель, чтобы было куда убегать
  for (let i = 0; i < cw * ch * 0.08; i++) {
    const x = 2 + Math.floor(rng() * (w - 4));
    const z = 2 + Math.floor(rng() * (h - 4));
    if (g.get(x, z) === WALL && g.isWalkable(x - 1, z) && g.isWalkable(x + 1, z)) g.set(x, z, FLOOR);
  }
  return g;
}

// Открытый склад с ящиками и стеллажами
function genWarehouse(rng, w, h) {
  const g = new Grid(w, h, FLOOR);
  g.rect(0, 0, w - 1, 0, WALL); g.rect(0, h - 1, w - 1, h - 1, WALL);
  g.rect(0, 0, 0, h - 1, WALL); g.rect(w - 1, 0, w - 1, h - 1, WALL);
  // ряды стеллажей
  for (let z = 5; z < h - 6; z += 7) {
    let x = 3;
    while (x < w - 4) {
      const len = 3 + Math.floor(rng() * 5);
      if (rng() < 0.8) g.rect(x, z, Math.min(x + len, w - 4), z + (rng() < 0.4 ? 1 : 0), WALL);
      x += len + 2 + Math.floor(rng() * 3);
    }
  }
  // кучи ящиков
  for (let i = 0; i < 26; i++) {
    const x = 2 + Math.floor(rng() * (w - 6));
    const z = 2 + Math.floor(rng() * (h - 6));
    const s = rng() < 0.6 ? 1 : 2;
    g.rect(x, z, x + s - 1, z + s - 1, WALL);
  }
  return g;
}

// Бассейны: большие залы, часть пола — вода
function genPools(rng, w, h) {
  const g = genRoomMaze(rng, w, h, 8, 0.85, 0.015);
  // водные бассейны в случайных комнатах
  for (let rz = 0; rz < Math.floor(h / 8); rz++) for (let rx = 0; rx < Math.floor(w / 8); rx++) {
    if (rng() < 0.45) {
      const x0 = rx * 8 + 2, z0 = rz * 8 + 2;
      for (let z = z0; z < z0 + 5; z++) for (let x = x0; x < x0 + 5; x++) {
        if (g.get(x, z) === FLOOR) g.set(x, z, WATER);
      }
    }
  }
  return g;
}

// Отель: сетка коридоров, по сторонам — номера с узкими дверями
function genHotel(rng, w, h) {
  const g = new Grid(w, h, WALL);
  const corrZ = [], corrX = [];
  for (let z = 3; z < h - 3; z += 8) corrZ.push(z);
  for (let x = 3; x < w - 3; x += 10) corrX.push(x);
  for (const z of corrZ) for (let x = 1; x < w - 1; x++) g.set(x, z, FLOOR);
  for (const x of corrX) for (let z = 1; z < h - 1; z++) g.set(x, z, FLOOR);
  // номера над и под горизонтальными коридорами
  for (const z of corrZ) {
    for (let x = 2; x < w - 5; x += 5) {
      for (const side of [-1, 1]) {
        const rz = z + side * 2;
        if (rz < 1 || rz + 2 > h - 1) continue;
        if (rng() < 0.75) {
          // комната 3x3
          for (let dz = 0; dz < 3; dz++) for (let dx = 0; dx < 3; dx++) {
            const cz = z + side * (2 + dz);
            if (cz > 0 && cz < h - 1) g.set(x + dx, cz, FLOOR);
          }
          g.set(x + 1, z + side, FLOOR); // дверной проём
        }
      }
    }
  }
  return g;
}

// Праздничные залы: большие комнаты с широкими проёмами
function genParty(rng, w, h) {
  return genRoomMaze(rng, w, h, 8, 0.8, 0.012);
}

// Финальный коридор
function genFinal(rng, len) {
  const w = len, h = 11;
  const g = new Grid(w, h, WALL);
  g.rect(1, 4, w - 2, 6, FLOOR); // основной коридор
  // боковые ниши и ответвления
  for (let x = 5; x < w - 5; x += 4 + Math.floor(rng() * 4)) {
    const side = rng() < 0.5 ? -1 : 1;
    const depth = 1 + Math.floor(rng() * 2);
    for (let d = 1; d <= depth; d++) g.set(x, 5 + side * (1 + d), FLOOR);
    g.set(x, 5 + side, FLOOR);
  }
  return g;
}

// ---------- размещение света ----------

function placeLights(rng, grid, spacing, jitter, brokenChance) {
  const lights = [];
  for (let z = 2; z < grid.h - 2; z += spacing) {
    for (let x = 2; x < grid.w - 2; x += spacing) {
      const ox = x + Math.floor((rng() - 0.5) * jitter);
      const oz = z + Math.floor((rng() - 0.5) * jitter);
      if (grid.isWalkable(ox, oz)) {
        const p = toWorld(ox, oz);
        lights.push({ x: p.x, z: p.z, broken: rng() < brokenChance, flicker: rng() < 0.35 });
      }
    }
  }
  return lights;
}

function pickSpread(rng, cands, count, minSep) {
  // выбирает count клеток, разнесённых минимум на minSep (по манхэттену)
  const picked = [];
  const pool = cands.slice().sort(() => rng() - 0.5);
  for (const c of pool) {
    if (picked.every(p => Math.abs(p.x - c.x) + Math.abs(p.z - c.z) >= minSep)) {
      picked.push(c);
      if (picked.length >= count) break;
    }
  }
  // добор без дублей: раньше могли положить два предмета в одну клетку,
  // и один из них было не найти
  if (picked.length < count) {
    for (const c of pool) {
      if (picked.length >= count) break;
      if (!picked.some(p => p.x === c.x && p.z === c.z)) picked.push(c);
    }
  }
  return picked;
}

// ---------- сборка уровней ----------

const GLYPHS = ['◆', '✶', '☾', '♁', '✠', '∞', 'Ψ', '⌀'];

function genLevel(index, seed) {
  const rng = mulberry32(seed + index * 7919);
  let grid, level;

  if (index === 0) {
    // УРОВЕНЬ 0 — Жёлтые комнаты. Сущность: Скиталец (идёт на звук).
    grid = genRoomMaze(rng, 46, 46, 6, 0.55, 0.03);
    const spawn = findSpawn(grid, rng);
    ensureConnected(grid, spawn.gx, spawn.gz);
    const far = farthestCell(grid, spawn.gx, spawn.gz);
    const exit = toWorld(far.x, far.z);
    const cands = cellsBeyond(grid, spawn.gx, spawn.gz, 18);
    const fuseCells = pickSpread(rng, cands, 3, 16);
    const items = fuseCells.map((c, i) => ({ id: 'fuse' + i, type: 'fuse', ...toWorld(c.x, c.z) }));
    items.push({ id: 'fusebox', type: 'fusebox', x: exit.x, z: exit.z });
    level = {
      name: 'УРОВЕНЬ 0 — ЖЁЛТЫЕ КОМНАТЫ',
      hint: 'Найдите 3 предохранителя и вставьте их в щиток у люка. Сущность идёт на звук — не бегайте без нужды.',
      theme: 'yellow', grid, spawn, exit, items,
      lights: placeLights(rng, grid, 4, 2, 0.06),
      entity: { type: 'wanderer' },
      puzzle: { kind: 'fuses', need: 3 },
      ceilH: 3.0, fog: { color: 0x8f814a, density: 0.038 }, ambient: 0.8,
    };
  } else if (index === 1) {
    // УРОВЕНЬ 1 — Тёмный склад. Сущность: Гончая (реагирует на свет и бег). Кооп-рычаги.
    grid = genWarehouse(rng, 44, 44);
    const spawn = findSpawn(grid, rng);
    ensureConnected(grid, spawn.gx, spawn.gz);
    const far = farthestCell(grid, spawn.gx, spawn.gz);
    const exit = toWorld(far.x, far.z);
    const cands = cellsBeyond(grid, spawn.gx, spawn.gz, 14);
    const lev = pickSpread(rng, cands, 2, 26);
    const items = lev.map((c, i) => ({ id: 'lever' + i, type: 'lever', ...toWorld(c.x, c.z) }));
    // шкафчики-укрытия
    const lockers = pickSpread(rng, cellsBeyond(grid, spawn.gx, spawn.gz, 4), 10, 8);
    lockers.forEach((c, i) => items.push({ id: 'locker' + i, type: 'locker', ...toWorld(c.x, c.z) }));
    level = {
      name: 'УРОВЕНЬ 1 — ТЁМНЫЙ СКЛАД',
      hint: 'Дёрните ОБА рычага с разницей не более 6 секунд — придётся разделиться. Гончая видит свет фонаря и слышит бег. Прячьтесь в шкафчиках.',
      theme: 'warehouse', grid, spawn, exit, items,
      lights: placeLights(rng, grid, 9, 3, 0.45),
      entity: { type: 'hound' },
      puzzle: { kind: 'levers', need: 2, window: 6 },
      ceilH: 5.0, fog: { color: 0x05060a, density: 0.085 }, ambient: 0.08,
    };
  } else if (index === 2) {
    // УРОВЕНЬ 2 — Трубы. Сущность: Улыбающийся (живёт в темноте, боится света).
    grid = genNarrowMaze(rng, 19, 19);
    const spawn = findSpawn(grid, rng);
    const far = farthestCell(grid, spawn.gx, spawn.gz);
    const exit = toWorld(far.x, far.z);
    const solution = [];
    const used = new Set();
    while (solution.length < 4) {
      const gi = Math.floor(rng() * GLYPHS.length);
      if (!used.has(gi)) { used.add(gi); solution.push(gi); }
    }
    const cands = cellsBeyond(grid, spawn.gx, spawn.gz, 10);
    const plateCells = pickSpread(rng, cands, 4, 12);
    const items = plateCells.map((c, i) => ({
      id: 'plate' + i, type: 'plate', slot: i, glyph: solution[i], ...toWorld(c.x, c.z),
    }));
    items.push({ id: 'panel', type: 'panel', x: exit.x, z: exit.z });
    level = {
      name: 'УРОВЕНЬ 2 — ТРУБЫ',
      hint: 'На стенах спрятаны 4 таблички с символами и их порядком. Введите последовательность на панели у двери. Улыбающийся живёт в темноте — свет фонаря удерживает его.',
      theme: 'pipes', grid, spawn, exit, items,
      lights: placeLights(rng, grid, 8, 3, 0.5),
      entity: { type: 'smiler' },
      puzzle: { kind: 'glyphs', solution, glyphs: GLYPHS },
      ceilH: 2.4, fog: { color: 0x1a0d06, density: 0.11 }, ambient: 0.12,
    };
  } else if (index === 3) {
    // УРОВЕНЬ 3 — Бассейны. Сущность: Кожекрад (выглядит как ваш напарник).
    grid = genPools(rng, 48, 48);
    const spawn = findSpawn(grid, rng);
    ensureConnected(grid, spawn.gx, spawn.gz);
    const far = farthestCell(grid, spawn.gx, spawn.gz);
    const exit = toWorld(far.x, far.z);
    const cands = cellsBeyond(grid, spawn.gx, spawn.gz, 16);
    const valves = pickSpread(rng, cands, 3, 18);
    const items = valves.map((c, i) => ({ id: 'valve' + i, type: 'valve', ...toWorld(c.x, c.z) }));
    level = {
      name: 'УРОВЕНЬ 3 — БАССЕЙНЫ',
      hint: 'Откройте 3 вентиля, чтобы разблокировать шлюз. Кожекрад принимает облик вашего напарника. Настоящий напарник может подать сигнал клавишей [Q] — двойник не может.',
      theme: 'pools', grid, spawn, exit, items,
      lights: placeLights(rng, grid, 6, 2, 0.1),
      entity: { type: 'skinstealer' },
      puzzle: { kind: 'valves', need: 3, holdTime: 3 },
      ceilH: 4.2, fog: { color: 0xbfd4d6, density: 0.045 }, ambient: 0.55,
    };
  } else if (index === 4) {
    // УРОВЕНЬ 5 — ОТЕЛЬ УЖАСА. Сущность: Отверженный (видит в коридорах).
    grid = genHotel(rng, 47, 47);
    const spawn = findSpawn(grid, rng);
    ensureConnected(grid, spawn.gx, spawn.gz);
    const far = farthestCell(grid, spawn.gx, spawn.gz);
    const exit = toWorld(far.x, far.z);
    const cands = cellsBeyond(grid, spawn.gx, spawn.gz, 16);
    const keys = pickSpread(rng, cands, 3, 18);
    const items = keys.map((c, i) => ({ id: 'key' + i, type: 'key', ...toWorld(c.x, c.z) }));
    level = {
      name: 'УРОВЕНЬ 5 — ОТЕЛЬ УЖАСА',
      hint: 'Найдите 3 ключа в номерах, чтобы вызвать лифт. Отверженный патрулирует коридоры и видит далеко — прячьтесь в номерах и не попадайтесь ему на глаза.',
      theme: 'hotel', grid, spawn, exit, items,
      lights: placeLights(rng, grid, 6, 2, 0.35),
      entity: { type: 'wretch' },
      puzzle: { kind: 'collect', itemType: 'key', need: 3 },
      ceilH: 3.0, fog: { color: 0x160a08, density: 0.075 }, ambient: 0.16,
    };
  } else if (index === 5) {
    // УРОВЕНЬ FUN =) — Партигёрл. Замирает, пока на него смотрят.
    grid = genParty(rng, 46, 46);
    const spawn = findSpawn(grid, rng);
    ensureConnected(grid, spawn.gx, spawn.gz);
    const far = farthestCell(grid, spawn.gx, spawn.gz);
    const exit = toWorld(far.x, far.z);
    const cands = cellsBeyond(grid, spawn.gx, spawn.gz, 12);
    const balloons = pickSpread(rng, cands, 5, 12);
    const items = balloons.map((c, i) => ({ id: 'balloon' + i, type: 'balloon', ...toWorld(c.x, c.z) }));
    level = {
      name: 'УРОВЕНЬ FUN =) — ВЕЧЕРИНКА',
      hint: 'Соберите 5 шариков, чтобы «отпраздновать» и открыть выход. Партигёрл замирает, пока хоть кто-то СМОТРИТ на него. Отвернётесь — он приближается. =)',
      theme: 'party', grid, spawn, exit, items,
      lights: placeLights(rng, grid, 5, 2, 0.06),
      entity: { type: 'partygoer' },
      puzzle: { kind: 'collect', itemType: 'balloon', need: 5 },
      ceilH: 3.4, fog: { color: 0x8a7868, density: 0.055 }, ambient: 0.32,
    };
  } else {
    // УРОВЕНЬ 6 — ИСХОД. Финальная погоня.
    grid = genFinal(rng, 64);
    const spawn = { gx: 2, gz: 5, ...toWorld(2, 5) };
    const exit = toWorld(62, 5);
    const items = [];
    const xs = [14, 28, 42, 54];
    xs.forEach((x, i) => {
      // ищем ближайшую проходимую клетку рядом с коридором
      let gz = 5;
      for (const tz of [3, 7, 2, 8, 4, 6, 5]) if (grid.isWalkable(x, tz)) { gz = tz; break; }
      items.push({ id: 'switch' + i, type: 'switch', ...toWorld(x, gz) });
    });
    level = {
      name: 'УРОВЕНЬ 6 — ИСХОД',
      hint: 'Включите 4 рубильника вдоль коридора и доберитесь до лифта. НЕ ОСТАНАВЛИВАЙТЕСЬ. ОНО УЖЕ ЗДЕСЬ.',
      theme: 'final', grid, spawn, exit, items,
      // лампы вручную вдоль коридора — он слишком узкий для сетки placeLights
      lights: Array.from({ length: Math.floor((64 - 4) / 4) }, (_, i) => {
        const p = toWorld(3 + i * 4, 5);
        return { x: p.x, z: p.z, broken: rng() < 0.45, flicker: rng() < 0.6 };
      }),
      entity: { type: 'reaper', dormant: true },
      puzzle: { kind: 'switches', need: 4 },
      ceilH: 3.2, fog: { color: 0x0a0103, density: 0.10 }, ambient: 0.1,
    };
  }

  level.index = index;
  level.cell = CELL;
  level.seedVal = (seed + index * 7919) >>> 0;
  return level;
}

function findSpawn(grid, rng) {
  for (let i = 0; i < 500; i++) {
    const gx = 2 + Math.floor(rng() * (grid.w - 4));
    const gz = 2 + Math.floor(rng() * (grid.h - 4));
    if (grid.get(gx, gz) === FLOOR && grid.get(gx + 1, gz) === FLOOR) {
      return { gx, gz, ...toWorld(gx, gz) };
    }
  }
  return { gx: 1, gz: 1, ...toWorld(1, 1) };
}

// Сериализация для клиента
function serializeLevel(level) {
  return {
    index: level.index,
    seedVal: level.seedVal,
    name: level.name,
    hint: level.hint,
    theme: level.theme,
    w: level.grid.w,
    h: level.grid.h,
    cell: level.cell,
    cells: Buffer.from(level.grid.cells).toString('base64'),
    spawn: { x: level.spawn.x, z: level.spawn.z },
    exit: level.exit,
    lights: level.lights,
    items: level.items.map(it => {
      const { glyph, ...pub } = it; // решение головоломки не светим лишний раз — глиф нужен на табличке
      return it.type === 'plate' ? it : pub;
    }),
    entity: level.entity,
    puzzle: level.puzzle.kind === 'glyphs'
      ? { kind: 'glyphs', glyphs: level.puzzle.glyphs }
      : level.puzzle,
    ceilH: level.ceilH,
    fog: level.fog,
    ambient: level.ambient,
  };
}

const LEVEL_COUNT = 7;

module.exports = { genLevel, serializeLevel, LEVEL_COUNT, CELL, FLOOR, WALL, WATER, bfsDistances };
