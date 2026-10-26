const $ = s => document.querySelector(s);
let modalOpen = false;
const QUESTIONS = [
  "The service you received met your expectations.",
  "The staff were friendly and respectful.",
  "Your concerns were addressed quickly.",
  "The prices are fair for the quality offered.",
  "The place was clean and well organized.",
  "You were treated fairly, no matter who you are.",
  "The waiting time was reasonable.",
  "You felt valued as a customer.",
  "You trust this service to meet your needs in the future.",
  "You would recommend this service to others."
];
const SCALE = [5, 4, 3, 2, 1]; // column order on the paper
const KEY = 'pst_survey_responses';
const getRows = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };

/* ---------- build answer table ---------- */
const tbody = $('#answers tbody');
QUESTIONS.forEach((q, i) => {
  const tr = document.createElement('tr');
  tr.innerHTML = `<td>${i + 1}</td><td>${q}</td>` +
    SCALE.map(v => `<td><input type="radio" name="q${i + 1}" value="${v}"></td>`).join('');
  tbody.appendChild(tr);
});
$('#date').valueAsDate = new Date();

/* ---------- tabs ---------- */
document.querySelectorAll('.tab').forEach(b => b.onclick = () => {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t === b));
  document.querySelectorAll('.panel').forEach(p => p.hidden = p.id !== b.dataset.tab);
  if (b.dataset.tab === 'records') loadRecords();
  if (b.dataset.tab === 'results') renderResults();
});

/* ---------- scanner ---------- */
const cv = $('#cv'), ctx = cv.getContext('2d');
const pause = ms => new Promise(r => setTimeout(r, ms));

// try a few working sizes / ink sensitivities until the 10 x 5 box grid is found (no clicking needed)
let goodCombo = null;
const COMBOS = [[1100, 25], [1100, 12], [1600, 25], [800, 25], [1600, 12]];
function readPhoto(src, sw, sh) {
  const list = goodCombo ? [goodCombo, ...COMBOS.filter(c => c[0] !== goodCombo[0] || c[1] !== goodCombo[1])] : COMBOS;
  for (const [max, thr] of list) {
    work(src, sw, sh, max);
    const gr = findGrid(thr);
    if (gr) { goodCombo = [max, thr]; return { gr, max, thr, pk: readPicks(gr) }; }
  }
  return null;
}
// a box counts as ticked only if it is clearly darker than the empty boxes of the same sheet
function readPicks(gr) {
  const f = gr.inks.flat().sort((a, b) => a - b), base = f[f.length >> 1];   // typical empty box
  return gr.inks.map(r => pick(r.map(x => x - base), 0.06, 0.09));
}
function pick(v, margin, min = 0) {
  const o = v.map((x, c) => [x, c]).sort((p, q) => q[0] - p[0]);
  return o[0][0] >= min && o[0][0] - o[1][0] > margin ? o[0][1] : -1;
}

/* ---------- live camera (opens by itself) ---------- */
let stream = null, busy = false;
function stopCam() { $('#camBox').classList.remove('found'); if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; $('#vid').srcObject = null; $('#camBox').hidden = true; }
async function startCam() {
  stopCam(); $('#camMsg').textContent = '';
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    $('#camMsg').textContent = 'Camera needs https:// or localhost to open.'; return;
  }
  const size = { width: { ideal: 1920 }, height: { ideal: 1080 } };
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, ...size } });
    $('#vid').onloadedmetadata = () => { setStatus('Place the survey sheet inside the frame. When the boxes turn blue, press the round button.'); missed = 0; liveTick(); };
    $('#vid').srcObject = stream; $('#camBox').hidden = false;
  } catch (err) {
    $('#camMsg').textContent = 'Camera unavailable: ' + err.message + '. Allow camera access and reload the page.';
  }
}
$('#snap').onclick = async () => {
  const v = $('#vid'); if (!v.videoWidth || busy || modalOpen) return;
  busy = true; setStatus('Reading...');
  try {
    const reads = [];
    for (let t = 0; t < 3; t++) {   // read 3 quick frames: an answer counts only when the frames agree
      const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
      c.getContext('2d').drawImage(v, 0, 0);
      const r = readPhoto(c, c.width, c.height);
      if (r) { r.c = c; reads.push(r); }
      if (t < 2) await pause(150);
    }
    let best = null;
    if (reads.length) {
      best = reads[reads.length - 1];
      const need = Math.min(2, reads.length);
      best.pk = best.pk.map((_, i) => {   // per question: the value at least 2 frames agree on, else unclear
        const cnt = {}; reads.forEach(r => cnt[r.pk[i]] = (cnt[r.pk[i]] || 0) + 1);
        const hit = Object.keys(cnt).find(k => +k >= 0 && cnt[k] >= need);
        return hit === undefined ? -1 : +hit;
      });
    }
    $('#tools').hidden = false;
    if (!best) {
      showAuto(null);
      return setStatus('Could not find the survey boxes. Make sure all 10 rows and 5 columns are in view, then press the button again.', 'err');
    }
    work(best.c, best.c.width, best.c.height, best.max);   // redraw the frame the answers came from
    showAuto(best.gr, best.pk); finish(best.pk);
    $('#tools').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } finally { busy = false; }
};
window.addEventListener('beforeunload', stopCam);

