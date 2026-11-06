// Liga as regras e a IA à cena, ao Quest (controles e mãos) e ao mouse/teclado.
import * as THREE from '../vendor/three/three.module.js';
import { N, PLAYER, CPU, GRAY, INK, MIN_DROP, MAX_DROP, PAPERS, ROUNDS, Match, applyMove, dry, areas, preview, isLegal, quantize } from './rules.js';
import { OPPONENTS, ROBOT, rng, chooseMoveGen } from './ai.js';
import { CHALLENGES, setupChallenge, bestChallengeGen, measure, starsFor, goalText, metricName, challengeMove, canDrop } from './challenges.js';
import { buildWorld, TABLE, CELL, PAPER_Y, JAR, cellPos, cellAtXZ } from './scene.js';
import { createShell } from './shell.js';
import { setTheme, Label } from './ui.js';
import { Sfx } from './audio.js';
import { loadSave, storeSave } from './save.js';

setTheme({
  bg: 'rgba(252,249,242,0.97)', edge: '#2468d6', text: '#2e2a26', dim: '#7a7068', btn: '#ece4d8', btnHover: '#f6c8d4',
  btnOn: '#d6345c', btnOnText: '#ffffff', lock: '#e4ded4', star: '#e8a82a', labelBg: 'rgba(252,249,242,0.92)',
  title: 'italic bold 60px Georgia, serif',
});

const save = loadSave();
const sfx = new Sfx();
sfx.on = save.sound;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const GRAB_DIST = 0.1;
const CHARGE_T = 1.4;                  // segundos segurando para a gota mais forte
const FRAME_T = 0.09, DRY_FRAME_T = 0.05;
const STAND = { x: TABLE.x, z: TABLE.z + 0.6 };
const PAPER_CENTER = new THREE.Vector3(TABLE.x, PAPER_Y, TABLE.z);

const world = buildWorld();
const { scene } = world;
const shell = createShell({ scene, sfx, save, storeSave, stand: STAND, exposure: 1.0, statusPos: new THREE.Vector3(TABLE.x, 1.92, TABLE.z - 0.6), hooks: {} });
const { renderer, camera, panel } = shell;
shell.orbit.target.copy(PAPER_CENTER).add(new THREE.Vector3(0, 0.16, -0.2));
shell.orbit.dist = 1.3; shell.orbit.pitch = 0.92; shell.orbit.keys = 'wasd';
const menuCam = (t) => ({ pos: new THREE.Vector3(TABLE.x + Math.sin(t * 0.1) * 0.9, 1.6, TABLE.z + 1.5), look: new THREE.Vector3(TABLE.x - 0.3, 1.25, TABLE.z - 3) });
const previewLabel = new Label(0.34, 768, 160);
previewLabel.mesh.visible = false;
scene.add(previewLabel.mesh);

// ---------- Estado ----------
let app = 'menu', mode = 'match', match = null, ch = null, oppIndex = 0;
let phase = 'idle';          // 'intro' | 'turn' | 'think' | 'anim' | 'dry' | 'roundEnd' | 'over'
let time = 0, msg = null, random = rng((Date.now() % 100000) + 1);
let thinker = null, thinkT = 0, timerAuto = 0, chResult = null;
let charging = null;         // { src: entry | 'mouse', t, amount }
let held = null;             // conta-gotas na mão { entry }
let hover = { cell: -1 };
let lastAmount = 3;
const opponent = () => OPPONENTS[oppIndex];
const cur = () => (mode === 'match' ? match?.round : ch?.st);
const timers = [];
const later = (sec, fn) => timers.push({ at: time + sec, fn });
let anim = null;             // { frames, k, t, dt, from, done }
let shown = null;            // estado desenhado no papel agora

function show(st) { shown = st; world.drawInk(st); }
function clearAll() {
  timers.length = 0; anim = null; charging = null;
  for (const f of world.falling) f.visible = false;
  for (const p of world.pipettes) { p.position.copy(p.userData.home); p.rotation.set(0, 0, 0); p.userData.drop.scale.setScalar(0.001); }
  held = null;
  hidePreview();
}

