'use strict';
const K = 'markfit.v1';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isNaN(n) ? null : n; };
const fmtN = n => n == null ? '' : String(Math.round(n * 100) / 100).replace('.', ',');
const DN = ['ned', 'pon', 'uto', 'sre', 'čet', 'pet', 'sub'];
const pad = n => String(n).padStart(2, '0');
const dkey = d => { d = new Date(d); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
const fromKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const fmtD = d => { d = new Date(d); return DN[d.getDay()] + ' ' + d.getDate() + '.' + (d.getMonth() + 1) + '.'; };
const monday = d => { d = new Date(d); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return d; };
const addDays = (d, n) => { d = new Date(d); d.setDate(d.getDate() + n); return d; };
const mmss = s => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + pad(s % 60); };
const parseTime = t => { t = String(t || '').trim().replace(',', '.'); if (!t) return null; if (t.includes(':')) { const [m, s] = t.split(':'); return (+m || 0) * 60 + (+s || 0); } const n = parseFloat(t); return isNaN(n) ? null : n * 60; };

// ---------- state ----------
let S;
function load() {
  try { S = JSON.parse(localStorage.getItem(K)); } catch (e) { S = null; }
  S = Object.assign({ v: 1, sessions: [], active: null, body: [], food: {}, plan: {}, notes: {}, set: { rest: 90, sound: false } }, S || {});
}
function save() {
  try { localStorage.setItem(K, JSON.stringify(S)); }
  catch (e) { toast('Greška pri čuvanju! Napravi rezervnu kopiju.'); }
}
load();
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

let tab = 'train', editId = null, progEx = null, repWeek = dkey(monday(new Date()));

function toast(t) { const el = $('#toast'); el.textContent = t; el.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(() => el.style.display = 'none', 2200); }

// ---------- helpers ----------
const isW = id => !E[id].type; // weighted/set based exercise
function itemOf(dayId, exId) { return DAYS[dayId].items.find(i => i[0] === exId); }
function newSession(day) {
  const ex = {};
  for (const it of DAYS[day].items) {
    const id = it[0];
    ex[id] = isW(id) ? { sets: Array.from({ length: it[1] }, () => ({ kg: '', reps: '', done: false })), rir: null, note: '' }
      : E[id].type === 'cardio' ? { km: '', time: '', done: false } : { done: false, note: '' };
  }
  return { id: 's' + Date.now(), day, start: Date.now(), end: null, ex, feel: 0, note: '' };
}
const finished = () => S.sessions.filter(s => s.end).sort((a, b) => a.start - b.start);
function lastFor(exId, exceptId) {
  const l = finished().filter(s => s.id !== exceptId && s.ex[exId] && s.ex[exId].sets && s.ex[exId].sets.some(x => x.kg !== '' || x.reps !== ''));
  return l.length ? l[l.length - 1] : null;
}
function setsTxt(sets) {
  return sets.filter(x => x.kg !== '' || x.reps !== '').map(x => (x.kg !== '' ? fmtN(num(x.kg)) : '–') + '×' + (x.reps || '?')).join(', ');
}
function bestKg(s, id) { const d = s.ex[id]; if (!d || !d.sets) return null; let m = null; for (const x of d.sets) { const k = num(x.kg); if (k != null && (m == null || k > m)) m = k; } return m; }
function nextDay() { const f = finished(); if (!f.length) return 'A'; return { A: 'B', B: 'C', C: 'A' }[f[f.length - 1].day]; }
const cur = () => editId ? S.sessions.find(s => s.id === editId) : S.active;

// ---------- render ----------
function render() {
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.t === tab));
  const app = $('#app');
  app.innerHTML = tab === 'train' ? (cur() ? vWorkout(cur()) : vDays())
    : tab === 'prog' ? vProg() : tab === 'body' ? vBody() : vRep();
  tick();
}

function vDays() {
  const nd = nextDay();
  let h = '<div class="card info"><h3>📋 Pravila od trenera</h3><ul>' + RULES.map(r => '<li>' + r + '</li>').join('') + '</ul></div>';
  for (const [id, d] of Object.entries(DAYS)) {
    h += `<div class="card ${id === nd ? 'next' : ''}"><div class="day"><div class="badge">${id === 'A' ? 1 : id === 'B' ? 2 : 3}</div>
      <div class="grow"><h3>${d.name} · ${d.sub}</h3><div class="mut sm">${id === nd ? '👉 Sledeći na redu' : d.items.filter(i => isW(i[0])).length + ' vežbi'}</div></div>
      <button class="btn ${id === nd ? 'pri' : ''}" data-a="start" data-d="${id}">Kreni</button></div><ul class="list">`;
    for (const it of d.items) h += `<li data-a="info" data-e="${it[0]}" data-d="${id}">${thumbSmall(it[0])}<div class="grow"><div>${esc(E[it[0]].sr)}</div><div class="mut xs">${esc(E[it[0]].en)}</div></div><span class="chip">${target(it)}</span></li>`;
    h += '</ul></div>';
  }
  return h;
}
function target(it) { return isW(it[0]) ? it[1] + ' × ' + it[2] + (it[3] ? ' ' + it[3] : '') : esc(it[1]); }
function thumbSmall(id) { const e = E[id]; return e.img ? `<img loading="lazy" src="img/${e.img}_0.jpg" alt="">` : `<span class="ic">${e.icon || '•'}</span>`; }
function anim(id, cls) { const e = E[id]; return e.img ? `<div class="anim ${cls}"><img src="img/${e.img}_0.jpg" alt=""><img src="img/${e.img}_1.jpg" alt=""></div>` : `<div class="${cls}" style="display:grid;place-items:center;font-size:60px">${e.icon || ''}</div>`; }

