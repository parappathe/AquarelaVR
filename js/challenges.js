// Desafios da Aquarela: só você pinga, com pouca tinta. A tinta azul já está no papel e não se mexe
// por conta própria (só escorre junto quando a sua chega). No fim o papel seca e conta-se a medida.
// O robô (bestChallengeGen) faz uma busca em feixe pelas gotas. Sem navegador.
import { N, idx, newRound, applyMove, dry, areas, isLegal, quantize, MIN_DROP, MAX_DROP, PLAYER, CPU, GRAY } from './rules.js';

// zone: { cx, cy, r } (círculo em células) — a área-alvo desenhada no papel
export const CHALLENGES = [
  {
    name: 'Primeira gota', ink: 6, metric: 'mine', stars: [40, 60, 72],
    desc: 'Papel limpo. Pinte o máximo que der com 6 de tinta.',
    paper: { wax: [] }, pre: [],
  },
  {
    name: 'A flor', ink: 8, metric: 'zone', stars: [15, 32, 48],
    desc: 'Pinte o círculo do meio sem desperdiçar tinta fora dele.',
    paper: { wax: [] }, pre: [], zone: { cx: 9.5, cy: 9.5, r: 4 },
  },
  {
    name: 'Empurrão', ink: 8, metric: 'diff', stars: [0, 20, 34],
    desc: 'Uma mancha azul no meio. Gota forte empurra, gota fraca vira lama.',
    paper: { wax: [] }, pre: [{ owner: CPU, cell: idx(10, 10), amount: 6 }],
  },
  {
    name: 'Muro de cera', ink: 8, metric: 'zone', stars: [5, 15, 24],
    desc: 'O círculo fica depois da cera, e a tinta não escorre por ela. Não desperdice do lado de cá.',
    paper: { wax: [[3, 12, 16, 12]] }, pre: [], zone: { cx: 9.5, cy: 16, r: 3 },
  },
  {
    name: 'Engolir', ink: 10, metric: 'diff', stars: [-10, 5, 22],
    desc: 'Gotinhas azuis espalhadas. Engula com gotas fortes.',
    paper: { wax: [] }, pre: [{ owner: CPU, cell: idx(5, 5), amount: 2 }, { owner: CPU, cell: idx(14, 5), amount: 2 }, { owner: CPU, cell: idx(5, 14), amount: 2 }, { owner: CPU, cell: idx(14, 14), amount: 2 }],
  },
  {
    name: 'Sem lama', ink: 8, metric: 'clean', stars: [50, 75, 95],
    desc: 'Cada célula cinza tira 2 pontos. Pinte sem brigar.',
    paper: { wax: [] }, pre: [{ owner: CPU, cell: idx(7, 9), amount: 6 }, { owner: CPU, cell: idx(13, 11), amount: 5 }],
  },
  {
    name: 'Dois rios', ink: 8, metric: 'zone', stars: [5, 12, 22],
    desc: 'Duas manchas azuis. Pinte o círculo entre elas.',
    paper: { wax: [] }, pre: [{ owner: CPU, cell: idx(4, 10), amount: 6 }, { owner: CPU, cell: idx(15, 10), amount: 6 }], zone: { cx: 9.5, cy: 10, r: 3 },
  },
  {
    name: 'Gota única', ink: 6, maxDrops: 1, metric: 'zone', stars: [10, 22, 30],
    desc: 'Uma gota só. Escolha bem o lugar entre as ilhas de cera.',
    paper: { wax: [[6, 6, 7, 7], [12, 6, 13, 7], [6, 12, 7, 13], [12, 12, 13, 13]] }, pre: [], zone: { cx: 9.5, cy: 9.5, r: 3.5 },
  },
  {
    name: 'Cerco', ink: 9, metric: 'shrink', stars: [-65, -50, -36],
    desc: 'A azul está no canto. Deixe ela o menor possível.',
    paper: { wax: [] }, pre: [{ owner: CPU, cell: idx(3, 3), amount: 6 }, { owner: CPU, cell: idx(5, 2), amount: 4 }],
  },
  {
    name: 'Obra-prima', ink: 10, metric: 'diff', stars: [-100, -80, -66],
    desc: 'Papel quase todo azul e uma fita no caminho. Perca de pouco.',
    paper: { wax: [[9, 2, 10, 8]] }, pre: [{ owner: CPU, cell: idx(5, 6), amount: 6 }, { owner: CPU, cell: idx(14, 6), amount: 6 }, { owner: CPU, cell: idx(10, 14), amount: 5 }],
  },
];

export function zoneCells(c) {
  const z = c.zone;
  const out = new Uint8Array(N * N);
  if (!z) return out;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (Math.hypot(x - z.cx, y - z.cy) <= z.r) out[idx(x, y)] = 1;
  return out;
}

export function setupChallenge(c) {
  const st = newRound({ paper: { name: c.name, ...c.paper }, starter: PLAYER, ink: [c.ink, 0], pre: c.pre });
  st.maxDrops = c.maxDrops || 99;
  return st;
}

