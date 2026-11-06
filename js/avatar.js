// Boneco do adversário, sentado do outro lado da mesa: corpo, cabeça com olhos que piscam e seguem
// o alvo, sobrancelhas, boca com expressões, braços apoiados e um enfeite por personalidade.
import * as THREE from '../vendor/three/three.module.js';

// styles: { chave: (mats) => THREE.Group } — o enfeite de cabeça de cada adversário (cabelo, chapéu...).
export function makeAvatar({ styles = {}, handZ = 0.36, headY = 1.3, skin = 0xe0b08a, standing = false, pants = 0x3a3a4a } = {}) {
  const group = new THREE.Group();
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });
  const shirt = new THREE.MeshLambertMaterial({ color: 0x6fa8dc });
  const dark = new THREE.MeshBasicMaterial({ color: 0x1a1008 });
  const mats = { skin: skinMat, shirt, dark };
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.22, 0.55, 20), shirt);
  body.position.y = headY - 0.48; group.add(body);
  const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.1, 0.5, 0.8), shirt);
  shoulders.position.y = headY - 0.22; group.add(shoulders);
  if (standing) {
    // em pé: quadril e pernas até o chão
    const pantsMat = new THREE.MeshLambertMaterial({ color: pants });
    const hipY = headY - 0.76;
    const hip = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.19, 0.16, 18), pantsMat); hip.position.y = hipY + 0.04; group.add(hip);
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, hipY - 0.1, 4, 10), pantsMat);
      leg.position.set(s * 0.09, hipY / 2, 0); group.add(leg);
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.2), new THREE.MeshLambertMaterial({ color: 0x2a1a10 }));
      shoe.position.set(s * 0.09, 0.03, 0.04); group.add(shoe);
    }
  }
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.1, 12), skinMat);
  neck.position.y = headY - 0.16; group.add(neck);
  const headG = new THREE.Group();
  headG.position.y = headY; group.add(headG);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 16), skinMat);
  head.scale.set(1, 1.08, 1); headG.add(head);
  const eyeW = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const eyes = [], pupils = [], brows = [];
  for (const x of [-0.045, 0.045]) {
    const e = new THREE.Group();
    const w = new THREE.Mesh(new THREE.SphereGeometry(0.026, 12, 8), eyeW); e.add(w);
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.013, 10, 6), dark); p.position.z = 0.018; e.add(p);
    e.position.set(x, 0.02, 0.108); headG.add(e); eyes.push(e); pupils.push(p);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.011, 0.012), dark);
    b.position.set(x, 0.065, 0.122); headG.add(b); brows.push(b);
  }
  const mouthMat = new THREE.MeshBasicMaterial({ color: 0x6a2a1a });
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.008, 6, 16, Math.PI), mouthMat);
  mouth.position.set(0, -0.055, 0.115); mouth.rotation.z = Math.PI; headG.add(mouth);
  const mouthO = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.007, 6, 14), mouthMat);
  mouthO.position.set(0, -0.06, 0.118); mouthO.visible = false; headG.add(mouthO);
  const mouthFlat = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.009, 0.01), mouthMat);
  mouthFlat.position.set(0, -0.06, 0.122); mouthFlat.visible = false; headG.add(mouthFlat);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), skinMat); nose.position.set(0, -0.01, 0.13); headG.add(nose);
  const cheeks = [];
  const blushMat = new THREE.MeshBasicMaterial({ color: 0xff8a8a, transparent: true, opacity: 0 });
  for (const x of [-0.075, 0.075]) { const c = new THREE.Mesh(new THREE.CircleGeometry(0.02, 12), blushMat); c.position.set(x, -0.025, 0.112); c.rotation.y = x > 0 ? 0.5 : -0.5; headG.add(c); cheeks.push(c); }
  // braços apoiados na mesa
  const arms = [], hands = [];
  for (const s of [-1, 1]) {
    const a = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.32, 4, 10), shirt);
    a.position.set(s * 0.2, headY - 0.44, 0.17); a.rotation.x = Math.PI / 2.6; a.rotation.z = s * 0.25; group.add(a); arms.push(a);
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), skinMat); h.position.set(s * 0.13, headY - 0.5, handZ); group.add(h); hands.push(h);
  }
  const parts = {};
  for (const [k, fn] of Object.entries(styles)) { parts[k] = fn(mats); parts[k].visible = false; headG.add(parts[k]); }
  // balão de "pensando"
  const dotsMat = new THREE.MeshBasicMaterial({ color: 0xfff6e0, transparent: true, opacity: 0.9 });
  const dots = [];
  for (let k = 0; k < 3; k++) { const d = new THREE.Mesh(new THREE.SphereGeometry(0.018 + k * 0.006, 10, 8), dotsMat); d.position.set(0.16 + k * 0.05, 0.16 + k * 0.05, 0); headG.add(d); dots.push(d); }

  const state = { mood: 0, moodT: 0, thinking: false, blink: 2, expr: null, exprT: 0, surprise: 0 };
  function setStyle(style, color) {
    for (const k of Object.keys(parts)) parts[k].visible = k === style;
    shirt.color.set(color);
  }
  // +1 feliz, -1 triste, 'surpresa'
  function react(mood, sec = 1.6) {
    if (mood === 'surpresa') { state.surprise = sec; return; }
    state.mood = mood; state.moodT = sec;
  }
  // Expressão escolhida (para quem blefa): { mouth: 'smile'|'frown'|'flat'|'o'|'smirk', brows: 'up'|'down'|'flat'|'one', eyes: 'normal'|'narrow'|'wide', blush, look }
  function setExpression(e, sec = 3) { state.expr = e; state.exprT = sec; }
  function update(dt, time, lookAt) {
    state.blink -= dt;
    const blink = state.blink < 0.12;
    if (state.blink < 0) state.blink = 2 + Math.random() * 3;
    state.moodT = Math.max(0, state.moodT - dt);
    state.surprise = Math.max(0, state.surprise - dt);
    state.exprT = Math.max(0, state.exprT - dt);
    const m = state.moodT > 0 ? state.mood : 0;
    const ex = state.exprT > 0 ? state.expr : null;
    if (lookAt) {
      const local = group.worldToLocal(lookAt.clone()).sub(headG.position);
      const yaw = Math.atan2(local.x, local.z), pitch = Math.atan2(local.y, Math.hypot(local.x, local.z));
      headG.rotation.y += (THREE.MathUtils.clamp(yaw, -0.8, 0.8) - headG.rotation.y) * Math.min(1, dt * 4);
      headG.rotation.x += (THREE.MathUtils.clamp(-pitch, -0.6, 0.6) - headG.rotation.x) * Math.min(1, dt * 4);
    }
    headG.rotation.z = state.thinking ? Math.sin(time * 1.5) * 0.12 : m < 0 ? Math.sin(time * 6) * 0.1 : (ex?.tilt || 0);
    headG.position.y = headY + Math.sin(time * 1.7) * 0.006 + (m > 0 ? Math.abs(Math.sin(time * 9)) * 0.04 : 0) - (m < 0 ? 0.03 : 0);
    // olhos
    const eyeMode = state.surprise > 0 ? 'wide' : ex?.eyes || 'normal';
    for (const e of eyes) e.scale.y = blink ? 0.15 : eyeMode === 'narrow' ? 0.5 : eyeMode === 'wide' ? 1.25 : 1;
    const side = ex?.look || 0;
    for (const p of pupils) p.position.x = side * 0.009;
    // boca
    let mm = ex?.mouth || (state.surprise > 0 ? 'o' : m > 0 ? 'smile' : m < 0 ? 'frown' : 'smile');
    mouth.visible = mm === 'smile' || mm === 'frown' || mm === 'smirk';
    mouthO.visible = mm === 'o';
    mouthFlat.visible = mm === 'flat';
    mouth.rotation.z = mm === 'frown' ? 0 : Math.PI;
    mouth.position.y = mm === 'frown' ? -0.075 : -0.055;
    mouth.scale.set(mm === 'smirk' ? 0.7 : 1, mm === 'smirk' ? 0.6 : 1, 1);
    mouth.position.x = mm === 'smirk' ? 0.018 : 0;
    // sobrancelhas
    const bm = state.surprise > 0 ? 'up' : ex?.brows || (m < 0 ? 'sad' : 'flat');
    brows.forEach((b, k) => {
      const s = k ? 1 : -1;
      let y = 0.065, r = 0;
      if (bm === 'up') y = 0.08;
      else if (bm === 'down') { y = 0.06; r = s * 0.35; }
      else if (bm === 'sad') { r = -s * 0.3; }
      else if (bm === 'one') { if (k) { y = 0.082; r = -0.2; } else { y = 0.06; } }
      b.position.y += (y - b.position.y) * Math.min(1, dt * 10);
      b.rotation.z += (r - b.rotation.z) * Math.min(1, dt * 10);
    });
    blushMat.opacity += ((ex?.blush ? 0.6 : 0) - blushMat.opacity) * Math.min(1, dt * 4);
    for (const a of arms) a.rotation.x = Math.PI / 2.6 + (m > 0 ? Math.sin(time * 9) * 0.25 : 0);
    dots.forEach((d, k) => { d.visible = state.thinking; d.position.y = 0.16 + k * 0.05 + Math.sin(time * 4 + k) * 0.01; });
  }
  return { group, setStyle, react, setExpression, update, state, headG, hands, arms, mats };
}
