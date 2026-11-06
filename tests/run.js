// Testes automáticos: node tests/run.js (ou npm test). Não tocam som e saem com código 1 se algo falhar.
import { N, idx, newRound, applyMove, dropInk, spreadStep, dry, areas, preview, isLegal, Match, PAPERS, INK, ROUNDS, STEPS, FLOW_MIN, MIX, PLAYER, CPU, GRAY, EMPTY } from '../js/rules.js';
import { OPPONENTS, ROBOT, rng, chooseMove, chooseMoveGen, playRound } from '../js/ai.js';
import { CHALLENGES, setupChallenge, solveChallenge, gradeMoves, measure, canDrop, challengeMove } from '../js/challenges.js';

let fails = 0, count = 0;
function ok(cond, msg) { count++; if (!cond) { fails++; console.log('  FALHOU:', msg); } }
process.on('uncaughtException', (e) => { console.log('ERRO:', e); process.exit(1); });
process.on('unhandledRejection', (e) => { console.log('ERRO:', e); process.exit(1); });
setTimeout(() => { console.log('ERRO: os testes passaram de 240 s'); process.exit(1); }, 240000).unref();
const total = (st) => { let s = 0; for (let i = 0; i < N * N; i++) if (st.own[i] === 0 || st.own[i] === 1) s += st.conc[i]; return s; };

console.log('Tinta');
{
  const st = newRound({ paper: 0 });
  ok(areas(st).join() === '0,0,0' && st.ink.join() === `${INK},${INK}`, 'papel limpo e 12 de tinta cada');
  const r = applyMove(st, { cell: idx(10, 10), amount: 4 }, true);
  ok(Math.abs(total(r.st) - 4) < 1e-3, `a tinta se conserva enquanto escorre (${total(r.st).toFixed(4)})`);
  ok(r.frames.length === STEPS + 1 && areas(r.st)[0] > 5, `escorre por ${STEPS} passos e pinta área (${areas(r.st)[0]})`);
  ok(areas(dry(r.st).st)[0] > areas(r.st)[0], 'secando ainda espalha um pouco');
  const big = areas(dry(applyMove(st, { cell: idx(10, 10), amount: 6 }).st).st)[0];
  const small = areas(dry(applyMove(st, { cell: idx(10, 10), amount: 2 }).st).st)[0];
  ok(big > small, `gota forte pinta mais (${big} x ${small})`);
  ok(JSON.stringify(Array.from(dry(r.st).st.own)) === JSON.stringify(Array.from(dry(r.st).st.own)), 'simulação determinística');
  // simétrico: gota no centro espalha igual para os lados
  const c = applyMove(newRound({ paper: { wax: [] } }), { cell: idx(9, 9), amount: 5 }).st;
  ok(c.own[idx(6, 9)] === c.own[idx(12, 9)] && Math.abs(c.conc[idx(9, 12)] - c.conc[idx(9, 6)]) < 1e-5, 'espalha por igual');
  // cera
  const w = newRound({ paper: 1 });
  ok(!isLegal(w, { cell: idx(9, 8), amount: 3 }), 'não pode pingar na cera');
  let ws = applyMove(w, { cell: idx(7, 8), amount: 6 }).st;
  ws = dry(ws).st;
  let crossed = false;
  for (let y = 3; y <= 16; y++) if (ws.own[idx(11, y)] === PLAYER) crossed = true;
  ok(ws.own[idx(9, 8)] === EMPTY && !crossed, 'a tinta não atravessa a fita de cera');
  // encontro de cores: o dobro avança, parecido vira lama
  let m = newRound({ paper: 0, starter: PLAYER });
  m = applyMove(m, { cell: idx(5, 10), amount: 6 }).st;
  m = applyMove(m, { cell: idx(9, 10), amount: 6 }).st;
  const am = areas(dry(m).st);
  ok(am[2] > 0, `duas gotas iguais se encontrando viram lama (${am})`);
  let e = newRound({ paper: 0, starter: CPU });
  e = applyMove(e, { cell: idx(10, 10), amount: 1 }).st;          // azul fraquinho
  const before = areas(e);
  e = applyMove(e, { cell: idx(10, 10), amount: 6 }).st;          // você por cima, forte
  ok(e.own[idx(10, 10)] === PLAYER && areas(e)[1] < before[1], 'gota com o dobro come a outra cor');
  const g = { ...newRound({ paper: 0 }) };
  g.own[0] = GRAY;
  const g2 = dropInk(g, PLAYER, 1, 3).st;
  ok(g2.own[0] === GRAY, 'lama não muda mais');
  ok(MIX === 2 && FLOW_MIN > 0, 'constantes da regra');
  const pv = preview(st, { cell: idx(3, 3), amount: 3 });
  ok(areas(st).join() === '0,0,0' && pv.areasEnd[0] >= pv.areasNow[0], 'prévia não mexe no jogo e mostra o fim');
}

