// Процедурные текстуры на canvas — обои, ковролин, бетон, ржавчина, плитка.

import * as THREE from 'three';

function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')];
}

function addNoise(ctx, size, alpha, dark = true) {
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 255 * alpha;
    d[i] = clamp8(d[i] + (dark ? Math.min(n, 0) : n));
    d[i + 1] = clamp8(d[i + 1] + (dark ? Math.min(n, 0) : n));
    d[i + 2] = clamp8(d[i + 2] + (dark ? Math.min(n, 0) : n));
  }
  ctx.putImageData(img, 0, 0);
}

function addStains(ctx, size, count, color, maxR) {
  for (let i = 0; i < count; i++) {
    const x = Math.random() * size, y = Math.random() * size;
    const r = maxR * (0.3 + Math.random() * 0.7);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

function clamp8(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

function toTexture(canvas, repeat = 1) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function wallpaperTexture() {
  const size = 512;
  const [c, ctx] = makeCanvas(size);
  ctx.fillStyle = '#b9a24b';
  ctx.fillRect(0, 0, size, size);
  // вертикальные полосы обоев
  for (let x = 0; x < size; x += 64) {
    ctx.fillStyle = 'rgba(0,0,0,0.07)';
    ctx.fillRect(x, 0, 6, size);
    ctx.fillStyle = 'rgba(255,255,230,0.05)';
    ctx.fillRect(x + 30, 0, 18, size);
  }
  addStains(ctx, size, 9, 'rgba(70,55,15,0.16)', 130);
  addStains(ctx, size, 4, 'rgba(40,30,8,0.22)', 60);
  addNoise(ctx, size, 0.10);
  return toTexture(c, 2);
}

export function carpetTexture() {
  const size = 512;
  const [c, ctx] = makeCanvas(size);
  ctx.fillStyle = '#8a7434';
  ctx.fillRect(0, 0, size, size);
  addNoise(ctx, size, 0.35, false);
  addStains(ctx, size, 14, 'rgba(35,28,8,0.30)', 110);
  addStains(ctx, size, 5, 'rgba(20,16,4,0.45)', 50); // влажные пятна
  return toTexture(c, 8);
}

export function ceilingTexture() {
  const size = 512;
  const [c, ctx] = makeCanvas(size);
  ctx.fillStyle = '#cfc5a0';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(60,50,25,0.5)';
  ctx.lineWidth = 3;
  for (let i = 0; i <= size; i += 128) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(size, i); ctx.stroke();
  }
  addStains(ctx, size, 7, 'rgba(90,70,30,0.25)', 90);
  addNoise(ctx, size, 0.07);
  return toTexture(c, 6);
}

export function concreteTexture() {
  const size = 512;
  const [c, ctx] = makeCanvas(size);
  ctx.fillStyle = '#3c3c40';
  ctx.fillRect(0, 0, size, size);
  addNoise(ctx, size, 0.25, false);
  addStains(ctx, size, 12, 'rgba(0,0,0,0.3)', 140);
  addStains(ctx, size, 6, 'rgba(120,120,130,0.1)', 80);
  // трещины
  ctx.strokeStyle = 'rgba(10,10,12,0.5)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 8; i++) {
    let x = Math.random() * size, y = Math.random() * size;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let s = 0; s < 12; s++) {
      x += (Math.random() - 0.5) * 60; y += Math.random() * 40;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  return toTexture(c, 6);
}

export function metalWallTexture() {
  const size = 512;
  const [c, ctx] = makeCanvas(size);
  ctx.fillStyle = '#2e3134';
  ctx.fillRect(0, 0, size, size);
  // гофра
  for (let x = 0; x < size; x += 32) {
    const g = ctx.createLinearGradient(x, 0, x + 32, 0);
    g.addColorStop(0, 'rgba(0,0,0,0.35)');
    g.addColorStop(0.5, 'rgba(160,170,180,0.12)');
    g.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, 32, size);
  }
  addStains(ctx, size, 10, 'rgba(80,45,15,0.25)', 100); // ржавые подтёки
  addNoise(ctx, size, 0.12);
  return toTexture(c, 3);
}

export function rustTexture() {
  const size = 512;
  const [c, ctx] = makeCanvas(size);
  ctx.fillStyle = '#4a2f1c';
  ctx.fillRect(0, 0, size, size);
  addStains(ctx, size, 26, 'rgba(120,60,20,0.4)', 90);
  addStains(ctx, size, 18, 'rgba(25,12,5,0.5)', 70);
  addNoise(ctx, size, 0.3, false);
  return toTexture(c, 3);
}

export function tileTexture() {
  const size = 512;
  const [c, ctx] = makeCanvas(size);
  ctx.fillStyle = '#cfd8d4';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(90,110,105,0.7)';
  ctx.lineWidth = 4;
  for (let i = 0; i <= size; i += 64) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(size, i); ctx.stroke();
  }
  addStains(ctx, size, 5, 'rgba(110,140,135,0.18)', 100);
  addNoise(ctx, size, 0.05);
  return toTexture(c, 6);
}

