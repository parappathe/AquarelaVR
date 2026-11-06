// Regras da Aquarela: papel molhado em grade fina, gotas de tinta que escorrem por alguns passos.
// Simulação determinística por células (sem física), para a prévia e a IA darem exatamente o que se vê.
// Sem navegador: roda no Node nos testes.

export const N = 20;                     // papel de 20 x 20 células
export const PLAYER = 0, CPU = 1, GRAY = 2, EMPTY = -1;
export const INK = 12;                   // tinta de cada um por rodada
export const MIN_DROP = 1, MAX_DROP = 6; // força da gota (unidades de tinta)
export const STEPS = 8;                  // passos de escorrer depois de cada gota
export const DRY_STEPS = 16;             // passos finais, secando, no fim da rodada
export const FLOW_MIN = 0.1;             // abaixo disto a tinta não escorre mais
export const RATE = 0.5;                 // fração do excesso que escorre por passo
export const MIX = 2;                    // uma cor só avança se tiver o dobro da outra; senão vira cinza
export const ROUNDS = 2;
export const idx = (x, y) => y * N + x;

// Papéis das rodadas: onde há cera (a tinta não entra). Notação: retângulos [x0, y0, x1, y1] inclusive.
export const PAPERS = [
  { name: 'Folha lisa', wax: [] },
  { name: 'Fita no meio', wax: [[9, 3, 10, 16]] },
  { name: 'Quatro ilhas', wax: [[4, 4, 5, 5], [14, 4, 15, 5], [4, 14, 5, 15], [14, 14, 15, 15]] },
  { name: 'Moldura', wax: [[6, 6, 13, 6], [6, 13, 13, 13]] },
  { name: 'Diagonal', wax: [[3, 3, 4, 4], [6, 6, 7, 7], [9, 9, 10, 10], [12, 12, 13, 13], [15, 15, 16, 16]] },
];

export function waxMask(paper) {
  const w = new Uint8Array(N * N);
  for (const [x0, y0, x1, y1] of paper.wax || []) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) w[idx(x, y)] = 1;
  for (const c of paper.waxCells || []) w[c] = 1;
  return w;
}

export function newRound({ paper = 0, starter = PLAYER, ink = INK, pre = [] } = {}) {
  const P = typeof paper === 'number' ? PAPERS[paper] : paper;
  const st = {
    paper: P, wax: waxMask(P),
    own: new Int8Array(N * N).fill(EMPTY), conc: new Float32Array(N * N),
    ink: Array.isArray(ink) ? ink.slice() : [ink, ink],
    turn: starter, starter, moves: 0, over: false, drops: [],
  };
  // tinta que já está no papel (desafios): pinga e escorre antes de começar
  let s = st;
  for (const d of pre) s = dropInk(s, d.owner, d.cell, d.amount, d.steps ?? STEPS).st;
  s.drops = [];
  return s;
}

export function cloneSt(st) {
  return { ...st, own: st.own.slice(), conc: st.conc.slice(), ink: st.ink.slice(), drops: st.drops.slice() };
}

// Resolve o que chega numa célula: tinta dela + o que entrou de cada cor.
function resolveCell(own, conc, i, in0, in1) {
  const o = own[i];
  if (o === GRAY) return;               // cinza é lama: absorve e não muda
  const t0 = in0 + (o === PLAYER ? conc[i] : 0);
  const t1 = in1 + (o === CPU ? conc[i] : 0);
  if (t0 > 0 && t1 > 0) {
    const hi = Math.max(t0, t1), lo = Math.min(t0, t1);
    if (hi >= MIX * lo) { own[i] = t0 > t1 ? PLAYER : CPU; conc[i] = hi - lo; }
    else { own[i] = GRAY; conc[i] = 0; }
  } else if (t0 > 0) { own[i] = PLAYER; conc[i] = t0; }
  else if (t1 > 0) { own[i] = CPU; conc[i] = t1; }
}

const NB = [[1, 0], [-1, 0], [0, 1], [0, -1]];
// Um passo de escorrer (todas as células ao mesmo tempo). Muda st.own/st.conc no lugar.
// Devolve true se alguma tinta mexeu.
const _in0 = new Float32Array(N * N), _in1 = new Float32Array(N * N);
export function spreadStep(st) {
  const { own, conc, wax } = st;
  _in0.fill(0); _in1.fill(0);
  let moved = false;
  for (let i = 0; i < N * N; i++) {
    const o = own[i];
    if (o !== PLAYER && o !== CPU) continue;
    const c = conc[i];
    if (c <= FLOW_MIN) continue;
    const x = i % N, y = (i - x) / N;
    let k = 0;
    for (const [dx, dy] of NB) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < N && ny < N && !wax[ny * N + nx]) k++; }
    if (!k) continue;
    const out = (c - FLOW_MIN) * RATE;
    if (out < 1e-4) continue;
    moved = true;
    conc[i] = c - out;
    const share = out / k;
    const dst = o === PLAYER ? _in0 : _in1;
    for (const [dx, dy] of NB) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < N && ny < N && !wax[ny * N + nx]) dst[ny * N + nx] += share; }
  }
  if (!moved) return false;
  for (let i = 0; i < N * N; i++) if (_in0[i] || _in1[i]) resolveCell(own, conc, i, _in0[i], _in1[i]);
  return true;
}

