// Визуал сущностей. Позицию диктует сервер, клиент интерполирует и анимирует.
// Скиталец и Гончая — модель зомби (Гончая ползает на четвереньках),
// Жнец — огромный мутант, Кожекрад — точная копия модели игрока,
// Улыбающийся — канонная светящаяся улыбка во тьме.

import * as THREE from 'three';
import { smilerTexture } from './textures.js';
import { createCharacter, makeEyesSprite, loadMonster, instantiateMonster } from './characters.js';

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
    this.char = null;
    this.group = new THREE.Group();
    scene.add(this.group);
    this._build(type);
  }

  _build(type) {
    const g = this.group;
    if (type === 'wanderer') {
      // Скиталец: бледная истощённая тварь с расщеплённой пастью
      loadMonster('wanderer').then(gltf => {
        this.char = instantiateMonster(gltf, { height: 2.45 });
        g.add(this.char.root);
      });
    } else if (type === 'hound') {
      // Гончая: глянцево-чёрный зверь с белой ухмылкой
      loadMonster('hound').then(gltf => {
        this.char = instantiateMonster(gltf, { height: 1.35, rotateY: Math.PI / 2 });
        g.add(this.char.root);
      });
    } else if (type === 'smiler') {
      this._buildSmiler(g);
    } else if (type === 'skinstealer') {
      // Кожекрад: ТОЧНАЯ копия модели игрока. Выдают его только
      // неестественно склонённая голова и чуть длинные руки.
      const c = createCharacter();
      this.soldier = c;
      g.add(c.root);
      const b = c.bones;
      for (const side of ['Left', 'Right']) {
        if (b[side + 'Arm']) b[side + 'Arm'].scale.setScalar(1.12);
      }
    } else if (type === 'reaper') {
      // Жнец: гора мышц без кожи, не знает усталости
      loadMonster('mutant').then(gltf => {
        this.char = instantiateMonster(gltf, { height: 2.6, tint: 0x553a3a });
        g.add(this.char.root);
        this.eyes = makeEyesSprite('#ff2a12', 0.22);
        g.add(this.eyes);
      });
      this.glow = new THREE.PointLight(0xff1100, 9, 8, 1.6);
      this.glow.position.y = 1.9;
      g.add(this.glow);
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

    if (this.type === 'wanderer') this._animWanderer(dt, speed);
    else if (this.type === 'hound') this._animHound(dt, speed);
    else if (this.type === 'skinstealer') this._animSkinstealer(dt, speed);
    else if (this.type === 'reaper') this._animReaper(dt, speed);
    else if (this.type === 'smiler' && this.face) {
      const p = 0.9 + Math.sin(this.time * 7) * 0.08;
      this.face.scale.set(p, p, 1);
      this.face.position.y = 1.5 + Math.sin(this.time * 1.3) * 0.12;
      this.face.position.z = 0.8;
    }
    if (this.glow) this.glow.intensity = 7 + Math.sin(this.time * 13) * 2.5;
  }

  _animWanderer(dt, speed) {
    if (!this.char) return;
    // у модели один клип Idle — тварь «скользит», что выглядит только страшнее
    const hunting = this.state === 'hunt';
    this.char.play('idle', 0.3, hunting ? 2.2 : 1);
    this.char.mixer.update(dt);
    // наклон вперёд и нервное покачивание в погоне
    this.char.root.rotation.x = hunting ? 0.18 : 0.04 + Math.sin(this.time * 0.9) * 0.02;
    this.char.root.rotation.z = Math.sin(this.time * (hunting ? 7 : 1.6)) * (hunting ? 0.05 : 0.02);
    if (this.char.head) {
      this.char.head.rotation.z += Math.sin(this.time * 2.3) * 0.1 + Math.sin(this.time * 17) * 0.03;
    }
  }

  _animHound(dt, speed) {
    if (!this.char) return;
    // скелет без клипов: процедурный галоп — раскачка и рывки корпусом
    const chase = this.state === 'chase';
    const gallop = Math.min(1, speed / 3);
    const f = chase ? 11 : 5;
    this.char.root.position.y = Math.abs(Math.sin(this.time * f)) * 0.14 * (0.3 + gallop);
    this.char.root.rotation.x = Math.sin(this.time * f) * 0.1 * (0.3 + gallop);
    this.char.root.rotation.z = Math.sin(this.time * f * 0.5) * 0.04;
    this.char.mixer.update(dt);
  }

  _animSkinstealer(dt, speed) {
    if (!this.soldier) return;
    if (speed < 0.15) this.soldier.play('Idle', 0.3);
    else if (speed > 2.4) this.soldier.play('Run', 0.2, Math.max(0.7, speed / 4.8));
    else this.soldier.play('Walk', 0.25, Math.max(0.6, speed / 1.6));
    this.soldier.mixer.update(dt);
    // фирменный наклон головы — единственная примета двойника
    const b = this.soldier.bones;
    if (b.Head) b.Head.rotation.z += 0.3 + Math.sin(this.time * 0.6) * 0.05;
  }

  _animReaper(dt, speed) {
    if (!this.char) return;
    if (speed < 0.2) this.char.play('idle', 0.3);
    else this.char.play('run', 0.15, Math.max(0.8, speed / 4.2));
    this.char.mixer.update(dt);
    this._placeEyes(0.2);
  }

  _placeEyes(zOff) {
    if (!this.eyes || !this.char?.head) return;
    this.char.head.getWorldPosition(_v);
    this.group.worldToLocal(_v);
    _v.z += zOff;
    _v.y += 0.03;
    this.eyes.position.copy(_v);
  }

  dispose() {
    this.scene.remove(this.group);
  }
}