// ---------- Partidas e desafios ----------
function pickPapers() {
  const a = Math.floor(random() * PAPERS.length);
  let b = Math.floor(random() * (PAPERS.length - 1)); if (b >= a) b++;
  return [a, b];
}
function newMatch(i) {
  mode = 'match';
  oppIndex = clamp(i, 0, OPPONENTS.length - 1);
  const o = opponent();
  world.avatar.setStyle(o.style, o.color);
  match = new Match({ starter: random() < 0.5 ? PLAYER : CPU, papers: pickPapers() });
  ch = null;
  startRound();
  msg = { text: match.round.starter === PLAYER ? 'Sorteio: você começa.' : `Sorteio: ${o.name} começa.`, t: 3.5 };
}
function startRound() {
  app = 'play'; shell.hidePanel();
  clearAll();
  show(cur());
  world.setZone(null);
  placeForPlay();
  beginTurn();
}
function newChallenge(i, skipIntro = false) {
  mode = 'challenge';
  const k = clamp(i, 0, CHALLENGES.length - 1);
  ch = { i: k, st: setupChallenge(CHALLENGES[k]), plan: null };
  match = null;
  world.avatar.setStyle('master', 0x8a7a6a);
  app = 'play';
  clearAll();
  show(ch.st);
  world.setZone(CHALLENGES[k].zone || null);
  msg = null; chResult = null;
  placeForPlay();
  if (skipIntro || dev.autoplay) { shell.hidePanel(); beginTurn(); } else { phase = 'intro'; showScreen('chIntro'); }
}
function beginTurn() {
  const st = cur();
  thinker = null;
  if (mode === 'challenge' ? !canDrop(st) : st.over) { endOfRound(); return; }
  if (st.turn === PLAYER) { phase = 'turn'; thinkT = 0; }
  else {
    phase = 'think'; thinkT = 0;
    world.avatar.state.thinking = true;
    thinker = { gen: chooseMoveGen(st, CPU, opponent(), random), done: false, result: null };
  }
  updateHint();
}
function pumpThinker(budgetMs = 6) {
  if (!thinker || thinker.done) return;
  const t0 = performance.now();
  do { const x = thinker.gen.next(); if (x.done) { thinker.done = true; thinker.result = x.value; return; } } while (performance.now() - t0 < budgetMs);
}

// Pinga: a gota cai, bate no papel e a tinta escorre passo a passo (os mesmos passos da regra).
function doMove(m, from = null) {
  const st = cur();
  if (!st || (phase !== 'turn' && phase !== 'think') || !isLegal(st, m)) return false;
  const who = st.turn;
  const before = st;
  let r;
  if (mode === 'match') r = match.play(m, true);
  else { r = challengeMove(ch.st, m); ch.st = r.st; r = { ...r, frames: applyMove(before, m, true).frames }; }
  phase = 'anim';
  hidePreview();
  charging = null; sfx.charge(0);
  if (who === CPU) world.avatar.state.thinking = false;
  const target = cellPos(m.cell);
  const start = from ? from.clone() : target.clone().add(new THREE.Vector3(0, 0.12, 0));
  const drop = world.falling[who];
  drop.visible = true; drop.scale.setScalar(0.004 + 0.0018 * Math.cbrt(r.amount) * 2);
  drop.position.copy(start);
  const fallT = Math.max(0.12, Math.sqrt(2 * Math.max(0.01, start.y - PAPER_Y) / 9.8));
  const t0 = time;
  later(0, () => { dropAnim = { mesh: drop, a: start, b: target, t0, dur: fallT }; });
  later(fallT, () => {
    drop.visible = false; dropAnim = null;
    sfx.drip(r.amount); sfx.seep(0.05);
    if (shell.vr) shell.pulse(held?.entry || lastEntry, 0.4, 30);
    anim = { frames: r.frames, k: 0, t: 0, dt: FRAME_T, from: before, done: () => afterMove(who, r, before) };
  });
  return true;
}
let dropAnim = null;
function afterMove(who, r, before) {
  const st = cur();
  show(st);
  const a0 = areas(before), a1 = areas(st);
  const gray = a1[2] - a0[2];
  const name = who === PLAYER ? 'Você' : mode === 'match' ? opponent().name : '';
  msg = { text: `${name} pingou ${fmt(r.amount)} de tinta${gray > 0 ? ` (virou lama: ${gray})` : ''}.`, t: 2.5 };
  if (gray > 2) sfx.mud();
  if (who === CPU && a1[1] - a0[1] > 12) world.avatar.react(1, 1.2);
  if (who === PLAYER && a1[0] - a0[0] > 12 && a0[1] > a1[1]) world.avatar.react(-1, 1.2);
  beginTurn();
}
const fmt = (v) => String(v).replace('.', ',');

function updateAnim(dt) {
  if (dropAnim) {
    const u = clamp((time - dropAnim.t0) / dropAnim.dur, 0, 1);
    dropAnim.mesh.position.lerpVectors(dropAnim.a, dropAnim.b, u * u);
  }
  if (!anim) return;
  anim.t += dt;
  while (anim && anim.t >= anim.dt) {
    anim.t -= anim.dt;
    anim.k++;
    if (anim.k >= anim.frames.length) { const d = anim.done; anim = null; d(); return; }
  }
  const f = anim.frames[anim.k];
  const prev = anim.k > 0 ? anim.frames[anim.k - 1] : anim.from;
  world.drawInk({ own: f.own, conc: f.conc, wax: cur().wax }, prev, anim.t / anim.dt);
}

