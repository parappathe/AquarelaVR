// Fumaça do main.js: carrega o jogo inteiro no Node com um navegador de mentira (sem WebGL, sem som)
// e confere que menu, partida (com o robô), clique do PC com prévia e desafios funcionam.
import * as nodeModule from 'node:module';

// ---- navegador de mentira ----
function fakeCtx() {
  const fn = () => proxy;
  const proxy = new Proxy(fn, {
    get(_, k) {
      if (k === 'measureText') return (t) => ({ width: String(t).length * 12 });
      if (k === 'canvas') return null;
      return fn;
    },
    set() { return true; },
    apply() { return proxy; },
  });
  return proxy;
}
function fakeElement(tag = 'div') {
  const listeners = {};
  return {
    tagName: tag.toUpperCase(), style: {}, dataset: {}, children: [], textContent: '', innerHTML: '', width: 300, height: 150,
    listeners,
    addEventListener(t, f) { (listeners[t] ||= []).push(f); },
    removeEventListener() {},
    appendChild(c) { this.children.push(c); return c; },
    getContext() { return fakeCtx(); },
    setPointerCapture() {}, releasePointerCapture() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 1280, height: 720 }; },
    dispatch(t, e) { for (const f of listeners[t] || []) f(e); },
  };
}
function installDom() {
  const els = {};
  const winListeners = {};
  const store = new Map();
  const doc = {
    createElement: (t) => fakeElement(t),
    createElementNS: (_, t) => fakeElement(t),
    getElementById: (id) => (els[id] ||= fakeElement('div')),
    body: fakeElement('body'),
    addEventListener() {},
  };
  const win = {
    innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, isSecureContext: false,
    addEventListener(t, f) { (winListeners[t] ||= []).push(f); },
    removeEventListener() {},
    dispatch(t, e) { for (const f of winListeners[t] || []) f(e); },
    requestAnimationFrame: () => 0, cancelAnimationFrame() {},
  };
  globalThis.window = win;
  globalThis.document = doc;
  globalThis.self = win;
  Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'node-teste' }, configurable: true, writable: true });
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  globalThis.requestAnimationFrame = win.requestAnimationFrame;
  return { els, win, store };
}

// Troca só o WebGLRenderer do Three.js por um de mentira (o resto do Three.js é o de verdade).
function installThreeStub() {
  const stub = new URL('./three-stub.js', import.meta.url).href;
  const resolve = (spec, ctx, next) => {
    if (spec.endsWith('vendor/three/three.module.js') && !String(ctx.parentURL || '').endsWith('three-stub.js')) return { url: stub, shortCircuit: true };
    return next(spec, ctx);
  };
  if (nodeModule.registerHooks) nodeModule.registerHooks({ resolve });
  else throw new Error('Node sem module.registerHooks (precisa do Node 22.15 ou mais novo)');
}

