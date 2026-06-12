// Визуал сущностей. Позицию диктует сервер, клиент интерполирует и анимирует.
// Соглашение: сущность смотрит вдоль локальной +Z (group.rotation.y = atan2(dx, dz)).

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
    if (type === 'wanderer') this._buildWanderer(g);
    else if (type === 'hound') this._buildHound(g);
    else if (type === 'smiler') this._buildSmiler(g);
    else if (type === 'skinstealer') this._buildSkinstealer(g);
    else if (type === 'reaper') this._buildReaper(g);
  }

  // Скиталец: истощённый чёрный гигант (~2.4 м) с горящими жёлтыми глазами
  _buildWanderer(g) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x111114, roughness: 0.95 });
    const body = new THREE.Group();
    body.rotation.x = 0.13; // сгорбленность
    g.add(body);
    this.body = body;

    // ноги
    for (const sx of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 1.0, 4, 8), mat);
      leg.position.set(sx * 0.11, 0.6, 0);
      body.add(leg);
    }
    // таз и торс
    const hips = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), mat);
    hips.position.y = 1.15; hips.scale.set(1, 0.7, 0.8);
    body.add(hips);
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.75, 4, 10), mat);
    torso.position.y = 1.65; torso.scale.set(1.15, 1, 0.75);
    body.add(torso);
    // выпирающие рёбра
    for (let i = 0; i < 4; i++) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.016, 6, 14, Math.PI), mat);
      rib.position.set(0, 1.45 + i * 0.13, 0.02);
      rib.rotation.x = Math.PI / 2 + 0.25;
      body.add(rib);
    }
    // плечи и руки до колен, с когтями
    this.arms = [];
    for (const sx of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.set(sx * 0.25, 2.05, 0);
      const sh = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 6), mat);
      arm.add(sh);
      const limb = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 1.15, 4, 8), mat);
      limb.position.y = -0.65;
      arm.add(limb);
      // когти
      for (let f = -1; f <= 1; f++) {
        const claw = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.16, 5), mat);
        claw.position.set(f * 0.035, -1.32, 0.02);
        claw.rotation.x = Math.PI; // остриём вниз
        arm.add(claw);
      }
      arm.rotation.z = sx * 0.10;
      body.add(arm);
      this.arms.push(arm);
    }
    // шея и вытянутая голова
    const neck = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.18, 4, 6), mat);
    neck.position.y = 2.3;
    body.add(neck);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), mat);
    head.position.y = 2.52; head.scale.set(0.85, 1.5, 0.9);
    body.add(head);
    this.head = head;
    // горящие глаза и провал рта — на ЛИЦЕ (+Z)
    const eyeMat = new THREE.MeshStandardMaterial({
      color: 0x000000, emissive: 0xc7ad28, emissiveIntensity: 3.2,
    });
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), eyeMat);
      eye.position.set(sx * 0.05, 2.58, 0.105);
      body.add(eye);
    }
    const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 1 }));
    mouth.position.set(0, 2.44, 0.105);
    mouth.scale.set(0.8, 1.6, 0.5);
    body.add(mouth);
  }

  // Гончая: безглазый ободранный четвероногий хищник
  _buildHound(g) {
    const skin = new THREE.MeshStandardMaterial({ color: 0x9a8d7d, roughness: 0.9 });
    const raw = new THREE.MeshStandardMaterial({ color: 0x5e2520, roughness: 0.75 });
    const body = new THREE.Group();
    g.add(body);
    this.body = body;

    // корпус вдоль +Z: грудь впереди, круп сзади
    const spine = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.7, 4, 10), skin);
    spine.rotation.x = Math.PI / 2;
    spine.position.set(0, 0.62, 0);
    body.add(spine);
    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), skin);
    chest.position.set(0, 0.64, 0.32); chest.scale.set(1, 1.05, 1.2);
    body.add(chest);
    const rump = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), skin);
    rump.position.set(0, 0.66, -0.36); rump.scale.set(0.9, 1, 1.2);
    body.add(rump);
    // позвонки, торчащие вдоль хребта
    for (let i = 0; i < 6; i++) {
      const v = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.09, 5), raw);
      v.position.set(0, 0.84 - Math.abs(i - 2.5) * 0.012, 0.3 - i * 0.13);
      body.add(v);
    }
    // шея и безглазый череп с раскрытой пастью — впереди (+Z)
    const neck = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.22, 4, 8), skin);
    neck.position.set(0, 0.76, 0.52); neck.rotation.x = Math.PI / 2 - 0.5;
    body.add(neck);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.115, 10, 8), skin);
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
    // зубы
    const toothMat = new THREE.MeshStandardMaterial({ color: 0xd8cdb6, roughness: 0.4 });
    for (let i = 0; i < 4; i++) {
      for (const sy of [-1, 1]) {
        const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.05, 4), toothMat);
        tooth.position.set((i - 1.5) * 0.028, sy === 1 ? 0.02 : -0.045, 0.19);
        tooth.rotation.x = sy === 1 ? Math.PI : 0;
        maw.add(tooth);
      }
    }
    // лапы с локтями
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

  // Улыбающийся: сгусток тьмы со светящейся улыбкой (спрайт всегда повёрнут к игроку)
  _buildSmiler(g) {
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 1.0, transparent: true, opacity: 0.92 }));
    body.position.y = 1.5; body.scale.y = 1.25;
    g.add(body);
    // внешняя дымка тьмы
    const haze = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 1.0, transparent: true, opacity: 0.35 }));
    haze.position.y = 1.5; haze.scale.y = 1.2;
    g.add(haze);
    const face = new THREE.Sprite(new THREE.SpriteMaterial({
      map: smilerTexture(), transparent: true, depthTest: true, depthWrite: false,
    }));
    face.scale.set(0.95, 0.95, 1);
    // выносим улыбку перед телом (группа всегда повёрнута к жертве)
    face.position.set(0, 1.5, 0.8);
    g.add(face);
    this.face = face;
  }

  // Кожекрад: «как напарник», но с чёрными глазами и свёрнутой набок головой
  _buildSkinstealer(g) {
    const h = buildHumanoid(0x4f6b8f, true);
    // руки чуть длиннее человеческих
    h.userData.armL.scale.y = 1.25; h.userData.armL.position.y = 1.0;
    h.userData.armR.scale.y = 1.25; h.userData.armR.position.y = 1.0;
    g.add(h);
    this.humanoid = h;
  }

  // Жнец: парящая рваная фигура с алым свечением
  _buildReaper(g) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x070708, roughness: 1.0 });
    const body = new THREE.Group();
    g.add(body);
    this.body = body;

    const robe = new THREE.Mesh(new THREE.ConeGeometry(0.46, 2.0, 9), mat);
    robe.position.y = 1.0;
    body.add(robe);
    // плечи, соединяющие балахон с капюшоном
    const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), mat);
    shoulders.position.y = 2.0; shoulders.scale.y = 0.8;
    body.add(shoulders);
    // рваный подол — кольцо мелких конусов вниз
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const rag = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.5 + (i % 3) * 0.18, 4), mat);
      rag.position.set(Math.cos(a) * 0.36, 0.22, Math.sin(a) * 0.36);
      rag.rotation.x = Math.PI;
      body.add(rag);
    }
    // плечи и длинные руки с когтями, разведённые в стороны
    this.arms = [];
    for (const sx of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.set(sx * 0.32, 1.95, 0);
      const limb = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.95, 4, 8), mat);
      limb.position.y = -0.5;
      arm.add(limb);
      for (let f = -1; f <= 1; f++) {
        const claw = new THREE.Mesh(new THREE.ConeGeometry(0.013, 0.2, 5), mat);
        claw.position.set(f * 0.035, -1.06, 0.02);
        claw.rotation.x = Math.PI;
        arm.add(claw);
      }
      arm.rotation.z = sx * 0.55;
      body.add(arm);
      this.arms.push(arm);
    }
    // капюшон с пустотой и алыми глазами на лице (+Z)
    const hood = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.6, 9), mat);
    hood.position.y = 2.38;
    body.add(hood);
    const faceVoid = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 1 }));
    faceVoid.position.set(0, 2.26, 0.08);
    body.add(faceVoid);
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff1500, emissiveIntensity: 2.6 });
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.027, 8, 6), eyeMat);
      eye.position.set(sx * 0.055, 2.28, 0.21);
      body.add(eye);
    }
    const glow = new THREE.PointLight(0xff1100, 10, 8, 1.6);
    glow.position.y = 1.8;
    body.add(glow);
    this.glow = glow;
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
    if (this.type === 'wanderer' && this.arms) {
      const s = this.state === 'hunt' ? 9 : 3.5;
      this.arms[0].rotation.x = Math.sin(this.time * s) * 0.4;
      this.arms[1].rotation.x = -Math.sin(this.time * s) * 0.4;
      this.group.position.y = Math.abs(Math.sin(this.time * s * 0.5)) * 0.05;
      // голова подёргивается
      if (this.head) this.head.rotation.z = Math.sin(this.time * 2.3) * 0.12 + Math.sin(this.time * 17) * 0.02;
    }
    if (this.type === 'hound' && this.legs) {
      const s = this.state === 'chase' ? 16 : 6;
      this.legs.forEach((leg, i) => {
        leg.rotation.x = Math.sin(this.time * s + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.65;
      });
      this.body.position.y = Math.abs(Math.sin(this.time * s * 0.5)) * 0.06;
      // пасть лязгает в погоне
      if (this.maw) this.maw.rotation.x = this.state === 'chase'
        ? Math.max(0, Math.sin(this.time * 13)) * 0.5
        : 0.12;
    }
    if (this.type === 'smiler' && this.face) {
      // улыбка дрожит и пульсирует
      const p = 0.9 + Math.sin(this.time * 7) * 0.08;
      this.face.scale.set(p, p, 1);
      this.face.position.y = 1.5 + Math.sin(this.time * 1.3) * 0.12;
      this.face.position.z = 0.8;
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
    if (this.type === 'reaper') {
      if (this.glow) this.glow.intensity = 8 + Math.sin(this.time * 13) * 3;
      this.group.position.y = 0.12 + Math.sin(this.time * 2.2) * 0.1;
      if (this.arms) {
        this.arms[0].rotation.z = 0.55 + Math.sin(this.time * 1.7) * 0.15;
        this.arms[1].rotation.z = -0.55 - Math.sin(this.time * 1.7 + 1) * 0.15;
      }
    }
  }

  dispose() {
    this.scene.remove(this.group);
  }
}