function vWorkout(s) {
  const d = DAYS[s.day];
  let h = `<div class="row" style="margin-bottom:10px"><div class="grow"><h3>${d.name} · ${d.sub}</h3><div class="mut sm">${editId ? 'Izmena: ' : ''}${fmtD(s.start)} ${editId ? '' : '· <span id="dur"></span>'}</div></div>
    ${editId ? '' : '<button class="btn sm" data-a="rules">Pravila</button>'}</div>`;
  for (const it of d.items) h += exCard(s, it);
  if (editId) h += `<button class="btn pri big" data-a="editdone">Gotovo</button><p></p><button class="btn big dan" data-a="del">Obriši ovaj trening</button>`;
  else h += `<button class="btn pri big" data-a="finish">Završi trening ✓</button><p></p><button class="btn big dan" data-a="cancel">Odustani (briše upisano)</button>`;
  return h;
}

function exCard(s, it) {
  const id = it[0], e = E[id], d = s.ex[id] || (s.ex[id] = isW(id) ? { sets: [], rir: null, note: '' } : {});
  const head = `<div class="top"><button class="thumb" data-a="info" data-e="${id}" data-d="${s.day}">${e.img ? anim(id, '') : e.icon}</button>
    <div class="grow"><h3>${esc(e.sr)}</h3><div class="mut xs">${esc(e.en)}</div><span class="chip acc">${target(it)}</span>${S.plan[id] && isW(id) ? `<span class="chip">trener: ${fmtN(num(S.plan[id]))} kg</span>` : ''}
    <br><button class="how" data-a="info" data-e="${id}" data-d="${s.day}">ⓘ Kako se radi + video</button></div></div>`;
  if (!isW(id)) {
    if (e.type === 'cardio') {
      const sec = parseTime(d.time), km = num(d.km);
      const res = sec && km ? `<div class="sm" style="margin-top:8px">${(km / (sec / 3600)).toFixed(1).replace('.', ',')} km/h · ${km >= 5 && sec < 780 ? '<span class="chip ok">✓ cilj ispunjen</span>' : '<span class="chip">cilj: 5 km &lt; 13:00</span>'}</div>` : '';
      return `<div class="card ex ${d.done ? 'done' : ''}" id="c-${id}">${head}<div class="g2" style="margin-top:10px"><div><label class="f">km</label><input inputmode="decimal" placeholder="5" value="${esc(d.km)}" data-f="cardio" data-e="${id}" data-k="km"></div>
        <div><label class="f">vreme (min:sek)</label><input inputmode="text" placeholder="12:45" value="${esc(d.time)}" data-f="cardio" data-e="${id}" data-k="time"></div></div><div id="cr-${id}">${res}</div>
        <button class="tog ${d.done ? 'on' : ''}" data-a="tog" data-e="${id}">${d.done ? '✓ Urađeno' : 'Označi kao urađeno'}</button></div>`;
    }
    return `<div class="card ex ${d.done ? 'done' : ''}" id="c-${id}">${head}${e.type === 'abs' ? `<input style="margin-top:10px" placeholder="šta si radio (npr. 3×20 kranč, plank 3×45 s)" value="${esc(d.note)}" data-f="note" data-e="${id}">` : ''}
      <button class="tog ${d.done ? 'on' : ''}" data-a="tog" data-e="${id}">${d.done ? '✓ Urađeno' : 'Označi kao urađeno'}</button></div>`;
  }
  const prev = lastFor(id, s.id), pl = num(S.plan[id]);
  const prevSets = prev ? prev.ex[id].sets.filter(x => x.kg !== '' || x.reps !== '') : [];
  let rows = `<div class="h">#</div><div class="h">${e.bw ? 'kg (opc.)' : 'kg'}</div><div></div><div class="h">ponavljanja</div><div></div>`;
  d.sets.forEach((x, i) => {
    const p = prevSets[i] || prevSets[prevSets.length - 1] || {};
    const phKg = pl != null ? fmtN(pl) : (p.kg || ''), phR = it[2] === 'max' ? 'max' : (it[2] || p.reps || '');
    rows += `<div class="n">${i + 1}</div><input inputmode="${e.bar ? 'tel' : 'decimal'}" placeholder="${esc(phKg)}" value="${esc(x.kg)}" data-f="set" data-e="${id}" data-i="${i}" data-k="kg">
      <div class="x">×</div><input inputmode="numeric" placeholder="${esc(phR)}" value="${esc(x.reps)}" data-f="set" data-e="${id}" data-i="${i}" data-k="reps">
      <button class="ok ${x.done ? 'on' : ''}" data-a="setok" data-e="${id}" data-i="${i}" aria-label="Serija gotova">✓</button>`;
  });
  const done = d.sets.length && d.sets.every(x => x.done);
  return `<div class="card ex ${done ? 'done' : ''}" id="c-${id}">${head}
    ${prev ? `<div class="prev">Prošli put (${fmtD(prev.start)}): ${esc(setsTxt(prevSets))}${prev.ex[id].rir != null ? ' · rezerva ' + rirTxt(prev.ex[id].rir) : ''}</div>` : '<div class="prev">Prvi put – izaberi kilažu tako da u zadnjoj seriji ostanu najviše 2 ponavljanja u rezervi.</div>'}
    ${e.bar ? `<div class="xs mut">Kilaža ukupno, sa šipkom${id === 'upright' ? ' (EZ šipka obično 7–10 kg)' : ' (šipka obično 20 kg)'}. Možeš da kucaš i <b>2*20 20</b> (tegovi i šipka) – sama sabere u 60.</div>` : e.bw ? '' : '<div class="xs mut">Bučice: kilaža jedne bučice.</div>'}
    <div class="sets">${rows}</div>
    <div class="rir">Rezerva u zadnjoj seriji:${[0, 1, 2, 3].map(r => `<button class="${d.rir === r ? 'on' : ''}" data-a="rir" data-e="${id}" data-r="${r}">${r === 3 ? '3+' : r}</button>`).join('')}</div>
    ${d.rir === 3 ? '<div class="xs" style="color:var(--acc2);margin-top:6px">Ostalo ti je više od 2 – sledeći put stavi malo više kila.</div>' : ''}
    <div class="row" style="margin-top:10px"><input class="grow" placeholder="beleška (opciono)" value="${esc(d.note)}" data-f="note" data-e="${id}">
    <button class="btn sm" data-a="addset" data-e="${id}">+ serija</button>${d.sets.length > 1 ? `<button class="btn sm" data-a="rmset" data-e="${id}">−</button>` : ''}</div></div>`;
}
const rirTxt = r => r === 3 ? '3+' : String(r);

