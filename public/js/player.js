// Контроллер от первого лица: pointer lock, ходьба/бег/присед, выносливость,
// фонарик, покачивание камеры, коллизии с сеткой уровня.

import * as THREE from 'three';

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

    // фонарик
    this.flash = new THREE.SpotLight(0xfff1d0, 0, 22, 0.46, 0.45, 1.2);
    this.flash.castShadow = true;
    this.flash.shadow.mapSize.set(512, 512);
    this.flashTarget = new THREE.Object3D();
    this.flash.target = this.flashTarget;

    this._bind();
  }

  addToScene(scene) {
    scene.add(this.flash);
    scene.add(this.flashTarget);
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
    this.flash.intensity = (this.light && !this.hidden) ? 42 : 0;
    this.flash.position.copy(this.pos);
    this.flash.position.y -= 0.15;
    const fx = -Math.sin(this.yaw) * Math.cos(this.pitch);
    const fy = Math.sin(this.pitch);
    const fz = -Math.cos(this.yaw) * Math.cos(this.pitch);
    const t = this.flashTarget.position;
    const want = new THREE.Vector3(this.pos.x + fx * 8, this.pos.y + fy * 8, this.pos.z + fz * 8);
    t.lerp(want, Math.min(1, 12 * dt));
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
