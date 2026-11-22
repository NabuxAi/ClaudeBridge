// DIGI — DigiWP's guardian, keeping the sign-in, sign-up and invitation forms company.
//
// The idea in one sentence: handing a stranger the keys to your WordPress site is a nervous
// moment, so the little guardian who will watch those sites reads along with you, looks away
// from your password, and is plainly delighted when you are in.
//
// Who he is (kept identical everywhere he appears):
//   - head: a browser window, three dots on its title bar, the screen is his face (mint LEDs);
//   - antenna with a bulb: what he is thinking about lights it (busy pulses, success glows);
//   - body: a rounded green case with a shield-and-tick on the chest (the product protects);
//   - tail: a cable ending in a plug lying on the floor (the signed connector to your site);
//   - short tube arms with round hands; two stubby feet.
// Style: flat vector to sit on the panel's glass. One ink outline weight (2.6 px), flat fills,
// one hard highlight per volume, a soft floor shadow. No gradients on moving parts.
//
// Behaviour (targets the page marks with data-anidoodle): name, email, password, reveal, submit.
//   - typing in a field: eyes follow the caret, head a beat later, a small nod per keystroke;
//   - the password field: both hands over the screen, eyes shut; "peek" state: one hand drops;
//   - hovering or focusing submit: a grin and a brighter bulb;
//   - state "busy": looks up at his bulb, a loading row on the screen;
//   - state "error": a worried head-shake, then a worried face until the page clears it;
//   - state "success": a jump with both arms up and sparks, then a happy glow.
// Untouched: he breathes, blinks, the bulb pulses and the cable sways. Loop 480 ticks (8 s).
import type { Ctx, Env, P } from "./engine/types";
import { clip, lookTarget, reactionSeed, ticksSince, type Discrete, type InputState, type Piece } from "./engine/input";

const W = 320, H = 230, LOOP = 480;
const FACE: P = [160, 92];          // screen centre at rest, in piece coordinates
const NECK: P = [160, 140];         // head pivot

const INK = "#0b3b22";
const GREEN = "#16a34a";
const GREEN_HI = "#4ade80";
const SHELL = "#ecfdf3";
const SCREEN = "#0a2418";
const LED = "#5ff59a";
const PLUG = "#cbd5e1";
const LINE = 2.6;
const TAU = Math.PI * 2;

type Eyes = "open" | "shut" | "happy";
type Pose = {
  y: number; head: P; tilt: number; look: P;
  eyes: Eyes; eyesR: Eyes | null; blink: number;
  brows: "none" | "up" | "worried"; mouth: "smile" | "grin" | "o" | "flat" | "wobble";
  blush: number; glow: number; cover: [number, number]; cheer: number;
  sparks: number; seed: number; busy: number; squash: number;
};

// The password was the last field he watched (the show/hide toggle sits inside it).
const pwLast = (d: Discrete) => (d.since["focus:password"] ?? -1) > Math.max(d.since["focus:name"] ?? -1, d.since["focus:email"] ?? -1);
// A mouse click on "show" takes focus off the field without a focus-visible ring, so the
// peek state itself keeps him at the password until another field is focused.
const covering = (d: Discrete) => d.state !== "success" && d.state !== "busy" &&
  (d.focus === "password" || ((d.focus === "reveal" || d.state === "peek") && pwLast(d) && d.focus !== "email" && d.focus !== "name"));
