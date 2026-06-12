// Реалистичные персонажи. Игроки — hazmat-костюм (как в Escape the Backrooms),
// анимации Idle/Walk/Run ретаргетятся с Mixamo-рига Soldier через мировые
// кватернионы (риги имеют разные оси костей и смотрят в разные стороны).
// Монстры — реальные модели, загружаются лениво на уровне.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const loader = new GLTFLoader();

const [soldierGltf, hazmatGltf] = await Promise.all([
  loader.loadAsync('/models/Soldier.glb'),
  loader.loadAsync('/models/hazmat_etb.glb'),
]);

// кости hazmat названы как Mixamo, но без префикса — приводим к именам Soldier
hazmatGltf.scene.traverse(o => {
  if (o.isBone) {
    const base = o.name.replace(/_\d+$/, '');
    if (!base.startsWith('mixamorig')) o.name = 'mixamorig' + base;
  }
  if (o.isMesh || o.isSkinnedMesh) o.castShadow = true;
});

// нормализация роста hazmat
const _hbox = new THREE.Box3().setFromObject(hazmatGltf.scene);
const HAZMAT_SCALE = 1.78 / Math.max(0.01, _hbox.max.y - _hbox.min.y);
const HAZMAT_Y = -_hbox.min.y * HAZMAT_SCALE;

// ---------- ретаргет анимаций (мировые кватернионы, посемплированно) ----------

function retargetWorld(srcScene, srcClip, tgtScene, srcTPose) {
  const srcBones = {};
  srcScene.traverse(o => { if (o.isBone) srcBones[o.name] = o; });
  const tgtBones = [];
  tgtScene.traverse(o => { if (o.isBone && srcBones[o.name]) tgtBones.push(o); });

  // источник в честную T-позу: его дефолтная поза в файле — не bind
  if (srcTPose) {
    const m0 = new THREE.AnimationMixer(srcScene);
    m0.clipAction(srcTPose).play();
    m0.setTime(0);
  }
  srcScene.updateMatrixWorld(true);
  tgtScene.updateMatrixWorld(true);

  const qs = new THREE.Quaternion();
  const SREST = {}, TREST = {}; // (src_rest)⁻¹ и tgt_rest в мировых координатах
  for (const b of tgtBones) {
    const qt = new THREE.Quaternion();
    srcBones[b.name].getWorldQuaternion(qs);
    b.getWorldQuaternion(qt);
    SREST[b.name] = qs.clone().invert();
    TREST[b.name] = qt.clone();
  }

  const mixer = new THREE.AnimationMixer(srcScene);
  mixer.clipAction(srcClip).play();
  const fps = 30;
  const frames = Math.max(2, Math.round(srcClip.duration * fps));
  const times = [], data = tgtBones.map(() => []);
  const worldQ = new Map();
  for (let f = 0; f < frames; f++) {
    const t = (f / (frames - 1)) * srcClip.duration * 0.999;
    mixer.setTime(t);
    srcScene.updateMatrixWorld(true);
    times.push(t);
    worldQ.clear();
    for (let i = 0; i < tgtBones.length; i++) {
      const b = tgtBones[i];
      srcBones[b.name].getWorldQuaternion(qs);
      // мировая дельта источника, применённая к rest-позе цели
      const wq = qs.clone().multiply(SREST[b.name]).multiply(TREST[b.name]);
      let pq;
      if (b.parent && worldQ.has(b.parent.name)) pq = worldQ.get(b.parent.name).clone();
      else { pq = new THREE.Quaternion(); b.parent.getWorldQuaternion(pq); }
      worldQ.set(b.name, wq.clone());
      const lq = pq.invert().multiply(wq);
      data[i].push(lq.x, lq.y, lq.z, lq.w);
    }
  }
  const tracks = tgtBones.map((b, i) =>
    new THREE.QuaternionKeyframeTrack(b.name + '.quaternion', times.slice(), data[i]));
  return new THREE.AnimationClip(srcClip.name, srcClip.duration, tracks);
}

// риги смотрят в противоположные стороны — выравниваем на время ретаргета
soldierGltf.scene.rotation.y = Math.PI;
const TPOSE = soldierGltf.animations.find(c => c.name === 'TPose');
const HAZMAT_CLIPS = ['Idle', 'Walk', 'Run'].map(name =>
  retargetWorld(soldierGltf.scene, soldierGltf.animations.find(c => c.name === name), hazmatGltf.scene, TPOSE));
soldierGltf.scene.rotation.y = 0;

// ---------- персонаж-игрок (hazmat) ----------

