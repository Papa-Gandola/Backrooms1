// Построение уровня из данных сервера: PBR-материалы, геометрия с деталями
// (плинтусы, утопленные светильники, трубы), пыль в воздухе, вода.

import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { themeMaterials, waterNormalTexture } from './materials.js';
import { plateTexture } from './textures.js';
import { scatterProps } from './props.js';

const FLOOR = 0, WALL = 1, WATER = 2;

export class World {
  constructor(scene) {
    this.scene = scene;
    this.group = null;
    this.grid = null;
    this.level = null;
    this.itemMeshes = new Map();
    this.fixtures = [];
    this.lightPool = [];
    this.exitMesh = null;
    this.doorOpen = false;
    this.time = 0;
    this.dust = null;
  }

  clear() {
    if (this.group) {
      this.scene.remove(this.group);
      // материалы тем кэшируются в materials.js — освобождаем только геометрию
      this.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    }
    for (const l of this.lightPool) this.scene.remove(l);
    if (this.dust) { this.scene.remove(this.dust); this.dust.geometry.dispose(); this.dust = null; }
    this.group = null;
    this.itemMeshes.clear();
    this.fixtures = [];
    this.lightPool = [];
    this.propColliders = [];
    this.doorOpen = false;
  }

  build(level) {
    this.clear();
    this.level = level;
    const cells = Uint8Array.from(atob(level.cells), c => c.charCodeAt(0));
    this.grid = { w: level.w, h: level.h, cells, cell: level.cell };
    this.group = new THREE.Group();
    this.scene.add(this.group);

    const theme = themeMaterials(level.theme);
    this.theme = theme;
    const C = level.cell, W = level.w, H = level.h, ceilH = level.ceilH;
    const get = (x, z) => (x < 0 || z < 0 || x >= W || z >= H) ? WALL : cells[z * W + x];
    const walkable = (x, z) => { const c = get(x, z); return c === FLOOR || c === WATER; };

    // ---- пол и потолок ----
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W * C, H * C), theme.floor);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(W * C / 2, 0, H * C / 2);
    floor.receiveShadow = true;
    this.group.add(floor);

    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W * C, H * C), theme.ceiling);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(W * C / 2, ceilH, H * C / 2);
    this.group.add(ceil);

    // ---- стены ----
    const wallGeos = [];
    for (let z = 0; z < H; z++) {
      for (let x = 0; x < W; x++) {
        if (get(x, z) !== WALL) continue;
        let near = false;
        for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]])
          if (walkable(x + dx, z + dz)) { near = true; break; }
        if (!near) continue;
        const g = new THREE.BoxGeometry(C, ceilH, C);
        g.translate((x + 0.5) * C, ceilH / 2, (z + 0.5) * C);
        wallGeos.push(g);
      }
    }
    if (wallGeos.length) {
      const walls = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(wallGeos), theme.wall);
      walls.receiveShadow = true;
      walls.castShadow = true;
      this.group.add(walls);
      wallGeos.forEach(g => g.dispose());
    }

    // ---- плинтусы вдоль открытых граней стен ----
    const trimGeos = [];
    const trimH = 0.13, trimD = 0.035;
    for (let z = 0; z < H; z++) {
      for (let x = 0; x < W; x++) {
        if (get(x, z) !== WALL) continue;
        const cx = (x + 0.5) * C, cz = (z + 0.5) * C;
        if (walkable(x, z - 1)) {
          const g = new THREE.BoxGeometry(C, trimH, trimD);
          g.translate(cx, trimH / 2, z * C - trimD / 2);
          trimGeos.push(g);
        }
        if (walkable(x, z + 1)) {
          const g = new THREE.BoxGeometry(C, trimH, trimD);
          g.translate(cx, trimH / 2, (z + 1) * C + trimD / 2);
          trimGeos.push(g);
        }
        if (walkable(x - 1, z)) {
          const g = new THREE.BoxGeometry(trimD, trimH, C);
          g.translate(x * C - trimD / 2, trimH / 2, cz);
          trimGeos.push(g);
        }
        if (walkable(x + 1, z)) {
          const g = new THREE.BoxGeometry(trimD, trimH, C);
          g.translate((x + 1) * C + trimD / 2, trimH / 2, cz);
          trimGeos.push(g);
        }
      }
    }
    if (trimGeos.length) {
      this.group.add(new THREE.Mesh(BufferGeometryUtils.mergeGeometries(trimGeos), theme.trim));
      trimGeos.forEach(g => g.dispose());
    }

    // ---- трубы вдоль стен (тема pipes) ----
    if (level.theme === 'pipes') {
      const pipeGeos = [];
      const addPipe = (x0, z0, x1, z1, y, r) => {
        const len = Math.hypot(x1 - x0, z1 - z0);
        const g = new THREE.CylinderGeometry(r, r, len, 8);
        g.rotateZ(Math.PI / 2);
        const ang = Math.atan2(z1 - z0, x1 - x0);
        g.rotateY(-ang);
        g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
        pipeGeos.push(g);
      };
      const off = 0.16;
      for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
        if (get(x, z) !== WALL) continue;
        if (walkable(x, z - 1)) { addPipe(x * C, z * C - off, (x + 1) * C, z * C - off, 0.55, 0.09); addPipe(x * C, z * C - off, (x + 1) * C, z * C - off, 1.85, 0.12); }
        if (walkable(x, z + 1)) { addPipe(x * C, (z + 1) * C + off, (x + 1) * C, (z + 1) * C + off, 0.55, 0.09); addPipe(x * C, (z + 1) * C + off, (x + 1) * C, (z + 1) * C + off, 1.85, 0.12); }
        if (walkable(x - 1, z)) { addPipe(x * C - off, z * C, x * C - off, (z + 1) * C, 0.55, 0.09); addPipe(x * C - off, z * C, x * C - off, (z + 1) * C, 1.85, 0.12); }
        if (walkable(x + 1, z)) { addPipe((x + 1) * C + off, z * C, (x + 1) * C + off, (z + 1) * C, 0.55, 0.09); addPipe((x + 1) * C + off, z * C, (x + 1) * C + off, (z + 1) * C, 1.85, 0.12); }
      }
      if (pipeGeos.length) {
        const pipeMat = new THREE.MeshStandardMaterial({ color: 0x4a3625, roughness: 0.55, metalness: 0.7 });
        this.group.add(new THREE.Mesh(BufferGeometryUtils.mergeGeometries(pipeGeos), pipeMat));
        pipeGeos.forEach(g => g.dispose());
      }
    }

    // ---- вода ----
    const waterGeos = [];
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      if (get(x, z) === WATER) {
        const g = new THREE.PlaneGeometry(C, C);
        g.rotateX(-Math.PI / 2);
        g.translate((x + 0.5) * C, 0.14, (z + 0.5) * C);
        waterGeos.push(g);
      }
    }
    if (waterGeos.length) {
      const wn = waterNormalTexture();
      wn.repeat.set(3, 3);
      this.waterMesh = new THREE.Mesh(
        BufferGeometryUtils.mergeGeometries(waterGeos),
        new THREE.MeshStandardMaterial({
          color: 0x2e6e74, transparent: true, opacity: 0.7,
          roughness: 0.06, metalness: 0.0,
          normalMap: wn, normalScale: new THREE.Vector2(0.35, 0.35),
          envMapIntensity: 1.6,
        })
      );
      this.group.add(this.waterMesh);
      waterGeos.forEach(g => g.dispose());
    }

    // ---- тематический декор ----
    if (level.theme === 'hotel') this._buildHotelDoors(get, walkable, C, W, H);
    if (level.theme === 'party') this._buildPartyDecor(walkable, C, W, H, ceilH);

    // ---- светильники ----
    this._buildFixtures(level, theme, ceilH);

    // пул реальных источников света — двигаем к ближайшим плафонам
    for (let i = 0; i < 7; i++) {
      const pl = new THREE.PointLight(theme.lightColor, 0, 18, 1.8);
      pl.position.y = ceilH - 0.7;
      this.scene.add(pl);
      this.lightPool.push(pl);
    }

    // ---- пыль в воздухе ----
    this._buildDust();

    // ---- предметы и выход ----
    for (const item of level.items) this._buildItem(item, theme, ceilH);
    this._buildExit(level, theme);

    // ---- мебель-декор (одинакова у обоих игроков благодаря сиду) ----
    const avoid = [
      { x: level.spawn.x, z: level.spawn.z, r: 3.5 },
      { x: level.exit.x, z: level.exit.z, r: 3.0 },
      ...level.items.map(i => ({ x: i.x, z: i.z, r: 1.6 })),
    ];
    this.propColliders = scatterProps(this.group, level.theme, this.grid, C, level.seedVal || 1, avoid);
  }

  // двери номеров вдоль коридоров
  _buildHotelDoors(get, walkable, C, W, H) {
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x4a2c16, roughness: 0.45 });
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x2a1a0c, roughness: 0.6 });
    const knobMat = new THREE.MeshStandardMaterial({ color: 0xc8a850, roughness: 0.3, metalness: 0.9 });
    const group = new THREE.Group();
    let n = 0;
    for (let z = 1; z < H - 1; z++) for (let x = 1; x < W - 1; x++) {
      if (get(x, z) !== 1) continue;
      if ((x * 7 + z * 13) % 4 !== 0) continue; // не на каждой стене
      for (const [dx, dz, rot] of [[0, -1, 0], [0, 1, Math.PI], [-1, 0, Math.PI / 2], [1, 0, -Math.PI / 2]]) {
        if (!walkable(x + dx, z + dz)) continue;
        const d = new THREE.Group();
        const door = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.1, 0.06), doorMat);
        door.position.y = 1.05;
        d.add(door);
        const frame = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.25, 0.04), frameMat);
        frame.position.y = 1.1;
        frame.position.z = -0.02;
        d.add(frame);
        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), knobMat);
        knob.position.set(0.38, 1.02, 0.06);
        d.add(knob);
        const cx = (x + 0.5) * C + dx * (C / 2 + 0.04);
        const cz = (z + 0.5) * C + dz * (C / 2 + 0.04);
        d.position.set(cx, 0, cz);
        d.rotation.y = rot;
        group.add(d);
        if (++n > 90) break;
      }
      if (n > 90) break;
    }
    this.group.add(group);
  }

  // гроздья шаров по углам комнат
  _buildPartyDecor(walkable, C, W, H, ceilH) {
    const group = new THREE.Group();
    let placed = 0;
    for (let i = 0; i < 400 && placed < 26; i++) {
      const gx = 1 + Math.floor(Math.random() * (W - 2));
      const gz = 1 + Math.floor(Math.random() * (H - 2));
      if (!walkable(gx, gz)) continue;
      placed++;
      const cluster = new THREE.Group();
      const cnt = 2 + Math.floor(Math.random() * 3);
      for (let b = 0; b < cnt; b++) {
        const col = new THREE.Color().setHSL(Math.random(), 0.7, 0.55);
        const ball = new THREE.Mesh(
          new THREE.SphereGeometry(0.22 + Math.random() * 0.08, 12, 10),
          new THREE.MeshStandardMaterial({ color: col, roughness: 0.2 })
        );
        ball.scale.y = 1.15;
        ball.position.set((Math.random() - 0.5) * 0.5, ceilH - 0.45 - Math.random() * 0.35, (Math.random() - 0.5) * 0.5);
        cluster.add(ball);
        const string = new THREE.Mesh(
          new THREE.CylinderGeometry(0.004, 0.004, ceilH - ball.position.y - 0.3),
          new THREE.MeshStandardMaterial({ color: 0xcccccc })
        );
        string.position.set(ball.position.x, (ball.position.y + ceilH) / 2 - 0.12, ball.position.z);
        cluster.add(string);
      }
      cluster.position.set((gx + 0.5) * C, 0, (gz + 0.5) * C);
      group.add(cluster);
    }
    this.group.add(group);
  }

  _buildFixtures(level, theme, ceilH) {
    const isPipes = level.theme === 'pipes';
    const isFinal = level.theme === 'final';
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x35363a, roughness: 0.5, metalness: 0.6 });
    for (const li of level.lights) {
      const on = !li.broken;
      const fg = new THREE.Group();
      const panelMat = new THREE.MeshStandardMaterial({
        color: 0x101010,
        emissive: theme.lightColor,
        emissiveIntensity: on ? 0.95 : 0.02,
      });
      if (isPipes) {
        // лампа на кабеле
        const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3), frameMat);
        wire.position.y = ceilH - 0.15;
        fg.add(wire);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), panelMat);
        bulb.position.y = ceilH - 0.34;
        fg.add(bulb);
        this._fix(li, bulb);
      } else if (isFinal) {
        // аварийная мигалка
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.07, 0.18), frameMat);
        base.position.y = ceilH - 0.035;
        fg.add(base);
        const dome = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), panelMat);
        dome.rotation.x = Math.PI;
        dome.position.y = ceilH - 0.08;
        fg.add(dome);
        this._fix(li, dome);
      } else {
        // утопленная люминесцентная панель с рамкой
        const frame = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.07, 0.75), frameMat);
        frame.position.y = ceilH - 0.02;
        fg.add(frame);
        const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.62), panelMat);
        panel.rotation.x = Math.PI / 2;
        panel.position.y = ceilH - 0.062;
        fg.add(panel);
        this._fix(li, panel);
      }
      fg.position.set(li.x, 0, li.z);
      this.group.add(fg);
    }
  }

  _fix(li, emissiveMesh) {
    this.fixtures.push({
      x: li.x, z: li.z, broken: li.broken, flicker: li.flicker,
      mesh: emissiveMesh, phase: Math.random() * 100,
    });
  }

  _buildDust() {
    const count = 420;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const span = 26;
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * span;
      pos[i * 3 + 1] = Math.random() * (this.level.ceilH - 0.2);
      pos[i * 3 + 2] = (Math.random() - 0.5) * span;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const cv = document.createElement('canvas');
    cv.width = cv.height = 32;
    const cx = cv.getContext('2d');
    const grad = cx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,250,230,1)');
    grad.addColorStop(1, 'rgba(255,250,230,0)');
    cx.fillStyle = grad;
    cx.fillRect(0, 0, 32, 32);
    const mat = new THREE.PointsMaterial({
      size: 0.03, map: new THREE.CanvasTexture(cv),
      transparent: true, opacity: 0.45, depthWrite: false,
      blending: THREE.AdditiveBlending, color: 0xfff4d8,
    });
    this.dust = new THREE.Points(geo, mat);
    this.dust.userData.span = span;
    this.scene.add(this.dust);
  }

  // светящийся столб над квестовым предметом — видно издалека сквозь туман
  _beacon(color, ceilH) {
    const g = new THREE.Group();
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.34, ceilH, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.14,
        blending: THREE.AdditiveBlending, depthWrite: false,
        side: THREE.DoubleSide, fog: false,
      })
    );
    beam.position.y = ceilH / 2 - 0.4;
    g.add(beam);
    const pl = new THREE.PointLight(color, 4, 6, 1.8);
    pl.position.y = 0.2;
    g.add(pl);
    return g;
  }

  _buildItem(item, theme, ceilH) {
    let mesh;
    if (item.type === 'fuse') {
      mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.34, 0.14),
        new THREE.MeshStandardMaterial({ color: 0x333333, emissive: 0x2a9d3f, emissiveIntensity: 1.2 })
      );
      mesh.position.set(item.x, 0.5, item.z);
      mesh.userData.bob = true;
      mesh.add(this._beacon(0x36ff70, ceilH));
    } else if (item.type === 'fusebox') {
      mesh = new THREE.Group();
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 1.0, 0.25),
        new THREE.MeshStandardMaterial({ color: 0x6a6a6e, roughness: 0.45, metalness: 0.7 })
      );
      box.position.y = 1.3;
      mesh.add(box);
      const lamp = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 8, 6),
        new THREE.MeshStandardMaterial({ emissive: 0xff2222, emissiveIntensity: 2 })
      );
      lamp.position.set(0, 1.85, 0.1);
      mesh.add(lamp);
      mesh.userData.lamp = lamp;
      mesh.position.set(item.x, 0, item.z);
    } else if (item.type === 'lever') {
      mesh = new THREE.Group();
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(0.45, 0.7, 0.3),
        new THREE.MeshStandardMaterial({ color: 0x88452a, roughness: 0.55, metalness: 0.6 })
      );
      base.position.y = 1.2;
      mesh.add(base);
      const handle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 0.65),
        new THREE.MeshStandardMaterial({ color: 0xcc3333, roughness: 0.35, metalness: 0.7 })
      );
      handle.position.set(0, 1.45, 0.18);
      handle.rotation.x = -0.7;
      mesh.add(handle);
      mesh.userData.handle = handle;
      mesh.position.set(item.x, 0, item.z);
    } else if (item.type === 'locker') {
      mesh = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 2.1, 0.7),
        new THREE.MeshStandardMaterial({ color: 0x2d4a3e, roughness: 0.5, metalness: 0.55 })
      );
      body.position.y = 1.05;
      mesh.add(body);
      for (let i = 0; i < 3; i++) {
        const slot = new THREE.Mesh(
          new THREE.BoxGeometry(0.5, 0.03, 0.02),
          new THREE.MeshStandardMaterial({ color: 0x0a0f0c, roughness: 0.9 })
        );
        slot.position.set(0, 1.55 + i * 0.12, 0.36);
        mesh.add(slot);
      }
      mesh.position.set(item.x, 0, item.z);
    } else if (item.type === 'plate') {
      mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.9, 0.9),
        new THREE.MeshStandardMaterial({
          map: plateTexture(this.level.puzzle.glyphs ? this.level.puzzle.glyphs[item.glyph] : '?', item.slot),
          emissive: 0x886622, emissiveIntensity: 0.35,
        })
      );
      const ori = this._wallOrientation(item.x, item.z);
      mesh.position.set(item.x + ori.ox, 1.5, item.z + ori.oz);
      mesh.rotation.y = ori.rot;
    } else if (item.type === 'panel') {
      mesh = new THREE.Group();
      const stand = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 1.3, 0.18),
        new THREE.MeshStandardMaterial({ color: 0x3a3a40, roughness: 0.35, metalness: 0.75 })
      );
      stand.position.y = 1.15;
      mesh.add(stand);
      const screen = new THREE.Mesh(
        new THREE.PlaneGeometry(0.7, 0.35),
        new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x2c5f2d, emissiveIntensity: 1.4 })
      );
      screen.position.set(0, 1.45, 0.1);
      mesh.add(screen);
      mesh.position.set(item.x, 0, item.z);
    } else if (item.type === 'valve') {
      mesh = new THREE.Group();
      const pipe = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.09, 1.4),
        new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.5, metalness: 0.75 })
      );
      pipe.position.y = 0.7;
      mesh.add(pipe);
      const wheel = new THREE.Mesh(
        new THREE.TorusGeometry(0.3, 0.05, 8, 20),
        new THREE.MeshStandardMaterial({ color: 0xa03030, roughness: 0.4, metalness: 0.7 })
      );
      wheel.rotation.x = Math.PI / 2;
      wheel.position.y = 1.25;
      mesh.add(wheel);
      mesh.userData.wheel = wheel;
      mesh.position.set(item.x, 0, item.z);
    } else if (item.type === 'key') {
      mesh = new THREE.Group();
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.09, 0.025, 8, 16),
        new THREE.MeshStandardMaterial({ color: 0xd8b54a, roughness: 0.25, metalness: 0.9, emissive: 0x6a5418, emissiveIntensity: 0.5 })
      );
      mesh.add(ring);
      const stem = new THREE.Mesh(
        new THREE.BoxGeometry(0.035, 0.2, 0.02),
        ring.material
      );
      stem.position.y = -0.17;
      mesh.add(stem);
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.035, 0.02), ring.material);
      tooth.position.set(0.03, -0.25, 0);
      mesh.add(tooth);
      mesh.position.set(item.x, 1.0, item.z);
      mesh.userData.bob = true;
      mesh.userData.bobBase = 1.0;
      mesh.add(this._beacon(0xffd24a, ceilH));
    } else if (item.type === 'balloon') {
      mesh = new THREE.Group();
      const hue = (item.id.charCodeAt(item.id.length - 1) * 53) % 360;
      const col = new THREE.Color().setHSL(hue / 360, 0.75, 0.55);
      const ball = new THREE.Mesh(
        new THREE.SphereGeometry(0.26, 16, 14),
        new THREE.MeshStandardMaterial({ color: col, roughness: 0.18, emissive: col, emissiveIntensity: 0.18 })
      );
      ball.scale.y = 1.18;
      mesh.add(ball);
      const string = new THREE.Mesh(
        new THREE.CylinderGeometry(0.005, 0.005, 1.1),
        new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.8 })
      );
      string.position.y = -0.82;
      mesh.add(string);
      mesh.position.set(item.x, 1.5, item.z);
      mesh.userData.bob = true;
      mesh.userData.bobBase = 1.5;
      mesh.add(this._beacon(0xff6ab0, ceilH));
    } else if (item.type === 'switch') {
      mesh = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.9, 0.3),
        new THREE.MeshStandardMaterial({ color: 0x444448, roughness: 0.45, metalness: 0.7 })
      );
      body.position.y = 1.25;
      mesh.add(body);
      const lamp = new THREE.Mesh(
        new THREE.SphereGeometry(0.07, 8, 6),
        new THREE.MeshStandardMaterial({ emissive: 0xff2222, emissiveIntensity: 2.4 })
      );
      lamp.position.set(0, 1.8, 0.1);
      mesh.add(lamp);
      mesh.userData.lamp = lamp;
      mesh.position.set(item.x, 0, item.z);
    }
    if (mesh) {
      mesh.userData.item = item;
      this.group.add(mesh);
      this.itemMeshes.set(item.id, mesh);
    }
  }

  _wallOrientation(x, z) {
    const C = this.grid.cell;
    const gx = Math.floor(x / C), gz = Math.floor(z / C);
    const get = (a, b) => (a < 0 || b < 0 || a >= this.grid.w || b >= this.grid.h) ? WALL : this.grid.cells[b * this.grid.w + a];
    if (get(gx, gz - 1) === WALL) return { ox: 0, oz: -C / 2 + 0.06, rot: 0 };
    if (get(gx, gz + 1) === WALL) return { ox: 0, oz: C / 2 - 0.06, rot: Math.PI };
    if (get(gx - 1, gz) === WALL) return { ox: -C / 2 + 0.06, oz: 0, rot: Math.PI / 2 };
    return { ox: C / 2 - 0.06, oz: 0, rot: -Math.PI / 2 };
  }

  _buildExit(level) {
    const g = new THREE.Group();
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.35, metalness: 0.85 });
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.2, 0.4), frameMat);
    top.position.y = 2.5;
    g.add(top);
    for (const sx of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.6, 0.4), frameMat);
      side.position.set(sx * 1.1, 1.3, 0);
      g.add(side);
    }
    this.exitGlowMat = new THREE.MeshStandardMaterial({
      color: 0x000000, emissive: 0xaa1111, emissiveIntensity: 1.2,
      transparent: true, opacity: 0.85, side: THREE.DoubleSide,
    });
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 2.4), this.exitGlowMat);
    glow.position.y = 1.3;
    g.add(glow);
    g.position.set(level.exit.x, 0, level.exit.z);
    this.group.add(g);
    this.exitMesh = g;
  }

  setDoorOpen() {
    this.doorOpen = true;
    if (this.exitGlowMat) {
      this.exitGlowMat.emissive.set(0x22cc44);
      this.exitGlowMat.emissiveIntensity = 2.0;
    }
  }

  onItemEvent(id, ev) {
    const mesh = this.itemMeshes.get(id);
    if (!mesh) return;
    if (ev === 'taken') {
      mesh.visible = false;
    } else if (ev === 'pulled') {
      if (mesh.userData.handle) mesh.userData.handle.rotation.x = 0.7;
    } else if (ev === 'reset') {
      if (mesh.userData.handle) mesh.userData.handle.rotation.x = -0.7;
    } else if (ev === 'done') {
      if (mesh.userData.wheel) mesh.userData.wheel.material.color.set(0x30a050);
      if (mesh.userData.lamp) mesh.userData.lamp.material.emissive.set(0x22ff44);
    } else if (ev === 'insert') {
      if (mesh.userData.lamp) mesh.userData.lamp.material.emissive.set(0xffaa22);
    }
  }

  update(dt, playerPos) {
    this.time += dt;
    if (!this.level) return;

    // пул источников света к ближайшим рабочим плафонам
    const working = this.fixtures.filter(f => !f.broken);
    working.sort((a, b) =>
      ((a.x - playerPos.x) ** 2 + (a.z - playerPos.z) ** 2) -
      ((b.x - playerPos.x) ** 2 + (b.z - playerPos.z) ** 2));
    for (let i = 0; i < this.lightPool.length; i++) {
      const pl = this.lightPool[i];
      const f = working[i];
      if (!f) { pl.intensity = 0; continue; }
      pl.position.x = f.x; pl.position.z = f.z;
      let inten = this.theme.lightIntensity;
      if (f.flicker) {
        const v = Math.sin(this.time * 19 + f.phase) + Math.sin(this.time * 47 + f.phase * 2);
        if (v > 1.55) inten *= 0.15;
        else if (v > 1.2) inten *= 0.55;
        f.mesh.material.emissiveIntensity = inten / this.theme.lightIntensity * 0.95;
      }
      // аварийные мигалки финала пульсируют
      if (this.level.theme === 'final') {
        inten *= 0.6 + 0.4 * Math.sin(this.time * 5 + f.phase);
      }
      pl.intensity = inten;
      pl.color.copy(this.theme.lightColor);
    }

    // покачивание подбираемых предметов
    for (const mesh of this.itemMeshes.values()) {
      if (mesh.userData.bob && mesh.visible) {
        const base = mesh.userData.bobBase ?? 0.5;
        mesh.position.y = base + Math.sin(this.time * 2 + mesh.position.x) * 0.07;
        mesh.rotation.y += dt * 1.2;
      }
    }

    // вода: скроллим карту нормалей
    if (this.waterMesh) {
      const nm = this.waterMesh.material.normalMap;
      nm.offset.x = this.time * 0.018;
      nm.offset.y = Math.sin(this.time * 0.12) * 0.05 + this.time * 0.011;
    }

    // пыль дрейфует и заворачивается вокруг игрока
    if (this.dust) {
      const pos = this.dust.geometry.attributes.position;
      const span = this.dust.userData.span, half = span / 2;
      for (let i = 0; i < pos.count; i++) {
        let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        y -= dt * 0.045;
        x += Math.sin(this.time * 0.35 + i) * dt * 0.05;
        if (y < 0.1) y = this.level.ceilH - 0.2;
        while (x < playerPos.x - half) x += span;
        while (x > playerPos.x + half) x -= span;
        while (z < playerPos.z - half) z += span;
        while (z > playerPos.z + half) z -= span;
        pos.setXYZ(i, x, y, z);
      }
      pos.needsUpdate = true;
    }

    // пульсация выхода
    if (this.exitGlowMat) {
      this.exitGlowMat.emissiveIntensity = (this.doorOpen ? 2.0 : 1.0) + Math.sin(this.time * 3) * 0.35;
    }
  }

  // ---- коллизии ----
  isWall(gx, gz) {
    if (gx < 0 || gz < 0 || gx >= this.grid.w || gz >= this.grid.h) return true;
    return this.grid.cells[gz * this.grid.w + gx] === WALL;
  }

  isWater(x, z) {
    const C = this.grid.cell;
    const gx = Math.floor(x / C), gz = Math.floor(z / C);
    if (gx < 0 || gz < 0 || gx >= this.grid.w || gz >= this.grid.h) return false;
    return this.grid.cells[gz * this.grid.w + gx] === WATER;
  }

  collide(x, z, r) {
    const C = this.grid.cell;
    let nx = x, nz = z;
    const gx = Math.floor(x / C), gz = Math.floor(z / C);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cx = gx + dx, cz = gz + dz;
        if (!this.isWall(cx, cz)) continue;
        const minX = cx * C, maxX = (cx + 1) * C;
        const minZ = cz * C, maxZ = (cz + 1) * C;
        const px = Math.max(minX, Math.min(nx, maxX));
        const pz = Math.max(minZ, Math.min(nz, maxZ));
        const ddx = nx - px, ddz = nz - pz;
        const d2 = ddx * ddx + ddz * ddz;
        if (d2 < r * r && d2 > 1e-9) {
          const d = Math.sqrt(d2);
          nx = px + (ddx / d) * r;
          nz = pz + (ddz / d) * r;
        } else if (d2 <= 1e-9) {
          nx = (gx + 0.5) * C;
          nz = (gz + 0.5) * C;
        }
      }
    }
    return { x: nx, z: nz };
  }
}
