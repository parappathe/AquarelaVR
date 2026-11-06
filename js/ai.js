// Adversários da Aquarela. Todos simulam a tinta de verdade (rules.applyMove + dry). Sem navegador.
import { N, idx, applyMove, dry, areas, isLegal, quantize, MIN_DROP, MAX_DROP, PLAYER, CPU } from './rules.js';

export const OPPONENTS = [
  {
    id: 'cida', name: 'Dona Cida', title: 'a cuidadosa', style: 'careful',
    desc: 'Pinta o papel vazio com gotas médias e foge da briga', color: 0x9a6ab8,
    think: 1.1, noise: 3, wMine: 1, wTheirs: 0.6, inkValue: 7, depth: 1, amounts: [2, 3, 4],
  },
  {
    id: 'tito', name: 'Tito', title: 'o arriscado', style: 'risky',
    desc: 'Gotas grandes em cima da sua tinta, para engolir', color: 0xe08a2a,
    think: 0.8, noise: 6, wMine: 0.8, wTheirs: 1.3, inkValue: 3, depth: 1, amounts: [4, 5, 6],
  },
  {
    id: 'aurelio', name: 'Mestre Aurélio', title: 'pensa à frente', style: 'master',
    desc: 'Antes de pingar, olha a sua melhor resposta', color: 0x3a8a7a,
    think: 1.5, noise: 0.5, wMine: 1, wTheirs: 1, inkValue: 7, depth: 2, amounts: [2, 3, 4, 6],
  },
];
export const ROBOT = { id: 'robo', name: 'Robô', style: 'master', think: 0.3, noise: 0, wMine: 1, wTheirs: 1, inkValue: 6, depth: 2, amounts: [2, 3.5, 5, 6] };

export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// Valor para "me": área no fim (se ninguém mais pingasse) + o que a tinta que sobrou ainda pode pintar.
export function evaluate(st, me, o) {
  const a = areas(dry(st).st);
  return o.wMine * a[me] - o.wTheirs * a[1 - me] + o.inkValue * (st.ink[me] - st.ink[1 - me]);
}

// Quantias que fazem sentido: as do estilo, sem deixar sobra menor que uma gota.
export function amountsFor(st, who, list) {
  const ink = st.ink[who];
  const out = new Set();
  for (const a of list) {
    let v = Math.min(a, ink, MAX_DROP);
    if (ink - v > 0 && ink - v < MIN_DROP) v = ink - MIN_DROP >= MIN_DROP ? ink - MIN_DROP : Math.min(ink, MAX_DROP);
    v = quantize(v);
    if (v >= MIN_DROP) out.add(v);
  }
  if (ink <= MAX_DROP && ink >= MIN_DROP) out.add(quantize(ink));
  return [...out];
}
export function candidateCells(st, stepN = 3, off = 1) {
  const out = [];
  for (let y = off; y < N; y += stepN) for (let x = off; x < N; x += stepN) { const c = idx(x, y); if (!st.wax[c]) out.push(c); }
  return out;
}

export function* chooseMoveGen(st, who, o, random = Math.random) {
  if (st.over || st.turn !== who) return null;
  const amts = amountsFor(st, who, o.amounts);
  if (!amts.length) return null;
  const scored = [];
  let n = 0;
  const tryMove = (m) => {
    if (!isLegal(st, m)) return null;
    const s2 = applyMove(st, m).st;
    const c = { m, v: evaluate(s2, who, o), s2 };
    scored.push(c);
    return c;
  };
  for (const cell of candidateCells(st)) {
    for (const amount of amts) { tryMove({ cell, amount }); if (++n % 25 === 0) yield; }
  }
  // refina em volta das 3 melhores
  scored.sort((a, b) => b.v - a.v);
  const seeds = scored.slice(0, 3).map(c => c.m);
  for (const m of seeds) {
    const x = m.cell % N, y = (m.cell - x) / N;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
      tryMove({ cell: idx(nx, ny), amount: m.amount });
      if (++n % 25 === 0) yield;
    }
  }
  scored.sort((a, b) => b.v - a.v);
  let pool = scored;
  if (o.depth >= 2) {
    pool = scored.slice(0, 4);
    for (const c of pool) {
      const s2 = c.s2;
      if (s2.over || s2.turn === who) continue;
      // resposta do outro: as gotas maiores dele, na grade
      const rAmts = amountsFor(s2, 1 - who, [6, 3]);
      let worst = Infinity;
      for (const cell of candidateCells(s2, 3, 2)) for (const amount of rAmts) {
        const m2 = { cell, amount };
        if (!isLegal(s2, m2)) continue;
        const v = evaluate(applyMove(s2, m2).st, who, o);
        if (v < worst) worst = v;
        if (++n % 25 === 0) yield;
      }
      if (worst < Infinity) c.v = worst;
    }
  }
  let best = null, bv = -Infinity;
  for (const c of pool) {
    const v = c.v + (o.noise ? (random() - 0.5) * o.noise : 0);
    if (v > bv) { bv = v; best = c.m; }
  }
  return best;
}

export function chooseMove(st, who, o, random = Math.random) {
  const g = chooseMoveGen(st, who, o, random);
  let x;
  do x = g.next(); while (!x.done);
  return x.value;
}

export function playRound(st, a, b, random) {
  let s = st, guard = 0;
  while (!s.over && guard++ < 200) {
    const o = s.turn === PLAYER ? a : b;
    const m = chooseMove(s, s.turn, o, random);
    if (!m) break;
    s = applyMove(s, m).st;
  }
  const end = dry(s).st;
  return { st: s, end, score: areas(end) };
}
export { CPU };