function vInfo(id, day) {
  const e = E[id], it = day && itemOf(day, id);
  let h = `<div class="row"><div class="grow"><h2 style="margin:0">${esc(e.sr)}</h2><div class="mut sm">${esc(e.en)}</div></div><button class="icon" data-a="close">✕</button></div>
    <p style="margin:8px 0">${it ? `<span class="chip acc">${target(it)}</span>` : ''}<span class="chip">${esc(e.muscles)}</span></p>
    ${e.img ? anim(id, 'hero') + '<div class="xs mut" style="margin:4px 0 0">Slike se smenjuju: početni i krajnji položaj.</div>' : ''}
    <h3 style="margin-top:14px">Kako se radi</h3><ol>${e.how.map(x => '<li>' + esc(x) + '</li>').join('')}</ol>${e.tip ? `<p class="sm">💡 ${esc(e.tip)}</p>` : ''}`;
  if (e.video) h += `<h3>Video</h3><p class="xs mut" style="margin:2px 0 8px">Na engleskom – ${esc(e.vch)}</p><button class="vid" data-a="play" data-v="${e.video}"><img loading="lazy" src="https://i.ytimg.com/vi/${e.video}/hqdefault.jpg" alt=""><span>▶</span></button>
    <p class="sm"><a style="color:var(--acc)" href="https://www.youtube.com/watch?v=${e.video}" target="_blank" rel="noopener">Otvori na YouTube-u</a> · <a style="color:var(--acc)" href="https://www.youtube.com/results?search_query=${encodeURIComponent(e.en.split('(')[0] + ' pravilno izvođenje')}" target="_blank" rel="noopener">traži još snimaka</a></p>`;
  if (isW(id)) {
    h += `<h3>Kilaža od trenera</h3><div class="row" style="margin-top:6px"><input inputmode="decimal" placeholder="npr. 60" value="${esc(S.plan[id] || '')}" data-f="plan" data-e="${id}"><span class="mut">kg</span></div>
      <p class="xs mut">Kad je upišeš, predlaže se u svim serijama ove vežbe.</p>`;
    h += progBlock(id);
  }
  return h;
}

