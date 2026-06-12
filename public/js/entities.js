// Визуал сущностей. Позицию диктует сервер, клиент интерполирует и анимирует.

import * as THREE from 'three';
import { buildHumanoid } from './avatar.js';
import { smilerTexture } from './textures.js';

export class EntityView {
  constructor(scene, type, partnerName) {
    this.scene = scene;
    this.type = type;
    this.cur = { x: -999, z: -999 };
    this.dst = { x: -999, z: -999 };
    this.state = 'roam';
    this.time = 0;
    this.group = new THREE.Group();
    scene.add(this.group);
    this._build(type, partnerName);
  }

  _build(type) {
    const g = this.group;
    if (type === 'wanderer') {
      // Скиталец: высокая истощённая чёрная фигура с длинными руками
      const mat = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 1.0 });
      const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.20, 1.1, 4, 8), mat);
      torso.position.y = 1.45; torso.scale.x = 0.7;
      g.add(torso);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), mat);
      head.position.y = 2.25; head.scale.y = 1.4;
      g.add(head);
      // тусклые жёлтые глаза
      for (const sx of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 6),
          new THREE.MeshStandardMaterial({ emissive: 0x9a8a20, emissiveIntensity: 1.6 }));
        eye.position.set(sx * 0.05, 2.3, -0.11);
        g.add(eye);
      }
      const armGeo = new THREE.CapsuleGeometry(0.045, 1.05, 4, 6);
      this.armL = new THREE.Mesh(armGeo, mat);
      this.armL.position.set(-0.26, 1.25, 0);
      g.add(this.armL);
      this.armR = new THREE.Mesh(armGeo, mat);
      this.armR.position.set(0.26, 1.25, 0);
      g.add(this.armR);
      const legs = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.8, 4, 8), mat);
      legs.position.y = 0.55;
      g.add(legs);
    } else if (type === 'hound') {
      // Гончая: низкий бледный четвероногий силуэт
      const mat = new THREE.MeshStandardMaterial({ color: 0x8f8378, roughness: 0.95 });
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.9, 4, 8), mat);
      body.rotation.z = Math.PI / 2;
      body.position.y = 0.55;
      g.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), mat);
      head.position.set(0, 0.62, -0.62);
      head.scale.z = 1.5;
      g.add(head);
      // пасть
      const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.25),
        new THREE.MeshStandardMaterial({ color: 0x551111, roughness: 0.6 }));
      jaw.position.set(0, 0.5, -0.75);
      g.add(jaw);
      this.legs = [];
      for (const [lx, lz] of [[-0.16, -0.35], [0.16, -0.35], [-0.16, 0.35], [0.16, 0.35]]) {
        const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.45, 4, 6), mat);
        leg.position.set(lx, 0.28, lz);
        g.add(leg);
        this.legs.push(leg);
      }
    } else if (type === 'smiler') {
      // Улыбающийся: почти невидимое тело и светящаяся улыбка
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8),
        new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 1.0, transparent: true, opacity: 0.85 }));
      body.position.y = 1.55;
      g.add(body);
      const face = new THREE.Sprite(new THREE.SpriteMaterial({
        map: smilerTexture(), transparent: true, depthTest: true,
      }));
      face.scale.set(0.85, 0.85, 1);
      face.position.y = 1.55;
      g.add(face);
      this.face = face;
    } else if (type === 'skinstealer') {
      // Кожекрад строится в game.js как копия аватара напарника — тут заглушка
      const h = buildHumanoid(0x4f6b8f, true);
      g.add(h);
      this.humanoid = h;
    } else if (type === 'reaper') {
      // Жнец: высокая рваная фигура с красным свечением
      const mat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1.0 });
      const robe = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.4, 8), mat);
      robe.position.y = 1.2;
      g.add(robe);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), mat);
      head.position.y = 2.45;
      g.add(head);
      const glow = new THREE.PointLight(0xff1100, 10, 8, 1.6);
      glow.position.y = 1.8;
      g.add(glow);
      this.glow = glow;
      for (const sx of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6),
          new THREE.MeshStandardMaterial({ emissive: 0xff2200, emissiveIntensity: 4 }));
        eye.position.set(sx * 0.06, 2.48, -0.13);
        g.add(eye);
      }
    }
  }

  netUpdate(m) {
    this.dst.x = m.x; this.dst.z = m.z;
    this.state = m.state;
    if (this.dst.x !== -999 && this.cur.x === -999) {
      this.cur.x = m.x; this.cur.z = m.z;
    }
  }

  update(dt, playerPos) {
    this.time += dt;
    const k = 1 - Math.pow(0.002, dt);
    this.cur.x += (this.dst.x - this.cur.x) * k;
    this.cur.z += (this.dst.z - this.cur.z) * k;
    this.group.position.set(this.cur.x, 0, this.cur.z);
    this.group.visible = this.state !== 'dormant' && this.cur.x > -500;

    // поворот в сторону движения / игрока
    const dx = this.dst.x - this.cur.x, dz = this.dst.z - this.cur.z;
    if (dx * dx + dz * dz > 0.0004) {
      this.group.rotation.y = Math.atan2(dx, dz);
    } else if (playerPos) {
      this.group.rotation.y = Math.atan2(playerPos.x - this.cur.x, playerPos.z - this.cur.z);
    }

    // анимации
    if (this.type === 'wanderer' && this.armL) {
      const s = this.state === 'hunt' ? 9 : 3.5;
      this.armL.rotation.x = Math.sin(this.time * s) * 0.45;
      this.armR.rotation.x = -Math.sin(this.time * s) * 0.45;
      this.group.position.y = Math.abs(Math.sin(this.time * s * 0.5)) * 0.05;
    }
    if (this.type === 'hound' && this.legs) {
      const s = this.state === 'chase' ? 16 : 6;
      this.legs.forEach((leg, i) => {
        leg.rotation.x = Math.sin(this.time * s + i * Math.PI / 2) * 0.7;
      });
    }
    if (this.type === 'smiler' && this.face) {
      // улыбка дрожит и пульсирует
      const p = 0.8 + Math.sin(this.time * 7) * 0.08;
      this.face.scale.set(p, p, 1);
      this.face.position.y = 1.55 + Math.sin(this.time * 1.3) * 0.12;
    }
    if (this.type === 'skinstealer' && this.humanoid) {
      const ud = this.humanoid.userData;
      const moving = Math.abs(dx) + Math.abs(dz) > 0.01;
      if (moving) {
        ud.walkPhase = (ud.walkPhase || 0) + dt * 6;
        ud.armL.rotation.x = Math.sin(ud.walkPhase) * 0.6;
        ud.armR.rotation.x = -Math.sin(ud.walkPhase) * 0.6;
      }
      // голова неестественно наклонена — единственное, что выдаёт двойника
      ud.head.rotation.z = 0.22 + Math.sin(this.time * 0.6) * 0.06;
    }
    if (this.type === 'reaper' && this.glow) {
      this.glow.intensity = 8 + Math.sin(this.time * 13) * 3;
      this.group.position.y = Math.sin(this.time * 2.2) * 0.1;
    }
  }

  dispose() {
    this.scene.remove(this.group);
  }
}
