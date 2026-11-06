// Cenário da Aquarela: ateliê claro num sótão de manhã. Claraboia, janelão com jardim, cavaletes,
// potes de pincel, plantas, varal de desenhos. Na mesa: a folha de papel molhado presa com fita,
// os conta-gotas de cada um nos potes de tinta e a tela do placar num cavalete.
import * as THREE from '../vendor/three/three.module.js';
import { N, PLAYER, CPU, GRAY } from './rules.js';
import { makeAvatar } from './avatar.js';

export const TABLE = { x: 0, z: -0.5, top: 0.88, w: 1.1, d: 0.9 };
export const CELL = 0.03;                                  // 20 células = 60 cm
export const PAPER_Y = TABLE.top + 0.004;
export const INK_RGB = [[214, 52, 92], [36, 104, 214], [128, 118, 104]];   // magenta, azul, lama
export const TEAM_HEX = [0xd6345c, 0x2468d6];
// pote de tinta de cada um (onde o conta-gotas descansa)
export const JAR = [new THREE.Vector3(TABLE.x + 0.4, TABLE.top, TABLE.z + 0.3), new THREE.Vector3(TABLE.x - 0.4, TABLE.top, TABLE.z - 0.3)];

export function cellPos(i, out = new THREE.Vector3()) {
  const x = i % N, y = Math.floor(i / N);
  return out.set(TABLE.x + (x - (N - 1) / 2) * CELL, PAPER_Y, TABLE.z - (y - (N - 1) / 2) * CELL);
}
export function cellAtXZ(x, z) {
  const gx = Math.round((x - TABLE.x) / CELL + (N - 1) / 2), gy = Math.round(-(z - TABLE.z) / CELL + (N - 1) / 2);
  if (gx < 0 || gy < 0 || gx >= N || gy >= N) return -1;
  return gy * N + gx;
}

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, { repeat = null } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  t.anisotropy = 4;
  return t;
}
function rand(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
function woodCanvas(w, h, base, dark, seed, planks = 0) {
  const c = canvas(w, h), g = c.getContext('2d'), r = rand(seed);
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 70; i++) {
    g.strokeStyle = `rgba(${dark},${0.04 + r() * 0.1})`; g.lineWidth = 1 + r() * 3;
    const y = r() * h; g.beginPath(); g.moveTo(0, y);
    for (let x = 0; x <= w; x += 32) g.lineTo(x, y + Math.sin(x * 0.01 + i) * 5);
    g.stroke();
  }
  if (planks) { g.strokeStyle = `rgba(${dark},0.4)`; g.lineWidth = 3; for (let k = 0; k <= planks; k++) { const y = k * h / planks; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); } }
  return c;
}

