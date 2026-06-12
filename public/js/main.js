// Точка входа: меню, сеть, сцена, игровой цикл.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

import { Net } from './net.js';
import { World } from './world.js';
import { PlayerController } from './player.js';
import { PartnerAvatar } from './avatar.js';
import { EntityView } from './entities.js';
import { AudioEngine } from './audio.js';
import { VoiceChat } from './voice.js';
import { UI } from './ui.js';

const $ = (id) => document.getElementById(id);

// ---------- состояние ----------
const net = new Net();
const audio = new AudioEngine();
let voice = null;

let renderer, scene, camera, composer, grainPass;
let world, player, partner, entityView;
let mySlot = 0;
let myName = 'Аноним';
let partnerName = '???';
let level = null;
let puzzleState = null;
let carriedFuses = 0;
let startTime = 0;
let inGame = false;
let nearLocker = null;
let lastWhisper = 0;
let entityState = { x: -999, z: -999, state: 'roam' };

// ---------- меню ----------

$('nameInput').value = localStorage.getItem('br_name') || '';

$('createBtn').onclick = async () => {
  myName = $('nameInput').value.trim() || 'Аноним';
  localStorage.setItem('br_name', myName);
  UI.menuError('');
  try {
    if (!net.connected) await net.connect();
    net.send({ t: 'create', name: myName });
  } catch {
    UI.menuError('Не удалось подключиться к серверу');
  }
};

$('joinBtn').onclick = async () => {
  myName = $('nameInput').value.trim() || 'Аноним';
  localStorage.setItem('br_name', myName);
  const code = $('codeInput').value.trim().toUpperCase();
  if (code.length !== 4) { UI.menuError('Код — 4 символа'); return; }
  UI.menuError('');
  try {
    if (!net.connected) await net.connect();
    net.send({ t: 'join', code, name: myName });
  } catch {
    UI.menuError('Не удалось подключиться к серверу');
  }
};

