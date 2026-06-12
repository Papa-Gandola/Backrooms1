// Игровая логика комнаты: состояние уровня, ИИ сущности, головоломки, переходы.

'use strict';

const { genLevel, serializeLevel, LEVEL_COUNT, CELL, WATER, bfsDistances } = require('./levels');

const TICK = 1000 / 20;

class GameSession {
  constructor(room) {
    this.room = room; // { players: [p1, p2], broadcast(obj), sendTo(p,obj) }
    this.seed = (Math.random() * 0xffffffff) >>> 0;
    this.levelIndex = 0;
    this.level = null;
    this.entity = null;
    this.puzzle = null;
    this.finished = false;
    this.timer = setInterval(() => this.tick(), TICK);
    this.lastEntityBroadcast = 0;
    this.startLevel(0);
  }

  destroy() {
    clearInterval(this.timer);
  }

  startLevel(index) {
    this.levelIndex = index;
    this.level = genLevel(index, this.seed);
    this.doorOpen = false;
    this.initPuzzle();
    this.initEntity();
    for (const p of this.room.players) {
      p.pos = { x: this.level.spawn.x, y: 1.7, z: this.level.spawn.z + (p.slot === 1 ? 1.2 : 0) };
      p.yaw = 0; p.hidden = false; p.dead = false;
      p.noise = 0; p.light = false; p.moving = false; p.running = false;
    }
    this.room.broadcast({ t: 'level', data: serializeLevel(this.level) });
  }

  initPuzzle() {
    const pz = this.level.puzzle;
    if (pz.kind === 'fuses') {
      this.puzzle = { kind: 'fuses', carried: {}, inserted: 0, taken: new Set() };
    } else if (pz.kind === 'levers') {
      this.puzzle = { kind: 'levers', pulledAt: {}, done: new Set() };
    } else if (pz.kind === 'glyphs') {
      this.puzzle = { kind: 'glyphs', slots: [0, 0, 0, 0], solution: pz.solution };
    } else if (pz.kind === 'valves') {
      this.puzzle = { kind: 'valves', done: new Set() };
    } else if (pz.kind === 'switches') {
      this.puzzle = { kind: 'switches', done: new Set() };
    }
  }

  initEntity() {
    const start = this.entitySpot();
    this.entity = {
      type: this.level.entity.type,
      x: start.x, z: start.z,
      state: this.level.entity.dormant ? 'dormant' : 'roam',
      target: null,        // {x,z} куда идёт
      path: [],
      repathIn: 0,
      speed: 1.6,
      lastSeen: 0,
      frozen: 0,
      mimicSlot: Math.random() < 0.5 ? 0 : 1, // для кожекрада: чей облик
      awakeIn: 0,
    };
  }

  // Точка появления/отступления сущности: далеко от игроков и не у самого выхода,
  // чтобы она не караулила ни спавн, ни портал.
  entitySpot() {
    const g = this.level.grid;
    const refs = this.room.players.filter(p => p.pos).map(p => ({ x: p.pos.x, z: p.pos.z }));
    if (!refs.length) refs.push({ x: this.level.spawn.x, z: this.level.spawn.z });
    const exit = this.level.exit;
    let best = null, bestScore = -1;
    for (let i = 0; i < 200; i++) {
      const gx = Math.floor(Math.random() * g.w), gz = Math.floor(Math.random() * g.h);
      if (!g.isWalkable(gx, gz)) continue;
      const x = (gx + 0.5) * CELL, z = (gz + 0.5) * CELL;
      const dPlayers = Math.min(...refs.map(r => Math.hypot(r.x - x, r.z - z)));
      const dExit = Math.hypot(exit.x - x, exit.z - z);
      const score = Math.min(dPlayers, dExit * 1.5);
      if (score > bestScore) { bestScore = score; best = { x, z }; }
    }
    return best || { x: this.level.spawn.x, z: this.level.spawn.z };
  }

  farthestFromSpawn() {
    const g = this.level.grid;
    const sgx = Math.floor(this.level.spawn.x / CELL), sgz = Math.floor(this.level.spawn.z / CELL);
    const dist = bfsDistances(g, sgx, sgz);
    let best = { x: this.level.spawn.x, z: this.level.spawn.z, d: 0 };
    for (let z = 0; z < g.h; z++) for (let x = 0; x < g.w; x++) {
      const d = dist[z * g.w + x];
      if (d > best.d) best = { x: (x + 0.5) * CELL, z: (z + 0.5) * CELL, d };
    }
    return best;
  }

