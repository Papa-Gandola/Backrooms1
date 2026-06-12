// Реалистичные персонажи на базе риггованной модели (Mixamo-скелет, 49 костей,
// анимации Idle/Walk/Run). Одна и та же модель используется для аватаров игроков
// и для гуманоидных сущностей — кости масштабируются и позируются по-разному.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const gltf = await new GLTFLoader().loadAsync('/models/Soldier.glb');
gltf.scene.traverse(o => { if (o.isMesh || o.isSkinnedMesh) o.castShadow = true; });

export function createCharacter(opts = {}) {
  const root = SkeletonUtils.clone(gltf.scene);
  root.rotation.y = Math.PI; // модель изначально смотрит вдоль -Z, наше соглашение +Z
  const bones = {};
  root.traverse(o => {
    if (o.isBone) bones[o.name.replace('mixamorig', '')] = o;
    if (o.isMesh || o.isSkinnedMesh) {
      o.castShadow = true;
      o.frustumCulled = false; // кости двигают меш — стандартный куллинг ошибается
      if (opts.material) o.material = opts.material;
    }
  });

  const mixer = new THREE.AnimationMixer(root);
  const actions = {};
  for (const clip of gltf.animations) {
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