$('codeInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('joinBtn').click(); });

// модули (включая модели) загружены — открываем кнопки
$('createBtn').disabled = false;
$('createBtn').textContent = 'СОЗДАТЬ ИГРУ';
$('joinBtn').disabled = false;
$('joinBtn').textContent = 'ВОЙТИ';

// ---------- сетевые события ----------

net.on('err', (m) => UI.menuError(m.msg));

net.on('created', (m) => {
  mySlot = m.slot;
  UI.showScreen('lobby');
  $('roomCode').textContent = m.code;
});

net.on('joined', (m) => {
  mySlot = m.slot;
  partnerName = m.partnerName;
  UI.showScreen('lobby');
  $('roomCode').textContent = m.code;
  $('lobbyStatus').innerHTML = 'напарник найден — спускаемся<span class="dots">...</span>';
});

net.on('partnerJoined', (m) => {
  partnerName = m.partnerName;
  $('lobbyStatus').innerHTML = `${partnerName} здесь — спускаемся<span class="dots">...</span>`;
});

net.on('level', async (m) => {
  if (!inGame) initGame();
  loadLevel(m.data);
});

net.on('partner', (m) => { if (partner) partner.netUpdate(m); });

net.on('entity', (m) => {
  entityState = m;
  if (entityView) entityView.netUpdate(m);
});

net.on('item', (m) => {
  world.onItemEvent(m.id, m.ev);
  if (m.ev === 'taken') {
    if (m.by === mySlot) { carriedFuses++; audio.pickup(); }
    else UI.subtitles(`${partnerName} нашёл предохранитель`);
  }
  if (m.ev === 'insert') { carriedFuses = 0; audio.pickup(); }
  if (m.ev === 'pulled') audio.leverClank();
  if (m.ev === 'reset') UI.subtitles('рычаг отщёлкнулся обратно...');
  if (m.ev === 'done') audio.valveCreak();
  updateInventoryUI();
});

net.on('puzzle', (m) => {
  puzzleState = m.state;
  if (m.state.kind === 'fuses') carriedFuses = m.state.carried[mySlot] || 0;
  updateInventoryUI();
  if (m.state.kind === 'glyphs') UI.glyphPanel(glyphPanelVisible, m.state.slots, level.puzzle.glyphs);
});

net.on('door', () => {
  world.setDoorOpen();
  audio.doorOpen();
  UI.subtitles('что-то открылось...');
  UI.setObjective('ВЫХОД ОТКРЫТ', 'Доберитесь до светящегося портала ВДВОЁМ.');
});

net.on('reaper', () => {
  UI.subtitles('ОНО ПРОСНУЛОСЬ. БЕГИТЕ.');
});

net.on('caught', (m) => {
  if (m.slot === mySlot) {
    audio.jumpscare();
    UI.jumpscare(m.entity);
    player.frozen = true;
  } else {
    audio.distantScream();
    UI.subtitles(`${partnerName} кричит где-то в темноте...`);
  }
});

net.on('respawn', (m) => {
  player.teleport(m.x, m.z);
  player.frozen = false;
  player.setHidden(false);
});

net.on('signal', () => {
  UI.signalFlash();
  audio.signalPing();
});

net.on('descend', () => {
  player.frozen = true;
  UI.subtitles('вы проваливаетесь глубже...');
});

net.on('victory', () => {
  const secs = Math.floor((Date.now() - startTime) / 1000);
  const timeStr = `${Math.floor(secs / 60)} мин ${secs % 60} сек`;
  UI.victory(timeStr);
  document.exitPointerLock();
  player.frozen = true;
});

net.on('partnerLeft', () => { UI.disconnected(); });
net.on('roomClosed', () => { UI.disconnected(); });
net.on('close', () => { if (inGame) UI.disconnected(); });

// ---------- инициализация 3D ----------

function initGame() {
  inGame = true;
  startTime = Date.now();
  UI.showScreen('game');
  UI.hud(true);

  audio.init();
  audio.resume();
  voice = new VoiceChat(net, mySlot);
  UI.voice(false, false);

  renderer = new THREE.WebGLRenderer({ canvas: $('canvas'), antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 1.75;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 120);

  // мягкие отражения окружения для PBR-материалов
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.2;

  world = new World(scene);
  player = new PlayerController(camera, world, audio);
  player.addToScene(scene);
  partner = new PartnerAvatar(scene, partnerName);

  // постобработка: SSAO + bloom + зерно/виньетка/хроматика
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  if (new URLSearchParams(location.search).get('ao') !== '0') {
    const gtao = new GTAOPass(scene, camera, innerWidth, innerHeight);
    gtao.blendIntensity = 0.9;
    composer.addPass(gtao);
  }
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.22, 0.5, 0.88);
  composer.addPass(bloom);
  grainPass = new ShaderPass(GrainShader);
  composer.addPass(grainPass);

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
  });

  // pointer lock
  const canvas = $('canvas');
  canvas.addEventListener('click', () => {
    if (!player.frozen) canvas.requestPointerLock();
  });
  $('clickToPlay').addEventListener('click', () => {
    canvas.requestPointerLock();
  });
  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === canvas;
    UI.clickToPlay(!locked && inGame && !player.frozen && $('victory').classList.contains('hidden'));
    audio.resume();
  });
  canvas.requestPointerLock();

  document.addEventListener('keydown', onGameKey);

  requestAnimationFrame(loop);
  setInterval(() => { if (level) net.send(player.netState()); }, 80);
  window.__diag = () => ({
    me: { x: player.pos.x, z: player.pos.z, yaw: player.yaw },
    partnerCur: { ...partner.cur },
    partnerDst: { x: partner.dst.x, z: partner.dst.z },
    spawn: level ? level.spawn : null,
    entity: { ...entityState },
  });
}

function onGameKey(e) {
  if (!level || player.frozen) return;
  if (e.code === 'KeyE') tryInteract();
  if (e.code === 'KeyQ') net.send({ t: 'signal' });
  if (e.code === 'KeyV') {
    voice.toggle().then(on => UI.voice(on, !!voice.pc));
  }
  // панель глифов: 1-4 переключают слоты
  if (glyphPanelVisible && ['Digit1', 'Digit2', 'Digit3', 'Digit4'].includes(e.code)) {
    const slot = Number(e.code.slice(-1)) - 1;
    net.send({ t: 'slot', slot, dir: e.shiftKey ? -1 : 1 });
    audio.uiTick();
  }
}

