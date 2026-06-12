// Гуманоидная фигура: используется для напарника и для Кожекрада (его двойника).

import * as THREE from 'three';

export function buildHumanoid(color = 0x6b7a8f, isStealer = false) {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x23282e, roughness: 0.9 });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.55, 4, 8), skin);
  torso.position.y = 1.05;
  g.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xc9a98c, roughness: 0.8 }));
  head.position.y = 1.62;
  g.add(head);

  // глаза — у кожекрада сплошь чёрные и чуть больше
  const eyeMat = new THREE.MeshStandardMaterial({
    color: isStealer ? 0x000000 : 0x222222,
    roughness: isStealer ? 0.1 : 0.5,
  });
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(isStealer ? 0.035 : 0.02, 6, 6), eyeMat);
    eye.position.set(sx * 0.06, 1.65, -0.13);
    g.add(eye);
  }

  const legs = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.5, 4, 8), dark);
  legs.position.y = 0.45;
  g.add(legs);

  const armGeo = new THREE.CapsuleGeometry(0.06, 0.5, 4, 6);
  const armL = new THREE.Mesh(armGeo, skin);
  armL.position.set(-0.3, 1.1, 0);
  g.add(armL);
  const armR = new THREE.Mesh(armGeo, skin);
  armR.position.set(0.3, 1.1, 0);
  g.add(armR);

  g.userData = { armL, armR, head, walkPhase: 0 };
  return g;
}

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

// Аватар напарника с интерполяцией по сети
export class PartnerAvatar {
  constructor(scene, name) {
    this.scene = scene;
    this.mesh = buildHumanoid(0x4f6b8f, false);
    this.nameSprite = makeNameSprite(name);
    this.mesh.add(this.nameSprite);

    this.flash = new THREE.SpotLight(0xfff1d0, 0, 18, 0.42, 0.5, 1.2);
    this.flashTarget = new THREE.Object3D();
    this.scene.add(this.flashTarget);
    this.flash.target = this.flashTarget;
    this.mesh.add(this.flash);
    this.flash.position.set(0.2, 1.4, -0.2);

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
    this.mesh.rotation.y = this.cur.yaw + Math.PI;
    this.mesh.visible = !this.dst.hidden;
    this.mesh.scale.y = this.dst.crouch ? 0.7 : 1.0;

    // анимация ходьбы
    const ud = this.mesh.userData;
    if (this.dst.moving) {
      ud.walkPhase += dt * (this.dst.running ? 11 : 6);
      ud.armL.rotation.x = Math.sin(ud.walkPhase) * 0.6;
      ud.armR.rotation.x = -Math.sin(ud.walkPhase) * 0.6;
    } else {
      ud.armL.rotation.x *= 0.9;
      ud.armR.rotation.x *= 0.9;
    }
    ud.head.rotation.x = -(this.dst.pitch || 0) * 0.6;

    // фонарик
    this.flash.intensity = (this.dst.light && !this.dst.hidden) ? 45 : 0;
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