function chart(pts, unit) {
  if (pts.length < 2) return '<p class="sm mut">Grafikon se pojavi posle bar 2 upisa.</p>';
  const W = 340, H = 150, L = 34, B = 20, T = 10, R = 8;
  const ys = pts.map(p => p.y), mn = Math.min(...ys), mx = Math.max(...ys), span = (mx - mn) || 1;
  const lo = mn - span * 0.15, hi = mx + span * 0.15;
  const X = i => L + (W - L - R) * (pts.length === 1 ? 0.5 : i / (pts.length - 1));
  const Y = v => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
  let g = '';
  for (const v of [lo + (hi - lo) * 0.1, (lo + hi) / 2, hi - (hi - lo) * 0.1]) g += `<line class="gr" x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${L - 4}" y="${Y(v) + 4}" text-anchor="end">${fmtN(Math.round(v * 10) / 10)}</text>`;
  const step = Math.ceil(pts.length / 5);
  pts.forEach((p, i) => { if (i % step === 0 || i === pts.length - 1) g += `<text x="${X(i)}" y="${H - 4}" text-anchor="middle">${p.l}</text>`; });
  return `<svg class="ch" viewBox="0 0 ${W} ${H}" role="img" aria-label="grafikon ${unit}">${g}<polyline class="ln" points="${pts.map((p, i) => X(i) + ',' + Y(p.y)).join(' ')}"/>${pts.map((p, i) => `<circle class="dt" cx="${X(i)}" cy="${Y(p.y)}" r="3.5"/>`).join('')}</svg>`;
}
function progBlock(id) {
  const ss = finished().filter(s => bestKg(s, id) != null || (s.ex[id] && s.ex[id].sets && s.ex[id].sets.some(x => x.reps)));
  if (!ss.length) return '<p class="sm mut">Još nema upisanih treninga za ovu vežbu.</p>';
  const pts = ss.filter(s => bestKg(s, id) != null).map(s => ({ y: bestKg(s, id), l: new Date(s.start).getDate() + '.' + (new Date(s.start).getMonth() + 1) + '.' }));
  return `<h3 style="margin-top:14px">Napredak (najveća kilaža)</h3>${chart(pts, 'kg')}
    <table><tr><th>Datum</th><th>Serije (kg×pon.)</th><th>Rez.</th></tr>${ss.slice().reverse().map(s => `<tr><td>${fmtD(s.start)}</td><td>${esc(setsTxt(s.ex[id].sets))}</td><td>${s.ex[id].rir != null ? rirTxt(s.ex[id].rir) : ''}</td></tr>`).join('')}</table>`;
}

function vProg() {
  const f = finished();
  const exIds = Object.keys(E).filter(isW);
  if (!progEx) progEx = exIds[0];
  let h = `<h2>Napredak po vežbi</h2><div class="card"><select data-f="progex">${Object.values(DAYS).map(d => `<optgroup label="${d.name}">` + d.items.filter(i => isW(i[0])).map(i => `<option value="${i[0]}" ${i[0] === progEx ? 'selected' : ''}>${esc(E[i[0]].sr)}</option>`).join('') + '</optgroup>').join('')}</select>${progBlock(progEx)}</div>`;
  h += `<h2>Istorija treninga</h2>`;
  if (!f.length) return h + '<p class="mut">Još nema završenih treninga.</p>';
  h += '<div class="card"><ul class="list hist" style="margin:0">';
  for (const s of f.slice().reverse()) {
    const d = DAYS[s.day], n = d.items.filter(i => isW(i[0]) && s.ex[i[0]] && s.ex[i[0]].sets.some(x => x.done || x.kg || x.reps)).length;
    const min = s.end ? Math.round((s.end - s.start) / 60000) : 0;
    h += `<li data-a="edit" data-s="${s.id}"><span class="ic" style="width:40px;height:40px;border-radius:10px;display:grid;place-items:center;background:var(--card2);font-size:20px">${['', '😫', '😕', '😐', '🙂', '💪'][s.feel] || '🏋'}</span>
      <div class="grow"><div>${fmtD(s.start)} · ${d.name}</div><div class="mut xs">${n} vežbi upisano · ${min} min${s.note ? ' · ' + esc(s.note) : ''}</div></div><span class="mut">›</span></li>`;
  }
  return h + '</ul></div><p class="xs mut">Dodirni trening da ga izmeniš ili obrišeš.</p>';
}