export function officeTexture() {
  const size = 512;
  const [c, ctx] = makeCanvas(size);
  ctx.fillStyle = '#241418';
  ctx.fillRect(0, 0, size, size);
  for (let x = 0; x < size; x += 48) {
    ctx.fillStyle = 'rgba(255,40,40,0.04)';
    ctx.fillRect(x, 0, 20, size);
  }
  addStains(ctx, size, 16, 'rgba(70,5,8,0.3)', 110);
  addStains(ctx, size, 8, 'rgba(0,0,0,0.5)', 130);
  addNoise(ctx, size, 0.14);
  return toTexture(c, 3);
}

export function waterTexture() {
  const size = 256;
  const [c, ctx] = makeCanvas(size);
  ctx.fillStyle = '#56a7b0';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 40; i++) {
    ctx.strokeStyle = `rgba(255,255,255,${0.04 + Math.random() * 0.08})`;
    ctx.lineWidth = 1 + Math.random() * 2;
    ctx.beginPath();
    const y = Math.random() * size;
    ctx.moveTo(0, y);
    for (let x = 0; x <= size; x += 16) {
      ctx.lineTo(x, y + Math.sin(x * 0.1 + i) * 6);
    }
    ctx.stroke();
  }
  return toTexture(c, 4);
}

// Табличка с глифом и порядковым номером (уровень 2)
export function plateTexture(glyph, slot) {
  const size = 256;
  const [c, ctx] = makeCanvas(size);
  ctx.fillStyle = '#1c1410';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = '#8a6a30';
  ctx.lineWidth = 8;
  ctx.strokeRect(10, 10, size - 20, size - 20);
  ctx.fillStyle = '#d8c051';
  ctx.textAlign = 'center';
  ctx.font = '120px serif';
  ctx.fillText(glyph, size / 2, 150);
  ctx.font = '36px monospace';
  ctx.fillStyle = '#8a6a30';
  ctx.fillText(`ПОЗИЦИЯ ${slot + 1}`, size / 2, 215);
  addNoise(ctx, size, 0.1);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Светящаяся улыбка для Улыбающегося
export function smilerTexture() {
  const size = 256;
  const [c, ctx] = makeCanvas(size);
  ctx.clearRect(0, 0, size, size);
  ctx.shadowColor = '#dffcff';
  ctx.shadowBlur = 22;
  ctx.strokeStyle = '#eaffff';
  ctx.lineWidth = 9;
  // улыбка
  ctx.beginPath();
  ctx.arc(size / 2, size * 0.4, size * 0.33, 0.25 * Math.PI, 0.75 * Math.PI);
  ctx.stroke();
  // глаза
  ctx.fillStyle = '#eaffff';
  ctx.beginPath(); ctx.ellipse(size * 0.34, size * 0.34, 15, 9, -0.4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(size * 0.66, size * 0.34, 15, 9, 0.4, 0, Math.PI * 2); ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