console.log('Partida');
{
  let st = newRound({ paper: 0, starter: CPU });
  ok(st.turn === CPU, 'começa quem foi sorteado');
  let n = 0;
  while (!st.over && n < 100) { st = applyMove(st, { cell: (n * 37) % (N * N), amount: 3 }).st; n++; }
  ok(st.over && n === 8 && st.ink.join() === '0,0', `acaba quando a tinta dos dois acaba (${n} gotas)`);
  ok(!isLegal(newRound({ paper: 0 }), { cell: 0, amount: 7 }) && !isLegal(newRound({ paper: 0 }), { cell: 0, amount: 0.5 }), 'gota de 1 a 6');
  let one = newRound({ paper: 0, ink: [12, 2] });
  one = applyMove(one, { cell: 0, amount: 2 }).st;
  one = applyMove(one, { cell: 50, amount: 2 }).st;
  ok(one.turn === PLAYER && !one.over, 'se um acaba a tinta, o outro continua sozinho');
  const mt = new Match({ starter: PLAYER, papers: [0, 2] });
  while (!mt.round.over) mt.play({ cell: (mt.round.moves * 53) % 400, amount: 6 });
  mt.closeRound();
  mt.nextRound();
  ok(mt.round.starter === CPU && mt.round.paper.name === PAPERS[2].name, 'rodada 2: começa o outro, outro papel');
  while (!mt.round.over) mt.play({ cell: (mt.round.moves * 41 + 7) % 400, amount: 6 });
  mt.closeRound();
  ok(mt.over && mt.results.length === ROUNDS, 'partida de 2 rodadas');
}

console.log('IA');
{
  const r = rng(5);
  for (const o of OPPONENTS) {
    const st = newRound({ paper: 3, starter: CPU });
    let m, ms = Infinity;
    for (let k = 0; k < 3; k++) {     // o menor de 3 (o PC pode estar ocupado com outra coisa)
      const t0 = performance.now();
      m = chooseMove(st, CPU, o, r);
      ms = Math.min(ms, performance.now() - t0);
    }
    console.log(`  ${o.name}: ${ms.toFixed(0)} ms`);
    ok(m && isLegal(st, m), `${o.name}: jogada válida`);
    ok(ms < 100, `${o.name} pensa em menos de 100 ms (${ms.toFixed(0)})`);
  }
  const g = chooseMoveGen(newRound({ paper: 0, starter: CPU }), CPU, OPPONENTS[2], r);
  let steps = 0, x;
  do { x = g.next(); steps++; } while (!x.done);
  ok(steps > 5 && x.value, `escolha em passos (${steps} pedaços)`);
  // estilos: Tito usa gotas maiores que a Dona Cida
  const avg = (o) => { const res = playRound(newRound({ paper: 0 }), o, o, r); const d = res.st.drops; return d.reduce((s, q) => s + q.amount, 0) / d.length; };
  const at = avg(OPPONENTS[1]), ac = avg(OPPONENTS[0]);
  ok(at > ac, `Tito pinga gotas maiores que a Dona Cida (${at.toFixed(1)} x ${ac.toFixed(1)})`);
}

console.log('IA contra IA');
{
  const r = rng(11);
  const duel = (a, b, games) => {
    let wa = 0, wb = 0; const lines = [];
    for (let gI = 0; gI < games; gI++) {
      let A = 0, B = 0;
      for (let rd = 0; rd < 2; rd++) {
        const res = playRound(newRound({ paper: (gI + rd) % PAPERS.length, starter: (gI + rd) % 2 }), OPPONENTS[a], OPPONENTS[b], r);
        ok(res.st.over && res.st.ink[0] < 1 && res.st.ink[1] < 1, 'rodada IA x IA até o fim da tinta');
        A += res.score[0]; B += res.score[1];
      }
      if (A > B) wa++; else if (B > A) wb++;
      lines.push(`${A}x${B}`);
    }
    console.log(`  ${OPPONENTS[a].name} ${wa} x ${wb} ${OPPONENTS[b].name}  (${lines.join(' ')})`);
    return wa;
  };
  ok(duel(2, 0, 6) > 3, 'Mestre Aurélio vence a maioria contra a Dona Cida');
  ok(duel(2, 1, 6) > 3, 'Mestre Aurélio vence a maioria contra o Tito');
  ok(duel(0, 1, 6) > 3, 'Dona Cida vence a maioria contra o Tito');
}

console.log('Desafios');
{
  for (const [i, c] of CHALLENGES.entries()) {
    const st = setupChallenge(c);
    ok(c.desc && c.stars.length === 3 && c.stars[0] < c.stars[1] && c.stars[1] < c.stars[2], `desafio ${i + 1}: texto e metas crescentes`);
    ok(measure(c, st) < c.stars[0] || c.metric === 'clean', `desafio ${i + 1}: sem pingar não dá estrela`);
    const t0 = performance.now();
    const best = solveChallenge(c);
    const ms = performance.now() - t0;
    const again = gradeMoves(c, best.moves);
    console.log(`  ${i + 1}. ${c.name}: ${'★'.repeat(best.stars)}${'☆'.repeat(3 - best.stars)}  valor ${best.value}  ${best.moves.map(m => `(${m.cell % N},${Math.floor(m.cell / N)}) x${m.amount}`).join(', ')}  (${ms.toFixed(0)} ms)`);
    ok(best.stars === 3 && again.stars === 3 && !canDrop(again.st), `robô tira 3 estrelas no desafio ${i + 1} gastando a tinta`);
    // jogada boba: tudo numa gota só no canto
    let s = st;
    while (canDrop(s)) s = challengeMove(s, { cell: s.wax[0] ? 1 : 0, amount: Math.min(6, s.ink[0]) }).st;
    ok(measure(c, s) < c.stars[2], `desafio ${i + 1}: pingar tudo no canto não dá 3 estrelas`);
  }
}

console.log('Fumaça do main.js');
{
  const { smoke } = await import('./smoke.js');
  try {
    const out = await smoke();
    for (const [cond, msg] of out) ok(cond, msg);
    console.log(`  ${out.filter(o => o[0]).length} de ${out.length} conferências do jogo carregado`);
  } catch (e) { ok(false, `main.js quebrou: ${e.stack || e}`); }
}

console.log(`\n${count - fails} de ${count} passaram`);
if (fails) { console.log(`${fails} FALHARAM`); process.exit(1); }
console.log('Tudo certo');
process.exit(0);
