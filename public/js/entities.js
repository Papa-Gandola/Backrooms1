// Визуал сущностей. Позицию диктует сервер, клиент интерполирует и анимирует.
// Гуманоиды (Скиталец, Кожекрад, Жнец) — реалистичная риггованная модель
// с изменёнными пропорциями костей. Соглашение: лицо вдоль локальной +Z.

import * as THREE from 'three';
import { smilerTexture } from './textures.js';
import { fleshMaterial, clothMaterial, gnarl } from './materials.js';
import { createCharacter, makeEyesSprite } from './characters.js';

const _v = new THREE.Vector3();

export class EntityView {
  constructor(scene, type) {
    this.scene = scene;
    this.type = type;
    this.cur = { x: -999, z: -999 };
    this.dst = { x: -999, z: -999 };
    this.prev = { x: -999, z: -999 };
    this.state = 'roam';
    this.time = 0;
    this.group = new THREE.Group();
    scene.add(this.group);
    this._build(type);
  }

  _build(type) {
    const g = this.group;
    if (type === 'wanderer') {
      // Скиталец: измождённый чёрный гигант — вытянутый, руки до колен
      this.char = createCharacter({ material: fleshMaterial(0x16161b, 0x09090d, 0.55) });
      this.char.root.scale.set(1.04, 1.28, 1.04);
      g.add(this.char.root);
      const b = this.char.bones;
      for (const side of ['Left', 'Right']) {
        if (b[side + 'Arm']) b[side + 'Arm'].scale.setScalar(1.32); // длинные руки
      }
      if (b.Neck) b.Neck.scale.setScalar(1.25);
      this.eyes = makeEyesSprite('#e8c63a', 0.17);
      g.add(this.eyes);
    } else if (type === 'hound') {
      this._buildHound(g);
    } else if (type === 'smiler') {
      this._buildSmiler(g);
    } else if (type === 'skinstealer') {
      // Кожекрад: ТОЧНАЯ копия модели игрока. Выдают его только
      // неестественно склонённая голова и чуть длинные руки.
      this.char = createCharacter();
      g.add(this.char.root);
      const b = this.char.bones;
      for (const side of ['Left', 'Right']) {
        if (b[side + 'Arm']) b[side + 'Arm'].scale.setScalar(1.12);
      }
    } else if (type === 'reaper') {
      // Жнец: высокая фигура в чёрной ткани, алые глаза, бежит не уставая
      this.char = createCharacter({ material: clothMaterial(0x0b0b0e) });
      this.char.root.scale.set(1.1, 1.33, 1.1);
      g.add(this.char.root);
      const b = this.char.bones;
      for (const side of ['Left', 'Right']) {
        if (b[side + 'Arm']) b[side + 'Arm'].scale.setScalar(1.22);
      }
      this.eyes = makeEyesSprite('#ff2a12', 0.2);
      g.add(this.eyes);
      this.glow = new THREE.PointLight(0xff1100, 9, 8, 1.6);
      this.glow.position.y = 1.9;
      g.add(this.glow);
    }
  }

