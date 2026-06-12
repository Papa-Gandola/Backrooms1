// HUD, заставки уровней, скримеры.

const $ = (id) => document.getElementById(id);

export const UI = {
  showScreen(name) {
    for (const id of ['menu', 'lobby', 'game']) $(id).classList.toggle('hidden', id !== name);
  },

  menuError(msg) { $('menuError').textContent = msg; },

  setObjective(title, text) {
    $('objective').innerHTML = `<div class="obj-title">${title}</div>${text}`;
  },

  // Чеклист задач уровня: [{ text, done, active, progress: [есть, нужно] }]
  setTasks(title, tasks) {
    const items = tasks.map(t => {
      const cls = t.done ? 'done' : (t.active ? 'active' : '');
      const prog = t.progress ? ` <span class="task-progress">${t.progress[0]}/${t.progress[1]}</span>` : '';
      return `<li class="${cls}">${t.text}${prog}</li>`;
    }).join('');
    $('objective').innerHTML = `<div class="obj-title">${title}</div><ul class="task-list">${items}</ul>`;
  },

  setInventory(text) { $('inventory').textContent = text; },
  setPartnerInfo(text) { $('partnerInfo').textContent = text; },

  prompt(text) {
    const el = $('prompt');
    if (text) { el.innerHTML = text; el.style.display = 'block'; }
    else el.style.display = 'none';
  },

  stamina(v, visible) {
    $('staminaWrap').style.opacity = visible ? 1 : 0;
    $('stamina').style.width = (v * 100) + '%';
  },

  subtitles(text, ms = 4000) {
    const el = $('subtitles');
    el.textContent = text;
    clearTimeout(this._subT);
    this._subT = setTimeout(() => { el.textContent = ''; }, ms);
  },

  voice(on, connected) {
    const el = $('voiceInfo');
    el.classList.toggle('on', on);
    el.textContent = on ? ('🎤 микрофон вкл' + (connected ? ' · связь есть' : ' · ждём напарника')) : '[V] голосовой чат';
  },

  signalFlash() {
    const el = $('signalFlash');
    el.classList.remove('hidden');
    clearTimeout(this._sigT);
    this._sigT = setTimeout(() => el.classList.add('hidden'), 2500);
  },

  glyphPanel(show, slots, glyphs) {
    const panel = $('glyphPanel');
    panel.classList.toggle('hidden', !show);
    if (show && slots && glyphs) {
      panel.querySelectorAll('.glyph-slot').forEach((el, i) => {
        el.textContent = glyphs[slots[i]];
      });
    }
  },

  async levelCard(name, hint) {
    const card = $('levelCard');
    const nameEl = $('levelName');
    const hintEl = $('levelHint');
    card.classList.remove('hidden');
    card.style.opacity = 1;
    hintEl.textContent = '';
    nameEl.textContent = '';
    // печатаем название по буквам
    for (let i = 0; i <= name.length; i++) {
      nameEl.textContent = name.slice(0, i);
      await sleep(38);
    }
    hintEl.textContent = hint;
    await sleep(4600);
    card.style.opacity = 0;
    await sleep(1200);
    card.classList.add('hidden');
  },

  // Скример: процедурно рисуем морду сущности крупным планом
  jumpscare(entityType) {
    const js = $('jumpscare');
    const canvas = $('scareCanvas');
    const ctx = canvas.getContext('2d');
    js.classList.remove('hidden');

    let frame = 0;
    const draw = () => {
      frame++;
      const W = canvas.width, H = canvas.height;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      const jx = (Math.random() - 0.5) * 30, jy = (Math.random() - 0.5) * 30;
      ctx.save();
      ctx.translate(W / 2 + jx, H / 2 + jy);

      if (entityType === 'smiler') {
        ctx.strokeStyle = '#eaffff';
        ctx.shadowColor = '#bffcff'; ctx.shadowBlur = 60;
        ctx.lineWidth = 26;
        ctx.beginPath(); ctx.arc(0, -40, 260, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
        ctx.fillStyle = '#eaffff';
        for (const sx of [-1, 1]) {
          ctx.beginPath(); ctx.ellipse(sx * 130, -120, 55, 30, sx * 0.4, 0, Math.PI * 2); ctx.fill();
        }
        // зубы
        ctx.lineWidth = 6;
        for (let i = 0; i < 14; i++) {
          const a = 0.18 * Math.PI + (i / 13) * 0.64 * Math.PI;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * 235, -40 + Math.sin(a) * 235);
          ctx.lineTo(Math.cos(a) * 285, -40 + Math.sin(a) * 285);
          ctx.stroke();
        }
      } else if (entityType === 'hound') {
        ctx.fillStyle = '#8f8378';
        ctx.beginPath(); ctx.ellipse(0, 0, 230, 300, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#551111';
        ctx.beginPath(); ctx.ellipse(0, 130, 150, 110, 0, 0, Math.PI); ctx.fill();
        ctx.fillStyle = '#e8e0d0';
        for (let i = -5; i <= 5; i++) {
          ctx.beginPath();
          ctx.moveTo(i * 26 - 8, 120); ctx.lineTo(i * 26 + 8, 120); ctx.lineTo(i * 26, 185);
          ctx.fill();
        }
        ctx.fillStyle = '#1a1208';
        for (const sx of [-1, 1]) {
          ctx.beginPath(); ctx.ellipse(sx * 95, -90, 38, 50, 0, 0, Math.PI * 2); ctx.fill();
        }
      } else if (entityType === 'partygoer') {
        // жёлтая рожа =) во весь экран
        ctx.fillStyle = '#e8c83a';
        ctx.beginPath(); ctx.ellipse(0, 0, 250, 260, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#1a1208';
        for (const sx of [-1, 1]) {
          ctx.beginPath(); ctx.ellipse(sx * 90, -80, 28, 44, 0, 0, Math.PI * 2); ctx.fill();
        }
        ctx.strokeStyle = '#1a1208'; ctx.lineWidth = 26; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(0, 10, 150, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke();
        // подтёки краски
        ctx.strokeStyle = 'rgba(120,40,20,0.5)'; ctx.lineWidth = 8;
        for (let i = -3; i <= 3; i++) {
          ctx.beginPath(); ctx.moveTo(i * 60, -240); ctx.lineTo(i * 60 + 10, -140 + Math.random() * 60); ctx.stroke();
        }
      } else if (entityType === 'wretch') {
        // красная безглазая морда с распахнутым ртом
        ctx.fillStyle = '#8f2a20';
        ctx.beginPath(); ctx.ellipse(0, 0, 215, 290, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#eadfd0';
        ctx.shadowColor = '#fff'; ctx.shadowBlur = 30;
        for (const sx of [-1, 1]) {
          ctx.beginPath(); ctx.ellipse(sx * 85, -85, 40, 26, 0, 0, Math.PI * 2); ctx.fill();
        }
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#170503';
        ctx.beginPath(); ctx.ellipse(0, 130, 110, 150 + Math.random() * 15, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(40,8,5,0.8)'; ctx.lineWidth = 4;
        for (let i = 0; i < 7; i++) {
          ctx.beginPath();
          let x = (Math.random() - 0.5) * 320, y = -290;
          ctx.moveTo(x, y);
          for (let s2 = 0; s2 < 5; s2++) { x += (Math.random() - 0.5) * 70; y += 70; ctx.lineTo(x, y); }
          ctx.stroke();
        }
      } else if (entityType === 'skinstealer') {
        ctx.fillStyle = '#c9a98c';
        ctx.beginPath(); ctx.ellipse(0, 0, 220, 290, 0, 0, Math.PI * 2); ctx.fill();
        // лицо «сползает»
        ctx.fillStyle = '#a07a5a';
        ctx.beginPath(); ctx.ellipse(40, 60, 180, 230, 0.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        for (const [ex, ey, r] of [[-90, -80, 55], [80, -60, 65]]) {
          ctx.beginPath(); ctx.ellipse(ex, ey, r, r * 1.3, 0, 0, Math.PI * 2); ctx.fill();
        }
        ctx.beginPath(); ctx.ellipse(0, 150, 90, 130, 0, 0, Math.PI * 2); ctx.fill();
      } else {
        // wanderer / reaper: чёрный череп с горящими глазами
        const eyeColor = entityType === 'reaper' ? '#ff2200' : '#9a8a20';
        ctx.fillStyle = '#0d0d10';
        ctx.beginPath(); ctx.ellipse(0, 0, 210, 290, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = eyeColor;
        ctx.shadowColor = eyeColor; ctx.shadowBlur = 50;
        for (const sx of [-1, 1]) {
          ctx.beginPath(); ctx.ellipse(sx * 85, -70, 45, 60 + Math.random() * 14, 0, 0, Math.PI * 2); ctx.fill();
        }
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.ellipse(0, 160, 95, 120 + Math.random() * 20, 0, 0, Math.PI * 2); ctx.fill();
        // трещины
        ctx.strokeStyle = 'rgba(60,60,70,0.8)'; ctx.lineWidth = 3;
        for (let i = 0; i < 6; i++) {
          ctx.beginPath();
          let x = (Math.random() - 0.5) * 300, y = -280;
          ctx.moveTo(x, y);
          for (let s = 0; s < 6; s++) { x += (Math.random() - 0.5) * 80; y += 60; ctx.lineTo(x, y); }
          ctx.stroke();
        }
      }
      ctx.restore();

      // помехи
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      for (let i = 0; i < 30; i++) {
        ctx.fillRect(Math.random() * W, Math.random() * H, Math.random() * 200, 2);
      }
      if (frame < 80) requestAnimationFrame(draw);
    };
    draw();

    setTimeout(() => {
      js.classList.add('hidden');
      $('deathScreen').classList.remove('hidden');
    }, 1300);
    setTimeout(() => {
      $('deathScreen').classList.add('hidden');
    }, 3300);
  },

  victory(timeStr) {
    $('victoryStats').textContent = `время в Закулисье: ${timeStr}`;
    $('victory').classList.remove('hidden');
  },

  disconnected() { $('disconnected').classList.remove('hidden'); },

  clickToPlay(show) { $('clickToPlay').classList.toggle('hidden', !show); },

  hud(show) { $('hud').classList.toggle('hidden', !show); },
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