  // ---------- сообщения от игроков ----------

  onPlayerState(p, m) {
    p.pos = m.pos; p.yaw = m.yaw; p.pitch = m.pitch;
    p.light = !!m.light; p.crouch = !!m.crouch;
    p.moving = !!m.moving; p.running = !!m.running;
    p.hidden = !!m.hidden;
    // уровень шума: бег слышно издалека, ходьбу — ближе, присев — почти неслышно
    p.noise = m.moving ? (m.running ? 16 : (m.crouch ? 2.5 : 7)) : 0;
    const other = this.other(p);
    if (other) {
      this.room.sendTo(other, {
        t: 'partner',
        pos: p.pos, yaw: p.yaw, pitch: p.pitch,
        light: p.light, crouch: p.crouch, moving: p.moving, running: p.running,
        hidden: p.hidden,
      });
    }
  }

  onInteract(p, m) {
    const item = this.level.items.find(i => i.id === m.id);
    if (!item || this.finished) return;
    const d = dist2(p.pos.x, p.pos.z, item.x, item.z);
    if (d > 3.2 * 3.2) return; // слишком далеко
    const pz = this.puzzle;

    if (item.type === 'fuse' && pz.kind === 'fuses' && !pz.taken.has(item.id)) {
      pz.taken.add(item.id);
      pz.carried[p.slot] = (pz.carried[p.slot] || 0) + 1;
      this.room.broadcast({ t: 'item', id: item.id, ev: 'taken', by: p.slot });
      this.broadcastPuzzle();
    } else if (item.type === 'fusebox' && pz.kind === 'fuses') {
      const have = pz.carried[p.slot] || 0;
      if (have > 0) {
        pz.carried[p.slot] = 0;
        pz.inserted += have;
        this.room.broadcast({ t: 'item', id: item.id, ev: 'insert', count: pz.inserted });
        this.broadcastPuzzle();
        if (pz.inserted >= this.level.puzzle.need) this.openDoor();
      }
    } else if (item.type === 'lever' && pz.kind === 'levers' && !pz.done.has(item.id)) {
      const now = Date.now() / 1000;
      pz.pulledAt[item.id] = now;
      this.room.broadcast({ t: 'item', id: item.id, ev: 'pulled' });
      // оба рычага в окне 6 секунд?
      const ids = this.level.items.filter(i => i.type === 'lever').map(i => i.id);
      const times = ids.map(id => pz.pulledAt[id]).filter(Boolean);
      if (times.length === ids.length && Math.max(...times) - Math.min(...times) <= this.level.puzzle.window) {
        ids.forEach(id => pz.done.add(id));
        this.openDoor();
      } else {
        // рычаг «отщёлкивается» обратно через окно
        setTimeout(() => {
          if (!this.doorOpen && this.puzzle === pz && pz.pulledAt[item.id] === now) {
            delete pz.pulledAt[item.id];
            this.room.broadcast({ t: 'item', id: item.id, ev: 'reset' });
          }
        }, this.level.puzzle.window * 1000);
      }
      this.broadcastPuzzle();
    } else if (item.type === 'valve' && pz.kind === 'valves' && !pz.done.has(item.id)) {
      pz.done.add(item.id);
      this.room.broadcast({ t: 'item', id: item.id, ev: 'done' });
      this.broadcastPuzzle();
      if (pz.done.size >= this.level.puzzle.need) this.openDoor();
    } else if (item.type === 'switch' && pz.kind === 'switches' && !pz.done.has(item.id)) {
      pz.done.add(item.id);
      this.room.broadcast({ t: 'item', id: item.id, ev: 'done' });
      this.broadcastPuzzle();
      this.wakeReaper();
      if (pz.done.size >= this.level.puzzle.need) this.openDoor();
    } else if (item.type === 'locker') {
      // клиент сам управляет скрытием, сервер просто верит флагу hidden из state
    }
  }