  // Гончая: безглазый ободранный четвероногий хищник (процедурная органика)
  _buildHound(g) {
    const skin = fleshMaterial(0x9a8d7d, 0x6e3a34, 0.35);
    const raw = fleshMaterial(0x5e2520, 0x3f1612, 0.25);
    const body = new THREE.Group();
    g.add(body);
    this.body = body;

    const spine = new THREE.Mesh(gnarl(new THREE.CapsuleGeometry(0.17, 0.7, 8, 16), 0.03, 10, 2), skin);
    spine.rotation.x = Math.PI / 2;
    spine.position.set(0, 0.62, 0);
    body.add(spine);
    const chest = new THREE.Mesh(gnarl(new THREE.SphereGeometry(0.21, 14, 12), 0.035, 8, 4), skin);
    chest.position.set(0, 0.64, 0.32); chest.scale.set(1, 1.05, 1.2);
    body.add(chest);
    const rump = new THREE.Mesh(gnarl(new THREE.SphereGeometry(0.17, 14, 12), 0.03, 9, 6), skin);
    rump.position.set(0, 0.66, -0.36); rump.scale.set(0.9, 1, 1.2);
    body.add(rump);
    for (let i = 0; i < 6; i++) {
      const v = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.09, 5), raw);
      v.position.set(0, 0.84 - Math.abs(i - 2.5) * 0.012, 0.3 - i * 0.13);
      body.add(v);
    }
    const neck = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.22, 4, 8), skin);
    neck.position.set(0, 0.76, 0.52); neck.rotation.x = Math.PI / 2 - 0.5;
    body.add(neck);
    const skull = new THREE.Mesh(gnarl(new THREE.SphereGeometry(0.115, 16, 12), 0.02, 14, 8), skin);
    skull.position.set(0, 0.88, 0.68); skull.scale.set(0.85, 0.8, 1.5);
    body.add(skull);
    const maw = new THREE.Group();
    maw.position.set(0, 0.84, 0.74);
    body.add(maw);
    this.maw = maw;
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.035, 0.26), skin);
    jaw.position.set(0, -0.06, 0.1);
    maw.add(jaw);
    const throat = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.06, 0.22), raw);
    throat.position.set(0, -0.02, 0.08);
    maw.add(throat);
    const toothMat = new THREE.MeshStandardMaterial({ color: 0xd8cdb6, roughness: 0.4 });
    for (let i = 0; i < 4; i++) {
      for (const sy of [-1, 1]) {
        const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.05, 4), toothMat);
        tooth.position.set((i - 1.5) * 0.028, sy === 1 ? 0.02 : -0.045, 0.19);
        tooth.rotation.x = sy === 1 ? Math.PI : 0;
        maw.add(tooth);
      }
    }
    this.legs = [];
    for (const [sx, sz] of [[-0.13, 0.3], [0.13, 0.3], [-0.12, -0.36], [0.12, -0.36]]) {
      const leg = new THREE.Group();
      leg.position.set(sx, 0.52, sz);
      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.28, 4, 6), skin);
      upper.position.y = -0.12;
      leg.add(upper);
      const lower = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.26, 4, 6), skin);
      lower.position.y = -0.38;
      leg.add(lower);
      body.add(leg);
      this.legs.push(leg);
    }
  }

  // Улыбающийся: сгусток тьмы со светящейся улыбкой
  _buildSmiler(g) {
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 1.0, transparent: true, opacity: 0.92 }));
    body.position.y = 1.5; body.scale.y = 1.25;
    g.add(body);
    const haze = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 1.0, transparent: true, opacity: 0.35 }));
    haze.position.y = 1.5; haze.scale.y = 1.2;
    g.add(haze);
    const face = new THREE.Sprite(new THREE.SpriteMaterial({
      map: smilerTexture(), transparent: true, depthTest: true, depthWrite: false,
    }));
    face.scale.set(0.95, 0.95, 1);
    face.position.set(0, 1.5, 0.8);
    g.add(face);
    this.face = face;
  }

  netUpdate(m) {
    this.dst.x = m.x; this.dst.z = m.z;
    this.state = m.state;
    if (this.dst.x !== -999 && this.cur.x === -999) {
      this.cur.x = m.x; this.cur.z = m.z;
      this.prev.x = m.x; this.prev.z = m.z;
    }
  }

  update(dt, playerPos) {
    this.time += dt;
    const k = 1 - Math.pow(0.002, dt);
    this.cur.x += (this.dst.x - this.cur.x) * k;
    this.cur.z += (this.dst.z - this.cur.z) * k;
    this.group.position.set(this.cur.x, 0, this.cur.z);
    this.group.visible = this.state !== 'dormant' && this.cur.x > -500;

    // фактическая скорость для синхронизации анимации с движением
    const mvx = this.cur.x - this.prev.x, mvz = this.cur.z - this.prev.z;
    const speed = dt > 0 ? Math.hypot(mvx, mvz) / dt : 0;
    this.prev.x = this.cur.x; this.prev.z = this.cur.z;

    // поворот в сторону движения / игрока
    const dx = this.dst.x - this.cur.x, dz = this.dst.z - this.cur.z;
    if (dx * dx + dz * dz > 0.0004) {
      this.group.rotation.y = Math.atan2(dx, dz);
    } else if (playerPos) {
      this.group.rotation.y = Math.atan2(playerPos.x - this.cur.x, playerPos.z - this.cur.z);
    }

    if (this.char) this._updateHumanoid(dt, speed);
    if (this.type === 'hound' && this.legs) {
      const s = this.state === 'chase' ? 16 : 6;
      this.legs.forEach((leg, i) => {
        leg.rotation.x = Math.sin(this.time * s + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.65;
      });
      this.body.position.y = Math.abs(Math.sin(this.time * s * 0.5)) * 0.06;
      if (this.maw) this.maw.rotation.x = this.state === 'chase'
        ? Math.max(0, Math.sin(this.time * 13)) * 0.5
        : 0.12;
    }
    if (this.type === 'smiler' && this.face) {
      const p = 0.9 + Math.sin(this.time * 7) * 0.08;
      this.face.scale.set(p, p, 1);
      this.face.position.y = 1.5 + Math.sin(this.time * 1.3) * 0.12;
      this.face.position.z = 0.8;
    }
    if (this.glow) this.glow.intensity = 7 + Math.sin(this.time * 13) * 2.5;
  }

  _updateHumanoid(dt, speed) {
    const hunting = ['hunt', 'chase', 'approach'].includes(this.state);
    // анимация по скорости: стоит / идёт / бежит
    if (speed < 0.15) {
      this.char.play('Idle', 0.3);
    } else if (speed < 2.4) {
      this.char.play('Walk', 0.25, Math.max(0.6, speed / 1.6));
    } else {
      this.char.play('Run', 0.2, Math.max(0.7, speed / 4.8));
    }
    this.char.mixer.update(dt);

    // процедурные правки ПОСЛЕ микшера
    const b = this.char.bones;
    if (this.type === 'wanderer') {
      // дёргающаяся голова и сутулость
      if (b.Head) {
        b.Head.rotation.z += Math.sin(this.time * 2.1) * 0.16 + Math.sin(this.time * 19) * 0.03;
        b.Head.rotation.x += 0.12;
      }
      if (b.Spine) b.Spine.rotation.x += 0.18;
    } else if (this.type === 'skinstealer') {
      // фирменный наклон головы — единственная примета двойника
      if (b.Head) b.Head.rotation.z += 0.3 + Math.sin(this.time * 0.6) * 0.05;
    } else if (this.type === 'reaper') {
      if (b.Spine) b.Spine.rotation.x += 0.1;
      if (b.Head) b.Head.rotation.x -= 0.1; // взгляд исподлобья
    }

    // светящиеся глаза следуют за головой
    if (this.eyes && b.Head) {
      b.Head.getWorldPosition(_v);
      this.group.worldToLocal(_v);
      _v.z += 0.19; // перед лицом, чтобы не тонули в геометрии головы
      _v.y += 0.04;
      this.eyes.position.copy(_v);
    }
  }

  dispose() {
    this.scene.remove(this.group);
  }
}