const coverFor = (d: Discrete, side: number) => (covering(d) ? (d.state === "peek" && side > 0 ? 0.25 : 1) : 0);
const tri = (u: number) => (u < 0.5 ? u * 2 : 2 - u * 2);
const rand = (seed: number, i: number) => { let h = (seed ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0; h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; return ((h >>> 0) % 10000) / 10000; };

// ------------------------------------------------------------------------- pose from input
const restPose = (): Pose => ({
  y: 0, head: [0, 0], tilt: 0, look: [0, 0], eyes: "open", eyesR: null, blink: 0,
  brows: "none", mouth: "smile", blush: 0, glow: 0.6, cover: [0, 0], cheer: 0, sparks: -1, seed: 0, busy: 0, squash: 0,
});

// Blinks at fixed ticks of the loop, so the untouched piece repeats exactly.
const BLINKS = [70, 236, 251, 392];
const blinkAt = (t: number) => { const u = t % LOOP; for (const b of BLINKS) { const f = u - b; if (f >= 0 && f < 8) return Math.sin((f / 8) * Math.PI); } return 0; };

export const pose = (t: number, s: InputState): Pose => {
  const p = restPose(), R = s.reduced, a = s.attention, st = s.state;
  if (!R) {
    p.y = 1.6 * Math.sin((TAU * t) / 120);
    p.blink = blinkAt(t);
    p.glow = 0.55 + 0.25 * Math.sin((TAU * t) / 160);
  }
  const look = s.spring.look as P, head = s.spring.head as P;
  const gx = Math.tanh((look[0] - FACE[0]) / 140), gy = Math.tanh((look[1] - FACE[1]) / 140);
  p.look = [7 * gx, 5 * gy];
  if (!R) { const hx = Math.tanh((head[0] - FACE[0]) / 220), hy = Math.tanh((head[1] - FACE[1]) / 220); p.head = [4 * hx, 3 * hy]; p.tilt = 5 * hx; }
  p.cover = [s.spring.coverL as number, s.spring.coverR as number];

  const typing = a ? clip(s, `key:${a}`, 12) : null;
  if (a && a !== "password" && a !== "submit" && a !== "reveal") {
    p.brows = "up";
    if (typing && !R) p.head[1] += 2.5 * tri(typing.u);
  }
  if (a === "submit") { p.mouth = "grin"; p.brows = "up"; p.glow += 0.8; }

  if (covering(s)) {
    p.eyes = "shut"; p.mouth = "flat"; p.brows = "worried"; p.blush = 1; p.look = [0, 0]; p.blink = 0;
    if (st === "peek") { p.eyesR = "open"; p.mouth = "o"; p.brows = "up"; p.look = [4, 3]; }
    if (!R) { p.tilt = -3; p.head = [0, 2]; if (typing) p.head[1] += 1.5 * tri(typing.u); }
  }

  if (st === "error") {
    const w = s.spring.worry as number;
    p.brows = "worried"; p.mouth = "wobble"; p.blush = 0.5; p.glow = Math.max(0.15, p.glow - 0.6 * w);
    const sh = clip(s, "state:error", 42);
    if (sh && !R) {
      const amp = 1 - sh.f / 42, k = Math.sin((TAU * sh.f) / 13) * amp;
      p.head = [8 * k, 2]; p.tilt = -6 * k; p.look = [-5 * k, 2];
    } else if (!R) { p.look = [p.look[0] * 0.4, 4]; p.head[1] += 2; }
  }

  if (st === "busy") {
    p.brows = "up"; p.mouth = "o"; p.look = [2, -5];
    p.busy = R ? 0.5 : ((ticksSince(s, "state:busy") % 45) / 45);
    if (!R) { p.head = [0, -2]; p.glow = 1.3 + 0.7 * Math.sin((TAU * t) / 18); }
  }

  if (st === "success") {
    const ch = clip(s, "state:success", 96);
    p.eyes = "happy"; p.mouth = "grin"; p.blush = 1; p.brows = "none"; p.glow = 1.6; p.cover = [0, 0];
    if (ch) {
      p.seed = reactionSeed(s, "state:success");
      p.sparks = ch.u;
      if (!R) {
        // two hops, the first one higher; a squash on each landing
        const hop = (f0: number, len: number, hgt: number) => { const f = ch.f - f0; return f >= 0 && f < len ? hgt * Math.sin((f / len) * Math.PI) : 0; };
        p.y = -hop(0, 30, 26) - hop(34, 22, 12);
        const land = (f0: number) => { const f = ch.f - f0; return f >= 0 && f < 6 ? Math.sin((f / 6) * Math.PI) : 0; };
        p.squash = 0.12 * land(30) + 0.07 * land(56);
        p.cheer = ch.f < 70 ? 1 : 1 - (ch.f - 70) / 26;
      } else p.cheer = 1;
    } else if (!R) {
      p.cheer = 0;
      p.glow = 1.3 + 0.3 * Math.sin((TAU * t) / 40);
    }
  }
  return p;
};

// ------------------------------------------------------------------------- drawing helpers
const rr = (ctx: Ctx, x: number, y: number, w: number, h: number, r: number) => {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
};
const ink = (ctx: Ctx, fill: string, width = LINE) => { ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = width; ctx.strokeStyle = INK; ctx.stroke(); };

// Two-bone IK: elbow for a shoulder S reaching hand H with segment lengths a, b, bending to `side`.
const elbow = (S: P, Hd: P, a: number, b: number, side: number): P => {
  const dx = Hd[0] - S[0], dy = Hd[1] - S[1], d = Math.min(a + b - 0.01, Math.max(Math.abs(a - b) + 0.01, Math.hypot(dx, dy)));
  const ang = Math.atan2(dy, dx), cosA = (a * a + d * d - b * b) / (2 * a * d), A = Math.acos(Math.max(-1, Math.min(1, cosA)));
  const e = ang + side * A;
  return [S[0] + a * Math.cos(e), S[1] + a * Math.sin(e)];
};

const lerpP = (a: P, b: P, u: number): P => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];