function endOfRound() {
  phase = 'dry';
  hidePreview();
  msg = { text: 'O papel está secando...', t: 2 };
  const before = cur();
  let frames;
  if (mode === 'match') frames = match.closeRound(true).frames;
  else { const d = dry(ch.st, true); frames = d.frames; ch.final = d.st; }
  if (!frames.length) { finishRound(); return; }
  anim = { frames, k: 0, t: 0, dt: DRY_FRAME_T, from: before, done: finishRound };
}
function finishRound() {
  if (mode === 'challenge') { show(ch.final || ch.st); finishChallenge(); return; }
  show(match.round);
  phase = match.over ? 'over' : 'roundEnd';
  const r = match.results[match.results.length - 1].score;
  if (match.over) {
    save.games[oppIndex]++;
    if (match.winner === PLAYER) { save.wins[oppIndex]++; sfx.fanfare(); world.avatar.react(-1, 3); }
    else if (match.winner === CPU) { sfx.bad(); world.avatar.react(1, 3); }
    storeSave(save);
    showScreen('over');
  } else {
    if (r[0] > r[1]) { sfx.good(); world.avatar.react(-1, 2); } else if (r[1] > r[0]) { sfx.bad(); world.avatar.react(1, 2); }
    showScreen('roundEnd');
  }
  timerAuto = 2.5;
  updateHint();
}
function nextRound() {
  match.nextRound();
  startRound();
  msg = { text: match.round.starter === PLAYER ? `Rodada ${match.index + 1}: você começa.` : `Rodada ${match.index + 1}: ${opponent().name} começa.`, t: 3 };
}
function finishChallenge() {
  phase = 'over';
  const c = CHALLENGES[ch.i];
  const value = measure(c, ch.st);
  const stars = starsFor(c, value);
  chResult = { stars, value };
  save.ch[ch.i] = Math.max(save.ch[ch.i] || 0, stars);
  storeSave(save);
  for (let k = 0; k < stars; k++) later(0.25 * k, () => sfx.star(k));
  if (stars === 3) later(0.8, () => sfx.fanfare());
  timerAuto = 2.5;
  showScreen('chResult');
}
function goMenu() {
  app = 'menu'; phase = 'idle';
  shell.orbit.menu = menuCam; shell.orbit.snap = true;
  match = null; ch = null;
  clearAll();
  const demo = setupChallenge(CHALLENGES[9]);
  show(demo);
  world.setZone(null);
  world.avatar.setStyle('careful', OPPONENTS[0].color);
  world.avatar.state.thinking = false;
  if (shell.vr) shell.recenter();
  showScreen('main');
  updateHint();
}
function togglePause() {
  if (app === 'play' && !panel.visible) { app = 'paused'; dropHeld(); charging = null; sfx.charge(0); showScreen('pause'); }
  else if (app === 'paused') { app = 'play'; shell.hidePanel(); }
  updateHint();
}