export function buildWorld() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf4efe6);
  scene.fog = new THREE.Fog(0xf4efe6, 9, 22);

  const hemi = new THREE.HemisphereLight(0xffffff, 0xc8b8a0, 1.5);
  scene.add(hemi);
  const sky = new THREE.DirectionalLight(0xfff4e0, 1.6);   // luz da claraboia, sem sombra
  sky.position.set(0.6, 4, 0.4);
  scene.add(sky);
  const fill = new THREE.DirectionalLight(0xdfe8ff, 0.5); fill.position.set(-3, 2, -2); scene.add(fill);

  // Sótão: piso de tábua clara, paredes caiadas, teto inclinado com vigas
  const room = new THREE.Group(); scene.add(room);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: tex(woodCanvas(512, 512, '#d8b88a', '120,80,40', 3, 8), { repeat: [3, 3] }) }));
  floor.position.set(0, 0, -1); room.add(floor);
  const wallMat = new THREE.MeshLambertMaterial({ color: 0xf6f1e8 });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(8, 3.2), wallMat); back.position.set(0, 1.6, -4.4); room.add(back);
  const front = new THREE.Mesh(new THREE.PlaneGeometry(8, 3.2), wallMat); front.position.set(0, 1.6, 2.6); front.rotation.y = Math.PI; room.add(front);
  for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(7, 3.2), wallMat); w.position.set(s * 3.8, 1.6, -0.9); w.rotation.y = -s * Math.PI / 2; room.add(w); }
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(8, 7).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xefe6d6 }));
  ceil.position.set(0, 3.2, -0.9); room.add(ceil);
  const beamMat = new THREE.MeshLambertMaterial({ color: 0xa07a50 });
  for (let k = -3; k <= 2; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.14, 0.14), beamMat); b.position.set(0, 3.1, k * 1.1 - 0.5); room.add(b); }
  // claraboia em cima da mesa: céu azul claro
  const skyC = canvas(256, 256), sg = skyC.getContext('2d');
  const gr = sg.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#9fd0ff'); gr.addColorStop(1, '#e8f6ff'); sg.fillStyle = gr; sg.fillRect(0, 0, 256, 256);
  sg.fillStyle = 'rgba(255,255,255,0.85)'; for (const [x, y, r] of [[60, 80, 30], [90, 70, 36], [130, 90, 28], [190, 170, 24], [215, 160, 30]]) { sg.beginPath(); sg.arc(x, y, r, 0, Math.PI * 2); sg.fill(); }
  const skylight = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.2).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex(skyC), fog: false }));
  skylight.position.set(0, 3.18, -0.6); room.add(skylight);
  // facho de luz da claraboia (bem leve)
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 1.0, 2.3, 4, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff8e0, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide }));
  shaft.rotation.y = Math.PI / 4; shaft.position.set(0, 2.0, -0.6); room.add(shaft);
  // janelão no fundo com jardim
  const winC = canvas(512, 320), wg = winC.getContext('2d');
  const wsky = wg.createLinearGradient(0, 0, 0, 320); wsky.addColorStop(0, '#8cc8f0'); wsky.addColorStop(0.6, '#dff2ff'); wg.fillStyle = wsky; wg.fillRect(0, 0, 512, 320);
  const wr = rand(5);
  for (let k = 0; k < 14; k++) { wg.fillStyle = ['#6aa84a', '#7fb85a', '#5a9a40'][k % 3]; wg.beginPath(); wg.arc(wr() * 512, 230 + wr() * 40, 40 + wr() * 50, 0, Math.PI * 2); wg.fill(); }
  wg.fillStyle = '#8cc060'; wg.fillRect(0, 270, 512, 50);
  for (let k = 0; k < 40; k++) { wg.fillStyle = ['#ff7aa0', '#ffd23a', '#ffffff', '#c87aff'][k % 4]; wg.beginPath(); wg.arc(wr() * 512, 285 + wr() * 30, 4, 0, Math.PI * 2); wg.fill(); }
  const win = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.6), new THREE.MeshBasicMaterial({ map: tex(winC), fog: false }));
  win.position.set(-0.4, 1.7, -4.38); room.add(win);
  const frameMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  for (const [x, y, w, h] of [[-0.4, 2.52, 2.7, 0.08], [-0.4, 0.88, 2.7, 0.08], [-1.73, 1.7, 0.08, 1.7], [0.93, 1.7, 0.08, 1.7], [-0.4, 1.7, 0.05, 1.6], [-0.4, 1.7, 2.6, 0.05]]) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05), frameMat); f.position.set(x, y, -4.36); room.add(f);
  }
  // cavaletes com telas coloridas, varal de desenhos, plantas e potes
  const easelMat = new THREE.MeshLambertMaterial({ color: 0xb08858 });
  function easel(x, z, ry, art) {
    const g = new THREE.Group();
    for (const [lx, rz] of [[-0.3, 0.1], [0.3, -0.1]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.8, 0.04), easelMat); l.position.set(lx, 0.9, 0); l.rotation.z = rz; g.add(l); }
    const bl = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.7, 0.04), easelMat); bl.position.set(0, 0.85, -0.3); bl.rotation.x = -0.25; g.add(bl);
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.03, 0.06), easelMat); shelf.position.set(0, 0.95, 0.04); g.add(shelf);
    if (art) { const t = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.5), new THREE.MeshLambertMaterial({ map: art })); t.position.set(0, 1.23, 0.05); g.add(t); }
    g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g);
    return g;
  }
  function artCanvas(seed, cols) {
    const c = canvas(256, 192), g = c.getContext('2d'), r = rand(seed);
    g.fillStyle = '#fbf8f0'; g.fillRect(0, 0, 256, 192);
    for (let k = 0; k < 9; k++) { g.fillStyle = cols[k % cols.length]; g.globalAlpha = 0.35 + r() * 0.3; g.beginPath(); g.ellipse(r() * 256, r() * 192, 20 + r() * 50, 15 + r() * 40, r() * 3, 0, Math.PI * 2); g.fill(); }
    g.globalAlpha = 1; return c;
  }
  easel(2.4, -2.2, -0.6, tex(artCanvas(3, ['#ff8aa0', '#ffd27a', '#8ad0ff'])));
  easel(-2.6, -1.4, 0.7, tex(artCanvas(8, ['#7ac08a', '#2a7ad6', '#f0a050'])));
  const cordMat = new THREE.LineBasicMaterial({ color: 0x8a7a6a });
  const A = new THREE.Vector3(-3.7, 2.5, -3.2), B = new THREE.Vector3(-1.5, 2.5, -4.3);
  room.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([A, B]), cordMat));
  for (let k = 0; k < 4; k++) {
    const p = A.clone().lerp(B, (k + 0.6) / 4.4); p.y -= 0.22;
    const d = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.36), new THREE.MeshLambertMaterial({ map: tex(artCanvas(20 + k, ['#ff6a8a', '#4a9aff', '#ffcc4a', '#6ac06a'])), side: THREE.DoubleSide }));
    d.position.copy(p); d.lookAt(p.x + 1, p.y, p.z + 0.5); room.add(d);
  }
  const potMat = new THREE.MeshLambertMaterial({ color: 0xc8704a });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x4a9a4a });
  for (const [x, z, s] of [[3.2, -3.6, 1.2], [-3.2, -3.8, 1], [3.3, 1.2, 0.9]]) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * s, 0.15 * s, 0.35 * s, 12), potMat); pot.position.set(x, 0.175 * s, z); room.add(pot);
    for (let k = 0; k < 7; k++) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.16 * s, 8, 6).scale(0.6, 1.6, 0.3), leafMat); l.position.set(x + Math.cos(k) * 0.12 * s, 0.6 * s, z + Math.sin(k) * 0.12 * s); l.rotation.set(Math.sin(k) * 0.5, k, Math.cos(k) * 0.5); room.add(l); }
  }

  // ---------- Mesa de trabalho ----------
  const woodMat = new THREE.MeshStandardMaterial({ map: tex(woodCanvas(512, 512, '#c8a070', '110,70,30', 11)), roughness: 0.7 });
  const top = new THREE.Mesh(new THREE.BoxGeometry(TABLE.w, 0.05, TABLE.d), woodMat);
  top.position.set(TABLE.x, TABLE.top - 0.025, TABLE.z); scene.add(top);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.06, TABLE.top - 0.05, 0.06), woodMat); l.position.set(TABLE.x + x * (TABLE.w / 2 - 0.06), (TABLE.top - 0.05) / 2, TABLE.z + z * (TABLE.d / 2 - 0.06)); scene.add(l); }
  // respingos antigos de tinta na mesa
  const splC = canvas(512, 512), spg = splC.getContext('2d'), sr = rand(17);
  for (let k = 0; k < 40; k++) { spg.fillStyle = ['rgba(214,52,92,0.3)', 'rgba(36,104,214,0.3)', 'rgba(240,180,40,0.3)', 'rgba(60,160,90,0.3)'][k % 4]; spg.beginPath(); spg.arc(sr() * 512, sr() * 512, 2 + sr() * 9, 0, Math.PI * 2); spg.fill(); }
  const splat = new THREE.Mesh(new THREE.PlaneGeometry(TABLE.w, TABLE.d).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex(splC), transparent: true, depthWrite: false }));
  splat.position.set(TABLE.x, TABLE.top + 0.001, TABLE.z); scene.add(splat);

  // Papel: textura de grão + camada de tinta (canvas atualizado pelo main.js) + camada da prévia
  const PX = 8, SIZE = N * PX;
  const paperC = canvas(256, 256), pg = paperC.getContext('2d'), pr = rand(23);
  pg.fillStyle = '#fbf8f1'; pg.fillRect(0, 0, 256, 256);
  for (let k = 0; k < 2500; k++) { pg.fillStyle = `rgba(${150 + pr() * 60},${140 + pr() * 60},${120 + pr() * 50},${0.05 + pr() * 0.08})`; pg.fillRect(pr() * 256, pr() * 256, 1 + pr() * 2, 1 + pr() * 2); }
  const paperTex = tex(paperC);
  const paperW = N * CELL;
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(paperW + 0.03, paperW + 0.03).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: paperTex, roughness: 0.95 }));
  paper.position.set(TABLE.x, PAPER_Y - 0.002, TABLE.z); scene.add(paper);
  // fita crepe nas bordas
  const tapeMat = new THREE.MeshLambertMaterial({ color: 0xe8d8a8 });
  for (const [x, z, w, d] of [[0, -1, 1, 0], [0, 1, 1, 0], [-1, 0, 0, 1], [1, 0, 0, 1]]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(w ? paperW + 0.06 : 0.035, 0.002, d ? paperW + 0.06 : 0.035), tapeMat);
    t.position.set(TABLE.x + x * (paperW / 2 + 0.012), PAPER_Y, TABLE.z + z * (paperW / 2 + 0.012)); scene.add(t);
  }
  const inkC = canvas(SIZE, SIZE), smallC = canvas(N, N);
  const inkTex = tex(inkC);
  const ink = new THREE.Mesh(new THREE.PlaneGeometry(paperW, paperW).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: inkTex, transparent: true, depthWrite: false }));
  ink.position.set(TABLE.x, PAPER_Y + 0.0005, TABLE.z); ink.renderOrder = 2; scene.add(ink);
  const ghostC = canvas(SIZE, SIZE), ghostSmall = canvas(N, N);
  const ghostTex = tex(ghostC);
  const ghost = new THREE.Mesh(new THREE.PlaneGeometry(paperW, paperW).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: ghostTex, transparent: true, depthWrite: false, opacity: 0.8 }));
  ghost.position.set(TABLE.x, PAPER_Y + 0.001, TABLE.z); ghost.renderOrder = 3; ghost.visible = false; scene.add(ghost);
  const hit = new THREE.Mesh(new THREE.PlaneGeometry(paperW, paperW).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.set(TABLE.x, PAPER_Y + 0.001, TABLE.z); scene.add(hit);

  // desenha o estado (own/conc) numa imagem pequena e amplia com suavização: borda de aquarela
  function paintSmall(sc, own, conc, waxArr, mixFrom = null, u = 1) {
    const g = sc.getContext('2d');
    const img = g.createImageData(N, N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, j = ((N - 1 - y) * N + x) * 4;
      let r = 0, gg = 0, b = 0, a = 0;
      const put = (o, c, w) => {
        if (o < 0) return;
        const rgb = INK_RGB[o];
        const al = o === GRAY ? 0.7 : 0.42 + 0.5 * Math.min(1, c / 0.5);
        r += rgb[0] * al * w; gg += rgb[1] * al * w; b += rgb[2] * al * w; a += al * w;
      };
      if (mixFrom) { put(mixFrom.own[i], mixFrom.conc[i], 1 - u); put(own[i], conc[i], u); } else put(own[i], conc[i], 1);
      if (waxArr && waxArr[i]) { r = 226; gg = 204; b = 140; a = 0.95; }
      if (a > 0) { img.data[j] = r / a; img.data[j + 1] = gg / a; img.data[j + 2] = b / a; img.data[j + 3] = Math.min(255, a * 255); }
    }
    g.putImageData(img, 0, 0);
  }
  function blowUp(sc, big) {
    const g = big.getContext('2d');
    g.clearRect(0, 0, SIZE, SIZE);
    g.imageSmoothingEnabled = true;
    g.drawImage(sc, 0, 0, SIZE, SIZE);
  }
  function drawInk(st, mixFrom = null, u = 1) {
    paintSmall(smallC, st.own, st.conc, st.wax, mixFrom, u);
    blowUp(smallC, inkC);
    inkTex.needsUpdate = true;
  }
  // prévia: só as células que mudam de dono, com a cor nova
  function drawGhost(cur, next) {
    const g = ghostSmall.getContext('2d');
    const img = g.createImageData(N, N);
    let any = false;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, j = ((N - 1 - y) * N + x) * 4;
      if (next.own[i] === cur.own[i] || next.own[i] < 0) continue;
      const rgb = INK_RGB[next.own[i]];
      img.data[j] = rgb[0]; img.data[j + 1] = rgb[1]; img.data[j + 2] = rgb[2]; img.data[j + 3] = 200; any = true;
    }
    g.putImageData(img, 0, 0);
    blowUp(ghostSmall, ghostC);
    ghostTex.needsUpdate = true;
    ghost.visible = any;
  }
  // círculo-alvo dos desafios (tracejado a lápis)
  const zoneLine = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: 0x5a4a3a, dashSize: 0.012, gapSize: 0.008 }));
  zoneLine.visible = false; scene.add(zoneLine);
  function setZone(z) {
    if (!z) { zoneLine.visible = false; return; }
    const pts = [];
    for (let k = 0; k < 64; k++) {
      const a = k / 64 * Math.PI * 2;
      const gx = z.cx + Math.cos(a) * (z.r + 0.5), gy = z.cy + Math.sin(a) * (z.r + 0.5);
      pts.push(new THREE.Vector3(TABLE.x + (gx - (N - 1) / 2) * CELL, PAPER_Y + 0.0015, TABLE.z - (gy - (N - 1) / 2) * CELL));
    }
    zoneLine.geometry.dispose();
    zoneLine.geometry = new THREE.BufferGeometry().setFromPoints(pts);
    zoneLine.computeLineDistances();
    zoneLine.visible = true;
  }
  // marca da célula apontada e a gota que cresce
  const aim = new THREE.Mesh(new THREE.RingGeometry(0.012, 0.016, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x3a2a1a, transparent: true, opacity: 0.8, depthWrite: false }));
  aim.visible = false; aim.renderOrder = 4; scene.add(aim);

  // ---------- Conta-gotas e potes ----------
  const glass = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, roughness: 0.1 });
  const bulbMat = [new THREE.MeshStandardMaterial({ color: 0xd6345c, roughness: 0.5 }), new THREE.MeshStandardMaterial({ color: 0x2468d6, roughness: 0.5 })];
  const dropMat = [new THREE.MeshStandardMaterial({ color: 0xd6345c, roughness: 0.15, transparent: true, opacity: 0.9 }), new THREE.MeshStandardMaterial({ color: 0x2468d6, roughness: 0.15, transparent: true, opacity: 0.9 })];
  const dropGeo = new THREE.SphereGeometry(1, 16, 12);
  function makePipette(team) {
    const g = new THREE.Group();     // origem na ponta
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.0025, 0.1, 12).translate(0, 0.05, 0), glass); g.add(tube);
    const inkIn = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.0022, 0.05, 10).translate(0, 0.027, 0), dropMat[team]); g.add(inkIn);
    const bulb = new THREE.Mesh(new THREE.CapsuleGeometry(0.011, 0.03, 4, 12), bulbMat[team]); bulb.position.y = 0.125; g.add(bulb);
    const drop = new THREE.Mesh(dropGeo, dropMat[team]); drop.scale.setScalar(0.001); drop.position.y = -0.002; g.add(drop);
    g.userData = { drop, team };
    return g;
  }
  const jarMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, roughness: 0.1 });
  const pipettes = [];
  for (const team of [PLAYER, CPU]) {
    const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.032, 0.07, 18, 1, true), jarMat); jar.position.copy(JAR[team]).add(new THREE.Vector3(0, 0.035, 0)); scene.add(jar);
    const paint = new THREE.Mesh(new THREE.CylinderGeometry(0.031, 0.031, 0.04, 18), dropMat[team]); paint.position.copy(JAR[team]).add(new THREE.Vector3(0, 0.02, 0)); scene.add(paint);
    const p = makePipette(team); p.position.copy(JAR[team]).add(new THREE.Vector3(0, 0.03, 0)); scene.add(p); pipettes.push(p);
    p.userData.home = p.position.clone();
    p.userData.paint = paint;
  }
  // gota caindo
  const falling = [0, 1].map(t => { const m = new THREE.Mesh(dropGeo, dropMat[t]); m.visible = false; scene.add(m); return m; });

  // Placar: tela num cavalete à direita
  const boardC = canvas(1024, 512), boardTex = tex(boardC);
  const boardEasel = easel(TABLE.x + 1.35, TABLE.z - 1.3, -0.55, null);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.45), new THREE.MeshBasicMaterial({ map: boardTex }));
  board.position.set(0, 1.32, 0.06); boardEasel.add(board);
  function drawBoard({ names, scores, round, footer }) {
    const g = boardC.getContext('2d');
    g.fillStyle = '#fbf8f0'; g.fillRect(0, 0, 1024, 512);
    const r = rand(5);
    for (let k = 0; k < 14; k++) { g.fillStyle = k % 2 ? 'rgba(214,52,92,0.08)' : 'rgba(36,104,214,0.08)'; g.beginPath(); g.arc(r() * 1024, r() * 512, 40 + r() * 80, 0, Math.PI * 2); g.fill(); }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#5a4a3a'; g.font = 'italic bold 60px Georgia, serif'; g.fillText('Aquarela', 512, 62);
    const cols = ['#d6345c', '#2468d6'];
    for (const k of [0, 1]) {
      const x = k ? 770 : 254;
      g.fillStyle = cols[k]; g.font = 'bold 44px sans-serif'; g.fillText(names[k], x, 150);
      g.font = 'bold 150px Georgia, serif'; g.fillText(String(scores[k]), x, 285);
    }
    g.fillStyle = '#5a4a3a'; g.font = '36px sans-serif'; g.fillText(round || '', 512, 285);
    g.font = '32px sans-serif'; g.fillText(footer || '', 512, 450);
    boardTex.needsUpdate = true;
  }

  // ---------- Adversário (em pé do outro lado) ----------
  const styles = {
    careful: () => {
      const g = new THREE.Group();
      const hair = new THREE.MeshLambertMaterial({ color: 0xb8b0a8 });
      const top = new THREE.Mesh(new THREE.SphereGeometry(0.137, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), hair); top.position.y = 0.015; g.add(top);
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), hair); bun.position.set(0, 0.13, -0.05); g.add(bun);
      const pencil = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.16, 6), new THREE.MeshLambertMaterial({ color: 0xffc83a })); pencil.position.set(0, 0.13, -0.05); pencil.rotation.z = 1.1; g.add(pencil);
      const fr = new THREE.MeshBasicMaterial({ color: 0x4a3a2a });
      for (const x of [-0.045, 0.045]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.029, 0.004, 6, 18), fr); r.position.set(x, 0.02, 0.134); g.add(r); }
      return g;
    },
    risky: () => {
      const g = new THREE.Group();
      const beret = new THREE.Mesh(new THREE.SphereGeometry(0.15, 20, 10).scale(1.1, 0.35, 1.1), new THREE.MeshLambertMaterial({ color: 0xc83a2a })); beret.position.set(0.02, 0.11, -0.01); beret.rotation.z = -0.25; g.add(beret);
      const nub = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.03, 6), beret.material); nub.position.set(0.02, 0.16, 0); g.add(nub);
      const mus = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.009, 6, 16, Math.PI), new THREE.MeshLambertMaterial({ color: 0x2a1a10 })); mus.position.set(0, -0.03, 0.125); g.add(mus);
      return g;
    },
    master: () => {
      const g = new THREE.Group();
      const white = new THREE.MeshLambertMaterial({ color: 0xf0f0f0 });
      const beard = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), white); beard.position.set(0, -0.04, 0.05); beard.scale.set(1, 1.3, 1); g.add(beard);
      const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.15, 0.05, 20), new THREE.MeshLambertMaterial({ color: 0xe8d8a8 })); hat.position.y = 0.11; g.add(hat);
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.01, 24), hat.material); brim.position.y = 0.09; g.add(brim);
      return g;
    },
  };
  const avatar = makeAvatar({ styles, headY: 1.56, handZ: 0.3, standing: true, pants: 0x5a5a6a });
  avatar.group.position.set(TABLE.x, 0, TABLE.z - 0.82);
  avatar.hands.forEach(h => { h.position.y = TABLE.top + 0.04; });
  avatar.arms.forEach(a => { a.position.y = TABLE.top + 0.13; });
  scene.add(avatar.group);

  function animate(dt, time) { shaft.material.opacity = 0.06 + 0.015 * Math.sin(time * 0.7); }

  return { scene, hit, drawInk, drawGhost, ghost, setZone, aim, pipettes, falling, makePipette, drawBoard, avatar, animate };
}
