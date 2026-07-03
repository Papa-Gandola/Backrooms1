// Аватар напарника: реалистичная риггованная модель с анимациями.

import * as THREE from 'three';
import { createCharacter } from './characters.js';
import { makeFlashCookie } from './player.js';

export function makeNameSprite(name, color = '#7ec850') {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.font = '32px Oswald, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = color;
  ctx.shadowColor = '#000';
  ctx.shadowBlur = 8;
  ctx.fillText(name, 128, 42);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sprite.scale.set(1.6, 0.4, 1);
  sprite.position.y = 2.05;
  return sprite;
}

// Тело главного героя: видно от первого лица (ноги/руки при взгляде вниз),
// голова скрыта, анимации те же, что у напарника.
export class SelfBody {
  constructor(scene) {
    this.scene = scene;
    this.char = createCharacter();
    const b = this.char.bones;
    if (b.Head) b.Head.scale.setScalar(0.001); // прячем голову (камера внутри)
    this.mesh = new THREE.Group();
    this.mesh.add(this.char.root);
    scene.add(this.mesh);
  }

  update(dt, player) {
    this.mesh.visible = !player.hidden;
    // тело позади камеры; при приседе — заметно дальше, иначе капюшон
    // и грудь оказываются ВНУТРИ камеры и весь экран заливает жёлтым
    const back = player.crouch ? 0.5 : 0.18;
    const bx = player.pos.x + Math.sin(player.yaw) * back;
    const bz = player.pos.z + Math.cos(player.yaw) * back;
    this.mesh.position.set(bx, 0, bz);
    this.mesh.rotation.y = player.yaw + Math.PI;

    if (player.moving) {
      this.char.play(player.running ? 'Run' : 'Walk', 0.2, player.crouch ? 0.7 : 1);
    } else {
      this.char.play('Idle', 0.3);
    }
    this.char.mixer.update(dt);

    const b = this.char.bones;
    if (player.crouch) {
      if (b.Spine) b.Spine.rotation.x += 0.15; // лёгкий наклон, не в камеру
      this.char.root.position.y = -0.38;
    } else {
      this.char.root.position.y = 0;
    }
  }
}

// Аватар напарника с интерполяцией по сети
export class PartnerAvatar {
  constructor(scene, name) {
    this.scene = scene;
    this.char = createCharacter();
    this.mesh = new THREE.Group();
    this.mesh.add(this.char.root);

    this.nameSprite = makeNameSprite(name);
    this.mesh.add(this.nameSprite);

    this.flash = new THREE.SpotLight(0xfff1d0, 0, 20, 0.46, 0.9, 1.25);
    this.flash.map = makeFlashCookie();
    this.flash.castShadow = true; // без теней SpotLight игнорирует map
    this.flash.shadow.mapSize.set(512, 512);
    this.flash.shadow.bias = -0.002;
    this.flashTarget = new THREE.Object3D();
    this.scene.add(this.flashTarget);
    this.flash.target = this.flashTarget;
    this.mesh.add(this.flash);
    this.flash.position.set(0.2, 1.4, 0.2);

    this.cur = { x: 0, z: 0, yaw: 0 };
    this.dst = { x: 0, z: 0, yaw: 0, pitch: 0, light: false, crouch: false, moving: false, running: false, hidden: false };
    scene.add(this.mesh);
  }

  netUpdate(m) {
    this.dst.x = m.pos.x; this.dst.z = m.pos.z;
    this.dst.yaw = m.yaw; this.dst.pitch = m.pitch || 0;
    this.dst.light = m.light; this.dst.crouch = m.crouch;
    this.dst.moving = m.moving; this.dst.running = m.running;
    this.dst.hidden = m.hidden;
  }

  update(dt) {
    const k = 1 - Math.pow(0.001, dt); // плавная интерполяция
    this.cur.x += (this.dst.x - this.cur.x) * k;
    this.cur.z += (this.dst.z - this.cur.z) * k;
    let dy = this.dst.yaw - this.cur.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.cur.yaw += dy * k;

    this.mesh.position.set(this.cur.x, 0, this.cur.z);
    this.mesh.rotation.y = this.cur.yaw + Math.PI; // модель смотрит вдоль +Z
    this.mesh.visible = !this.dst.hidden;

    // выбор анимации
    if (this.dst.moving) {
      this.char.play(this.dst.running ? 'Run' : 'Walk', 0.2, this.dst.crouch ? 0.7 : 1);
    } else {
      this.char.play('Idle', 0.3);
    }
    this.char.mixer.update(dt);

    // процедурные поправки ПОСЛЕ микшера: наклон головы по pitch, присед
    const b = this.char.bones;
    if (b.Head) b.Head.rotation.x -= (this.dst.pitch || 0) * 0.55;
    if (this.dst.crouch) {
      if (b.Spine) b.Spine.rotation.x += 0.45;
      if (b.Hips) this.char.root.position.y = -0.32;
    } else {
      this.char.root.position.y = 0;
    }

    // фонарик
    this.flash.intensity = (this.dst.light && !this.dst.hidden) ? 48 : 0;
    if (this.dst.light) {
      const fx = -Math.sin(this.cur.yaw), fz = -Math.cos(this.cur.yaw);
      this.flashTarget.position.set(this.cur.x + fx * 6, 1.2, this.cur.z + fz * 6);
    }
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.scene.remove(this.flashTarget);
  }
}