// ---------- Menus ----------
const challengeUnlocked = (i) => i === 0 || (save.ch[i - 1] || 0) >= 1;
function showScreen(name) {
  const vr = shell.vr;
  shell.showPanel((p) => {
    if (name === 'main') {
      p.title('Aquarela', 72);
      p.text('Pingue tinta no papel molhado e tome conta da folha', 512, 130, { size: 26, color: '#7a7068' });
      p.button('Partida contra o computador', () => showScreen('opponents'), 212, 172, 600, 92, { size: 36 });
      p.button('Desafios', () => showScreen('challenges'), 212, 280, 600, 80);
      p.button('Como jogar', () => showScreen('help'), 212, 376, 600, 80);
      p.button(`Som: ${save.sound ? 'sim' : 'não'}`, () => { save.sound = !save.sound; sfx.setOn(save.sound); storeSave(save); showScreen('main'); }, 212, 474, 190, 66, { size: 26 });
      p.button(`Prévia: ${save.preview ? 'sim' : 'não'}`, () => { save.preview = !save.preview; storeSave(save); showScreen('main'); }, 417, 474, 190, 66, { size: 26 });
      p.button(`FPS: ${save.fps ? 'sim' : 'não'}`, () => { save.fps = !save.fps; storeSave(save); showScreen('main'); }, 622, 474, 190, 66, { size: 26 });
      const stars = Object.values(save.ch).reduce((a, b) => a + b, 0);
      p.text(`Vitórias: ${save.wins.reduce((a, b) => a + b, 0)}   ·   Estrelas nos desafios: ${stars} de ${CHALLENGES.length * 3}`, 512, 594, { size: 26, color: '#d6345c' });
      p.text(vr ? 'Aponte com o controle e aperte o gatilho' : 'No Quest: abra esta página no navegador do óculos e aperte "Entrar em VR"', 512, 656, { size: 22, color: '#7a7068' });
    } else if (name === 'opponents') {
      p.title('Escolha o adversário', 62);
      OPPONENTS.forEach((o, i) => {
        p.button(`${o.name}  ·  ${o.title}`, () => newMatch(i), 112, 116 + i * 156, 800, 136, { size: 36, sub: `${o.desc}   (vitórias: ${save.wins[i]} de ${save.games[i]})` });
      });
      p.text(`${ROUNDS} rodadas com ${INK} de tinta para cada um. Cada um começa uma.`, 512, 600, { size: 24, color: '#7a7068' });
      p.button('Voltar', () => showScreen('main'), 362, 632, 300, 66, { size: 28 });
    } else if (name === 'challenges') {
      p.title('Desafios', 56);
      CHALLENGES.forEach((c, i) => {
        p.tile(52 + (i % 5) * 186, 110 + Math.floor(i / 5) * 200, 172, 176, { num: i + 1, name: c.name, stars: save.ch[i] || 0, done: save.ch[i] != null, locked: !challengeUnlocked(i), action: () => newChallenge(i) });
      });
      p.text('Passe um desafio (1 estrela) para liberar o próximo.', 512, 540, { size: 24, color: '#7a7068' });
      p.button('Voltar', () => showScreen(app === 'paused' ? 'pause' : 'main'), 362, 600, 300, 70, { size: 30 });
    } else if (name === 'help') {
      p.title('Como jogar', 60);
      const rows = [
        `Cada um tem ${INK} de tinta por rodada. Na sua vez, pingue uma gota (1 a 6).`,
        'Quanto mais tempo segurar, mais forte a gota. A tinta escorre pelo papel.',
        'Onde as cores se encontram, a que tiver o dobro avança e come a outra.',
        'Se as duas forem parecidas, vira lama cinza: não é de ninguém e não muda.',
        'A tinta não entra na cera. No fim o papel seca: conta a área de cada cor.',
        'O contorno pulsando mostra o que a gota vai pintar antes de você soltar.',
        vr ? 'VR: aperto pega o conta-gotas; gatilho segurado enche a gota; soltar pinga.' : 'PC: segure o clique no papel e solte. Teclas 1 a 6: gota exata.',
        vr ? 'De longe: aponte o raio, segure e solte o gatilho. B ou Y: pausa.' : 'Botão direito ou A/D/W/S: girar a câmera. Esc: pausa.',
      ];
      rows.forEach((t, i) => p.text(t, 44, 124 + i * 54, { size: 25, align: 'left' }));
      p.button('Voltar', () => showScreen(app === 'paused' ? 'pause' : 'main'), 362, 586, 300, 80);
    } else if (name === 'pause') {
      p.title('Pausa', 66);
      p.text(mode === 'match' ? `Contra ${opponent().name} · Rodada ${match.index + 1} de ${ROUNDS}` : `Desafio ${ch.i + 1}: ${CHALLENGES[ch.i].name}`, 512, 130, { size: 28, color: '#7a7068' });
      p.button('Continuar', () => togglePause(), 262, 176, 500, 84);
      p.button(mode === 'match' ? 'Recomeçar a partida' : 'Recomeçar o desafio', () => (mode === 'match' ? newMatch(oppIndex) : newChallenge(ch.i, true)), 262, 276, 500, 84);
      p.button('Como jogar', () => showScreen('help'), 262, 376, 245, 84, { size: 30 });
      p.button('Recentralizar', () => { togglePause(); shell.recenter(); }, 517, 376, 245, 84, { size: 30, locked: !vr });
      p.button('Menu principal', () => goMenu(), 262, 476, 500, 84);
    } else if (name === 'roundEnd') {
      const r = match.results[match.results.length - 1];
      p.title(`Fim da rodada ${match.results.length}`, 66);
      p.text(`Você ${r.score[0]} x ${r.score[1]} ${opponent().name}   (lama: ${r.gray})`, 512, 150, { size: 38, bold: true, color: r.score[0] > r.score[1] ? '#d6345c' : r.score[1] > r.score[0] ? '#2468d6' : '#2e2a26' });
      p.text(`Total: você ${match.total(0)} x ${match.total(1)} ${opponent().name}`, 512, 212, { size: 28, color: '#7a7068' });
      p.text(`Próximo papel: ${PAPERS[match.papers[match.index + 1]].name}`, 512, 262, { size: 26, color: '#7a7068' });
      p.button('Próxima rodada', () => nextRound(), 262, 320, 500, 96, { size: 38 });
      p.button('Menu principal', () => goMenu(), 262, 450, 500, 80);
    } else if (name === 'over') {
      const w = match.winner;
      p.title(w === PLAYER ? 'Você venceu!' : w === CPU ? `${opponent().name} venceu` : 'Empate!', 72);
      p.text(`Você ${match.total(0)} x ${match.total(1)} ${opponent().name}`, 512, 150, { size: 40, bold: true });
      p.text(`Rodadas: ${match.results.map(r => `${r.score[0]}-${r.score[1]}`).join('   ')}`, 512, 210, { size: 28, color: '#7a7068' });
      p.text(`Contra ${opponent().name}: ${save.wins[oppIndex]} vitória(s) em ${save.games[oppIndex]} partida(s)`, 512, 258, { size: 24, color: '#7a7068' });
      p.button('Jogar de novo', () => newMatch(oppIndex), 262, 310, 500, 92, { size: 36 });
      p.button('Outro adversário', () => showScreen('opponents'), 262, 420, 500, 80);
      p.button('Menu principal', () => goMenu(), 262, 520, 500, 80);
    } else if (name === 'chIntro') {
      const c = CHALLENGES[ch.i];
      p.title(`Desafio ${ch.i + 1}: ${c.name}`, 66);
      p.text(c.desc, 512, 150, { size: 28 });
      p.text(`Tinta: ${c.ink}${c.maxDrops ? ` em ${c.maxDrops} gota` : ''}. A azul já está no papel.`, 512, 200, { size: 26, color: '#7a7068' });
      p.text(goalText(c), 512, 252, { size: 22, color: '#d6345c' });
      p.button('Começar', () => { shell.hidePanel(); beginTurn(); }, 262, 320, 500, 96, { size: 38 });
      p.button('Desafios', () => showScreen('challenges'), 262, 440, 500, 80);
    } else if (name === 'chResult') {
      const c = CHALLENGES[ch.i];
      p.title(chResult.stars ? 'Desafio cumprido!' : 'Não foi dessa vez', 66);
      p.stars(chResult.stars, 512, 160, 80);
      p.text(`${metricName(c)}: ${chResult.value}`, 512, 232, { size: 30, bold: true });
      p.text(goalText(c), 512, 276, { size: 21, color: '#7a7068' });
      p.text(`Melhor: ${save.ch[ch.i] || 0} estrela(s)`, 512, 314, { size: 24 });
      p.button('Tentar de novo', () => newChallenge(ch.i, true), 262, 350, 245, 84, { size: 30 });
      p.button('Próximo', () => newChallenge(ch.i + 1), 517, 350, 245, 84, { size: 30, locked: ch.i >= CHALLENGES.length - 1 || !challengeUnlocked(ch.i + 1) });
      p.button('Desafios', () => showScreen('challenges'), 262, 454, 500, 80);
      p.button('Menu principal', () => goMenu(), 262, 554, 500, 80);
    }
  });
  hidePreview();
  updateHint();
}
function placeForPlay() {
  shell.orbit.menu = null;
  if (shell.vr && !rigPlaced) { shell.recenter(); rigPlaced = true; }
  shell.orbit.snap = true;
}
let rigPlaced = false;