// Forma da gota: 40% no centro e 15% em cada vizinha (sem cera).
export function dropCells(st, cell) {
  const x = cell % N, y = (cell - x) / N;
  const out = [[cell, 0.4]];
  for (const [dx, dy] of NB) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < N && ny < N && !st.wax[ny * N + nx]) out.push([ny * N + nx, 0.15]); }
  const sum = out.reduce((s, [, w]) => s + w, 0);
  return out.map(([c, w]) => [c, w / sum]);
}

export const quantize = (a) => Math.round(a * 2) / 2;
export function isLegal(st, m) {
  if (st.over || !m) return false;
  if (m.cell < 0 || m.cell >= N * N || st.wax[m.cell]) return false;
  const a = quantize(m.amount);
  return a >= MIN_DROP && a <= MAX_DROP && a <= st.ink[st.turn] + 1e-9;
}

// Pinga sem mexer na vez (usado pelos desafios e pela jogada). frames: estados depois de cada passo.
export function dropInk(st, owner, cell, amount, steps = STEPS, keepFrames = false) {
  const s = cloneSt(st);
  const frames = [];
  const in0 = new Float32Array(N * N), in1 = new Float32Array(N * N);
  for (const [c, w] of dropCells(s, cell)) (owner === PLAYER ? in0 : in1)[c] += amount * w;
  for (let i = 0; i < N * N; i++) if (in0[i] || in1[i]) resolveCell(s.own, s.conc, i, in0[i], in1[i]);
  if (keepFrames) frames.push({ own: s.own.slice(), conc: s.conc.slice() });
  for (let k = 0; k < steps; k++) {
    const moved = spreadStep(s);
    if (keepFrames) frames.push({ own: s.own.slice(), conc: s.conc.slice() });
    if (!moved) break;
  }
  return { st: s, frames };
}

// Jogada: { cell, amount }. Quem está na vez gasta a tinta; acabou a dos dois, a rodada termina.
export function applyMove(st, m, keepFrames = false) {
  if (!isLegal(st, m)) throw new Error(`jogada inválida ${JSON.stringify(m)}`);
  const who = st.turn;
  const amount = quantize(m.amount);
  const r = dropInk(st, who, m.cell, amount, STEPS, keepFrames);
  const s = r.st;
  s.ink[who] = Math.round((s.ink[who] - amount) * 2) / 2;
  s.moves++;
  s.drops.push({ owner: who, cell: m.cell, amount });
  const can = (p) => s.ink[p] >= MIN_DROP - 1e-9;
  if (can(1 - who)) s.turn = 1 - who;
  else if (!can(who)) s.over = true;
  return { st: s, frames: r.frames, amount };
}

// Fim da rodada: o papel seca (mais alguns passos) e conta-se a área.
export function dry(st, keepFrames = false, steps = DRY_STEPS) {
  const s = cloneSt(st);
  const frames = [];
  for (let k = 0; k < steps; k++) {
    const moved = spreadStep(s);
    if (keepFrames) frames.push({ own: s.own.slice(), conc: s.conc.slice() });
    if (!moved) break;
  }
  return { st: s, frames };
}

export function areas(st) {
  const a = [0, 0, 0];
  for (let i = 0; i < N * N; i++) { const o = st.own[i]; if (o >= 0) a[o]++; }
  return a;    // [suas, dele, cinza]
}
export const finalScore = (st) => areas(dry(st).st);

// Prévia: como fica logo depois da gota e no fim (se ninguém mais pingasse)
export function preview(st, m) {
  if (!isLegal(st, m)) return null;
  const now = applyMove(st, m).st;
  const end = dry(now).st;
  return { now, end, areasNow: areas(now), areasEnd: areas(end), before: areas(dry(st).st) };
}

export class Match {
  constructor({ starter = PLAYER, papers = [0, 1] } = {}) {
    this.papers = papers;
    this.firstStarter = starter;
    this.index = 0;
    this.results = [];
    this.round = newRound({ paper: papers[0], starter });
    this.roundOver = false;
  }
  play(m, keepFrames = false) { const r = applyMove(this.round, m, keepFrames); this.round = r.st; return r; }
  closeRound(keepFrames = false) {
    const d = dry(this.round, keepFrames);
    this.round = d.st;
    const a = areas(d.st);
    this.results.push({ score: [a[0], a[1]], gray: a[2], paper: this.round.paper.name });
    this.roundOver = true;
    return d;
  }
  nextRound() {
    this.index++;
    this.round = newRound({ paper: this.papers[this.index], starter: this.index % 2 ? 1 - this.firstStarter : this.firstStarter });
    this.roundOver = false;
  }
  get over() { return this.results.length >= ROUNDS; }
  total(who) { return this.results.reduce((s, r) => s + r.score[who], 0); }
  get winner() { const a = this.total(0), b = this.total(1); return a > b ? PLAYER : b > a ? CPU : -1; }
}
