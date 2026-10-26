/* Finds the 10 x 5 checkbox grid of the survey in a camera frame, any rotation/tilt.
   Input: RGBA pixel data (d), width W, height H. Output: {cen, inks, bs} or null.
   cen[row][col] = box centers (row 0 = Q1, col 0 = "5"), inks[row][col] = ink inside each box. */
const medianOf = a => [...a].sort((x, y) => x - y)[a.length >> 1];
function gCluster(vals, gap) {
  const s = [...vals].sort((a, b) => a - b), out = []; let cur = [s[0]];
  for (let i = 1; i < s.length; i++) { if (s[i] - s[i - 1] > gap) { out.push(cur); cur = []; } cur.push(s[i]); }
  out.push(cur);
  return out.map(a => ({ m: a.reduce((x, y) => x + y, 0) / a.length, n: a.length }));
}
function gKeep(cl) { const mx = Math.max(...cl.map(c => c.n)); return cl.filter(c => c.n >= Math.max(2, 0.5 * mx)); }
function gEven(cl) {
  if (cl.length < 2) return false;
  const dd = cl.slice(1).map((c, i) => c.m - cl[i].m), md = medianOf(dd);
  return dd.every(x => Math.abs(x - md) < 0.3 * md);
}
function findGridData(d, W, H, thr = 25) {
  const N = W * H, g = new Float32Array(N);
  for (let i = 0; i < N; i++) g[i] = d[4 * i] * .3 + d[4 * i + 1] * .59 + d[4 * i + 2] * .11;
  // ink = pixels clearly darker than their local surroundings (works in any lighting)
  const S = W + 1, I = new Float64Array(S * (H + 1));
  for (let y = 0; y < H; y++) { let r = 0; for (let x = 0; x < W; x++) { r += g[y * W + x]; I[(y + 1) * S + x + 1] = I[y * S + x + 1] + r; } }
  const R = 16, ink = new Uint8Array(N);
  for (let y = 0; y < H; y++) {
    const y0 = Math.max(0, y - R), y1 = Math.min(H, y + R + 1);
    for (let x = 0; x < W; x++) {
      const x0 = Math.max(0, x - R), x1 = Math.min(W, x + R + 1);
      const m = (I[y1 * S + x1] - I[y0 * S + x1] - I[y1 * S + x0] + I[y0 * S + x0]) / ((x1 - x0) * (y1 - y0));
      if (g[y * W + x] < m - thr) ink[y * W + x] = 1;
    }
  }
  // connected blobs -> keep the small square-ish outlines (candidate checkboxes)
  const lab = new Uint8Array(N), stack = new Int32Array(N), raw = [];
  for (let i = 0; i < N; i++) {
    if (!ink[i] || lab[i]) continue;
    let sp = 0, n = 0, x0 = W, y0 = H, x1 = -1, y1 = -1;
    stack[sp++] = i; lab[i] = 1;
    while (sp) {
      const p = stack[--sp], x = p % W, y = (p / W) | 0; n++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const q = ny * W + nx; if (ink[q] && !lab[q]) { lab[q] = 1; stack[sp++] = q; }
      }
    }
    const w = x1 - x0 + 1, h = y1 - y0 + 1, f = n / (w * h);
    if (w >= 8 && h >= 8 && w <= 90 && h <= 90 && w / h > .75 && w / h < 1.33 && f > .08 && f < .7)
      raw.push({ x: (x0 + x1) / 2, y: (y0 + y1) / 2, s: (w + h) / 2 });
  }
  if (raw.length < 25) return null;
  // letters and checkboxes have similar shapes, so try each blob size until a 10 x 5 lattice fits
  for (let sz = 9; sz <= 70; sz++) {
    const bx = raw.filter(b => Math.abs(b.s - sz) <= .12 * sz);
    if (bx.length < 25) continue;
    const gr = fitLattice(bx, bx.reduce((t, b) => t + b.s, 0) / bx.length, ink, W, H);
    if (gr) return gr;
  }
  // not flat / seen at an angle: grow the grid box by box instead
  for (let sz = 9; sz <= 70; sz = Math.ceil(sz * 1.12)) {
    const bx = raw.filter(b => Math.abs(b.s - sz) <= .25 * sz);
    if (bx.length < 34) continue;
    const gr = growGrid(bx, bx.reduce((t, b) => t + b.s, 0) / bx.length, ink, W, H);
    if (gr) return gr;
  }
  return null;
}
function fitLattice(bx, bs, ink, W, H) {
  // tilt angle from nearest-neighbour directions
  let sc = 0, ss = 0;
  bx.forEach(a => {
    bx.map(b => ({ b, d: Math.hypot(b.x - a.x, b.y - a.y) })).filter(o => o.d > 0).sort((p, q) => p.d - q.d).slice(0, 2)
      .forEach(o => { const t = Math.atan2(o.b.y - a.y, o.b.x - a.x); sc += Math.cos(4 * t); ss += Math.sin(4 * t); });
  });
  if (Math.hypot(sc, ss) / (bx.length * 2) < .6) return null;
  const th = Math.atan2(ss, sc) / 4, c = Math.cos(th), s = Math.sin(th);
  bx.forEach(b => { b.u = b.x * c + b.y * s; b.v = -b.x * s + b.y * c; });
  // lattice: 5 equally spaced columns x 10 equally spaced rows (either way round)
  const cu = gKeep(gCluster(bx.map(b => b.u), .8 * bs)), cv = gKeep(gCluster(bx.map(b => b.v), .8 * bs));
  let colIsU;
  if (cu.length === 5 && cv.length === 10) colIsU = true;
  else if (cu.length === 10 && cv.length === 5) colIsU = false;
  else return null;
  const cols = colIsU ? cu : cv, rows = colIsU ? cv : cu;
  if (!gEven(cols) || !gEven(rows)) return null;
  const ec = colIsU ? [c, s] : [-s, c], er = colIsU ? [-s, c] : [c, s];
  const cmin = cols[0].m, cmax = cols[4].m, pc = (cmax - cmin) / 4, rmin = rows[0].m, rmax = rows[9].m, pr = (rmax - rmin) / 9;
  // grid in ascending order first; which way is "up" and "left" is decided afterwards
  const cen0 = rows.map(rw => cols.map(cl => {
    const u = colIsU ? cl.m : rw.m, v = colIsU ? rw.m : cl.m;
    return { x: u * c - v * s, y: u * s + v * c };
  }));
  // snap each predicted center to the real detected box next to it (fixes camera perspective)
  cen0.forEach(row => row.forEach(p => {
    let bd = .6 * bs, q = null;
    bx.forEach(b => { const dd = Math.hypot(b.x - p.x, b.y - p.y); if (dd < bd) { bd = dd; q = b; } });
    if (q) { p.x = q.x; p.y = q.y; }
  }));
  const cen = orientGrid(cen0, ink, W, H, bs);
  if (!cen) return null;
  return { cen, inks: inkGrid(cen, bs, ink, W, H), bs };
}