// ---------- Força da gota e prévia ----------
function inkNow() { const st = cur(); return st ? st.ink[PLAYER] : 0; }
function amountFor(t) {
  const ink = inkNow();
  let a = quantize(1 + (MAX_DROP - 1) * clamp(t / CHARGE_T, 0, 1));
  a = Math.min(a, MAX_DROP, ink);
  if (ink - a > 0 && ink - a < MIN_DROP) a = ink - a < 0.75 ? ink : a;   // não deixa sobra que não dá gota
  return quantize(Math.min(a, ink));
}
let previewKey = '', previewInfo = null;
const previewEl = document.getElementById('preview');
function hidePreview() {
  world.ghost.visible = false; world.aim.visible = false;
  previewLabel.mesh.visible = false; previewEl.style.display = 'none';
  previewInfo = null; previewKey = '';
}
function showPreview(cell, amount) {
  const st = cur();
  if (!st || cell < 0) { hidePreview(); return; }
  cellPos(cell, world.aim.position).y += 0.002;
  world.aim.visible = true;
  const m = { cell, amount };
  if (!isLegal(st, m)) { world.ghost.visible = false; world.aim.material.color.set(0xff3a2a); previewEl.style.display = 'none'; previewLabel.mesh.visible = false; previewInfo = null; previewKey = ''; return; }
  world.aim.material.color.set(0x3a2a1a);
  const key = `${cell}:${amount}:${st.moves}`;
  if (key !== previewKey) {
    previewKey = key;
    previewInfo = preview(st, m);
    if (save.preview) world.drawGhost(st, previewInfo.now); else world.ghost.visible = false;
  }
  updatePreviewText(previewInfo, amount, cell);
}
function previewLines(info, amount) {
  const other = mode === 'match' ? opponent().name : 'Azul';
  const a = info.areasNow, e = info.areasEnd, b = info.before;
  const d = e[0] - b[0];
  return [`Gota de ${fmt(amount)} (tem ${fmt(inkNow())}) · logo depois: você ${a[0]} x ${a[1]} ${other}${a[2] ? `, lama ${a[2]}` : ''}`, `No fim, secando: você ${e[0]} (${d >= 0 ? '+' : ''}${d}) x ${e[1]} ${other}`, e[0] - e[1] - (b[0] - b[1])];
}
function updatePreviewText(info, amount, cell) {
  const [l1, l2, net] = previewLines(info, amount);
  const color = net > 0 ? '#2a8a3a' : net < 0 ? '#c03a2a' : '#2e2a26';
  if (shell.vr) {
    previewLabel.set([{ text: l1, size: 0.34, color: '#d6345c' }, { text: l2, size: 0.38, color }]);
    previewLabel.mesh.visible = true;
    cellPos(cell, previewLabel.mesh.position).y += 0.22;
    const head = camera.getWorldPosition(new THREE.Vector3());
    previewLabel.mesh.lookAt(head.x, previewLabel.mesh.position.y, head.z);
  } else {
    previewEl.style.display = 'block';
    const pct = Math.round(amount / MAX_DROP * 100);
    const html = `<div class="bar"><div class="fill" style="width:${pct}%"></div></div><div class="txt">${l1}</div><div class="txt big" style="color:${color}">${l2}</div>`;
    if (previewEl.dataset.last !== html) { previewEl.innerHTML = html; previewEl.dataset.last = html; }
  }
}