function vBody() {
  const today = dkey(new Date());
  const b = S.body.slice().sort((a, c) => a.d < c.d ? -1 : 1);
  const t = S.body.find(x => x.d === today) || {};
  let h = `<h2>Telo</h2><div class="card"><div class="xs mut">Vagu uvek u isto vreme, struk uvek na istom mestu.</div>
    <div class="g3"><div><label class="f">Datum</label><input type="date" id="bd" value="${today}"></div><div><label class="f">Kilaža (kg)</label><input id="bkg" inputmode="decimal" value="${esc(t.kg || '')}" placeholder="${b.length ? fmtN(b[b.length - 1].kg) : ''}"></div>
    <div><label class="f">Struk (cm)</label><input id="bw" inputmode="decimal" value="${esc(t.w || '')}" placeholder="${b.length && b[b.length - 1].w ? fmtN(b[b.length - 1].w) : ''}"></div></div>
    <button class="btn pri big" style="margin-top:10px" data-a="bsave">Sačuvaj merenje</button>`;
  const kp = b.filter(x => x.kg != null).map(x => ({ y: x.kg, l: fromKey(x.d).getDate() + '.' + (fromKey(x.d).getMonth() + 1) + '.' }));
  if (b.length) {
    h += `<h3 style="margin-top:14px">Kilaža</h3>${chart(kp, 'kg')}<table><tr><th>Datum</th><th>kg</th><th>struk</th><th></th></tr>${b.slice().reverse().map(x => `<tr><td>${fmtD(fromKey(x.d))}</td><td>${x.kg != null ? fmtN(x.kg) : ''}</td><td>${x.w != null ? fmtN(x.w) : ''}</td><td style="text-align:right"><button class="btn sm" data-a="bdel" data-d="${x.d}">✕</button></td></tr>`).join('')}</table>`;
  }
  h += '</div>';
  // food
  const wk = monday(new Date());
  let sum = 0, cnt = 0, prot = 0, pc = 0;
  for (let i = 0; i < 7; i++) { const f = S.food[dkey(addDays(wk, i))]; if (f && f.kcal) { sum += +f.kcal; cnt++; } if (f && f.prot) { prot += +f.prot; pc++; } }
  const ft = S.food[today] || {};
  h += `<h2>Ishrana</h2><div class="card"><div class="row" style="flex-wrap:wrap"><span class="chip acc">${FOOD.kcal} kcal/dan</span><span class="chip">protein ${FOOD.prot} g</span><span class="chip">masti ${FOOD.fat} g</span><span class="chip">ostalo ugljeni hidrati</span></div>
    <p class="sm">Gleda se nedelja: do <b>${FOOD.week.toLocaleString('sr')} kcal</b> nedeljno. Može jedan dan 2500, drugi 3000, treći 2000… samo da nedeljno ne pređeš – trener garantuje do 1 kg manje svake nedelje.</p>
    <div class="row sm"><div class="grow">Ova nedelja (${fmtD(wk)}–${fmtD(addDays(wk, 6))})</div><b>${sum.toLocaleString('sr')} / ${FOOD.week.toLocaleString('sr')}</b></div>
    <div class="bar"><i class="${sum > FOOD.week ? 'over' : ''}" style="width:${Math.min(100, sum / FOOD.week * 100)}%"></i></div>
    <div class="xs mut">${cnt} od 7 dana upisano · ostalo ${(FOOD.week - sum).toLocaleString('sr')} kcal${cnt < 7 ? ' (≈' + Math.round((FOOD.week - sum) / (7 - cnt)) + ' kcal po preostalom danu)' : ''}${pc ? ' · protein prosek ' + Math.round(prot / pc) + ' g' : ''}</div>
    <div class="g3" style="margin-top:8px"><div><label class="f">Dan</label><input type="date" id="fd" value="${today}" data-f="fd"></div><div><label class="f">kcal</label><input id="fk" inputmode="numeric" value="${esc(ft.kcal || '')}"></div><div><label class="f">protein g</label><input id="fp" inputmode="numeric" value="${esc(ft.prot || '')}"></div></div>
    <button class="btn pri big" style="margin-top:10px" data-a="fsave">Sačuvaj dan</button>
    <table style="margin-top:10px"><tr><th>Dan</th><th>kcal</th><th>protein</th></tr>${[0, 1, 2, 3, 4, 5, 6].map(i => { const k = dkey(addDays(wk, i)), f = S.food[k] || {}; return `<tr><td>${fmtD(addDays(wk, i))}</td><td>${f.kcal || '–'}</td><td>${f.prot ? f.prot + ' g' : '–'}</td></tr>`; }).join('')}</table>
    <p class="xs mut">Kalorije računaj u aplikaciji po želji (ili ChatGPT/Claude) pa ovde upiši ukupno za dan.</p></div>`;
  return h;
}