const drawArm = (ctx: Ctx, S: P, Hd: P, side: number) => {
  const E = elbow(S, Hd, 24, 24, side);
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.beginPath(); ctx.moveTo(S[0], S[1]); ctx.lineTo(E[0], E[1]); ctx.lineTo(Hd[0], Hd[1]);
  ctx.lineWidth = 11 + LINE * 2; ctx.strokeStyle = INK; ctx.stroke();
  ctx.lineWidth = 11; ctx.strokeStyle = GREEN; ctx.stroke();
  ctx.beginPath(); ctx.arc(Hd[0], Hd[1], 8.5, 0, TAU); ink(ctx, GREEN);
  ctx.beginPath(); ctx.arc(Hd[0] - 2.5, Hd[1] - 2.5, 2.6, 0, TAU); ctx.fillStyle = GREEN_HI; ctx.fill();
};

const drawEye = (ctx: Ctx, cx: number, cy: number, kind: Eyes, blink: number, look: P, side: number) => {
  ctx.lineCap = "round";
  if (kind === "happy") {
    ctx.beginPath(); ctx.moveTo(cx - 8, cy + 3); ctx.quadraticCurveTo(cx, cy - 9, cx + 8, cy + 3);
    ctx.lineWidth = 4; ctx.strokeStyle = LED; ctx.stroke(); return;
  }
  if (kind === "shut") {
    ctx.beginPath(); ctx.moveTo(cx - 8, cy - 1 + side); ctx.quadraticCurveTo(cx, cy + 6, cx + 8, cy - 1 - side);
    ctx.lineWidth = 4; ctx.strokeStyle = LED; ctx.stroke(); return;
  }
  const h = Math.max(2.5, 19 * (1 - blink)), x = cx + look[0], y = cy + look[1];
  ctx.save(); ctx.shadowColor = LED; ctx.shadowBlur = 8;
  rr(ctx, x - 6.5, y - h / 2, 13, h, Math.min(6.5, h / 2)); ctx.fillStyle = LED; ctx.fill();
  ctx.restore();
  if (h > 8) { ctx.beginPath(); ctx.arc(x - 2, y - h / 2 + 4.5, 2, 0, TAU); ctx.fillStyle = "#e9fff2"; ctx.fill(); }
};