// ---------- Entrada ----------
let lastEntry = null;
const _v = new THREE.Vector3();
function canAct() { return app === 'play' && phase === 'turn' && !panel.visible && !dev.autoplay && cur()?.turn === PLAYER; }
function tipPos(out = new THREE.Vector3()) { return world.pipettes[PLAYER].getWorldPosition(out); }
// célula embaixo da ponta do conta-gotas (até 30 cm acima do papel)
function cellBelowTip() {
  const p = tipPos(_v);
  if (p.y < PAPER_Y - 0.01 || p.y > PAPER_Y + 0.3) return -1;
  return cellAtXZ(p.x, p.z);
}
function rayCell(e) {
  const hit = shell.entryRay(e).intersectObject(world.hit)[0];
  return hit ? { cell: cellAtXZ(hit.point.x, hit.point.z), dist: hit.distance } : { cell: -1, dist: 0 };
}
function tryGrab(e) {
  if (!canAct() || held) return false;
  const p = shell.grabPoint(e);
  const pip = world.pipettes[PLAYER];
  pip.getWorldPosition(_v); _v.y += 0.09;
  if (_v.distanceTo(p) > GRAB_DIST) return false;
  held = { entry: e };
  lastEntry = e;
  sfx.pick(); shell.pulse(e, 0.3, 25);
  return true;
}
function dropHeld() {
  if (!held) return;
  held = null;
  const pip = world.pipettes[PLAYER];
  pip.position.copy(pip.userData.home); pip.rotation.set(0, 0, 0); pip.userData.drop.scale.setScalar(0.001);
}
function startCharge(src) {
  if (!canAct() || charging) return;
  charging = { src, t: 0, amount: amountFor(0) };
  lastEntry = typeof src === 'object' ? src : lastEntry;
}
function releaseCharge(src) {
  if (!charging || charging.src !== src) return;
  const amount = charging.amount;
  charging = null; sfx.charge(0);
  world.pipettes[PLAYER].userData.drop.scale.setScalar(0.001);
  const cell = hover.cell;
  if (!canAct() || cell < 0) return;
  const m = { cell, amount };
  if (!isLegal(cur(), m)) { msg = { text: 'Aí é cera: a tinta não entra.', t: 2 }; return; }
  lastAmount = amount;
  const from = held ? tipPos(new THREE.Vector3()) : null;
  doMove(m, from);
}
function updateHeld() {
  const pip = world.pipettes[PLAYER];
  if (!held) return;
  const p = shell.grabPoint(held.entry);
  pip.position.copy(p).add(new THREE.Vector3(0, -0.07, 0));
  pip.rotation.set(0, 0, 0);
}
function updateAim() {
  if (!canAct()) return;
  let cell = -1;
  if (held) {
    cell = cellBelowTip();
  } else if (shell.vr) {
    const pref = charging && typeof charging.src === 'object' ? charging.src : null;
    for (const e of shell.ctrls) {
      if (!e.source) continue;
      const r = rayCell(e);
      if (r.cell >= 0) { e.laserLen = r.dist; if (!pref || e === pref) { if (cell < 0 || e === lastEntry || e === pref) cell = r.cell; } }
    }
  } else cell = pcCell();
  hover.cell = cell;
  const amount = charging ? charging.amount : Math.min(lastAmount, Math.max(MIN_DROP, inkNow()));
  if (cell >= 0) showPreview(cell, amount); else hidePreview();
}
function updateCharge(dt) {
  if (!charging) return;
  charging.t += dt;
  const a = amountFor(charging.t);
  if (a !== charging.amount) { charging.amount = a; if (shell.vr) shell.pulse(charging.src === 'mouse' ? lastEntry : charging.src, 0.1 + a / 12, 15); }
  sfx.charge(a / MAX_DROP);
  const s = 0.003 + 0.0028 * Math.cbrt(a) * 1.6;
  world.pipettes[PLAYER].userData.drop.scale.setScalar(held ? s : 0.001);
}
const hooks = {
  tick,
  pause: () => togglePause(),
  squeezeStart: (e) => { if (!e.isHand) tryGrab(e); },
  squeezeEnd: (e) => { if (held?.entry === e) { if (charging) releaseCharge(charging.src); dropHeld(); } },
  selectStart: (e) => { if (held && held.entry !== e) return; startCharge(e); },
  selectEnd: (e) => releaseCharge(e),
  disconnected: (e) => { if (held?.entry === e) dropHeld(); if (charging?.src === e) { charging = null; sfx.charge(0); } },
  sessionStart: () => { rigPlaced = false; hidePreview(); updateHint(); },
  sessionEnd: () => { dropHeld(); updateHint(); },
  pointerDown: () => { if (canAct() && pcCell() >= 0) startCharge('mouse'); },
  pointerUp: () => releaseCharge('mouse'),
  blur: () => { if (charging?.src === 'mouse') { charging = null; sfx.charge(0); } },
  key: (k) => {
    if (k >= '1' && k <= '6' && canAct()) {
      const cell = pcCell();
      if (cell < 0) { msg = { text: 'Ponha o mouse em cima do papel e aperte 1 a 6.', t: 2 }; return true; }
      const amount = Math.min(+k, inkNow());
      const m = { cell, amount };
      if (isLegal(cur(), m)) { lastAmount = amount; doMove(m); } else msg = { text: amount < MIN_DROP ? 'Acabou a tinta.' : 'Aí é cera: a tinta não entra.', t: 2 };
      return true;
    }
    return false;
  },
};
Object.assign(shell.hooks, hooks);
function pcCell() {
  if (shell.vr) return -1;
  const hit = shell.mouseRay().intersectObject(world.hit)[0];
  return hit ? cellAtXZ(hit.point.x, hit.point.z) : -1;
}