function inkGrid(cen, bs, ink, W, H) {   // ink inside each box (inner area, so the printed outline is ignored)
  const h = Math.max(2, Math.round(.28 * bs));
  return cen.map(row => row.map(p => {
    let n = 0, t = 0;
    for (let y = Math.round(p.y) - h; y <= Math.round(p.y) + h; y++)
      for (let x = Math.round(p.x) - h; x <= Math.round(p.x) + h; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        t++; n += ink[y * W + x];
      }
    return t ? n / t : 0;
  }));
}

/* Tolerant finder for sheets that are curled, bent or seen at an angle (not flat).
   It grows the grid box by box: each box predicts where its neighbours should be using
   the spacing it measured locally, so the rows and columns may bend and shrink. */
function growGrid(bx, bs, ink, W, H) {
  const n = bx.length;
  const nn = bx.map(a => Math.min(...bx.filter(b => b !== a).map(b => Math.hypot(b.x - a.x, b.y - a.y))));
  const pitch = medianOf(nn);
  const cx = bx.reduce((t, b) => t + b.x, 0) / n, cy = bx.reduce((t, b) => t + b.y, 0) / n;
  const seeds = bx.map(b => ({ b, k: bx.filter(o => o !== b && Math.hypot(o.x - b.x, o.y - b.y) < 2.2 * pitch).length }))
    .filter(o => o.k >= 4).sort((p, q) => Math.hypot(p.b.x - cx, p.b.y - cy) - Math.hypot(q.b.x - cx, q.b.y - cy)).slice(0, 8);
  for (const sd of seeds) {
    const r = growFrom(sd.b, bx, bs, ink, W, H);
    if (r) return r;
  }
  return null;
}
function growFrom(s0, bx, bs, ink, W, H) {
  const nb = bx.filter(o => o !== s0).map(o => ({ o, d: Math.hypot(o.x - s0.x, o.y - s0.y) })).sort((p, q) => p.d - q.d);
  if (!nb.length) return null;
  const v1 = [nb[0].o.x - s0.x, nb[0].o.y - s0.y], d1 = nb[0].d;
  const sec = nb.find(e => e.d < 2.4 * d1 && Math.abs(((e.o.x - s0.x) * v1[0] + (e.o.y - s0.y) * v1[1]) / (e.d * d1)) < .45);
  if (!sec) return null;
  const v2 = [sec.o.x - s0.x, sec.o.y - s0.y];
  const cell = new Map(), used = new Set([s0]), key = (i, j) => i + ',' + j;
  cell.set(key(0, 0), { i: 0, j: 0, b: s0, x: s0.x, y: s0.y, a: v1, c: v2 });
  const queue = [key(0, 0)];
  const ok = (m, ref) => { const L = Math.hypot(m[0], m[1]), R = Math.hypot(ref[0], ref[1]); return L > .7 * R && L < 1.4 * R; };
  while (queue.length && cell.size < 90) {
    const cur = cell.get(queue.shift());
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = cur.i + di, nj = cur.j + dj;
      if (Math.abs(ni) > 12 || Math.abs(nj) > 12 || cell.has(key(ni, nj))) continue;
      const v = di ? [di * cur.a[0], di * cur.a[1]] : [dj * cur.c[0], dj * cur.c[1]];
      const px = cur.x + v[0], py = cur.y + v[1], rad = .4 * Math.hypot(v[0], v[1]);
      let bd = rad, q = null;
      bx.forEach(b => { if (used.has(b)) return; const dd = Math.hypot(b.x - px, b.y - py); if (dd < bd) { bd = dd; q = b; } });
      if (!q) continue;
      used.add(q);
      const m = [(q.x - cur.x) * (di || dj), (q.y - cur.y) * (di || dj)];
      let a = cur.a, c = cur.c;
      if (di) { if (ok(m, a)) a = m; } else if (ok(m, c)) c = m;
      cell.set(key(ni, nj), { i: ni, j: nj, b: q, x: q.x, y: q.y, a, c });
      queue.push(key(ni, nj));
    }
  }
  const cells = [...cell.values()];
  const I = cells.map(e => e.i), J = cells.map(e => e.j);
  const i0 = Math.min(...I), i1 = Math.max(...I), j0 = Math.min(...J), j1 = Math.max(...J);
  // best 5 x 10 window (either way round): the one holding the most really-detected boxes
  let best = null;
  for (const [nA, nB] of [[5, 10], [10, 5]])
    for (let ia = i0; ia + nA - 1 <= i1; ia++) for (let jb = j0; jb + nB - 1 <= j1; jb++) {
      let cnt = 0;
      for (let i = ia; i < ia + nA; i++) for (let j = jb; j < jb + nB; j++) if (cell.has(key(i, j))) cnt++;
      if (!best || cnt > best.cnt) best = { cnt, ia, jb, nA, nB };
    }
  if (!best || best.cnt < 34) return null;
  const { ia, jb, nA, nB } = best;
  // fill boxes that were not detected (e.g. heavily ticked) from their neighbours
  const pos = new Map();
  for (let i = ia; i < ia + nA; i++) for (let j = jb; j < jb + nB; j++) { const e = cell.get(key(i, j)); if (e) pos.set(key(i, j), { x: e.x, y: e.y, a: e.a, c: e.c }); }
  for (let pass = 0; pass < 8 && pos.size < nA * nB; pass++) {
    const add = [];
    for (let i = ia; i < ia + nA; i++) for (let j = jb; j < jb + nB; j++) {
      if (pos.has(key(i, j))) continue;
      let sx = 0, sy = 0, k = 0;
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([di, dj]) => {
        const e = pos.get(key(i - di, j - dj)); if (!e) return;   // neighbour on the opposite side predicts forward
        const v = di ? [di * e.a[0], di * e.a[1]] : [dj * e.c[0], dj * e.c[1]];
        sx += e.x + v[0]; sy += e.y + v[1]; k++;
      });
      if (k) { const nbrs = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([di, dj]) => pos.get(key(i - di, j - dj))).find(Boolean); add.push([key(i, j), { x: sx / k, y: sy / k, a: nbrs.a, c: nbrs.c }]); }
    }
    if (!add.length) break;
    add.forEach(([k, v]) => pos.set(k, v));
  }
  if (pos.size < nA * nB) return null;
  // axes of increasing index (average direction)
  const get = (i, j) => pos.get(key(ia + i, jb + j));
  const dirOf = (da, db, na, nb2) => { let sx = 0, sy = 0; for (let i = 0; i < na - da; i++) for (let j = 0; j < nb2 - db; j++) { const p = get(i, j), q = get(i + da, j + db); sx += q.x - p.x; sy += q.y - p.y; } const L = Math.hypot(sx, sy) || 1; return [sx / L, sy / L]; };
  // the axis with 5 boxes = answer columns, the axis with 10 = question rows
  const colIsA = nA === 5;
  const ec = colIsA ? dirOf(1, 0, nA, nB) : dirOf(0, 1, nA, nB), er = colIsA ? dirOf(0, 1, nA, nB) : dirOf(1, 0, nA, nB);
  const at = (c, r) => colIsA ? get(c, r) : get(r, c);   // c: 0..4 along ec, r: 0..9 along er
  const cen0 = [];
  for (let r = 0; r < 10; r++) { const row = []; for (let cc = 0; cc < 5; cc++) { const p = at(cc, r); row.push({ x: p.x, y: p.y }); } cen0.push(row); }
  const cen = orientGrid(cen0, ink, W, H, bs);
  if (!cen) return null;
  return { cen, inks: inkGrid(cen, bs, ink, W, H), bs };
}