// ---------- загрузка уровня ----------

function loadLevel(data) {
  level = data;
  puzzleState = null;
  carriedFuses = 0;
  nearLocker = null;
  glyphPanelVisible = false;
  UI.glyphPanel(false);

  world.build(data);
  scene.fog = new THREE.FogExp2(data.fog.color, data.fog.density);
  scene.background = new THREE.Color(data.fog.color).multiplyScalar(0.25);
  scene.environmentIntensity = 0.08 + data.ambient * 0.3;

  // базовое освещение
  if (world.ambLight) scene.remove(world.ambLight);
  world.ambLight = new THREE.AmbientLight(0xffffff, data.ambient * 1.15);
  scene.add(world.ambLight);

  if (entityView) entityView.dispose();
  entityView = new EntityView(scene, data.entity.type, partnerName);
  entityState = { x: -999, z: -999, state: data.entity.dormant ? 'dormant' : 'roam' };

  // слот 1 спавнится с офсетом, чтобы игроки не оказались в одной точке
  player.teleport(data.spawn.x, data.spawn.z + (mySlot === 1 ? 1.2 : 0));
  player.frozen = true;
  player.setHidden(false);
  player.light = false;

  audio.startAmbient(data.theme);
  UI.setObjective(data.name, data.hint);
  updateInventoryUI();
  UI.setPartnerInfo(`напарник: ${partnerName}`);

  UI.levelCard(data.name, data.hint).then(() => {
    player.frozen = false;
    const canvas = $('canvas');
    if (document.pointerLockElement !== canvas) UI.clickToPlay(true);
  });
}

function updateInventoryUI() {
  if (!level) return;
  const pk = level.puzzle.kind;
  if (pk === 'fuses') {
    const ins = puzzleState?.inserted || 0;
    UI.setInventory(`Предохранители при себе: ${carriedFuses} · В щитке: ${ins}/3`);
  } else if (pk === 'levers') {
    UI.setInventory('Рычаги нужно дёрнуть одновременно (окно 6 сек)');
  } else if (pk === 'glyphs') {
    UI.setInventory('Найдите 4 таблички с символами');
  } else if (pk === 'valves') {
    const done = puzzleState?.done?.length || 0;
    UI.setInventory(`Вентили: ${done}/3`);
  } else if (pk === 'switches') {
    const done = puzzleState?.done?.length || 0;
    UI.setInventory(`Рубильники: ${done}/4`);
  }
}

// ---------- взаимодействие ----------

let glyphPanelVisible = false;

function nearestInteractable() {
  if (!level) return null;
  let best = null, bestD = 2.6 * 2.6;
  for (const item of level.items) {
    const mesh = world.itemMeshes.get(item.id);
    if (!mesh || !mesh.visible) continue;
    const dx = item.x - player.pos.x, dz = item.z - player.pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD) { bestD = d2; best = item; }
  }
  return best;
}

function tryInteract() {
  // выход из шкафчика
  if (player.hidden) {
    player.setHidden(false);
    UI.subtitles('');
    return;
  }
  const item = nearestInteractable();
  if (!item) return;
  if (item.type === 'locker') {
    player.setHidden(true);
    player.teleport(item.x, item.z);
    UI.subtitles('ты спрятался. сиди тихо. [E] — выйти', 6000);
    return;
  }
  if (item.type === 'valve') {
    // держим E — вентиль крутится 3 секунды
    startValveHold(item);
    return;
  }
  net.send({ t: 'interact', id: item.id });
}

