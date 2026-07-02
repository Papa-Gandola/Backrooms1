// HTTP + WebSocket сервер: лобби с кодами комнат, ретрансляция состояния, игровые сессии.

'use strict';

const path = require('path');
const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');
const { GameSession } = require('./game');

const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/vendor/three', express.static(path.join(__dirname, '..', 'node_modules', 'three')));

// отладка: выдать сгенерированный уровень без игры (для /debug-world.html)
const { genLevel, serializeLevel } = require('./levels');
app.get('/debug-level', (req, res) => {
  const index = Math.min(8, Math.max(0, parseInt(req.query.index || '0', 10)));
  const seed = parseInt(req.query.seed || '12345', 10);
  res.json(serializeLevel(genLevel(index, seed)));
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const rooms = new Map(); // code -> Room

function makeCode() {
  const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += abc[(Math.random() * abc.length) | 0];
  } while (rooms.has(code));
  return code;
}

class Room {
  constructor(code) {
    this.code = code;
    this.players = [];
    this.session = null;
  }
  broadcast(obj) {
    const s = JSON.stringify(obj);
    for (const p of this.players) if (p.ws.readyState === 1) p.ws.send(s);
  }
  sendTo(p, obj) {
    if (p.ws.readyState === 1) p.ws.send(JSON.stringify(obj));
  }
  start() {
    this.session = new GameSession(this, this.resume);
  }
  close(reason) {
    if (this.session) { this.session.destroy(); this.session = null; }
    for (const p of this.players) {
      this.sendTo(p, { t: 'roomClosed', reason });
    }
    rooms.delete(this.code);
  }
}

wss.on('connection', (ws) => {
  const player = { ws, name: 'Аноним', room: null, slot: 0, pos: null, dead: false, alivePing: true };

  ws.on('pong', () => { player.alivePing = true; });

  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    try { handle(player, m); } catch (err) {
      console.error('Ошибка обработки сообщения:', err);
    }
  });

  ws.on('close', () => {
    const room = player.room;
    if (!room) return;
    room.players = room.players.filter(p => p !== player);
    if (room.session) {
      room.close('partnerLeft');
    } else if (room.players.length === 0) {
      rooms.delete(room.code);
    } else {
      room.broadcast({ t: 'partnerLeft' });
    }
  });
});

function handle(p, m) {
  switch (m.t) {
    case 'create': {
      if (p.room) return;
      p.name = sanitizeName(m.name);
      const room = new Room(makeCode());
      if (m.resume && Number.isInteger(m.resume.level) && m.resume.level >= 0 && m.resume.level <= 8) {
        room.resume = { seed: (m.resume.seed >>> 0), level: m.resume.level };
      }
      rooms.set(room.code, room);
      p.room = room; p.slot = 0;
      room.players.push(p);
      room.sendTo(p, { t: 'created', code: room.code, slot: 0 });
      break;
    }
    case 'join': {
      if (p.room) return;
      const room = rooms.get(String(m.code || '').toUpperCase().trim());
      if (!room) return p.ws.send(JSON.stringify({ t: 'err', msg: 'Комната не найдена' }));
      if (room.players.length >= 2 || room.session)
        return p.ws.send(JSON.stringify({ t: 'err', msg: 'Комната уже заполнена' }));
      p.name = sanitizeName(m.name);
      p.room = room; p.slot = 1;
      room.players.push(p);
      const host = room.players[0];
      room.sendTo(p, { t: 'joined', code: room.code, slot: 1, partnerName: host.name });
      room.sendTo(host, { t: 'partnerJoined', partnerName: p.name });
      // оба на месте — запускаем игру
      setTimeout(() => { if (rooms.has(room.code) && room.players.length === 2) room.start(); }, 1500);
      break;
    }
    case 'state':
      if (p.room?.session) p.room.session.onPlayerState(p, m);
      break;
    case 'interact':
      if (p.room?.session) p.room.session.onInteract(p, m);
      break;
    case 'slot':
      if (p.room?.session) p.room.session.onSlot(p, m);
      break;
    case 'signal':
      if (p.room?.session) p.room.session.onSignal(p);
      break;
    case 'rtc': {
      // сигналинг голосового чата — просто пересылаем напарнику
      const other = p.room?.players.find(q => q !== p);
      if (other) p.room.sendTo(other, { t: 'rtc', data: m.data });
      break;
    }
  }
}

function sanitizeName(n) {
  return String(n || 'Аноним').replace(/[<>&"]/g, '').slice(0, 16) || 'Аноним';
}

// пинг для зачистки мёртвых соединений
setInterval(() => {
  for (const ws of wss.clients) {
    ws.ping();
  }
}, 30000);

server.listen(PORT, () => {
  console.log(`THE BACKROOMS работает: http://localhost:${PORT}`);
  console.log('Создайте игру, передайте код напарнику — и не шумите там, внизу.');
});