/* The same grid looks different upside down. Decide which end is Q1 and which side is "5":
   - header cue (strongest): the column titles "5 4 3 2 1" sit above Q1, nothing sits below Q10
   - text cue: the statements sit to the left of the "5" column
   Both are counted near the grid only and combined, so a dark background or a shadow on one cue cannot flip the sheet alone. */
function orientGrid(cen0, ink, W, H, bs) {
  const hw = Math.max(3, Math.round(.4 * bs));
  const box = (x, y) => { let t = 0; for (let yy = Math.round(y) - hw; yy <= Math.round(y) + hw; yy++) for (let xx = Math.round(x) - hw; xx <= Math.round(x) + hw; xx++) if (xx >= 0 && yy >= 0 && xx < W && yy < H) t += ink[yy * W + xx]; return t; };
  const unit = (p, q) => { const L = Math.hypot(q.x - p.x, q.y - p.y) || 1; return [(q.x - p.x) / L, (q.y - p.y) / L, L]; };
  let A = 0, B = 0, H0 = 0, H9 = 0;
  for (let r = 0; r < 10; r++) {            // text strips left / right of the 5 columns
    const p0 = cen0[r][0], p4 = cen0[r][4], [ux, uy, L] = unit(p0, p4), pc = L / 4;
    for (let k = 1; k <= 4; k++) { A += box(p0.x - ux * pc * (k + .3), p0.y - uy * pc * (k + .3)); B += box(p4.x + ux * pc * (k + .3), p4.y + uy * pc * (k + .3)); }
  }
  let n0 = 0, n9 = 0;                       // header band above first / last row: how many of the 5 columns have printed titles there
  for (let cc = 0; cc < 5; cc++) {
    const p0 = cen0[0][cc], p9 = cen0[9][cc], [ux, uy, L] = unit(p0, p9), pr = L / 9;
    let a0 = 0, a9 = 0;
    for (const f of [.8, 1.05, 1.3]) { a0 += box(p0.x - ux * pr * f, p0.y - uy * pr * f); a9 += box(p9.x + ux * pr * f, p9.y + uy * pr * f); }
    const need = .05 * 3 * (2 * hw + 1) * (2 * hw + 1);
    if (a0 > need) n0++; if (a9 > need) n9++;
    H0 += a0; H9 += a9;
  }
  if (A + B + H0 + H9 < 20) return null;
  const cross = Math.sign((cen0[0][4].x - cen0[0][0].x) * (cen0[9][0].y - cen0[0][0].y) - (cen0[0][4].y - cen0[0][0].y) * (cen0[9][0].x - cen0[0][0].x)) || 1;
  const S = 1.5 * bs * bs;                               // a little stray ink must not count as evidence
  const vt = (A - B) / (A + B + S);                    // > 0: text on the low-index side
  const vh = (n0 >= 3 || n9 >= 3 ? (n0 - n9) / 5 : 0) * cross;      // header on the low-row side, expressed as column direction
  const sgc = .7 * vt + 2.5 * vh >= 0 ? 1 : -1, sgr = sgc * cross;
  const rowsO = sgr > 0 ? cen0 : [...cen0].reverse();
  return rowsO.map(row => sgc > 0 ? row : [...row].reverse());
}