/* ---------- live preview: shows the boxes the page finds, before you press the button ---------- */
const ov = $('#ov'), octx = ov.getContext('2d');
let missed = 0;
function liveStatus(t, cls) { const e = $('#liveStatus'); e.textContent = t; e.className = 'msg ' + (cls || ''); }
function liveTick() {
  const v = $('#vid');
  if (!stream) return;
  if (!busy && !modalOpen && v.videoWidth) {
    let r = null;
    for (const thr of [25, 12]) {
      work(v, v.videoWidth, v.videoHeight, 800);
      const gr = findGrid(thr);
      if (gr) { r = { gr, pk: readPicks(gr) }; break; }
    }
    ov.width = WK.width; ov.height = WK.height; octx.clearRect(0, 0, ov.width, ov.height);
    if (r) {
      missed = 0;
      r.gr.cen.forEach((row, i) => row.forEach((p, j) => {
        octx.beginPath(); octx.arc(p.x, p.y, r.gr.bs * 0.6, 0, 7); octx.lineWidth = 3;
        octx.strokeStyle = r.pk[i] === j ? '#1fbf5a' : 'rgba(40,110,230,.8)'; octx.stroke();
      }));
      const ok = r.pk.filter(c => c >= 0).length;
      $('#camBox').classList.add('found'); $('#snap').classList.add('ready');
      if (ok === 10) liveStatus('\u2713 Sheet found, all 10 answers read. Press the round button.', 'ok');
      else liveStatus('Boxes found, but ' + (10 - ok) + ' answer(s) unclear. Hold it still for a moment.', '');
    } else if (++missed >= 2) {   // two misses in a row before the green state is dropped
      $('#camBox').classList.remove('found'); $('#snap').classList.remove('ready');
      liveStatus('Move the sheet so all 10 rows and 5 columns are inside the frame. It does not need to be flat.', 'err');
    }
  }
  setTimeout(liveTick, 120);
}

/* ---------- save / records ---------- */
function showMsg(t, good) { const m = $('#msg'); m.textContent = t; m.className = 'msg ' + (good ? 'ok' : 'err'); }
const getAnswers = () => QUESTIONS.map((_, i) => {
  const c = document.querySelector(`input[name=q${i + 1}]:checked`); return c ? +c.value : null;
});

$('#save').onclick = async () => {
  const answers = getAnswers();
  if (answers.includes(null)) {
    answers.forEach((v, i) => tbody.children[i].classList.toggle('check', v === null));
    return showMissing(answers.map((v, i) => v === null ? i + 1 : 0).filter(Boolean));
  }
  try {
    const row = { id: Date.now(), name: $('#name').value.trim().slice(0, 100), survey_date: $('#date').value };
    answers.forEach((v, i) => row['q' + (i + 1)] = v);
    const all = getRows(); all.push(row);
    localStorage.setItem(KEY, JSON.stringify(all));
    setStatus('Saved #' + all.length + ' \u2713', 'ok'); $('#ansCard').hidden = true; renderResults();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    document.querySelectorAll('#answers input').forEach(x => x.checked = false);
    document.querySelectorAll('#answers tr').forEach(r => r.classList.remove('check'));
    $('#name').value = '';
  } catch (err) { showMsg(err.message, false); }
};