  onSlot(p, m) {
    // переключение глифа на панели (уровень 2)
    const pz = this.puzzle;
    if (!pz || pz.kind !== 'glyphs' || this.doorOpen) return;
    const panel = this.level.items.find(i => i.type === 'panel');
    if (dist2(p.pos.x, p.pos.z, panel.x, panel.z) > 3.5 * 3.5) return;
    const s = m.slot | 0;
    if (s < 0 || s > 3) return;
    const n = this.level.puzzle.glyphs.length;
    pz.slots[s] = (pz.slots[s] + (m.dir < 0 ? n - 1 : 1)) % n;
    this.broadcastPuzzle();
    if (pz.slots.every((g, i) => g === pz.solution[i])) this.openDoor();
  }

  onSignal(p) {
    // сигнал «я настоящий» (уровень 3)
    const other = this.other(p);
    if (other) this.room.sendTo(other, { t: 'signal', from: p.slot });
  }

  broadcastPuzzle() {
    const pz = this.puzzle;
    let state;
    if (pz.kind === 'fuses') state = { kind: 'fuses', inserted: pz.inserted, carried: pz.carried, need: this.level.puzzle.need };
    else if (pz.kind === 'levers') state = { kind: 'levers', pulled: Object.keys(pz.pulledAt), done: [...pz.done] };
    else if (pz.kind === 'glyphs') state = { kind: 'glyphs', slots: pz.slots };
    else if (pz.kind === 'valves') state = { kind: 'valves', done: [...pz.done], need: this.level.puzzle.need };
    else state = { kind: 'switches', done: [...pz.done], need: this.level.puzzle.need };
    this.room.broadcast({ t: 'puzzle', state });
  }

  openDoor() {
    if (this.doorOpen) return;
    this.doorOpen = true;
    this.room.broadcast({ t: 'door', open: true });
  }

  wakeReaper() {
    if (this.entity.type === 'reaper' && this.entity.state === 'dormant') {
      this.entity.state = 'chase';
      this.entity.x = this.level.spawn.x;
      this.entity.z = this.level.spawn.z;
      this.room.broadcast({ t: 'reaper' });
    }
  }

  // ---------- основной цикл ----------

  tick() {
    if (this.finished || !this.level) return;
    const dt = TICK / 1000;
    this.updateEntity(dt);
    this.checkCatch();
    this.checkExit();
    const now = Date.now();
    if (now - this.lastEntityBroadcast > 95) {
      this.lastEntityBroadcast = now;
      const e = this.entity;
      this.room.broadcast({
        t: 'entity',
        x: e.x, z: e.z, state: e.state,
        mimic: e.type === 'skinstealer' ? e.mimicSlot : undefined,
      });
    }
  }

  alivePlayers() {
    return this.room.players.filter(p => !p.dead && p.pos);
  }

  other(p) {
    return this.room.players.find(q => q !== p);
  }