function report(wk) {
  const a = fromKey(wk), z = addDays(a, 7);
  const ss = finished().filter(s => s.start >= +a && s.start < +z);
  const L = [`Izveštaj za nedelju ${fmtD(a)}–${fmtD(addDays(a, 6))}${a.getFullYear()}.`, '', `Treninzi: ${ss.length}/3`];
  for (const s of ss) {
    const d = DAYS[s.day];
    L.push('', `▸ ${d.name} (${d.sub}) – ${fmtD(s.start)}${s.feel ? ' ' + ['', '😫', '😕', '😐', '🙂', '💪'][s.feel] : ''}`);
    for (const it of d.items) {
      const id = it[0], x = s.ex[id]; if (!x) continue;
      if (isW(id)) { const t = setsTxt(x.sets); L.push(`- ${E[id].en}: ${t || 'nije rađeno'}${x.rir != null && t ? ' (rezerva ' + rirTxt(x.rir) + ')' : ''}${x.note ? ' – ' + x.note : ''}`); }
      else if (E[id].type === 'cardio') { if (x.km || x.time) L.push(`- Kardio: ${x.km || '?'} km za ${x.time || '?'}`); else if (!x.done) L.push('- Kardio: nije rađeno'); }
      else if (id === 'abs') L.push(`- Trbušnjaci: ${x.done ? (x.note || 'urađeno') : 'nije rađeno'}`);
    }
    if (s.note) L.push('Beleška: ' + s.note);
  }
  const b = S.body.filter(x => x.d < dkey(z)).sort((p, q) => p.d < q.d ? -1 : 1);
  const inW = b.filter(x => x.d >= wk), before = b.filter(x => x.d < wk);
  const first = before.length ? before[before.length - 1] : inW[0], last = inW[inW.length - 1];
  if (last) {
    L.push('');
    const dlt = (p, q) => { const v = Math.round((q - p) * 10) / 10; return ' (' + (v > 0 ? '+' : '') + fmtN(v) + ')'; };
    if (last.kg != null) L.push(`Kilaža: ${first && first !== last && first.kg != null ? fmtN(first.kg) + ' → ' : ''}${fmtN(last.kg)} kg${first && first !== last && first.kg != null ? dlt(first.kg, last.kg) : ''}`);
    if (last.w != null) L.push(`Struk: ${first && first !== last && first.w != null ? fmtN(first.w) + ' → ' : ''}${fmtN(last.w)} cm${first && first !== last && first.w != null ? dlt(first.w, last.w) : ''}`);
  }
  let sum = 0, cnt = 0, prot = 0, pc = 0;
  for (let i = 0; i < 7; i++) { const f = S.food[dkey(addDays(a, i))]; if (f && f.kcal) { sum += +f.kcal; cnt++; } if (f && f.prot) { prot += +f.prot; pc++; } }
  if (cnt) L.push(`Ishrana: ${sum.toLocaleString('sr')} / ${FOOD.week.toLocaleString('sr')} kcal (upisano ${cnt}/7 dana)${pc ? ', protein prosek ' + Math.round(prot / pc) + ' g' : ''}`);
  const n = S.notes[wk] || {};
  if (n.feel) L.push('', 'Opšti osećaj: ' + n.feel);
  if (n.like) L.push('Sviđa mi se: ' + n.like);
  if (n.dis) L.push('Ne sviđa mi se: ' + n.dis);
  return L.join('\n');
}
function vRep() {
  const a = fromKey(repWeek), n = S.notes[repWeek] || {};
  return `<h2>Nedeljni izveštaj za trenera</h2><div class="card"><div class="row"><button class="btn" data-a="wk" data-n="-7">‹</button><div class="grow" style="text-align:center"><b>${fmtD(a)} – ${fmtD(addDays(a, 6))}</b></div><button class="btn" data-a="wk" data-n="7">›</button></div>
    <label class="f">Opšti osećaj (umor, san, energija, bolovi…)</label><textarea data-f="rn" data-k="feel">${esc(n.feel)}</textarea>
    <label class="f">Šta mi se sviđa</label><textarea data-f="rn" data-k="like">${esc(n.like)}</textarea>
    <label class="f">Šta mi se ne sviđa</label><textarea data-f="rn" data-k="dis">${esc(n.dis)}</textarea></div>
    <div class="card"><pre class="rep" id="rep">${esc(report(repWeek))}</pre>
    <div class="g2" style="margin-top:10px"><button class="btn" data-a="copy">📋 Kopiraj</button><button class="btn pri" data-a="share">📤 Pošalji</button></div></div>`;
}

function vSettings() {
  return `<div class="row"><h2 class="grow" style="margin:0">Podešavanja</h2><button class="icon" data-a="close">✕</button></div>
    <label class="f">Pauza između serija (tajmer)</label><div class="g3">${[60, 90, 120].map(r => `<button class="btn ${S.set.rest === r ? 'pri' : ''}" data-a="setrest" data-r="${r}">${r} s</button>`).join('')}</div>
    <label class="f">Zvuk kad pauza istekne (vibracija je uvek uključena)</label><button class="btn ${S.set.sound ? 'pri' : ''}" data-a="sound">${S.set.sound ? '🔔 Uključen' : '🔕 Isključen'}</button>
    <h3 style="margin-top:18px">Rezervna kopija</h3><p class="sm mut">Podaci se čuvaju samo na ovom telefonu. Povremeno napravi kopiju (fajl) i sačuvaj je na Drive ili pošalji sebi.</p>
    <div class="g2"><button class="btn" data-a="export">⬇ Napravi kopiju</button><button class="btn" data-a="import">⬆ Vrati iz kopije</button></div>
    <p class="xs mut" style="margin-top:18px">Treninga: ${finished().length} · Slike vežbi: free-exercise-db (javno vlasništvo). Snimci: YouTube, autori navedeni kod vežbe.</p>`;
}

// ---------- modal ----------
function openModal(html) { $('#sheet').innerHTML = html; $('#modal').classList.add('show'); $('#sheet').scrollTop = 0; history.pushState({ m: 1 }, ''); }
function closeModal(fromPop) { if (!$('#modal').classList.contains('show')) return; $('#modal').classList.remove('show'); $('#sheet').innerHTML = ''; if (!fromPop && history.state && history.state.m) history.back(); }
window.addEventListener('popstate', () => closeModal(true));
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });

// ---------- rest timer ----------
let restEnd = 0, restFired = false, actx = null;
function startRest() { restEnd = Date.now() + S.set.rest * 1000; restFired = false; $('#rest').classList.remove('end'); tick(); }
function beep() {
  try { actx = actx || new AudioContext(); const o = actx.createOscillator(), g = actx.createGain(); o.frequency.value = 880; g.gain.value = 0.25; o.connect(g); g.connect(actx.destination); o.start(); o.stop(actx.currentTime + 0.35); } catch (e) {}
}
function tick() {
  const r = $('#rest');
  if (restEnd) {
    const left = (restEnd - Date.now()) / 1000;
    r.classList.add('show');
    if (left > 0) { $('#restT').textContent = mmss(left); $('#restL').textContent = 'Pauza'; }
    else {
      $('#restT').textContent = '0:00'; $('#restL').textContent = 'Sledeća serija!'; r.classList.add('end');
      if (!restFired) { restFired = true; if (navigator.vibrate) navigator.vibrate([300, 150, 300]); if (S.set.sound) beep(); }
      if (left < -20) { restEnd = 0; r.classList.remove('show', 'end'); }
    }
  } else r.classList.remove('show');
  const du = $('#dur'); if (du && S.active && !editId) du.textContent = mmss((Date.now() - S.active.start) / 1000) + ' min';
}
setInterval(tick, 500);

