// Контроллер от первого лица: pointer lock, ходьба/бег/присед, выносливость,
// фонарик, покачивание камеры, коллизии с сеткой уровня.

import * as THREE from 'three';

// Гобо-текстура луча: горячее пятно, кольцевой ореол, неровный рваный край
// и лёгкие радиальные штрихи — как у настоящего LED-фонаря.
export function makeFlashCookie() {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const R = size / 2;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);

  // основной профиль: яркая середина, плавный спад к краю
  let g = ctx.createRadialGradient(R, R, 0, R, R, R);
  g.addColorStop(0.0, 'rgba(255,250,235,0.98)');
  g.addColorStop(0.35, 'rgba(255,244,218,0.80)');
  g.addColorStop(0.62, 'rgba(255,238,205,0.55)');
  g.addColorStop(0.85, 'rgba(255,234,195,0.30)');
  g.addColorStop(1.0, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  // лёгкий провал рефлектора между пятном и короной
  g = ctx.createRadialGradient(R, R, R * 0.34, R, R, R * 0.66);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.5, 'rgba(0,0,0,0.14)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  // корона — светлое кольцо ближе к краю
  g = ctx.createRadialGradient(R, R, R * 0.62, R, R, R * 0.94);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.5, 'rgba(255,240,208,0.20)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  // радиальные штрихи от рефлектора (неравномерность по окружности)
  ctx.save();
  ctx.translate(R, R);
  ctx.globalCompositeOperation = 'multiply';
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2 + Math.sin(i * 12.9898) * 0.05;
    const dark = 0.90 + Math.sin(i * 78.233) * 0.08;
    ctx.strokeStyle = `rgba(${(dark * 255) | 0},${(dark * 255) | 0},${(dark * 255) | 0},0.30)`;
    ctx.lineWidth = 4 + (Math.sin(i * 3.7) + 1) * 5;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * R * 0.36, Math.sin(a) * R * 0.36);
    ctx.lineTo(Math.cos(a) * R * 0.99, Math.sin(a) * R * 0.99);
    ctx.stroke();
  }
  ctx.restore();

  // рваный внешний край
  ctx.save();
  ctx.translate(R, R);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.beginPath();
  const N = 96;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const wob = 0.955 + Math.sin(a * 9 + 1.7) * 0.02 + Math.sin(a * 23 + 4.2) * 0.015;
    const rr = R * wob;
    if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.restore();

  // горячее пятно в центре — поверх всего
  g = ctx.createRadialGradient(R, R, 0, R, R, R * 0.42);
  g.addColorStop(0.0, 'rgba(255,255,250,1)');
  g.addColorStop(0.5, 'rgba(255,250,230,0.7)');
  g.addColorStop(1.0, 'rgba(255,244,210,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class PlayerController {
  constructor(camera, world, audio) {
    this.camera = camera;
    this.world = world;
    this.audio = audio;

    this.pos = new THREE.Vector3(2, 1.7, 2);
    this.yaw = 0;
    this.pitch = 0;
    this.vel = new THREE.Vector3();
    this.keys = new Set();
    this.crouch = false;
    this.running = false;
    this.moving = false;
    this.stamina = 1;
    this.light = false;
    this.hidden = false;     // в шкафчике
    this.frozen = false;     // во время скримера/перехода
    this.bobPhase = 0;
    this.stepAccum = 0;
    this.eyeHeight = 1.7;

    // фонарик: узкий луч с гобо-текстурой + широкий тусклый разлив света
    this.flash = new THREE.SpotLight(0xfff1d0, 0, 24, 0.48, 0.9, 1.25);
    this.flash.map = makeFlashCookie();
    this.flash.castShadow = true;
    this.flash.shadow.mapSize.set(1024, 1024);
    this.flash.shadow.bias = -0.002;
    this.flashTarget = new THREE.Object3D();
    this.flash.target = this.flashTarget;
    this.spill = new THREE.SpotLight(0xffe6bf, 0, 14, 1.05, 0.95, 1.8);
    this.spill.target = this.flashTarget;

    // объёмный конус луча (фейковый volumetric)
    const coneGeo = new THREE.ConeGeometry(2.6, 9, 24, 1, true);
    coneGeo.translate(0, -4.5, 0);     // вершина в начале координат
    coneGeo.rotateX(-Math.PI / 2);     // раскрытие вдоль +Z
    this.beam = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({
      color: 0xfff3d6, transparent: true, opacity: 0.05,
      blending: THREE.AdditiveBlending, depthWrite: false,
      side: THREE.DoubleSide, fog: false,
    }));
    this.beam.visible = false;

    this._bind();
  }

  addToScene(scene) {
    scene.add(this.flash);
    scene.add(this.spill);
    scene.add(this.flashTarget);
    scene.add(this.beam);
  }

  _bind() {
    document.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'KeyF' && !this.frozen && !this.hidden) {
        this.light = !this.light;
        this.audio.uiTick();
      }
      if (e.code === 'KeyC') this.crouch = !this.crouch;
    });
    document.addEventListener('keyup', (e) => this.keys.delete(e.code));

    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== document.getElementById('canvas')) return;
      if (this.frozen) return;
      this.yaw -= e.movementX * 0.0022;
      this.pitch -= e.movementY * 0.0022;
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
    });
  }

  teleport(x, z) {
    this.pos.set(x, this.eyeHeight, z);
    this.vel.set(0, 0, 0);
  }

  setHidden(h) {
    this.hidden = h;
    if (h) this.light = false;
  }

  update(dt) {
    const k = this.keys;
    let fwd = 0, str = 0;
    if (!this.frozen && !this.hidden) {
      if (k.has('KeyW') || k.has('ArrowUp')) fwd += 1;
      if (k.has('KeyS') || k.has('ArrowDown')) fwd -= 1;
      if (k.has('KeyA') || k.has('ArrowLeft')) str -= 1;
      if (k.has('KeyD') || k.has('ArrowRight')) str += 1;
    }

    const wantRun = (k.has('ShiftLeft') || k.has('ShiftRight')) && fwd > 0 && !this.crouch;
    this.running = wantRun && this.stamina > 0.02;

    // выносливость
    if (this.running && (fwd || str)) this.stamina = Math.max(0, this.stamina - dt * 0.22);
    else this.stamina = Math.min(1, this.stamina + dt * 0.13);

    const inWater = this.world.grid && this.world.isWater(this.pos.x, this.pos.z);
    let speed = this.crouch ? 1.6 : (this.running ? 5.4 : 3.0);
    if (inWater) speed *= 0.55;

    // направление движения в мировых координатах
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const dx = (-sin * fwd + cos * str);
    const dz = (-cos * fwd - sin * str);
    const len = Math.hypot(dx, dz) || 1;

    const ax = (dx / len) * speed;
    const az = (dz / len) * speed;
    const accel = 14;
    this.vel.x += (ax - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (az - this.vel.z) * Math.min(1, accel * dt);

    let nx = this.pos.x + this.vel.x * dt;
    let nz = this.pos.z + this.vel.z * dt;
    if (this.world.grid) {
      const c = this.world.collide(nx, nz, 0.35);
      nx = c.x; nz = c.z;
    }
    // мебель занимает место
    if (this.world.propColliders) {
      for (const c of this.world.propColliders) {
        const dx2 = nx - c.x, dz2 = nz - c.z;
        const min = c.r + 0.3;
        const d2 = dx2 * dx2 + dz2 * dz2;
        if (d2 < min * min && d2 > 1e-9) {
          const d = Math.sqrt(d2);
          nx = c.x + (dx2 / d) * min;
          nz = c.z + (dz2 / d) * min;
        }
      }
      // мебель могла затолкать в стену — повторная проверка стен
      if (this.world.grid) {
        const c2 = this.world.collide(nx, nz, 0.35);
        nx = c2.x; nz = c2.z;
      }
    }
    this.pos.x = nx; this.pos.z = nz;

    this.moving = (fwd !== 0 || str !== 0) && Math.hypot(this.vel.x, this.vel.z) > 0.4;

    // шаги
    if (this.moving && !this.hidden) {
      this.stepAccum += Math.hypot(this.vel.x, this.vel.z) * dt;
      const stepLen = this.running ? 2.4 : 1.7;
      if (this.stepAccum > stepLen) {
        this.stepAccum = 0;
        this.audio.footstep(this.running, inWater);
      }
    }

    // высота глаз и покачивание
    const targetEye = this.crouch ? 1.05 : 1.7;
    this.eyeHeight += (targetEye - this.eyeHeight) * Math.min(1, 10 * dt);
    if (this.moving) this.bobPhase += dt * (this.running ? 13 : 8);
    const bob = this.moving ? Math.sin(this.bobPhase) * (this.running ? 0.055 : 0.03) : 0;
    const sway = this.moving ? Math.sin(this.bobPhase * 0.5) * 0.02 : 0;

    this.pos.y = this.eyeHeight + bob + (inWater ? -0.25 : 0);

    this.camera.position.copy(this.pos);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw + sway * 0.4;
    this.camera.rotation.x = this.pitch;
    this.camera.rotation.z = sway;

    // фонарик следует за взглядом с небольшим отставанием
    const on = this.light && !this.hidden;
    this.flash.intensity = on ? 55 : 0; // гобо-текстура съедает часть яркости
    this.spill.intensity = on ? 7 : 0;
    this.flash.position.copy(this.pos);
    this.flash.position.y -= 0.15;
    this.spill.position.copy(this.flash.position);
    const fx = -Math.sin(this.yaw) * Math.cos(this.pitch);
    const fy = Math.sin(this.pitch);
    const fz = -Math.cos(this.yaw) * Math.cos(this.pitch);
    const t = this.flashTarget.position;
    const want = new THREE.Vector3(this.pos.x + fx * 8, this.pos.y + fy * 8, this.pos.z + fz * 8);
    t.lerp(want, Math.min(1, 12 * dt));

    // объёмный луч: вершина чуть ниже камеры, направлен на цель фонаря
    this.beam.visible = this.flash.intensity > 0;
    if (this.beam.visible) {
      this.beam.position.copy(this.pos);
      this.beam.position.y -= 0.18;
      this.beam.lookAt(t);
      this.beam.material.opacity = 0.045 + Math.sin(performance.now() / 700) * 0.006;
    }
  }

  forward() {
    return {
      x: -Math.sin(this.yaw) * Math.cos(this.pitch),
      y: Math.sin(this.pitch),
      z: -Math.cos(this.yaw) * Math.cos(this.pitch),
    };
  }

  netState() {
    return {
      t: 'state',
      pos: { x: round2(this.pos.x), y: round2(this.pos.y), z: round2(this.pos.z) },
      yaw: round2(this.yaw),
      pitch: round2(this.pitch),
      light: this.light,
      crouch: this.crouch,
      moving: this.moving,
      running: this.running,
      hidden: this.hidden,
    };
  }
}

function round2(v) { return Math.round(v * 100) / 100; }