// Medida no fim (depois de secar)
export function measure(c, st) {
  const end = dry(st).st;
  const a = areas(end);
  if (c.metric === 'mine') return a[PLAYER];
  if (c.metric === 'diff') return a[PLAYER] - a[CPU];
  if (c.metric === 'clean') return a[PLAYER] - 2 * a[GRAY];
  if (c.metric === 'shrink') return -a[CPU];
  if (c.metric === 'zone') {
    const z = zoneCells(c);
    let n = 0;
    for (let i = 0; i < N * N; i++) if (z[i] && end.own[i] === PLAYER) n++;
    return n;
  }
  return 0;
}
export function starsFor(c, v) { let n = 0; for (const t of c.stars) if (v >= t) n++; return n; }
export const metricName = (c) => ({ mine: 'área sua', diff: 'saldo (sua área menos a azul)', clean: 'área sua menos 2 por cinza', shrink: 'menos a área azul', zone: 'células suas dentro do círculo' })[c.metric];
export const goalText = (c) => `Estrelas por ${metricName(c)}: ${c.stars.map((t, i) => `${'★'.repeat(i + 1)} ${t}`).join('   ')}`;

export function canDrop(st) { return !st.over && st.ink[PLAYER] >= MIN_DROP && (st.drops.length < (st.maxDrops ?? 99)); }
export function challengeMove(st, m) {
  const r = applyMove(st, m);
  const s = r.st;
  s.maxDrops = st.maxDrops;
  if (s.drops.length >= (s.maxDrops ?? 99)) s.over = true;
  return { ...r, st: s };
}

export function gradeMoves(c, moves) {
  let st = setupChallenge(c);
  for (const m of moves) st = challengeMove(st, m).st;
  const v = measure(c, st);
  return { value: v, stars: starsFor(c, v), st };
}

function amountOptions(ink, last) {
  const out = new Set();
  for (const a of [2, 3, 4, 5, 6]) {
    let v = Math.min(a, ink);
    if (ink - v > 0 && ink - v < MIN_DROP) continue;
    if (v >= MIN_DROP) out.add(quantize(v));
  }
  if (last && ink <= MAX_DROP) { out.clear(); out.add(quantize(ink)); }
  else if (ink <= MAX_DROP) out.add(quantize(ink));
  return [...out];
}

// Busca em feixe: em cada passo tenta gotas numa grade de 2 em 2 células e guarda as melhores.
export function* bestChallengeGen(c, beam = 4) {
  const inkWorth = c.metric === 'zone' ? 4 : 9;   // quanto vale, mais ou menos, cada unidade de tinta que sobrou
  let layer = [{ st: setupChallenge(c), moves: [], v: -Infinity }];
  let best = { value: -Infinity, moves: [] };
  let n = 0;
  for (let depth = 0; depth < 14 && layer.length; depth++) {
    const next = [];
    for (const node of layer) {
      if (!canDrop(node.st)) continue;
      const last = node.st.drops.length + 1 >= (node.st.maxDrops ?? 99);
      for (const amount of amountOptions(node.st.ink[PLAYER], last)) {
        for (let y = 0; y < N; y += 2) for (let x = 0; x < N; x += 2) {
          for (const [ox, oy] of [[(y / 2) % 2, 0]]) {
            const cell = idx(x + ox, y + oy);
            const m = { cell, amount };
            if (!isLegal(node.st, m)) continue;
            const s2 = challengeMove(node.st, m).st;
            const v = measure(c, s2);
            next.push({ st: s2, moves: [...node.moves, m], v, h: v + (canDrop(s2) ? inkWorth * s2.ink[PLAYER] : 0) });
            if (++n % 30 === 0) yield;
          }
        }
      }
    }
    next.sort((a, b) => b.h - a.h);
    // feixe com variedade: no máximo um por casa inicial parecida
    layer = [];
    const seen = new Set();
    for (const nd of next) {
      const key = nd.moves.map(m => `${Math.floor((m.cell % N) / 3)},${Math.floor(m.cell / N / 3)},${m.amount}`).join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      layer.push(nd);
      if (layer.length >= beam) break;
    }
    for (const nd of layer) if (nd.v > best.value && !canDrop(nd.st)) best = { value: nd.v, moves: nd.moves };
  }
  // ajuste fino: mexe cada gota uma célula para os lados enquanto melhorar
  let moves = best.moves.slice(), value = best.value, improved = true;
  while (improved && moves.length) {
    improved = false;
    for (let k = 0; k < moves.length; k++) {
      const m = moves[k], x = m.cell % N, y = (m.cell - x) / N;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
        const trial = moves.slice(); trial[k] = { cell: idx(nx, ny), amount: m.amount };
        const g = tryPlan(c, trial);
        if (g != null && g > value) { value = g; moves = trial; improved = true; }
        if (++n % 30 === 0) yield;
      }
    }
  }
  return { value, stars: starsFor(c, value), moves };
}
function tryPlan(c, moves) {
  let st = setupChallenge(c);
  for (const m of moves) { if (!isLegal(st, m)) return null; st = challengeMove(st, m).st; }
  return canDrop(st) ? null : measure(c, st);
}

export function solveChallenge(c, beam) {
  const g = bestChallengeGen(c, beam);
  let x;
  do x = g.next(); while (!x.done);
  return x.value;
}