// ---------- CPU: o conta-gotas dele vai até a célula ----------
let cpuMove = null;
function startCpuMove(m) {
  const pip = world.pipettes[CPU];
  const target = cellPos(m.cell).add(new THREE.Vector3(0, 0.1, 0));
  cpuMove = { m, t0: time, a: pip.position.clone(), b: target, phase: 'go' };
}
function updateCpuPipette() {
  const pip = world.pipettes[CPU];
  if (!cpuMove) {
    if (phase !== 'think' && phase !== 'anim') pip.position.lerp(pip.userData.home, 0.1);
    return;
  }
  const e = time - cpuMove.t0;
  if (cpuMove.phase === 'go') {
    const u = clamp(e / 0.55, 0, 1), s = u * u * (3 - 2 * u);
    pip.position.lerpVectors(cpuMove.a, cpuMove.b, s); pip.position.y += Math.sin(Math.PI * u) * 0.08;
    if (u >= 1) { cpuMove.phase = 'charge'; cpuMove.t0 = time; }
  } else if (cpuMove.phase === 'charge') {
    const u = clamp(e / 0.45, 0, 1);
    pip.userData.drop.scale.setScalar(0.001 + u * (0.003 + 0.0028 * Math.cbrt(cpuMove.m.amount) * 1.6));
    if (u >= 1) {
      const m = cpuMove.m; cpuMove = null;
      pip.userData.drop.scale.setScalar(0.001);
      doMove(m, pip.getWorldPosition(new THREE.Vector3()));
    }
  }
}

// ---------- HUD ----------
function updateHint() {
  let t;
  if (app !== 'play' || panel.visible) t = 'Clique nas opções do painel';
  else if (phase === 'turn') t = 'Segure o clique no papel para encher a gota e solte para pingar · teclas 1 a 6: gota exata · botão direito ou A/D/W/S: câmera · Esc: pausa';
  else t = 'Botão direito ou A/D/W/S: girar a câmera · Esc: pausa';
  shell.setHint(t);
}
function statusLines() {
  const st = cur();
  const a = areas(shown || st);
  if (mode === 'challenge') {
    const c = CHALLENGES[ch.i];
    return { a: `Desafio ${ch.i + 1}: ${c.name} · tinta: ${fmt(st.ink[PLAYER])}${c.maxDrops ? ` · gotas: ${st.drops.length} de ${c.maxDrops}` : ''}`, b: goalText(c) };
  }
  const o = opponent();
  const head = `Rodada ${Math.min(ROUNDS, match.index + 1)} de ${ROUNDS} (${st.paper.name}) · área: você ${a[0]} x ${a[1]} ${o.name} · tinta: você ${fmt(st.ink[0])}, ${o.name} ${fmt(st.ink[1])}`;
  let line = '';
  if (phase === 'turn') line = charging ? `Enchendo: gota de ${fmt(charging.amount)}` : 'Sua vez.';
  else if (phase === 'think') line = `${o.name} está escolhendo onde pingar...`;
  else if (phase === 'dry') line = 'Secando...';
  return { a: head, b: line };
}
let boardKey = '';
function updateScoreboard() {
  const st = cur();
  let data;
  if (!st || app === 'menu') data = { names: ['Você', 'Adversário'], scores: [0, 0], round: '', footer: 'Escolha uma partida ou um desafio' };
  else if (mode === 'challenge') { const a = areas(shown || st); data = { names: ['Você', 'Azul'], scores: [a[0], a[1]], round: `Desafio ${ch.i + 1}`, footer: CHALLENGES[ch.i].name }; }
  else data = { names: ['Você', opponent().name], scores: [match.total(0), match.total(1)], round: `Rodada ${Math.min(ROUNDS, match.index + 1)}`, footer: st.paper.name };
  const key = JSON.stringify(data);
  if (key !== boardKey) { boardKey = key; world.drawBoard(data); }
}

// ---------- Laço ----------
function tick(dt) {
  const paused = app === 'paused';
  if (!paused) {
    time += dt;
    for (let i = 0; i < timers.length; i++) if (timers[i].at <= time) { const t = timers.splice(i, 1)[0]; i--; t.fn(); }
    updateAnim(dt);
  }
  if (app === 'play' && cur()) {
    if (phase === 'turn') {
      updateHeld();
      updateCharge(dt);
      updateAim();
      if (dev.autoplay) robotTurn(dt);
    } else if (phase === 'think') {
      thinkT += dt;
      pumpThinker();
      if (!cpuMove && thinkT >= opponent().think && thinker?.done) { const m = thinker.result; thinker = null; if (m) startCpuMove(m); }
    } else if ((phase === 'roundEnd' || phase === 'over') && dev.autoplay) {
      timerAuto -= dt;
      if (timerAuto <= 0) { if (phase === 'roundEnd') nextRound(); else if (mode === 'match') newMatch(oppIndex); }
    }
    if (phase !== 'turn' && !held) hidePreviewIfAny();
  }
  if (!paused) updateCpuPipette();
  if (held && phase !== 'turn') updateHeld();
  world.ghost.material.opacity = 0.45 + 0.35 * Math.sin(time * 6);
  shell.showPinch = false;
  const look = phase === 'think' ? PAPER_CENTER : held ? world.pipettes[PLAYER].position : camera.getWorldPosition(_v);
  world.avatar.update(dt, time, look);
  world.animate(dt, time);
  if (msg) { msg.t -= dt; if (msg.t <= 0) msg = null; }
  shell.setStatus(app === 'play' && cur() ? { ...statusLines(), msg: msg?.text } : null);
  updateScoreboard();
}
function hidePreviewIfAny() { if (previewKey || world.aim.visible) hidePreview(); }