  updateEntity(dt) {
    const e = this.entity;
    if (e.state === 'dormant') return;
    if (e.frozen > 0) { e.frozen -= dt; return; }

    const players = this.alivePlayers();

    if (e.type === 'wanderer') {
      // идёт на звук
      e.speed = 1.5;
      let heard = null;
      for (const p of players) {
        if (p.hidden || !p.noise) continue;
        if (dist2(e.x, e.z, p.pos.x, p.pos.z) < p.noise * p.noise) {
          if (!heard || p.noise > heard.noise) heard = p;
        }
      }
      if (heard) {
        e.target = { x: heard.pos.x, z: heard.pos.z };
        e.state = 'hunt';
        e.speed = 3.0;
        e.repathIn = 0;
      } else if (e.state === 'hunt' && (!e.path || !e.path.length)) {
        e.state = 'roam';
      }
      this.roamOrFollow(e, dt);
    } else if (e.type === 'hound') {
      // видит свет фонаря и слышит бег
      e.speed = e.state === 'chase' ? 4.6 : 2.2;
      let spotted = null;
      for (const p of players) {
        if (p.hidden) continue;
        const d2v = dist2(e.x, e.z, p.pos.x, p.pos.z);
        const seesLight = p.light && d2v < 20 * 20 && this.lineOfSight(e.x, e.z, p.pos.x, p.pos.z);
        const hearsRun = p.running && p.moving && d2v < 13 * 13;
        const veryClose = d2v < 4 * 4 && this.lineOfSight(e.x, e.z, p.pos.x, p.pos.z);
        if (seesLight || hearsRun || veryClose) { spotted = p; break; }
      }
      if (spotted) {
        e.state = 'chase';
        e.target = { x: spotted.pos.x, z: spotted.pos.z };
        e.lastSeen = 5;
        e.repathIn = Math.min(e.repathIn, 0.25);
      } else if (e.state === 'chase') {
        e.lastSeen -= dt;
        if (e.lastSeen <= 0) e.state = 'roam';
      }
      this.roamOrFollow(e, dt);
    } else if (e.type === 'smiler') {
      // вечно ползёт к ближайшему игроку; свет фонаря в его сторону замораживает
      e.speed = 1.35;
      let nearest = null, nd = Infinity;
      for (const p of players) {
        const d2v = dist2(e.x, e.z, p.pos.x, p.pos.z);
        if (d2v < nd) { nd = d2v; nearest = p; }
      }
      if (nearest) {
        // кто-то светит на него?
        for (const p of players) {
          if (!p.light) continue;
          const d2v = dist2(e.x, e.z, p.pos.x, p.pos.z);
          if (d2v < 14 * 14 && this.lineOfSight(p.pos.x, p.pos.z, e.x, e.z)) {
            // взгляд игрока при yaw=0 направлен в -Z (соглашение three.js)
            const ang = Math.atan2(e.x - p.pos.x, e.z - p.pos.z);
            const diff = Math.abs(normAngle(ang - p.yaw - Math.PI));
            if (diff < 0.55) { e.frozen = 0.35; return; }
          }
        }
        e.state = 'hunt';
        e.target = { x: nearest.pos.x, z: nearest.pos.z };
        if (nd > 30 * 30) e.speed = 2.2; // подтягивается издалека быстрее
        this.roamOrFollow(e, dt);
      }
    } else if (e.type === 'skinstealer') {
      // притворяется напарником: медленно бродит, при близком игроке начинает «подходить»
      let nearest = null, nd = Infinity;
      for (const p of players) {
        const d2v = dist2(e.x, e.z, p.pos.x, p.pos.z);
        if (d2v < nd) { nd = d2v; nearest = p; }
      }
      if (nearest && nd < 18 * 18) {
        e.state = 'approach';
        e.speed = nd < 6 * 6 ? 3.4 : 1.25; // рывок в последний момент
        e.target = { x: nearest.pos.x, z: nearest.pos.z };
      } else {
        e.state = 'roam';
        e.speed = 1.0;
      }
      this.roamOrFollow(e, dt);
    } else if (e.type === 'reaper') {
      // финальная погоня: всегда преследует ближайшего
      e.speed = 4.6; // чуть медленнее спринта игрока — шанс есть, пока есть выносливость
      let nearest = null, nd = Infinity;
      for (const p of players) {
        const d2v = dist2(e.x, e.z, p.pos.x, p.pos.z);
        if (d2v < nd) { nd = d2v; nearest = p; }
      }
      if (nearest) {
        e.state = 'chase';
        e.target = { x: nearest.pos.x, z: nearest.pos.z };
        this.roamOrFollow(e, dt);
      }
    }
  }