const drawFace = (ctx: Ctx, p: Pose, cx: number, cy: number) => {
  // blush first, under the LEDs
  if (p.blush > 0) {
    ctx.globalAlpha = 0.45 * p.blush; ctx.fillStyle = "#fb7185";
    ctx.beginPath(); ctx.ellipse(cx - 34, cy + 12, 8, 4.5, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + 34, cy + 12, 8, 4.5, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
  }
  drawEye(ctx, cx - 20, cy - 4, p.eyes, p.blink, p.look, -1);
  drawEye(ctx, cx + 20, cy - 4, p.eyesR ?? p.eyes, p.eyesR === "open" ? 0 : p.blink, p.look, 1);
  // brows
  ctx.lineCap = "round"; ctx.lineWidth = 3; ctx.strokeStyle = LED;
  const brow = (x: number, side: number) => {
    if (p.brows === "none") return;
    const lift = p.brows === "up" ? -4 : 0, tilt = p.brows === "worried" ? 4 * side : 0;
    ctx.beginPath(); ctx.moveTo(x - 7, cy - 19 + lift + tilt); ctx.lineTo(x + 7, cy - 19 + lift - tilt); ctx.stroke();
  };
  brow(cx - 20 + p.look[0] * 0.4, -1); brow(cx + 20 + p.look[0] * 0.4, 1);
  // mouth
  const mx = cx + p.look[0] * 0.5, my = cy + 17 + p.look[1] * 0.3;
  ctx.lineWidth = 3; ctx.strokeStyle = LED; ctx.fillStyle = LED;
  ctx.beginPath();
  if (p.mouth === "smile") { ctx.moveTo(mx - 9, my - 2); ctx.quadraticCurveTo(mx, my + 6, mx + 9, my - 2); ctx.stroke(); }
  else if (p.mouth === "grin") { ctx.moveTo(mx - 11, my - 3); ctx.quadraticCurveTo(mx, my + 11, mx + 11, my - 3); ctx.closePath(); ctx.fill(); }
  else if (p.mouth === "o") { ctx.ellipse(mx, my + 1, 4.5, 5.5, 0, 0, TAU); ctx.stroke(); }
  else if (p.mouth === "flat") { ctx.moveTo(mx - 7, my); ctx.lineTo(mx + 7, my); ctx.stroke(); }
  else { for (let i = 0; i <= 12; i++) { const x = mx - 10 + (20 * i) / 12, y = my + 2 * Math.sin(i * 1.4); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); } ctx.stroke(); }
  // busy: a loading row under the mouth
  if (p.mouth === "o" && p.busy > 0) {
    for (let i = 0; i < 3; i++) {
      const on = Math.floor(p.busy * 3) === i;
      ctx.globalAlpha = on ? 1 : 0.35; ctx.beginPath(); ctx.arc(mx - 9 + i * 9, my + 14, 2.2, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
};

// ------------------------------------------------------------------------- the frame
const draw = (ctx: Ctx, t: number, env: Env, s: InputState) => {
  const p = pose(t, s);
  ctx.setTransform(env.scale, 0, 0, env.scale, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over"; ctx.shadowBlur = 0;
  ctx.clearRect(0, 0, W, H);

  const lift = -p.y, floorY = 208;
  // floor shadow: smaller and fainter while he is up in the air
  const air = Math.min(1, Math.max(0, lift / 30));
  ctx.fillStyle = "rgba(4, 30, 18, 0.28)"; ctx.globalAlpha = 1 - 0.55 * air;
  ctx.beginPath(); ctx.ellipse(160, floorY, 62 * (1 - 0.3 * air), 8 * (1 - 0.3 * air), 0, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1;

  // the cable and plug: anchored to the floor, swaying, following the body
  const sway = s.reduced ? 0 : Math.sin((TAU * t) / 240);
  const tailFrom: P = [196, 186 + p.y];
  ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(tailFrom[0], tailFrom[1]);
  ctx.bezierCurveTo(232, 196 + p.y + 4 * sway, 236 + 4 * sway, 210, 262, 205);
  ctx.lineWidth = 6 + LINE * 2; ctx.strokeStyle = INK; ctx.stroke();
  ctx.lineWidth = 6; ctx.strokeStyle = "#15803d"; ctx.stroke();
  // plug: body + two prongs, lying on the floor
  ctx.save(); ctx.translate(266, 203); ctx.rotate(-0.12 + 0.03 * sway);
  rr(ctx, -6, -7, 18, 14, 4); ink(ctx, PLUG);
  ctx.fillStyle = INK; ctx.fillRect(12, -4.5, 7, 2.6); ctx.fillRect(12, 1.9, 7, 2.6);
  ctx.restore();

  ctx.save();
  // landing squash about the feet
  ctx.translate(160, floorY - 6); ctx.scale(1 + p.squash, 1 - p.squash); ctx.translate(-160, -(floorY - 6));

  // feet
  for (const fx of [140, 180]) { rr(ctx, fx - 13, 190 + p.y * 0.4, 26, 13, 6.5); ink(ctx, GREEN); }

  const by = p.y;
  // arms behind the body when relaxed (shoulders sit at the case's top corners)
  const shL: P = [124, 150 + by], shR: P = [196, 150 + by];
  const faceC: P = [FACE[0] + p.head[0], FACE[1] + p.head[1] + by];
  const handFor = (side: number, cover: number): P => {
    const sh = side < 0 ? shL : shR;
    const rest: P = [sh[0] + side * 9, sh[1] + 40];
    const over: P = [faceC[0] + side * 20, faceC[1] - 2];
    const up: P = [sh[0] + side * 30, sh[1] - 66];
    return lerpP(lerpP(rest, over, cover), up, p.cheer);
  };
  const hL = handFor(-1, p.cover[0]), hR = handFor(1, p.cover[1]);
  const frontL = p.cover[0] > 0.35 || p.cheer > 0.4, frontR = p.cover[1] > 0.35 || p.cheer > 0.4;
  if (!frontL) drawArm(ctx, shL, hL, 1);
  if (!frontR) drawArm(ctx, shR, hR, -1);

  // body case
  rr(ctx, 122, 140 + by, 76, 56, 16); ink(ctx, GREEN);
  ctx.save(); rr(ctx, 122, 140 + by, 76, 56, 16); ctx.clip();
  ctx.fillStyle = "rgba(255,255,255,0.16)"; ctx.fillRect(122, 140 + by, 76, 9);
  ctx.restore();
  // shield and tick on the chest
  const sx = 160, sy = 158 + by;
  ctx.beginPath(); ctx.moveTo(sx, sy - 10); ctx.lineTo(sx + 11, sy - 6); ctx.quadraticCurveTo(sx + 11, sy + 8, sx, sy + 14); ctx.quadraticCurveTo(sx - 11, sy + 8, sx - 11, sy - 6); ctx.closePath();
  ink(ctx, SHELL, 2.2);
  ctx.beginPath(); ctx.moveTo(sx - 5, sy + 1); ctx.lineTo(sx - 1, sy + 5); ctx.lineTo(sx + 6, sy - 3);
  ctx.lineWidth = 2.8; ctx.strokeStyle = GREEN; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.stroke();

  // head: rotated about the neck
  ctx.save();
  ctx.translate(NECK[0] + p.head[0], NECK[1] + p.head[1] + by); ctx.rotate((p.tilt * Math.PI) / 180); ctx.translate(-NECK[0], -NECK[1]);
  // neck
  rr(ctx, 150, 126, 20, 18, 5); ink(ctx, "#15803d");
  // antenna + bulb
  ctx.beginPath(); ctx.moveTo(160, 42); ctx.quadraticCurveTo(162, 30, 158, 20);
  ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.lineCap = "round"; ctx.stroke();
  const g = Math.max(0, p.glow);
  ctx.save(); ctx.shadowColor = LED; ctx.shadowBlur = 6 + 14 * Math.min(2, g);
  ctx.beginPath(); ctx.arc(158, 16, 7, 0, TAU); ctx.fillStyle = g > 0.9 ? "#b9ffd5" : LED; ctx.fill();
  ctx.restore();
  ctx.beginPath(); ctx.arc(158, 16, 7, 0, TAU); ctx.lineWidth = LINE; ctx.strokeStyle = INK; ctx.stroke();
  ctx.beginPath(); ctx.arc(155.6, 13.6, 2, 0, TAU); ctx.fillStyle = "#ffffff"; ctx.fill();
  // the window: shell, title bar dots, screen
  rr(ctx, 98, 40, 124, 92, 18); ink(ctx, SHELL);
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(114 + i * 10, 51, 3, 0, TAU); ctx.fillStyle = ["#f87171", "#fbbf24", GREEN][i]; ctx.fill(); }
  rr(ctx, 107, 59, 106, 64, 11); ctx.fillStyle = SCREEN; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke();
  ctx.save(); rr(ctx, 107, 59, 106, 64, 11); ctx.clip();
  drawFace(ctx, p, FACE[0], FACE[1]);
  // screen glare: one hard diagonal band
  ctx.fillStyle = "rgba(255,255,255,0.07)";
  ctx.beginPath(); ctx.moveTo(176, 59); ctx.lineTo(198, 59); ctx.lineTo(160, 123); ctx.lineTo(138, 123); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.restore();

  // arms in front when they cover the screen or cheer
  if (frontL) drawArm(ctx, shL, hL, 1);
  if (frontR) drawArm(ctx, shR, hR, -1);
  ctx.restore();

  // success sparks: seeded from the log, drawn outward from the head
  if (p.sparks >= 0 && p.sparks < 1) {
    for (let i = 0; i < 7; i++) {
      const a0 = -Math.PI * (0.1 + 0.8 * rand(p.seed, i)), r0 = 70 + 30 * rand(p.seed, i + 20), u = p.sparks;
      const r = r0 * (0.55 + 0.6 * u), x = 160 + r * Math.cos(a0), y = 92 + p.y + r * Math.sin(a0), k = (1 - u) * (5 + 3 * rand(p.seed, i + 40));
      ctx.globalAlpha = 1 - u; ctx.fillStyle = i % 2 ? LED : "#fde047";
      ctx.beginPath();
      for (let j = 0; j < 8; j++) { const rr2 = j % 2 ? k * 0.38 : k, aa = (j * Math.PI) / 4; ctx.lineTo(x + rr2 * Math.cos(aa), y + rr2 * Math.sin(aa)); }
      ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
};

export const digiForm: Piece = {
  meta: {
    title: "Digi, the DigiWP guardian",
    W, H, loop: LOOP,
    alt: "Digi, a small green robot with a browser window for a head and a plug for a tail, reads along as you fill in the form, covers his eyes while you type a password and cheers when you are in.",
  },
  input: {
    springs: {
      look: { omega: 0.3, target: (d) => lookTarget(d, FACE) },
      head: { omega: 0.1, target: (d) => lookTarget(d, FACE) },
      coverL: { omega: 0.2, zeta: 0.85, target: (d) => coverFor(d, -1) },
      coverR: { omega: 0.2, zeta: 0.85, target: (d) => coverFor(d, 1) },
      worry: { omega: 0.12, target: (d) => (d.state === "error" ? 1 : 0) },
    },
  },
  draw,
};