export function createCharacter(opts = {}) {
  const root = SkeletonUtils.clone(hazmatGltf.scene);
  const bones = {};
  root.traverse(o => {
    if (o.isBone) bones[o.name.replace('mixamorig', '')] = o;
    if (o.isMesh || o.isSkinnedMesh) {
      o.castShadow = true;
      o.frustumCulled = false;
      if (opts.material) o.material = opts.material;
    }
  });
  root.scale.setScalar(HAZMAT_SCALE);
  root.position.y = HAZMAT_Y;
  root.rotation.y = opts.rotateY ?? 0;

  const mixer = new THREE.AnimationMixer(root);
  const actions = {};
  for (const clip of HAZMAT_CLIPS) {
    actions[clip.name] = mixer.clipAction(clip);
  }

  const char = {
    root, mixer, actions, bones,
    current: null,
    play(name, fade = 0.25, timeScale = 1) {
      const next = actions[name];
      if (!next) return;
      next.timeScale = timeScale;
      if (this.current === next) return;
      next.reset().fadeIn(fade).play();
      if (this.current) this.current.fadeOut(fade);
      this.current = next;
    },
    setTimeScale(ts) {
      if (this.current) this.current.timeScale = ts;
    },
  };
  char.play('Idle', 0);
  return char;
}

// Светящиеся глаза-спрайт (пара точек), вешается на уровень головы
export function makeEyesSprite(color = '#ffd84a', size = 0.2) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const ctx = c.getContext('2d');
  for (const ex of [40, 88]) {
    const g = ctx.createRadialGradient(ex, 32, 0, ex, 32, 18);
    g.addColorStop(0, color);
    g.addColorStop(0.35, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(ex - 18, 14, 36, 36);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, depthTest: true, depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  sprite.scale.set(size, size / 2, 1);
  return sprite;
}

// ---------- модели монстров (ленивая загрузка по уровню) ----------

const monsterCache = new Map();

export function loadMonster(kind) {
  if (monsterCache.has(kind)) return monsterCache.get(kind);
  const p = (async () => {
    if (kind === 'mutant') {
      // меш и Idle/Walking из одного файла + run/attack из второго (один риг)
      const [a, b] = await Promise.all([
        loader.loadAsync('/models/mutant.glb'),
        loader.loadAsync('/models/mutant_anims.glb'),
      ]);
      a.animations = [...a.animations, ...b.animations];
      return a;
    }
    return loader.loadAsync('/models/' + kind + '.glb'); // wanderer | hound
  })();
  monsterCache.set(kind, p);
  return p;
}

// Подбор клипа по роли: у каждой модели свои имена анимаций
const ROLE_PATTERNS = {
  idle: [/^idle$/i, /idle/i],
  walk: [/^walk(ing)?$/i, /walk/i],
  run: [/^run$/i, /run/i],
  attack: [/melee/i, /attack/i],
};

export function instantiateMonster(gltf, opts = {}) {
  // НЕ клонируем: SkeletonUtils.clone ломает нестандартные риги (CATRig),
  // а сущность в игре в любой момент одна — используем кэшированную сцену
  const root = gltf.scene;
  root.traverse(o => {
    if (o.isMesh || o.isSkinnedMesh) {
      o.castShadow = true;
      o.frustumCulled = false;
      if (opts.tint && o.material) {
        o.material = o.material.clone();
        o.material.color = new THREE.Color(opts.tint);
      }
    }
  });

  // нормализация роста
  const box = new THREE.Box3().setFromObject(root);
  const h = Math.max(0.01, box.max.y - box.min.y);
  const s = (opts.height || 1.8) / h;
  const inner = new THREE.Group(); // обёртка: масштаб + доворот модели
  inner.add(root);
  root.scale.setScalar(s);
  root.position.y = -box.min.y * s + (opts.yOffset || 0);
  root.rotation.y = opts.rotateY || 0;

  const mixer = new THREE.AnimationMixer(root);
  const actions = {};
  for (const [role, patterns] of Object.entries(ROLE_PATTERNS)) {
    for (const re of patterns) {
      const clip = gltf.animations.find(c => re.test(c.name));
      if (clip) { actions[role] = mixer.clipAction(clip); break; }
    }
  }

  // голова для глаз/наклонов (по имени или самая высокая кость)
  let head = null, topY = -1;
  root.traverse(o => {
    if (o.isBone && /head/i.test(o.name)) head = o;
  });
  if (!head) {
    const v = new THREE.Vector3();
    root.traverse(o => {
      if (o.isBone) {
        o.getWorldPosition(v);
        if (v.y > topY) { topY = v.y; head = o; }
      }
    });
  }

  const char = {
    root: inner, mixer, actions, head,
    current: null,
    play(role, fade = 0.25, timeScale = 1) {
      const next = actions[role];
      if (!next) return;
      next.timeScale = timeScale;
      if (this.current === next) { next.timeScale = timeScale; return; }
      next.reset().fadeIn(fade).play();
      if (this.current) this.current.fadeOut(fade);
      this.current = next;
    },
  };
  if (actions.idle) char.play('idle', 0);
  else if (actions.walk) char.play('walk', 0);
  return char;
}