let robotT = 0;
function robotTurn(dt) {
  robotT += dt;
  if (!thinker) {
    robotT = 0;
    if (mode === 'challenge') thinker = ch.plan ? { done: true, kind: 'ch' } : { gen: bestChallengeGen(CHALLENGES[ch.i]), done: false, kind: 'ch' };
    else thinker = { gen: chooseMoveGen(cur(), PLAYER, ROBOT, random), done: false };
  }
  pumpThinker(12);
  if (!thinker.done || robotT < ROBOT.think) return;
  let m;
  if (thinker.kind === 'ch') { if (!ch.plan) ch.plan = thinker.result.moves.slice(); m = ch.plan.shift(); }
  else m = thinker.result;
  thinker = null;
  if (m) doMove(m);
}

// ---------- Depuração (console do navegador) ----------
// dev.autoplay = true   o robô joga por você      dev.advance(5)   avança 5 s na hora
// dev.state()           resumo do jogo            dev.loadLevel(3) abre o desafio 3 (1 a 10)
// dev.startMatch(2)     partida contra o 2 (1 a 3) dev.win()       ganha a partida/desafio na hora
// dev.cellScreen(i)     posição na tela da célula  dev.resetSave()  apaga o progresso
const dev = {
  _auto: false,
  get autoplay() { return this._auto; },
  set autoplay(v) { this._auto = !!v; dropHeld(); charging = null; if (phase === 'turn') thinker = null; },
  loadLevel(n) { newChallenge(n - 1, true); return this.state(); },
  startMatch(n = 1) { newMatch(n - 1); return this.state(); },
  advance(sec, stepT = 1 / 60) {
    const frames = Math.round(sec / stepT);
    for (let i = 0; i < frames; i++) shell.step(stepT);
    shell.resetClock(); shell.render();
    return this.state();
  },
  win() {
    if (mode === 'challenge' && ch) {
      const g = bestChallengeGen(CHALLENGES[ch.i]); let x; do x = g.next(); while (!x.done);
      ch.st = setupChallenge(CHALLENGES[ch.i]);
      for (const m of x.value.moves) ch.st = challengeMove(ch.st, m).st;
      clearAll(); show(ch.st); endOfRound();
    } else if (mode === 'match' && match) {
      clearAll();
      while (!match.over) match.results.push({ score: [300, 0], gray: 0, paper: 'dev' });
      match.roundOver = true; phase = 'over';
      save.games[oppIndex]++; save.wins[oppIndex]++; storeSave(save);
      showScreen('over');
    }
    return this.state();
  },
  cellScreen(i) { const p = cellPos(i).project(camera); return { x: (p.x + 1) / 2 * window.innerWidth, y: (1 - p.y) / 2 * window.innerHeight }; },
  state() {
    const base = { tela: app, modo: mode, fase: phase, painel: panel.visible };
    const st = cur();
    if (!st) return base;
    return {
      ...base,
      adversario: mode === 'match' ? opponent().name : null,
      desafio: mode === 'challenge' ? `${ch.i + 1}: ${CHALLENGES[ch.i].name}` : null,
      rodada: mode === 'match' ? match.index + 1 : null,
      papel: st.paper.name, vez: st.turn === PLAYER ? 'você' : 'computador',
      tinta: st.ink.slice(), gotas: st.drops.length, area: areas(st), areaNaTela: shown ? areas(shown) : null,
      total: mode === 'match' ? [match.total(0), match.total(1)] : null,
      enchendo: charging ? charging.amount : null, celula: hover.cell,
      previa: previewInfo ? previewLines(previewInfo, charging?.amount ?? lastAmount).slice(0, 2).join(' / ') : null,
      estrelas: mode === 'challenge' && chResult ? chResult.stars : null,
      vencedor: mode === 'match' && match.over && phase === 'over' ? (match.winner === PLAYER ? 'você' : match.winner === CPU ? opponent().name : 'empate') : null,
      animando: !!anim || timers.length > 0 || !!cpuMove,
      salvo: { vitorias: save.wins, desafios: save.ch },
    };
  },
  resetSave() { save.wins = [0, 0, 0]; save.games = [0, 0, 0]; save.ch = {}; storeSave(save); },
};
window.dev = dev;
window.aquarela = { dev, get match() { return match; }, get challenge() { return ch; }, save, camera, scene, renderer, world, shell };

goMenu();
shell.start();
