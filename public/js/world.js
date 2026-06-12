// Построение уровня из данных сервера: геометрия, материалы по теме, свет, предметы.

import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import * as TEX from './textures.js';

const FLOOR = 0, WALL = 1, WATER = 2;

export class World {
  constructor(scene) {
    this.scene = scene;
    this.group = null;
    this.grid = null;
    this.level = null;
    this.itemMeshes = new Map();
    this.fixtures = [];        // световые точки {x,z,broken,flicker,mesh}
    this.lightPool = [];       // переиспользуемые PointLight'ы
    this.exitMesh = null;
    this.doorOpen = false;
    this.time = 0;
  }

  clear() {
    if (this.group) {
      this.scene.remove(this.group);
      this.group.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => {
            if (m.map) m.map.dispose();
            m.dispose();
          });
        }
      });
    }
    for (const l of this.lightPool) this.scene.remove(l);
    this.group = null;
    this.itemMeshes.clear();
    this.fixtures = [];
    this.lightPool = [];
    this.doorOpen = false;
  }

  build(level) {
    this.clear();
    this.level = level;
    const cells = Uint8Array.from(atob(level.cells), c => c.charCodeAt(0));
    this.grid = { w: level.w, h: level.h, cells, cell: level.cell };
    this.group = new THREE.Group();
    this.scene.add(this.group);

    const theme = this._themeMaterials(level.theme);
    this.theme = theme;
    const C = level.cell, W = level.w, H = level.h, ceilH = level.ceilH;

    // ---- пол и потолок ----
    const floorGeo = new THREE.PlaneGeometry(W * C, H * C);
    const floor = new THREE.Mesh(floorGeo, theme.floor);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(W * C / 2, 0, H * C / 2);
    this.group.add(floor);

    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W * C, H * C), theme.ceiling);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(W * C / 2, ceilH, H * C / 2);
    this.group.add(ceil);

    // ---- стены (объединённая геометрия) ----
    const wallGeos = [];
    const get = (x, z) => (x < 0 || z < 0 || x >= W || z >= H) ? WALL : cells[z * W + x];
    for (let z = 0; z < H; z++) {
      for (let x = 0; x < W; x++) {
        if (get(x, z) !== WALL) continue;
        // стену рисуем только если рядом есть проходимая клетка
        let near = false;
        for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          const c = get(x + dx, z + dz);
          if (c === FLOOR || c === WATER) { near = true; break; }
        }
        if (!near) continue;
        const g = new THREE.BoxGeometry(C, ceilH, C);
        g.translate((x + 0.5) * C, ceilH / 2, (z + 0.5) * C);
        wallGeos.push(g);
      }
    }
    if (wallGeos.length) {
      const merged = BufferGeometryUtils.mergeGeometries(wallGeos);
      const walls = new THREE.Mesh(merged, theme.wall);
      this.group.add(walls);
      wallGeos.forEach(g => g.dispose());
    }

    // ---- вода ----
    const waterGeos = [];
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      if (get(x, z) === WATER) {
        const g = new THREE.PlaneGeometry(C, C);
        g.rotateX(-Math.PI / 2);
        g.translate((x + 0.5) * C, 0.12, (z + 0.5) * C);
        waterGeos.push(g);
      }
    }
    if (waterGeos.length) {
      const merged = BufferGeometryUtils.mergeGeometries(waterGeos);
      this.waterMesh = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({
        map: TEX.waterTexture(), transparent: true, opacity: 0.72,
        roughness: 0.15, metalness: 0.1,
      }));
      this.group.add(this.waterMesh);
      waterGeos.forEach(g => g.dispose());
    }

    // ---- световые плафоны ----
    const fixtureGeo = level.theme === 'pipes'
      ? new THREE.SphereGeometry(0.14, 8, 6)
      : new THREE.BoxGeometry(1.3, 0.08, 0.7);
    for (const li of level.lights) {
      const on = !li.broken;
      const mat = new THREE.MeshStandardMaterial({
        color: 0x222222,
        emissive: theme.lightColor,
        emissiveIntensity: on ? 0.85 : 0.0,
      });
      const m = new THREE.Mesh(fixtureGeo.clone(), mat);
      m.position.set(li.x, ceilH - 0.08, li.z);
      this.group.add(m);
      this.fixtures.push({ x: li.x, z: li.z, broken: li.broken, flicker: li.flicker, mesh: m, phase: Math.random() * 100 });
    }

    // пул реальных источников света — двигаем к ближайшим плафонам
    const poolSize = 7;
    for (let i = 0; i < poolSize; i++) {
      const pl = new THREE.PointLight(theme.lightColor, 0, 18, 1.8);
      pl.position.y = ceilH - 0.7;
      this.scene.add(pl);
      this.lightPool.push(pl);
    }

    // ---- предметы ----
    for (const item of level.items) this._buildItem(item, theme, ceilH);

    // ---- выход ----
    this._buildExit(level, theme);
  }

  _themeMaterials(theme) {
    if (theme === 'yellow') return {
      wall: new THREE.MeshStandardMaterial({ map: TEX.wallpaperTexture(), roughness: 0.92 }),
      floor: new THREE.MeshStandardMaterial({ map: TEX.carpetTexture(), roughness: 1.0 }),
      ceiling: new THREE.MeshStandardMaterial({ map: TEX.ceilingTexture(), roughness: 0.95 }),
      lightColor: new THREE.Color(0xfff2b8),
      lightIntensity: 24,
    };
    if (theme === 'warehouse') return {
      wall: new THREE.MeshStandardMaterial({ map: TEX.metalWallTexture(), roughness: 0.7, metalness: 0.45 }),
      floor: new THREE.MeshStandardMaterial({ map: TEX.concreteTexture(), roughness: 0.95 }),
      ceiling: new THREE.MeshStandardMaterial({ color: 0x16181c, roughness: 0.9 }),
      lightColor: new THREE.Color(0xbfd4ff),
      lightIntensity: 7,
    };
    if (theme === 'pipes') return {
      wall: new THREE.MeshStandardMaterial({ map: TEX.rustTexture(), roughness: 0.8, metalness: 0.5 }),
      floor: new THREE.MeshStandardMaterial({ map: TEX.rustTexture(), roughness: 0.9, metalness: 0.3 }),
      ceiling: new THREE.MeshStandardMaterial({ map: TEX.rustTexture(), roughness: 0.9, metalness: 0.3 }),
      lightColor: new THREE.Color(0xffb46b),
      lightIntensity: 9,
    };
    if (theme === 'pools') return {
      wall: new THREE.MeshStandardMaterial({ map: TEX.tileTexture(), roughness: 0.35 }),
      floor: new THREE.MeshStandardMaterial({ map: TEX.tileTexture(), roughness: 0.4 }),
      ceiling: new THREE.MeshStandardMaterial({ map: TEX.tileTexture(), roughness: 0.5 }),
      lightColor: new THREE.Color(0xd8f4f0),
      lightIntensity: 26,
    };
    return { // final
      wall: new THREE.MeshStandardMaterial({ map: TEX.officeTexture(), roughness: 0.85 }),
      floor: new THREE.MeshStandardMaterial({ map: TEX.concreteTexture(), roughness: 0.95 }),
      ceiling: new THREE.MeshStandardMaterial({ color: 0x0d0608, roughness: 0.95 }),
      lightColor: new THREE.Color(0xff2a1a),
      lightIntensity: 8,
    };
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
    } else if (item.type === 'fusebox') {
      mesh = new THREE.Group();
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 1.0, 0.25),
        new THREE.MeshStandardMaterial({ color: 0x6a6a6e, roughness: 0.5, metalness: 0.6 })
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
        new THREE.MeshStandardMaterial({ color: 0x88452a, roughness: 0.6, metalness: 0.5 })
      );
      base.position.y = 1.2;
      mesh.add(base);
      const handle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 0.65),
        new THREE.MeshStandardMaterial({ color: 0xcc3333, roughness: 0.4, metalness: 0.7 })
      );
      handle.position.set(0, 1.45, 0.18);
      handle.rotation.x = -0.7;
      mesh.add(handle);
      mesh.userData.handle = handle;
      mesh.position.set(item.x, 0, item.z);
    } else if (item.type === 'locker') {
      mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 2.1, 0.7),
        new THREE.MeshStandardMaterial({ color: 0x2d4a3e, roughness: 0.55, metalness: 0.5 })
      );
      mesh.position.set(item.x, 1.05, item.z);
    } else if (item.type === 'plate') {
      mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.9, 0.9),
        new THREE.MeshStandardMaterial({
          map: TEX.plateTexture(this.level.puzzle.glyphs ? this.level.puzzle.glyphs[item.glyph] : '?', item.slot),
          emissive: 0x886622, emissiveIntensity: 0.35, emissiveMap: null,
        })
      );
      // прислоняем к ближайшей стене
      const ori = this._wallOrientation(item.x, item.z);
      mesh.position.set(item.x + ori.ox, 1.5, item.z + ori.oz);
      mesh.rotation.y = ori.rot;
    } else if (item.type === 'panel') {
      mesh = new THREE.Group();
      const stand = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 1.3, 0.18),
        new THREE.MeshStandardMaterial({ color: 0x3a3a40, roughness: 0.4, metalness: 0.7 })
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
        new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.6, metalness: 0.7 })
      );
      pipe.position.y = 0.7;
      mesh.add(pipe);
      const wheel = new THREE.Mesh(
        new THREE.TorusGeometry(0.3, 0.05, 8, 18),
        new THREE.MeshStandardMaterial({ color: 0xa03030, roughness: 0.5, metalness: 0.6 })
      );
      wheel.rotation.x = Math.PI / 2;
      wheel.position.y = 1.25;
      mesh.add(wheel);
      mesh.userData.wheel = wheel;
      mesh.position.set(item.x, 0, item.z);
    } else if (item.type === 'switch') {
      mesh = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.9, 0.3),
        new THREE.MeshStandardMaterial({ color: 0x444448, roughness: 0.5, metalness: 0.6 })
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
    // находит соседнюю стену для размещения таблички
    const C = this.grid.cell;
    const gx = Math.floor(x / C), gz = Math.floor(z / C);
    const get = (a, b) => (a < 0 || b < 0 || a >= this.grid.w || b >= this.grid.h) ? WALL : this.grid.cells[b * this.grid.w + a];
    if (get(gx, gz - 1) === WALL) return { ox: 0, oz: -C / 2 + 0.06, rot: 0 };
    if (get(gx, gz + 1) === WALL) return { ox: 0, oz: C / 2 - 0.06, rot: Math.PI };
    if (get(gx - 1, gz) === WALL) return { ox: -C / 2 + 0.06, oz: 0, rot: Math.PI / 2 };
    return { ox: C / 2 - 0.06, oz: 0, rot: -Math.PI / 2 };
  }

  _buildExit(level, theme) {
    const g = new THREE.Group();
    // рамка портала
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4, metalness: 0.8 });
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
      transparent: true, opacity: 0.85,
    });
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 2.4), this.exitGlowMat);
    glow.position.y = 1.3;
    glow.material.side = THREE.DoubleSide;
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

  // вызывается из game.js при событиях головоломки
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
      if (mesh.userData.lamp) {
        mesh.userData.lamp.material.emissive.set(0x22ff44);
      }
    } else if (ev === 'insert') {
      if (mesh.userData.lamp) mesh.userData.lamp.material.emissive.set(0xffaa22);
    }
  }

  // обновление света и анимаций
  update(dt, playerPos) {
    this.time += dt;
    if (!this.level) return;

    // назначаем пул источников ближайшим плафонам
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
        f.mesh.material.emissiveIntensity = inten / this.theme.lightIntensity * 0.85;
      }
      pl.intensity = inten;
      pl.color.copy(this.theme.lightColor);
    }

    // покачивание предметов-подбираемых
    for (const mesh of this.itemMeshes.values()) {
      if (mesh.userData.bob && mesh.visible) {
        mesh.position.y = 0.5 + Math.sin(this.time * 2 + mesh.position.x) * 0.07;
        mesh.rotation.y += dt * 1.2;
      }
    }

    // вода
    if (this.waterMesh) {
      this.waterMesh.material.map.offset.x = Math.sin(this.time * 0.18) * 0.08;
      this.waterMesh.material.map.offset.y = this.time * 0.012;
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

  // скользящая коллизия круга радиусом r
  collide(x, z, r) {
    const C = this.grid.cell;
    let nx = x, nz = z;
    const gx = Math.floor(x / C), gz = Math.floor(z / C);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cx = gx + dx, cz = gz + dz;
        if (!this.isWall(cx, cz)) continue;
        // ближайшая точка AABB клетки
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
          // оказались внутри стены — выталкиваем к центру предыдущей клетки
          nx = (gx + 0.5) * C;
          nz = (gz + 0.5) * C;
        }
      }
    }
    return { x: nx, z: nz };
  }
}