export async function smoke() {
  const out = [];
  const ok = (c, m) => out.push([!!c, m]);
  const { els, win, store } = installDom();
  installThreeStub();
  const errors = [];
  const origErr = console.error;
  console.error = (...a) => errors.push(a.join(' '));
  await import('../js/main.js');
  const dev = window.dev;
  const G = window.aquarela;
  const THREE = await import('../vendor/three/three.module.js');
  const { cellPos } = await import('../js/scene.js');
  const { idx } = await import('../js/rules.js');
  ok(dev && typeof dev.advance === 'function', 'main.js carregou e criou window.dev');
  let s = dev.advance(0.5);
  ok(s.tela === 'menu' && s.painel, 'abre no menu principal');
  ok(els.vr.textContent.includes('VR'), `botão de VR avisa que não tem VR aqui ("${els.vr.textContent}")`);
  const waitMine = () => { for (let i = 0; i < 80 && !(dev.state().fase === 'turn' && dev.state().vez === 'você'); i++) dev.advance(0.25); return dev.advance(0.3); };

  // Partida: segurar o clique enche a gota, soltar pinga
  s = dev.startMatch(1);
  ok(s.tela === 'play' && s.adversario === 'Dona Cida' && s.tinta.join() === '12,12', `partida contra a Dona Cida com 12 de tinta cada (${s.tinta})`);
  s = waitMine();
  ok(s.fase === 'turn', 'chega a sua vez');
  const canvasEl = G.renderer.domElement;
  const cell = idx(2, 8);      // livre em todos os papéis
  const cp = dev.cellScreen(cell);
  canvasEl.dispatch('pointermove', { clientX: cp.x, clientY: cp.y });
  s = dev.advance(0.05);
  ok(s.celula === cell && s.previa && s.previa.startsWith('Gota'), `mouse no papel mostra a prévia ("${s.previa}")`);
  canvasEl.dispatch('pointerdown', { clientX: cp.x, clientY: cp.y, button: 0 });
  s = dev.advance(0.7);
  ok(s.enchendo >= 3 && s.enchendo <= 4, `segurar 0,7 s enche a gota (${s.enchendo})`);
  const amount = s.enchendo;
  const ink0 = s.tinta[0];
  win.dispatch('pointerup', {});
  s = dev.advance(2.5);
  ok(s.tinta[0] === ink0 - amount && G.match.round.drops.some(d => d.owner === 0 && d.cell === cell), `soltar pinga a gota de ${amount} na célula apontada (tinta ${s.tinta[0]})`);
  ok(s.areaNaTela && s.areaNaTela[0] > 10, `a tinta escorreu e aparece no papel (${s.areaNaTela})`);

  // tecla 2: gota exata
  s = waitMine();
  const cell2 = idx(17, 8);
  const cp2 = dev.cellScreen(cell2);
  canvasEl.dispatch('pointermove', { clientX: cp2.x, clientY: cp2.y });
  dev.advance(0.05);
  const ink1 = dev.state().tinta[0];
  win.dispatch('keydown', { key: '2' });
  s = dev.advance(2.5);
  ok(s.tinta[0] === ink1 - 2, 'tecla 2 pinga gota de 2');

  // VR (controle de mentira): pega o conta-gotas com o aperto, leva até o papel, gatilho enche e pinga
  s = waitMine();
  const entry = G.shell.ctrls[1];
  entry.source = { handedness: 'right', gamepad: { buttons: [], axes: [0, 0, 0, 0] } };
  entry.side = 'right';
  const rigInv = new THREE.Matrix4().copy(G.shell.rig.matrixWorld).invert();
  const setGrab = (p) => { entry.grip.position.copy(p.clone().add(new THREE.Vector3(0, 0.02, 0.04)).applyMatrix4(rigInv)); entry.ctrl.position.copy(entry.grip.position); G.shell.rig.updateMatrixWorld(true); };
  const pip = G.world.pipettes[0];
  setGrab(pip.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.09, 0)));
  G.shell.hooks.squeezeStart(entry);
  const cell3 = idx(2, 17);
  setGrab(cellPos(cell3).add(new THREE.Vector3(0, 0.17, 0)));
  s = dev.advance(0.05);
  ok(s.celula === cell3, `VR: com o conta-gotas em cima da célula ${cell3} (apontada: ${s.celula})`);
  const ink2 = s.tinta[0];
  G.shell.hooks.selectStart(entry);
  s = dev.advance(0.3);
  ok(s.enchendo >= 1, `VR: gatilho segurado enche a gota (${s.enchendo})`);
  G.shell.hooks.selectEnd(entry);
  s = dev.advance(2.5);
  ok(s.tinta[0] < ink2 && G.match.round.drops.some(d => d.owner === 0 && d.cell === cell3), 'VR: soltar o gatilho pinga embaixo da ponta');
  G.shell.hooks.squeezeEnd(entry);
  entry.source = null; entry.side = null;

  // o resto da partida o robô joga sozinho (passa pela animação e pela secagem)
  dev.autoplay = true;
  let guard = 0, sawDry = false;
  while (!dev.state().vencedor && guard++ < 2000) { s = dev.advance(0.25); if (s.fase === 'dry') sawDry = true; }
  s = dev.state();
  ok(s.vencedor, `partida terminou sozinha (${s.total?.join(' x ')}, vencedor: ${s.vencedor})`);
  ok(sawDry, 'o papel secou no fim da rodada');
  ok(G.match.results.length === 2 && G.match.results.every(r => r.score[0] > 20 && r.score[1] > 20), `2 rodadas com área para os dois (${G.match.results.map(r => r.score.join('-')).join(', ')})`);
  ok(JSON.parse(store.get('aquarelavr.v1') || '{"ch":{},"games":[]}').games[0] === 1, 'resultado salvo no localStorage');

  // Desafios: carregados pelo mesmo caminho do menu, e o robô resolve todos dentro do jogo
  const { CHALLENGES, setupChallenge } = await import('../js/challenges.js');
  const { areas } = await import('../js/rules.js');
  let stars = [], loadedOk = true;
  for (let n = 1; n <= CHALLENGES.length; n++) {
    s = dev.loadLevel(n);
    const c = CHALLENGES[n - 1];
    const ref = areas(setupChallenge(c));
    if (s.tinta[0] !== c.ink || s.area.join() !== ref.join() || s.areaNaTela.join() !== ref.join()) loadedOk = false;
    let g = 0;
    while (dev.state().estrelas == null && g++ < 600) dev.advance(0.25);
    stars.push(dev.state().estrelas);
  }
  ok(loadedOk, 'cada desafio aparece montado (tinta e manchas azuis certas na tela)');
  ok(stars.every(x => x === 3), `robô tira 3 estrelas nos ${CHALLENGES.length} desafios dentro do jogo (${stars.join(' ')})`);
  ok(Object.keys(JSON.parse(store.get('aquarelavr.v1') || '{"ch":{},"games":[]}').ch).length === CHALLENGES.length, 'estrelas dos desafios salvas');

  dev.autoplay = false;
  dev.loadLevel(9);
  dev.win();
  let g2 = 0;
  while (dev.state().estrelas == null && g2++ < 200) dev.advance(0.25);
  ok(dev.state().estrelas === 3, 'dev.win() resolve o desafio');
  dev.startMatch(2);
  s = dev.win();
  ok(s.vencedor === 'você', 'dev.win() ganha a partida');

  dev.startMatch(3);
  dev.advance(0.2);
  win.dispatch('keydown', { key: 'Escape' });
  ok(dev.state().tela === 'paused', 'Esc pausa');
  win.dispatch('keydown', { key: 'Escape' });
  ok(dev.state().tela === 'play', 'Esc de novo continua');
  const loop = G.renderer._loop;
  for (let i = 0; i < 5; i++) loop?.(performance.now() + i * 16);
  ok(typeof loop === 'function', 'laço de animação ligado');
  console.error = origErr;
  ok(errors.length === 0, `sem erros no console (${errors.slice(0, 2).join(' | ')})`);
  return out;
}
