// Интеграционный тест: два бота проходят все 5 уровней.
// Запуск: node test/sim.js (сервер должен работать на :3000)

'use strict';

const WebSocket = require('ws');

const URL = 'ws://localhost:3000';
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

function client(name) {
  const ws = new WebSocket(URL);
  const c = {
    ws, name, slot: -1, level: null, puzzle: null, doorOpen: false,
    pos: { x: 0, y: 1.7, z: 0 }, dead: false,
    waiters: new Map(),
  };
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    if (m.t === 'level') {
      c.level = m.data;
      c.doorOpen = false;
      c.puzzle = null;
      c.pos = { x: m.data.spawn.x, y: 1.7, z: m.data.spawn.z };
    }
    if (m.t === 'door') c.doorOpen = true;
    if (m.t === 'puzzle') c.puzzle = m.state;
    if (m.t === 'caught' && m.slot === c.slot) { c.dead = true; log(`!! ${name} пойман (${m.entity})`); }
    if (m.t === 'respawn') { c.dead = false; c.pos = { x: m.x, y: 1.7, z: m.z }; }
    const ws_ = c.waiters.get(m.t);
    if (ws_) { c.waiters.delete(m.t); ws_.forEach(r => r(m)); }
  });
  c.send = (o) => ws.send(JSON.stringify(o));
  c.wait = (type, timeout = 30000) => new Promise((res, rej) => {
    const arr = c.waiters.get(type) || [];
    arr.push(res);
    c.waiters.set(type, arr);
    setTimeout(() => rej(new Error(`${name}: таймаут ожидания '${type}'`)), timeout);
  });
  c.moveTo = (x, z) => {
    c.pos.x = x; c.pos.z = z;
    c.send({
      t: 'state', pos: { x, y: 1.7, z }, yaw: 0, pitch: 0,
      light: false, crouch: true, moving: false, running: false, hidden: false,
    });
  };
  return new Promise((res) => ws.on('open', () => res(c)));
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function completeLevel(a, b) {
  const lv = a.level;
  log(`--- ${lv.name} (тема ${lv.theme}) ---`);
  const items = lv.items;

  if (lv.puzzle.kind === 'fuses') {
    const fuses = items.filter(i => i.type === 'fuse');
    const box = items.find(i => i.type === 'fusebox');
    for (const f of fuses) {
      a.moveTo(f.x, f.z); await sleep(120);
      a.send({ t: 'interact', id: f.id }); await sleep(120);
    }
    a.moveTo(box.x, box.z); await sleep(120);
    a.send({ t: 'interact', id: box.id });
  } else if (lv.puzzle.kind === 'levers') {
    const levers = items.filter(i => i.type === 'lever');
    a.moveTo(levers[0].x, levers[0].z);
    b.moveTo(levers[1].x, levers[1].z);
    await sleep(150);
    a.send({ t: 'interact', id: levers[0].id });
    await sleep(800); // в пределах окна 6 сек
    b.send({ t: 'interact', id: levers[1].id });
  } else if (lv.puzzle.kind === 'glyphs') {
    const plates = items.filter(i => i.type === 'plate').sort((p, q) => p.slot - q.slot);
    const panel = items.find(i => i.type === 'panel');
    a.moveTo(panel.x, panel.z); await sleep(120);
    for (const p of plates) {
      for (let k = 0; k < p.glyph; k++) {
        a.send({ t: 'slot', slot: p.slot, dir: 1 });
        await sleep(40);
      }
    }
  } else if (lv.puzzle.kind === 'valves') {
    const valves = items.filter(i => i.type === 'valve');
    for (const v of valves) {
      b.moveTo(v.x, v.z); await sleep(120);
      b.send({ t: 'interact', id: v.id }); await sleep(120);
    }
  } else if (lv.puzzle.kind === 'collect') {
    const things = items.filter(i => i.type === lv.puzzle.itemType);
    for (const it of things) {
      a.moveTo(it.x, it.z); await sleep(120);
      a.send({ t: 'interact', id: it.id }); await sleep(120);
    }
  } else if (lv.puzzle.kind === 'switches') {
    const sws = items.filter(i => i.type === 'switch');
    for (const s of sws) {
      a.moveTo(s.x, s.z); await sleep(120);
      a.send({ t: 'interact', id: s.id }); await sleep(120);
    }
  }

  // ждём открытия двери
  for (let i = 0; i < 100 && !a.doorOpen; i++) await sleep(100);
  if (!a.doorOpen) throw new Error(`дверь не открылась на ${lv.name}`);
  log(`дверь открыта (${lv.puzzle.kind})`);

  // оба идут к выходу; повторяем state, пока не придёт descend/victory
  const isLast = lv.index === 6;
  const done = (isLast ? a.wait('victory', 30000) : a.wait('descend', 30000));
  const pump = setInterval(() => {
    if (!a.dead) a.moveTo(lv.exit.x, lv.exit.z);
    if (!b.dead) b.moveTo(lv.exit.x + 0.5, lv.exit.z);
  }, 150);
  try {
    await done;
  } finally {
    clearInterval(pump);
  }
  log(isLast ? '>>> ПОБЕДА' : 'переход на следующий уровень');
}

(async () => {
  const a = await client('Алиса');
  const b = await client('Борис');

  a.send({ t: 'create', name: 'Алиса' });
  const created = await a.wait('created');
  a.slot = created.slot;
  log('комната', created.code);

  b.send({ t: 'join', code: created.code, name: 'Борис' });
  const joined = await b.wait('joined');
  b.slot = joined.slot;

  await a.wait('level');
  await sleep(200); // b тоже получает level

  for (let i = 0; i < 7; i++) {
    if (!a.level || a.level.index !== i) {
      await a.wait('level');
      await sleep(200);
    }
    // проверки данных уровня
    const lv = a.level;
    if (lv.index !== i) throw new Error(`ожидали уровень ${i}, получили ${lv.index}`);
    const cells = Buffer.from(lv.cells, 'base64');
    if (cells.length !== lv.w * lv.h) throw new Error('размер сетки не совпадает');
    if (!lv.lights.length) throw new Error('нет света');
    if (!lv.items.length) throw new Error('нет предметов');
    log(`уровень ${i}: сетка ${lv.w}x${lv.h}, предметов ${lv.items.length}, ламп ${lv.lights.length}, сущность ${lv.entity.type}`);
    await completeLevel(a, b);
  }

  log('ТЕСТ ПРОЙДЕН: все 5 уровней завершены');
  process.exit(0);
})().catch((e) => {
  console.error('ТЕСТ ПРОВАЛЕН:', e.message);
  process.exit(1);
});