let valveHold = null;
function startValveHold(item) {
  if (valveHold) return;
  audio.valveCreak();
  const need = (level.puzzle.holdTime || 3) * 1000;
  const started = Date.now();
  UI.prompt('крутим вентиль... <b>держи [E]</b>');
  valveHold = setInterval(() => {
    if (!player.keys.has('KeyE')) {
      clearInterval(valveHold); valveHold = null;
      UI.prompt('');
      return;
    }
    const mesh = world.itemMeshes.get(item.id);
    if (mesh?.userData.wheel) mesh.userData.wheel.rotation.z += 0.15;
    if (Date.now() - started >= need) {
      clearInterval(valveHold); valveHold = null;
      net.send({ t: 'interact', id: item.id });
      UI.prompt('');
    }
  }, 50);
}

function promptText() {
  if (player.hidden) return '<b>[E]</b> выйти из шкафчика';
  const item = nearestInteractable();
  if (!item) return null;
  const names = {
    fuse: 'подобрать предохранитель',
    fusebox: carriedFuses > 0 ? `вставить предохранители (${carriedFuses})` : 'нужны предохранители',
    lever: 'дёрнуть рычаг',
    locker: 'спрятаться в шкафчике',
    plate: null, // просто читается с таблички
    panel: null, // открывается панель
    valve: 'крутить вентиль (держать)',
    switch: 'включить рубильник',
  };
  const n = names[item.type];
  return n ? `<b>[E]</b> ${n}` : null;
}

// ---------- игровой цикл ----------

let lastT = 0;
function loop(t) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (t - lastT) / 1000 || 0.016);
  lastT = t;
  if (!level) { composer?.render(); return; }

  player.update(dt);
  world.update(dt, player.pos);
  partner.update(dt);
  if (entityView) entityView.update(dt, player.pos);

  // панель глифов видна рядом с панелью
  if (level.puzzle.kind === 'glyphs') {
    const panel = level.items.find(i => i.type === 'panel');
    const d2 = (panel.x - player.pos.x) ** 2 + (panel.z - player.pos.z) ** 2;
    const vis = d2 < 3.2 * 3.2;
    if (vis !== glyphPanelVisible) {
      glyphPanelVisible = vis;
      UI.glyphPanel(vis, puzzleState?.slots || [0, 0, 0, 0], level.puzzle.glyphs);
    }
  }

  UI.prompt(promptText());
  UI.stamina(player.stamina, player.stamina < 0.995);

  // звук: слушатель и сущность
  audio.updateListener(player.pos, player.forward());
  const edx = entityState.x - player.pos.x, edz = entityState.z - player.pos.z;
  const edist = Math.hypot(edx, edz);
  const hunting = ['hunt', 'chase', 'approach'].includes(entityState.state);
  audio.updateEntity(entityState.x, 1.5, entityState.z, edist, hunting);

  // случайный шёпот, когда сущность близко, но не видна
  if (edist < 18 && t - lastWhisper > 14000 && Math.random() < 0.004) {
    lastWhisper = t;
    audio.whisper();
  }

  // зерно/искажения усиливаются рядом с сущностью
  if (grainPass) {
    grainPass.uniforms.time.value = t / 1000;
    grainPass.uniforms.fear.value = Math.max(0, 1 - edist / 16);
  }

  composer.render();
}

// ---------- шейдер плёночного зерна ----------

const GrainShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    fear: { value: 0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float fear;
    varying vec2 vUv;

    float rand(vec2 co) {
      return fract(sin(dot(co, vec2(12.9898, 78.233)) + time) * 43758.5453);
    }

    void main() {
      vec2 uv = vUv;
      // лёгкая хроматическая аберрация, усиливается от страха
      float ca = 0.0012 + fear * 0.004;
      vec2 dir = uv - 0.5;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + dir * ca).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - dir * ca).b;
      // зерно
      float g = (rand(uv * vec2(1920.0, 1080.0)) - 0.5) * (0.06 + fear * 0.12);
      col += g;
      // виньетка
      float vig = smoothstep(0.95, 0.35, length(dir));
      col *= mix(0.55, 1.0, vig);
      // пульс затемнения от страха
      col *= 1.0 - fear * 0.22 * (0.5 + 0.5 * sin(time * 9.0));
      gl_FragColor = vec4(col, 1.0);
    }`,
};