// ---------- events ----------
document.addEventListener('click', e => {
  const t = e.target.closest('[data-a]'); if (!t) return;
  const a = t.dataset.a, id = t.dataset.e, s = cur();
  switch (a) {
    case 'tab': tab = t.dataset.t; if (tab !== 'train') editId = editId; render(); scrollTo(0, 0); break;
    case 'start':
      if (S.active) { toast('Već imaš započet trening'); break; }
      S.active = newSession(t.dataset.d); editId = null; save(); render(); scrollTo(0, 0); break;
    case 'info': openModal(vInfo(id, t.dataset.d)); break;
    case 'close': closeModal(); break;
    case 'rules': openModal(`<div class="row"><h2 class="grow" style="margin:0">Pravila</h2><button class="icon" data-a="close">✕</button></div><ul>${RULES.map(r => '<li style="margin:8px 0">' + r + '</li>').join('')}</ul>`); break;
    case 'play': t.outerHTML = `<div class="vid"><iframe src="https://www.youtube-nocookie.com/embed/${t.dataset.v}?autoplay=1&rel=0&playsinline=1" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>`; break;
    case 'setok': {
      const x = s.ex[id].sets[+t.dataset.i], row = t.parentElement;
      const kgI = row.querySelector(`input[data-e="${id}"][data-i="${t.dataset.i}"][data-k="kg"]`), rI = row.querySelector(`input[data-e="${id}"][data-i="${t.dataset.i}"][data-k="reps"]`);
      x.done = !x.done;
      if (x.done) {
        if (x.kg === '' && kgI.placeholder && !E[id].bw) { x.kg = kgI.placeholder.replace(',', '.'); kgI.value = kgI.placeholder; }
        if (x.reps === '' && rI.placeholder && /^\d+$/.test(rI.placeholder)) { x.reps = rI.placeholder; rI.value = x.reps; }
        if (!editId) startRest();
      }
      t.classList.toggle('on', x.done);
      document.getElementById('c-' + id).classList.toggle('done', s.ex[id].sets.every(q => q.done));
      save(); break;
    }
    case 'rir': { const d = s.ex[id], r = +t.dataset.r; d.rir = d.rir === r ? null : r; save(); rerenderCard(id); break; }
    case 'addset': { const d = s.ex[id], l = d.sets[d.sets.length - 1]; d.sets.push({ kg: l ? l.kg : '', reps: '', done: false }); save(); rerenderCard(id); break; }
    case 'rmset': s.ex[id].sets.pop(); save(); rerenderCard(id); break;
    case 'tog': s.ex[id].done = !s.ex[id].done; save(); rerenderCard(id); break;
    case 'finish': openModal(`<h2 style="margin-top:0">Kako je bilo?</h2><div class="feel">${['😫', '😕', '😐', '🙂', '💪'].map((f, i) => `<button data-a="feel" data-r="${i + 1}" class="${S.active.feel === i + 1 ? 'on' : ''}">${f}</button>`).join('')}</div>
      <label class="f">Beleška za ovaj trening (opciono)</label><textarea data-f="snote">${esc(S.active.note)}</textarea><p></p><button class="btn pri big" data-a="finish2">Sačuvaj trening</button>`); break;
    case 'feel': S.active.feel = +t.dataset.r; save(); t.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === t)); break;
    case 'finish2': S.active.end = Date.now(); S.sessions.push(S.active); S.active = null; restEnd = 0; save(); closeModal(); tab = 'prog'; render(); scrollTo(0, 0); toast('Trening sačuvan 💪'); break;
    case 'cancel': if (confirm('Obrisati započet trening i sve upisano u njemu?')) { S.active = null; restEnd = 0; save(); render(); } break;
    case 'edit': editId = t.dataset.s; tab = 'train'; render(); scrollTo(0, 0); break;
    case 'editdone': editId = null; tab = 'prog'; render(); toast('Sačuvano'); break;
    case 'del': if (confirm('Obrisati ovaj trening zauvek?')) { S.sessions = S.sessions.filter(x => x.id !== editId); editId = null; save(); tab = 'prog'; render(); } break;
    case 'bsave': {
      const d = $('#bd').value, kg = num($('#bkg').value), w = num($('#bw').value);
      if (!d || (kg == null && w == null)) { toast('Upiši kilažu ili struk'); break; }
      S.body = S.body.filter(x => x.d !== d); S.body.push({ d, kg, w }); save(); render(); toast('Sačuvano'); break;
    }
    case 'bdel': if (confirm('Obrisati merenje?')) { S.body = S.body.filter(x => x.d !== t.dataset.d); save(); render(); } break;
    case 'fsave': {
      const d = $('#fd').value, k = num($('#fk').value), p = num($('#fp').value);
      if (!d) break;
      if (k == null && p == null) delete S.food[d]; else S.food[d] = { kcal: k == null ? '' : Math.round(k), prot: p == null ? '' : Math.round(p) };
      save(); render(); toast('Sačuvano'); break;
    }
    case 'wk': repWeek = dkey(addDays(fromKey(repWeek), +t.dataset.n)); render(); break;
    case 'copy': copyText(report(repWeek)); break;
    case 'share': {
      const txt = report(repWeek);
      if (navigator.share) navigator.share({ text: txt }).catch(() => {}); else copyText(txt);
      break;
    }
    case 'settings': openModal(vSettings()); break;
    case 'setrest': S.set.rest = +t.dataset.r; save(); $('#sheet').innerHTML = vSettings(); break;
    case 'sound': S.set.sound = !S.set.sound; save(); if (S.set.sound) beep(); $('#sheet').innerHTML = vSettings(); break;
    case 'export': exportData(); break;
    case 'import': $('#imp').click(); break;
    case 'rest+': restEnd += 15000; restFired = false; $('#rest').classList.remove('end'); tick(); break;
    case 'restx': restEnd = 0; tick(); break;
  }
});
function rerenderCard(id) {
  const s = cur(), el = document.getElementById('c-' + id); if (!el) return;
  const it = itemOf(s.day, id); const w = document.createElement('div'); w.innerHTML = exCard(s, it); el.replaceWith(w.firstElementChild);
}
function copyText(t) {
  (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast('Kopirano – nalepi treneru'), () => {
    const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast('Kopirano');
  });
}
document.addEventListener('input', e => {
  const t = e.target, f = t.dataset.f; if (!f) return;
  const s = cur(), id = t.dataset.e;
  if (f === 'set') { s.ex[id].sets[+t.dataset.i][t.dataset.k] = t.value.trim(); }
  else if (f === 'note') s.ex[id].note = t.value;
  else if (f === 'cardio') {
    s.ex[id][t.dataset.k] = t.value.trim();
    const sec = parseTime(s.ex[id].time), km = num(s.ex[id].km), r = document.getElementById('cr-' + id);
    if (r) r.innerHTML = sec && km ? `<div class="sm" style="margin-top:8px">${(km / (sec / 3600)).toFixed(1).replace('.', ',')} km/h · ${km >= 5 && sec < 780 ? '<span class="chip ok">✓ cilj ispunjen</span>' : '<span class="chip">cilj: 5 km &lt; 13:00</span>'}</div>` : '';
  }
  else if (f === 'plan') { if (t.value.trim()) S.plan[id] = t.value.trim().replace(',', '.'); else delete S.plan[id]; }
  else if (f === 'snote') S.active.note = t.value;
  else if (f === 'rn') { (S.notes[repWeek] = S.notes[repWeek] || {})[t.dataset.k] = t.value; const r = $('#rep'); if (r) r.textContent = report(repWeek); }
  else return;
  save();
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.f === 'set' && t.dataset.k === 'kg' && /[x×*+\s]/i.test(t.value.trim())) {
    // "2x20+20" -> 60
    let tot = 0, ok = true;
    for (const term of t.value.trim().replace(/\s*([x×*])\s*/gi, '$1').split(/[+\s]+/)) {
      if (!term) continue;
      const f = term.split(/[x×*]/i).map(num);
      if (f.some(v => v == null)) { ok = false; break; }
      tot += f.reduce((a, b) => a * b, 1);
    }
    if (ok) { t.value = fmtN(tot); cur().ex[t.dataset.e].sets[+t.dataset.i].kg = String(tot); save(); toast('= ' + fmtN(tot) + ' kg'); }
  }
  else if (t.dataset.f === 'progex') { progEx = t.value; render(); }
  else if (t.dataset.f === 'plan' && tab === 'train' && cur()) rerenderCard(t.dataset.e);
  else if (t.dataset.f === 'fd') { const f = S.food[t.value] || {}; $('#fk').value = f.kcal || ''; $('#fp').value = f.prot || ''; }
  else if (t.id === 'bd') { const b = S.body.find(x => x.d === t.value) || {}; $('#bkg').value = b.kg != null ? fmtN(b.kg) : ''; $('#bw').value = b.w != null ? fmtN(b.w) : ''; }
});

// ---------- backup ----------
async function exportData() {
  const name = 'markfit-' + dkey(new Date()) + '.json';
  const blob = new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' });
  const file = new File([blob], name, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
$('#imp').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (!d || !Array.isArray(d.sessions)) throw 0;
    if (confirm(`Vratiti kopiju (${d.sessions.length} treninga)? Trenutni podaci na telefonu biće zamenjeni.`)) { localStorage.setItem(K, JSON.stringify(d)); load(); editId = null; closeModal(); render(); toast('Kopija vraćena'); }
  } catch (err) { toast('To nije ispravan MarkFit fajl'); }
  e.target.value = '';
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
render();