  roamOrFollow(e, dt) {
    e.repathIn -= dt;
    if (e.repathIn <= 0) {
      e.repathIn = e.state === 'roam' ? 1.2 : 0.45;
      let goal = e.target;
      if (e.state === 'roam' || !goal) {
        goal = this.randomWalkable();
        if (e.state !== 'roam') e.state = 'roam';
      }
      e.path = this.findPath(e.x, e.z, goal.x, goal.z);
    }
    // движение по пути
    let remaining = e.speed * dt;
    while (remaining > 0 && e.path && e.path.length) {
      const wp = e.path[0];
      const dx = wp.x - e.x, dz = wp.z - e.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.05) { e.path.shift(); continue; }
      const step = Math.min(d, remaining);
      e.x += (dx / d) * step;
      e.z += (dz / d) * step;
      remaining -= step;
      if (step >= d) e.path.shift();
    }
  }

  randomWalkable() {
    const g = this.level.grid;
    for (let i = 0; i < 100; i++) {
      const x = Math.floor(Math.random() * g.w), z = Math.floor(Math.random() * g.h);
      if (g.isWalkable(x, z)) return { x: (x + 0.5) * CELL, z: (z + 0.5) * CELL };
    }
    return { x: this.level.spawn.x, z: this.level.spawn.z };
  }

  findPath(x0, z0, x1, z1) {
    const g = this.level.grid;
    const sx = clamp(Math.floor(x0 / CELL), 0, g.w - 1), sz = clamp(Math.floor(z0 / CELL), 0, g.h - 1);
    const tx = clamp(Math.floor(x1 / CELL), 0, g.w - 1), tz = clamp(Math.floor(z1 / CELL), 0, g.h - 1);
    if (!g.isWalkable(tx, tz)) return [];
    const prev = new Int32Array(g.w * g.h).fill(-2);
    prev[sz * g.w + sx] = -1;
    const q = [[sx, sz]];
    let found = false;
    for (let i = 0; i < q.length && !found; i++) {
      const [x, z] = q[i];
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= g.w || nz >= g.h) continue;
        const ni = nz * g.w + nx;
        if (!g.isWalkable(nx, nz) || prev[ni] !== -2) continue;
        prev[ni] = z * g.w + x;
        if (nx === tx && nz === tz) { found = true; break; }
        q.push([nx, nz]);
      }
    }
    if (!found) return [];
    const path = [];
    let cur = tz * g.w + tx;
    while (cur !== -1 && cur !== -2) {
      const cx = cur % g.w, cz = Math.floor(cur / g.w);
      path.push({ x: (cx + 0.5) * CELL, z: (cz + 0.5) * CELL });
      cur = prev[cur];
    }
    path.reverse();
    path.push({ x: x1, z: z1 });
    return path;
  }

  lineOfSight(x0, z0, x1, z1) {
    const g = this.level.grid;
    const d = Math.hypot(x1 - x0, z1 - z0);
    const steps = Math.ceil(d / (CELL * 0.4));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      if (!g.isWalkable(Math.floor(x / CELL), Math.floor(z / CELL))) return false;
    }
    return true;
  }

  checkCatch() {
    const e = this.entity;
    if (e.state === 'dormant') return;
    const now = Date.now();
    for (const p of this.alivePlayers()) {
      if (p.hidden || (p.graceUntil && now < p.graceUntil)) continue;
      if (dist2(e.x, e.z, p.pos.x, p.pos.z) < 1.1 * 1.1) {
        p.dead = true;
        this.room.broadcast({ t: 'caught', slot: p.slot, entity: e.type });
        // сущность отступает подальше, жертва возродится у входа
        if (e.type !== 'reaper') {
          const spot = this.entitySpot();
          e.x = spot.x; e.z = spot.z; e.state = 'roam'; e.path = []; e.target = null;
        }
        setTimeout(() => {
          if (!this.level) return;
          p.dead = false;
          p.graceUntil = Date.now() + 6000; // неуязвимость после возрождения
          p.pos = { x: this.level.spawn.x, y: 1.7, z: this.level.spawn.z };
          this.room.sendTo(p, { t: 'respawn', x: this.level.spawn.x, z: this.level.spawn.z });
        }, 3500);
      }
    }
  }

  checkExit() {
    if (!this.doorOpen) return;
    const players = this.room.players.filter(p => p.pos);
    if (!players.length) return;
    const allIn = players.every(p =>
      !p.dead && dist2(p.pos.x, p.pos.z, this.level.exit.x, this.level.exit.z) < 2.6 * 2.6);
    if (allIn) {
      if (this.levelIndex + 1 >= LEVEL_COUNT) {
        this.finished = true;
        this.room.broadcast({ t: 'victory' });
      } else {
        const next = this.levelIndex + 1;
        this.level = null;
        this.room.broadcast({ t: 'descend', to: next });
        setTimeout(() => this.startLevel(next), 2500);
      }
    }
  }
}

function dist2(x0, z0, x1, z1) { const dx = x1 - x0, dz = z1 - z0; return dx * dx + dz * dz; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function normAngle(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }

module.exports = { GameSession };