async function loadRecords() {
  const rows = getRows().reverse();
  $('#count').textContent = rows.length + ' response(s)';
  const avg = k => rows.length ? (rows.reduce((s, r) => s + +r[k], 0) / rows.length).toFixed(2) : '-';
  const qs = QUESTIONS.map((_, i) => 'q' + (i + 1));
  let h = '<tr><th>ID</th><th>Name</th><th>Date</th>' + qs.map((q, i) => `<th>Q${i + 1}</th>`).join('') + '<th>Avg</th><th></th></tr>';
  h += rows.map(r => {
    const a = (qs.reduce((s, k) => s + +r[k], 0) / 10).toFixed(2);
    return `<tr><td>${r.id}</td><td>${esc(r.name) || '-'}</td><td>${r.survey_date || ''}</td>` +
      qs.map(k => `<td class="ed" data-id="${r.id}" data-k="${k}" title="Tap to edit">${r[k]}</td>`).join('') + `<td><b>${a}</b></td><td><button class="del" onclick="del(${r.id})">Delete</button></td></tr>`;
  }).join('');
  if (rows.length) h += '<tr><th colspan="3">Average per question</th>' + qs.map(k => `<th>${avg(k)}</th>`).join('') +
    `<th>${(qs.reduce((s, k) => s + +avg(k), 0) / 10).toFixed(2)}</th><th></th></tr>`;
  $('#list').innerHTML = h;
}
const esc = s => (s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
async function del(id) {
  if (!confirm('Delete this response?')) return;
  localStorage.setItem(KEY, JSON.stringify(getRows().filter(r => r.id !== id)));
  loadRecords();
}
$('#refresh').onclick = loadRecords;

/* tap a number in Records to change it (1-5) */
$('#list').addEventListener('click', e => {
  const td = e.target.closest('td.ed');
  if (!td || td.querySelector('select')) return;
  const old = td.textContent;
  const sel = document.createElement('select');
  sel.className = 'edsel';
  SCALE.slice().sort((a, b) => b - a).forEach(v => sel.add(new Option(v, v, false, String(v) === old)));
  td.textContent = ''; td.appendChild(sel); sel.focus();
  let done = false;
  sel.onchange = () => {
    done = true;
    const all = getRows(), r = all.find(x => String(x.id) === td.dataset.id);
    if (r) { r[td.dataset.k] = +sel.value; localStorage.setItem(KEY, JSON.stringify(all)); }
    loadRecords(); renderResults();
  };
  sel.onblur = () => { if (!done) td.textContent = old; };
});

$('#csv').onclick = () => {
  const rows = getRows();
  const head = ['ID', 'Name', 'Date', ...QUESTIONS.map((_, i) => 'Q' + (i + 1)), 'Average'];
  const cell = v => '"' + String(/^[=+\-@]/.test(v) ? "'" + v : v).replace(/"/g, '""') + '"';
  const lines = rows.map((r, n) => {
    const q = QUESTIONS.map((_, i) => +r['q' + (i + 1)]);
    return [n + 1, r.name || '', r.survey_date || '', ...q, (q.reduce((a, b) => a + b, 0) / 10).toFixed(2)].map(cell).join(',');
  });
  const blob = new Blob(['\ufeff' + [head.map(cell).join(','), ...lines].join('\r\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'survey_responses.csv'; a.click();
};

/* ---------- results: count of votes 1-5 ---------- */
const LBL = { 5: 'Strongly Agree', 4: 'Agree', 3: 'Neutral', 2: 'Disagree', 1: 'Strongly Disagree' };
function renderResults() {
  const rows = getRows(), n = rows.length;
  $('#rcount').textContent = n + ' survey(s) recorded';
  const cell = (c, base) => {
    const p = base ? c * 100 / base : 0;
    return `<td style="background:linear-gradient(90deg,#bfe3d3 ${p}%,transparent ${p}%)"><b>${c}</b><br><small>${p.toFixed(0)}%</small></td>`;
  };
  let h = '<tr><th>#</th><th>Statement</th>' + SCALE.map(v => `<th>${v}<br><small>${LBL[v]}</small></th>`).join('') + '<th>Mean</th></tr>';
  const tot = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  QUESTIONS.forEach((qs, i) => {
    const c = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    rows.forEach(r => { const v = +r['q' + (i + 1)]; if (c[v] !== undefined) c[v]++; });
    SCALE.forEach(v => tot[v] += c[v]);
    const mean = n ? SCALE.reduce((s, v) => s + v * c[v], 0) / n : 0;
    h += `<tr><td>${i + 1}</td><td>${qs}</td>` + SCALE.map(v => cell(c[v], n)).join('') + `<td><b>${mean.toFixed(2)}</b></td></tr>`;
  });
  const all = n * 10, mean = all ? SCALE.reduce((s, v) => s + v * tot[v], 0) / all : 0;
  h += '<tr><th colspan="2">TOTAL (all statements)</th>' + SCALE.map(v => cell(tot[v], all).replace('<td', '<th').replace('</td>', '</th>')).join('') + `<th>${mean.toFixed(2)}</th></tr>`;
  $('#res').innerHTML = h;
}

function setStatus(t, cls) { const e = $('#autoStatus'); e.textContent = t; e.className = 'msg ' + (cls || ''); }
function beep() {
  try {
    const a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator();
    o.connect(a.destination); o.frequency.value = 880; o.start();
    setTimeout(() => { o.stop(); a.close(); }, 150);
  } catch { }
}
function store(answers) {
  const row = { id: Date.now(), name: '', survey_date: $('#date').value };
  answers.forEach((v, i) => row['q' + (i + 1)] = v);
  const all = getRows(); all.push(row);
  localStorage.setItem(KEY, JSON.stringify(all));
  return all.length;
}
renderResults();
$('#manualBtn').onclick = () => { const c = $('#ansCard'); c.hidden = !c.hidden; };

/* ---------- missing-answers window ---------- */
function fillForm(found) {
  found.forEach((v, i) => {
    const row = tbody.children[i];
    row.querySelectorAll('input').forEach(x => x.checked = +x.value === v);
    row.classList.toggle('check', v === null);
  });
}
function showMissing(list) {
  const many = list.length > 1;
  $('#modalText').innerHTML = `${many ? 'Questions' : 'Question'} <b>${list.map(n => 'Q' + n).join(', ')}</b> ${many ? 'have' : 'has'} no clear answer.<br>All 10 questions must be answered before a survey is recorded.`;
  $('#modal').hidden = false; modalOpen = true;
}
function closeModal(fix) {
  $('#modal').hidden = true; modalOpen = false;
  if (fix) { $('#ansCard').hidden = false; $('#ansCard').scrollIntoView({ behavior: 'smooth' }); }
}
$('#modalFix').onclick = () => closeModal(true);
$('#modalClose').onclick = () => closeModal(false);

/* ---------- grid finder helpers ---------- */
const WK = document.createElement('canvas'), wctx = WK.getContext('2d', { willReadFrequently: true });
function work(src, sw, sh, max = 1100) {
  const k = Math.min(1, max / Math.max(sw, sh));
  WK.width = Math.round(sw * k); WK.height = Math.round(sh * k);
  wctx.drawImage(src, 0, 0, WK.width, WK.height);
}
const findGrid = thr => findGridData(wctx.getImageData(0, 0, WK.width, WK.height).data, WK.width, WK.height, thr);
function showAuto(grid, picks) {   // live preview: blue = boxes found, green = answer read
  cv.width = WK.width; cv.height = WK.height; ctx.drawImage(WK, 0, 0);
  if (!grid) return;
  grid.cen.forEach((row, i) => row.forEach((p, j) => {
    ctx.beginPath(); ctx.arc(p.x, p.y, grid.bs * 0.6, 0, 7); ctx.lineWidth = 3;
    ctx.strokeStyle = picks && picks[i] === j ? '#1fbf5a' : 'rgba(40,110,230,.7)'; ctx.stroke();
  }));
}
function finish(picks) {   // all 10 answered -> record; otherwise the "missing" window
  const answers = picks.map(c => c < 0 ? null : SCALE[c]);
  beep();
  if (answers.every(Boolean)) {
    const n = store(answers); renderResults();
    setStatus('Saved #' + n + ' \u2713  answers: ' + answers.join(' '), 'ok');
    return true;
  }
  fillForm(answers);
  setStatus('Not saved: some questions have no clear answer.', 'err');
  showMissing(answers.map((a, i) => a ? 0 : i + 1).filter(Boolean));
  return false;
}
startCam();   // camera starts by itself when the page opens
