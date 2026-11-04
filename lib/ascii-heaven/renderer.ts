/**
 * Draws the heavenly sky as a grid of ASCII cells:
 *   1. a dawn-gold-to-azure gradient with a soft halo and a faint cell grid
 *   2. far gliders, half lost in the clouds
 *   3. a drifting ASCII cloud field (fbm value noise), lit from above, with a
 *      thick cloud sea along the bottom
 *   4. slowly swaying god rays, composited with "screen"
 *   5. twinkling motes, golden stardust trails, near gliders, then birds
 *
 * Glider rasterising (spine → supersampled cells) follows ascii-sharks (MIT).
 */
import { clamp, hash3, smoothstep } from "../ascii-sharks/math";
import { GLIDER_NODES, type Glider, type GliderKind, type World } from "./world";

type RGB = [number, number, number];

const SKIN_RAMP = ":;t%SX8#@";
const FIN_GLYPHS = "%;tS:";
const EDGE_HEAVY = ":;";
const EDGE_LIGHT = ".',`";
const CLOUD_RAMP = ".:-~=";
const ACCENTS = ["#e9b955", "#f2a7b8", "#9ed4e6", "#c5b3f0", "#ffffff", "#f6d58c"];

const FLAG_BODY = 1;
const FLAG_EDGE = 2;
const FLAG_FIN = 3;
const FLAG_EYE = 4;
const FLAG_MARK = 5;
const FLAG_MARK2 = 6;

const SUBSAMPLES = [0.25, 0.3, 0.75, 0.3, 0.25, 0.72, 0.75, 0.72];
/** Gliders nearer than this draw in front of the clouds. */
const NEAR_DEPTH = 0.7;
const CLOUD_INTERVAL = 0.11;

// ── noise ───────────────────────────────────────────────────────────────

function vnoise(x: number, y: number, seed: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash3(xi, yi, seed);
  const b = hash3(xi + 1, yi, seed);
  const c = hash3(xi, yi + 1, seed);
  const d = hash3(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x: number, y: number) {
  let sum = 0;
  let amp = 0.5;
  let f = 1;
  for (let o = 0; o < 4; o++) {
    sum += amp * vnoise(x * f, y * f, o * 17 + 3);
    f *= 2.03;
    amp *= 0.5;
  }
  return sum / 0.9375;
}

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const rgb = (c: RGB) => `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;

function inTriangle(px: number, py: number, ax: number, ay: number, bx: number, by: number, cx: number, cy: number) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

// ── creature shapes (seen from below, fractions of body length) ─────────

interface GliderShape {
  halfWidth: (s: number) => number;
  /** Pectoral fin / wing: leading root, trailing root, tip position, reach. */
  pectoral: [number, number, number, number];
  /** Concave trailing edge on the pectorals. */
  sweep: boolean;
  pelvic: [number, number, number, number] | null;
  /** Tail lobes: where they start along the body and how far they reach sideways. */
  tail: [number, number] | null;
  /** Lateral body-wave amplitude. */
  wave: number;
  /** Wingbeat foreshortening, 0 = none. */
  flap: number;
  eye: [number, number] | null;
  dark: RGB;
  light: RGB;
  markFill: RGB;
  mark: (s: number, v: number, L: number, across: number, id: number) => 0 | 1 | 2;
}

const SHAPES: Record<GliderKind, GliderShape> = {
  // Sky whale: broad rounded head, ventral pleats, very long flippers, wide flukes.
  humpback: {
    halfWidth: (s) => {
      if (s < 0.12) return 0.07 * Math.pow(Math.sin(((s / 0.12) * Math.PI) / 2), 0.6);
      if (s < 0.32) return 0.07 + 0.03 * smoothstep(0.12, 0.32, s);
      if (s < 0.86) return 0.018 + 0.082 * Math.pow(1 - (s - 0.32) / 0.54, 1.3);
      return 0.018 * (1 - (s - 0.86) / 0.14) + 0.006;
    },
    pectoral: [0.22, 0.3, 0.54, 0.34],
    sweep: false,
    pelvic: null,
    tail: [0.86, 0.16],
    wave: 0.018,
    flap: 0,
    eye: [0.13, 0.16],
    dark: [112, 118, 168],
    light: [226, 228, 246],
    markFill: [168, 172, 212],
    mark: (s, v, L, across) => (s > 0.04 && s < 0.44 && across < 0.72 && Math.sin((v / L) * 160) > 0.55 ? 1 : 0),
  },
  // Celestial manta: blunt wide head, huge swept wings that beat slowly, whip tail.
  manta: {
    halfWidth: (s) => {
      if (s < 0.05) return 0.045 + 0.02 * Math.sin(((s / 0.05) * Math.PI) / 2);
      if (s < 0.4) return 0.065 + 0.015 * Math.sin(((s - 0.05) / 0.35) * Math.PI);
      if (s < 0.5) return 0.065 * (1 - (s - 0.4) / 0.1) + 0.006;
      return 0.006 * (1 - (s - 0.5) / 0.5) + 0.002;
    },
    pectoral: [0.04, 0.44, 0.3, 0.52],
    sweep: true,
    pelvic: null,
    tail: null,
    wave: 0.01,
    flap: 0.24,
    eye: null,
    dark: [84, 88, 140],
    light: [244, 244, 252],
    markFill: [120, 124, 172],
    mark: (s, v, L, across, id) => {
      // Gill slits, then a belly-spot pattern unique to each manta.
      if (s > 0.14 && s < 0.26 && across > 0.35 && across < 0.7) {
        return Math.floor(((s - 0.14) / 0.12) * 5) % 2 === 0 ? 1 : 0;
      }
      if (s < 0.28 || s > 0.44) return 0;
      const gu = s / 0.04;
      const gv = v / (L * 0.03);
      const cu = Math.floor(gu);
      const cv = Math.floor(gv);
      if (hash3(cu, cv, id + 40) > 0.45) return 0;
      const jx = hash3(cu, cv, id) * 0.5 + 0.25;
      const jy = hash3(cu, cv, id + 11) * 0.5 + 0.25;
      return (gu - cu - jx) ** 2 + (gv - cv - jy) ** 2 < 0.07 ? 1 : 0;
    },
  },
  // Cloud koi: white with vermilion patches and long flowing fins.
  koi: {
    halfWidth: (s) => {
      if (s < 0.1) return 0.075 * Math.pow(Math.sin(((s / 0.1) * Math.PI) / 2), 0.7);
      if (s < 0.3) return 0.075 + 0.02 * smoothstep(0.1, 0.3, s);
      if (s < 0.76) return 0.014 + 0.081 * Math.pow(1 - (s - 0.3) / 0.46, 1.2);
      return 0.014;
    },
    pectoral: [0.16, 0.25, 0.32, 0.13],
    sweep: false,
    pelvic: [0.44, 0.5, 0.55, 0.07],
    tail: [0.74, 0.17],
    wave: 0.075,
    flap: 0,
    eye: [0.05, 0.09],
    dark: [176, 170, 192],
    light: [255, 253, 248],
    markFill: [232, 98, 62],
    mark: (s, v, L, _across, id) => (s > 0.06 && s < 0.78 && vnoise(s * 7 + id * 3.1, (v / L) * 18 + id, 91) > 0.56 ? 2 : 0),
  },
};
const KINDS = Object.keys(SHAPES) as GliderKind[];

// ── renderer ────────────────────────────────────────────────────────────

export class SkyRenderer {
  private ctx: CanvasRenderingContext2D;
  private bg: HTMLCanvasElement;
  private clouds: HTMLCanvasElement;
  private dpr = 1;
  private width = 0;
  private height = 0;
  private cw = 12;
  private ch = 18;
  private cols = 0;
  private rows = 0;
  private fontFamily = "ui-monospace, Menlo, monospace";
  private cloudClock = Infinity;
  private styleCache = new Map<number, string>();

  private density = new Float32Array(0);
  private dust = new Float32Array(0);
  private dustTmp = new Float32Array(0);
  private motes: number[] = [];
  private bursts: { x: number; y: number; t: number }[] = [];

  private flag = new Uint8Array(0);
  private shadeOf = new Float32Array(0);
  private keyOf = new Uint32Array(0);
  private depthOf = new Float32Array(0);
  private kindOf = new Uint8Array(0);
  private spine = new Float32Array(GLIDER_NODES * 2);
  private arc = new Float32Array(GLIDER_NODES);
  private arcTotal = 1;
  private shape = SHAPES.humpback;
  private gliderId = 0;
  private tipLeft = 0;
  private tipRight = 0;
  private hitFlag = 0;
  private hitShade = 0;
  private hitS = 0;
  private hitV = 0;
  private hitDist = 0;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("2D canvas unavailable");
    this.ctx = ctx;
    this.bg = document.createElement("canvas");
    this.clouds = document.createElement("canvas");
  }

  get cellWidth() {
    return this.cw;
  }

  get cellHeight() {
    return this.ch;
  }

  setFontFamily(family: string) {
    if (family) this.fontFamily = family;
  }

  resize(width: number, height: number, dpr: number) {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.cw = clamp(Math.round(width / 124), 9, 13);
    this.ch = Math.round(this.cw * 1.45);
    this.cols = Math.ceil(width / this.cw);
    this.rows = Math.ceil(height / this.ch);
    for (const c of [this.canvas, this.bg, this.clouds]) {
      c.width = Math.round(width * dpr);
      c.height = Math.round(height * dpr);
    }
    const n = this.cols * this.rows;
    if (this.flag.length !== n) {
      this.density = new Float32Array(n);
      this.dust = new Float32Array(n);
      this.dustTmp = new Float32Array(n);
      this.flag = new Uint8Array(n);
      this.shadeOf = new Float32Array(n);
      this.keyOf = new Uint32Array(n);
      this.depthOf = new Float32Array(n);
      this.kindOf = new Uint8Array(n);
    }
    this.motes = [];
    for (let i = 0; i < n; i++) {
      const row = (i / this.cols) | 0;
      if (row / this.rows < 0.7 && hash3(i % this.cols, row, 5) < 0.016) this.motes.push(i);
    }
    this.paintBackground();
    this.cloudClock = Infinity;
  }

  private paintBackground() {
    const g = this.bg.getContext("2d");
    if (!g) return;
    const { width: W, height: H, dpr, cw, ch } = this;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#8fb0e0");
    sky.addColorStop(0.34, "#bcd0ee");
    sky.addColorStop(0.66, "#eee6f3");
    sky.addColorStop(1, "#fbe2c0");
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);

    const [sx, sy] = this.source();
    const halo = g.createRadialGradient(sx, sy, 0, sx, sy, Math.max(W, H) * 0.7);
    halo.addColorStop(0, "rgba(255,244,214,0.95)");
    halo.addColorStop(0.25, "rgba(255,236,196,0.45)");
    halo.addColorStop(1, "rgba(255,236,196,0)");
    g.fillStyle = halo;
    g.fillRect(0, 0, W, H);

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.strokeStyle = "rgba(255,255,255,0.2)";
    g.lineWidth = 1;
    g.beginPath();
    for (let c = 0; c <= this.cols; c++) {
      const x = Math.round(c * cw * dpr) + 0.5;
      g.moveTo(x, 0);
      g.lineTo(x, H * dpr);
    }
    for (let r = 0; r <= this.rows; r++) {
      const y = Math.round(r * ch * dpr) + 0.5;
      g.moveTo(0, y);
      g.lineTo(W * dpr, y);
    }
    g.stroke();
  }

  /** Where the heavenly light comes from: just above the top edge, right of centre. */
  private source(): [number, number] {
    return [this.width * 0.68, -this.height * 0.1];
  }

  render(world: World, dt: number) {
    const { ctx, dpr, cols, ch } = this;
    if (cols === 0) return;
    const t = world.time;

    for (const e of world.events) {
      this.bursts.push({ x: e.x, y: e.y, t: 0 });
      this.stamp(e.x, e.y, 5, 1.3);
    }
    world.events.length = 0;

    this.rasterizeGliders(world.gliders);
    this.depositDust(world);
    this.diffuse(dt);
    this.cloudClock += dt;
    if (this.cloudClock >= CLOUD_INTERVAL) {
      this.cloudClock = 0;
      this.updateClouds(t);
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(this.bg, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = `600 ${Math.round(ch * 0.74)}px ${this.fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    this.drawGliders(t, false);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.clouds, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawRays(t);
    this.drawMotes(t);
    this.drawDust(t);
    this.drawGliders(t, true);
    this.drawBirds(world);
    this.drawBursts(dt);
    ctx.globalAlpha = 1;
  }

  // ── atmosphere ──────────────────────────────────────────────────────

  private updateClouds(t: number) {
    const g = this.clouds.getContext("2d");
    if (!g) return;
    const { cols, rows, cw, ch, density, height: H, dpr } = this;
    const drift = t * 7;
    for (let r = 0; r < rows; r++) {
      const y = r * ch;
      const yf = y / H;
      const sea = smoothstep(0.66, 1, yf) * 0.5;
      const band = 0.07 * Math.exp(-(((yf - 0.4) / 0.1) ** 2));
      const bias = -0.16 + sea + band;
      for (let c = 0; c < cols; c++) {
        const x = c * cw;
        density[r * cols + c] = fbm((x + drift) / 420, y / 210 + t * 0.003) + bias;
      }
    }

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.clouds.width, this.clouds.height);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.font = `600 ${Math.round(ch * 0.74)}px ${this.fontFamily}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    const shadow: RGB = [190, 194, 230];
    const white: RGB = [255, 255, 255];
    const gold: RGB = [255, 238, 208];
    for (let r = 0; r < rows; r++) {
      const warm = clamp((r * ch) / H - 0.35, 0, 1);
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const d = density[i];
        if (d < 0.47) continue;
        const k = smoothstep(0.47, 0.64, d);
        const above = r > 0 ? density[i - cols] : d;
        const below = r < rows - 1 ? density[i + cols] : d;
        // Lit from above: top surfaces glow, undersides fall into lavender shadow.
        const light = clamp(0.62 + (below - above) * 2.6 + k * 0.15, 0, 1);
        const x = c * cw;
        const y = r * ch;
        const lq = Math.round(light * 6);
        const kq = Math.round(k * 5);
        const wq = Math.round(warm * 3);
        if (kq >= 1) {
          g.fillStyle = this.cached(1000 + lq * 100 + kq * 10 + wq, () => {
            const col = mix(mix(shadow, white, lq / 6), gold, wq / 6);
            return `rgba(${Math.round(col[0])},${Math.round(col[1])},${Math.round(col[2])},${(0.45 + 0.53 * (kq / 5)).toFixed(2)})`;
          });
          g.fillRect(x + 1, y + 1, cw - 1, ch - 1);
          g.fillStyle = this.cached(2000 + lq, () => `rgba(160,166,214,${(0.16 + 0.34 * (1 - lq / 6)).toFixed(2)})`);
          const gi = clamp(Math.floor(d * 9 + hash3(c, r, 3) * 2) % CLOUD_RAMP.length, 0, CLOUD_RAMP.length - 1);
          g.fillText(CLOUD_RAMP[gi], x + cw / 2, y + ch / 2 + 1);
        } else {
          g.fillStyle = "rgba(255,255,255,0.85)";
          g.fillText(hash3(c, r, 9) < 0.5 ? "." : ":", x + cw / 2, y + ch / 2 + 1);
        }
      }
    }
  }

  private cached(key: number, make: () => string) {
    let s = this.styleCache.get(key);
    if (!s) {
      s = make();
      this.styleCache.set(key, s);
    }
    return s;
  }

  private drawRays(t: number) {
    const { ctx, width: W, height: H } = this;
    const [sx, sy] = this.source();
    const len = Math.hypot(W, H) * 1.2;
    ctx.globalCompositeOperation = "screen";
    const RAYS = 9;
    for (let k = 0; k < RAYS; k++) {
      const base = Math.PI * (0.32 + (k / (RAYS - 1)) * 0.5);
      const a = base + 0.035 * Math.sin(t * 0.07 + k * 1.7);
      const half = 0.018 + 0.03 * hash3(k, 3, 1);
      const alpha = 0.16 + 0.14 * (0.5 + 0.5 * Math.sin(t * 0.21 + k * 2.3));
      const grad = ctx.createLinearGradient(sx, sy, sx + Math.cos(a) * len, sy + Math.sin(a) * len);
      grad.addColorStop(0, `rgba(255,246,220,${alpha.toFixed(3)})`);
      grad.addColorStop(0.7, `rgba(255,240,210,${(alpha * 0.25).toFixed(3)})`);
      grad.addColorStop(1, "rgba(255,240,210,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + Math.cos(a - half) * len, sy + Math.sin(a - half) * len);
      ctx.lineTo(sx + Math.cos(a + half) * len, sy + Math.sin(a + half) * len);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  }

  private drawMotes(t: number) {
    const { ctx, cols, cw, ch, density, flag } = this;
    for (const i of this.motes) {
      if (density[i] > 0.47 || flag[i]) continue;
      const col = i % cols;
      const row = (i / cols) | 0;
      const tw = 0.5 + 0.5 * Math.sin(t * (0.6 + hash3(col, row, 7) * 1.4) + hash3(col, row, 8) * 6.28);
      ctx.globalAlpha = 0.25 + 0.7 * tw;
      ctx.fillStyle = hash3(col, row, 2) < 0.5 ? "#ffffff" : "#e2b458";
      ctx.fillText(tw > 0.82 ? "+" : "·", col * cw + cw / 2, row * ch + ch / 2 + 1);
    }
    ctx.globalAlpha = 1;
  }

  private drawBursts(dt: number) {
    const { ctx, cw, ch } = this;
    for (let b = this.bursts.length - 1; b >= 0; b--) {
      const burst = this.bursts[b];
      burst.t += dt;
      const life = burst.t / 1.1;
      if (life >= 1) {
        this.bursts.splice(b, 1);
        continue;
      }
      const radius = 14 + life * 190;
      const steps = Math.max(12, Math.round((Math.PI * 2 * radius) / (cw * 1.4)));
      ctx.globalAlpha = (1 - life) ** 1.5;
      ctx.fillStyle = "#d9a23f";
      for (let s = 0; s < steps; s++) {
        const a = (s / steps) * Math.PI * 2;
        const c = Math.floor((burst.x + Math.cos(a) * radius) / cw);
        const r = Math.floor((burst.y + Math.sin(a) * radius * 0.8) / ch);
        ctx.fillText(s % 3 === 0 ? "*" : "+", c * cw + cw / 2, r * ch + ch / 2 + 1);
      }
    }
    ctx.globalAlpha = 1;
  }

  // ── stardust ────────────────────────────────────────────────────────

  private stamp(x: number, y: number, radius: number, amount: number) {
    const c0 = Math.floor(x / this.cw);
    const r0 = Math.floor(y / this.ch);
    for (let r = r0 - radius; r <= r0 + radius; r++) {
      for (let c = c0 - radius; c <= c0 + radius; c++) {
        if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) continue;
        const d = Math.hypot(c - c0, (r - r0) * 1.4);
        if (d > radius + 0.5) continue;
        const i = r * this.cols + c;
        this.dust[i] = Math.min(1.6, this.dust[i] + amount * (1 - d / (radius + 1)));
      }
    }
  }

  private cellIndex(x: number, y: number) {
    const c = Math.floor(x / this.cw);
    const r = Math.floor(y / this.ch);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return -1;
    return r * this.cols + c;
  }

  private depositDust(world: World) {
    for (const g of world.gliders) {
      for (let k = GLIDER_NODES - 5; k < GLIDER_NODES; k++) {
        const i = this.cellIndex(g.nodes[k * 2], g.nodes[k * 2 + 1]);
        if (i >= 0) this.dust[i] = Math.min(1.6, this.dust[i] + 0.035 + g.speed * 0.0008);
      }
    }
    if (world.pointer.active) {
      const i = this.cellIndex(world.pointer.x, world.pointer.y);
      if (i >= 0) this.dust[i] = Math.min(1.6, this.dust[i] + 0.12);
    }
  }

  private diffuse(dt: number) {
    const { cols, rows, dust, dustTmp: tmp } = this;
    const decay = Math.exp(-dt * 0.9);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const l = c > 0 ? dust[i - 1] : dust[i];
        const rt = c < cols - 1 ? dust[i + 1] : dust[i];
        const u = r > 0 ? dust[i - cols] : dust[i];
        const d = r < rows - 1 ? dust[i + cols] : dust[i];
        tmp[i] = (dust[i] * 4 + l + rt + u + d) * 0.125 * decay;
      }
    }
    this.dust = tmp;
    this.dustTmp = dust;
  }

  private drawDust(t: number) {
    const { ctx, cols, rows, cw, ch, dust, flag } = this;
    const tick = Math.floor(t * 4);
    ctx.fillStyle = "#c58f2a";
    for (let i = 0; i < cols * rows; i++) {
      const e = dust[i];
      if (e < 0.16 || flag[i]) continue;
      const col = i % cols;
      const row = (i / cols) | 0;
      if (hash3(col, row, tick) < 0.3) continue;
      ctx.globalAlpha = clamp(e * 1.3, 0, 0.95);
      ctx.fillText(e > 0.75 ? "*" : e > 0.38 ? "+" : "·", col * cw + cw / 2, row * ch + ch / 2 + 1);
    }
    ctx.globalAlpha = 1;
  }

  // ── birds ───────────────────────────────────────────────────────────

  private drawBirds(world: World) {
    const { ctx, cw, ch, cols, flag } = this;
    ctx.fillStyle = "#363e66";
    for (const b of world.birds) {
      const i = this.cellIndex(b.x, b.y);
      if (i < 0 || flag[i]) continue;
      const w = Math.sin(b.phase);
      const glyph = w > 0.35 ? "v" : w < -0.45 ? "^" : "-";
      ctx.globalAlpha = 0.3 + 0.55 * ((b.depth - 0.5) / 0.5) + 0.15 * b.alarm;
      ctx.fillText(glyph, (i % cols) * cw + cw / 2, ((i / cols) | 0) * ch + ch / 2 + 1);
    }
    ctx.globalAlpha = 1;
  }

  // ── gliders ─────────────────────────────────────────────────────────

  private sample(px: number, py: number, L: number) {
    const { spine, arc } = this;
    let best = Infinity;
    let bestS = 0;
    let sign = 1;
    let bnx = 0;
    let bny = 0;
    for (let k = 0; k < GLIDER_NODES - 1; k++) {
      const ax = spine[k * 2];
      const ay = spine[k * 2 + 1];
      const sx = spine[(k + 1) * 2] - ax;
      const sy = spine[(k + 1) * 2 + 1] - ay;
      const len2 = sx * sx + sy * sy || 1;
      const u = clamp(((px - ax) * sx + (py - ay) * sy) / len2, 0, 1);
      const d2 = (px - ax - sx * u) ** 2 + (py - ay - sy * u) ** 2;
      if (d2 < best) {
        best = d2;
        const len = Math.sqrt(len2);
        bestS = (arc[k] + u * len) / this.arcTotal;
        sign = sx * (py - ay) - sy * (px - ax) >= 0 ? 1 : -1;
        bnx = (-sy / len) * sign;
        bny = (sx / len) * sign;
      }
    }
    const a = Math.sqrt(best);
    const s = bestS;
    const u = s * L;
    const shape = this.shape;
    const w = shape.halfWidth(s) * L;
    this.hitDist = a;
    this.hitS = s;
    this.hitV = a * sign;

    if (a <= w) {
      const across = a / (w || 1);
      const facing = (bnx * -0.6 + bny * -0.8) * across;
      let shade = 0.66 - across * across * 0.36 + facing * 0.22;
      let flag = FLAG_BODY;
      if (shape.eye && s > shape.eye[0] && s < shape.eye[1] && across > 0.62) {
        flag = FLAG_EYE;
        shade = 0;
      } else {
        const m = shape.mark(s, a * sign, L, across, this.gliderId);
        if (m === 1) flag = FLAG_MARK;
        else if (m === 2) flag = FLAG_MARK2;
      }
      this.hitFlag = flag;
      this.hitShade = shade;
      return true;
    }

    const tip = sign > 0 ? this.tipRight : this.tipLeft;
    const [p0, p1, p2] = shape.pectoral;
    if (
      inTriangle(u, a, L * p0, 0, L * p1, 0, L * p2, tip) &&
      !(shape.sweep && inTriangle(u, a, L * p1, 0, L * (p1 + (p2 - p1) * 0.4), tip * 0.6, L * p2, tip))
    ) {
      this.hitFlag = FLAG_FIN;
      // Pale near the body, darkening toward the tips.
      this.hitShade = 0.3 + 0.45 * (1 - clamp(a / tip, 0, 1));
      return true;
    }
    if (shape.pelvic) {
      const [v0, v1, v2, vr] = shape.pelvic;
      if (inTriangle(u, a, L * v0, 0, L * v1, 0, L * v2, L * vr)) {
        this.hitFlag = FLAG_FIN;
        this.hitShade = 0.45;
        return true;
      }
    }
    if (shape.tail && inTriangle(u, a, L * shape.tail[0], 0, L * 0.97, 0, L, L * shape.tail[1])) {
      this.hitFlag = FLAG_FIN;
      this.hitShade = 0.4 + 0.2 * (1 - a / (L * shape.tail[1]));
      return true;
    }
    return false;
  }

  private rasterizeGliders(gliders: Glider[]) {
    const { flag, shadeOf, keyOf, depthOf, kindOf, spine, arc, cw, ch, cols, rows } = this;
    flag.fill(0);
    for (const g of gliders) {
      const L = g.length;
      const N = GLIDER_NODES;
      const n = g.nodes;
      const shape = SHAPES[g.kind];
      this.shape = shape;
      this.gliderId = g.id;
      const kindIndex = KINDS.indexOf(g.kind);

      for (let k = 0; k < N; k++) {
        const s = k / (N - 1);
        const a = Math.max(0, k - 1);
        const b = Math.min(N - 1, k + 1);
        let tx = n[a * 2] - n[b * 2];
        let ty = n[a * 2 + 1] - n[b * 2 + 1];
        const tl = Math.hypot(tx, ty) || 1;
        tx /= tl;
        ty /= tl;
        const off = L * shape.wave * (0.15 + 0.85 * Math.pow(s, 1.6)) * Math.sin(g.phase - s * 5);
        spine[k * 2] = n[k * 2] - ty * off;
        spine[k * 2 + 1] = n[k * 2 + 1] + tx * off;
      }
      arc[0] = 0;
      for (let k = 1; k < N; k++) {
        arc[k] = arc[k - 1] + Math.hypot(spine[k * 2] - spine[(k - 1) * 2], spine[k * 2 + 1] - spine[(k - 1) * 2 + 1]);
      }
      this.arcTotal = arc[N - 1] || 1;

      const bank = clamp(g.turn * 0.6, -0.3, 0.3);
      const beat = 1 - shape.flap * (0.5 + 0.5 * Math.sin(g.phase * 1.3));
      const reach = shape.pectoral[3];
      this.tipRight = L * reach * beat * (1 - bank);
      this.tipLeft = L * reach * beat * (1 + bank);

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (let k = 0; k < N; k++) {
        minX = Math.min(minX, spine[k * 2]);
        maxX = Math.max(maxX, spine[k * 2]);
        minY = Math.min(minY, spine[k * 2 + 1]);
        maxY = Math.max(maxY, spine[k * 2 + 1]);
      }
      const pad = L * (reach * 1.35 + 0.04);
      const c0 = Math.max(0, Math.floor((minX - pad) / cw));
      const c1 = Math.min(cols - 1, Math.floor((maxX + pad) / cw));
      const r0 = Math.max(0, Math.floor((minY - pad) / ch));
      const r1 = Math.min(rows - 1, Math.floor((maxY + pad) / ch));
      if (c0 > c1 || r0 > r1) continue;
      const skipBeyond = pad + Math.hypot(cw, ch);

      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const x = c * cw;
          const y = r * ch;
          const centerHit = this.sample(x + cw / 2, y + ch / 2, L);
          if (!centerHit && this.hitDist > skipBeyond) continue;
          const hf = this.hitFlag;
          const hs = this.hitShade;
          const s = this.hitS;
          const v = this.hitV;
          let hits = centerHit ? 1 : 0;
          for (let k = 0; k < SUBSAMPLES.length; k += 2) {
            if (this.sample(x + SUBSAMPLES[k] * cw, y + SUBSAMPLES[k + 1] * ch, L)) hits++;
          }
          if (hits === 0) continue;
          const coverage = hits / 5;
          const i = r * cols + c;
          keyOf[i] = (hash3(Math.round(s * 52), Math.round(v / (cw * 0.9)), g.id) * 4294967295) >>> 0;
          depthOf[i] = g.depth;
          kindOf[i] = kindIndex;
          if (centerHit && coverage >= 0.6) {
            flag[i] = hf;
            shadeOf[i] = clamp(hs, 0, 1);
          } else {
            flag[i] = FLAG_EDGE;
            shadeOf[i] = coverage;
          }
        }
      }
    }
  }

  private drawGliders(t: number, near: boolean) {
    const { ctx, cols, rows, cw, ch, flag, shadeOf, keyOf, depthOf, kindOf } = this;
    for (let i = 0; i < cols * rows; i++) {
      const f = flag[i];
      if (!f || depthOf[i] >= NEAR_DEPTH !== near) continue;
      const x = (i % cols) * cw;
      const y = ((i / cols) | 0) * ch;
      const key = keyOf[i];
      const shade = shadeOf[i];
      const shape = SHAPES[KINDS[kindOf[i]]];
      // Atmospheric perspective: far creatures fade into the sky.
      ctx.globalAlpha = 0.45 + 0.55 * depthOf[i];
      const roll = hash3(key, Math.floor(t * 2 + (key % 997) / 97), 7);

      if (f === FLAG_EDGE) {
        ctx.fillStyle = roll < 0.07 ? ACCENTS[key % ACCENTS.length] : rgb(mix(shape.dark, shape.light, 0.35 + shade * 0.25));
        const set = shade >= 0.5 ? EDGE_HEAVY : EDGE_LIGHT;
        ctx.fillText(set[(key >>> 8) % set.length], x + cw / 2, y + ch / 2 + 1);
        continue;
      }

      let fill: RGB;
      let glyph: string;
      let ink: string;
      if (f === FLAG_EYE) {
        fill = [44, 46, 78];
        glyph = "o";
        ink = "#c9cbe0";
      } else if (f === FLAG_MARK || f === FLAG_MARK2) {
        fill = f === FLAG_MARK2 ? mix(shape.markFill, [255, 170, 120], shade * 0.35) : mix(shape.markFill, shape.dark, 0.3 - shade * 0.3);
        glyph = "#%@"[(key >>> 8) % 3];
        ink = rgb(mix(fill, [40, 30, 50], 0.45));
      } else {
        fill = mix(shape.dark, shape.light, shade);
        if (f === FLAG_FIN) glyph = FIN_GLYPHS[(key >>> 8) % FIN_GLYPHS.length];
        else glyph = SKIN_RAMP[clamp(Math.floor((1 - shade) * 8.99) + (((key >>> 4) % 3) - 1), 0, SKIN_RAMP.length - 1)];
        ink = roll < 0.08 ? ACCENTS[key % ACCENTS.length] : roll < 0.11 ? "#ffffff" : rgb(mix(shape.dark, fill, 0.55));
      }
      ctx.fillStyle = rgb(fill);
      ctx.fillRect(x + 1, y + 1, cw - 1, ch - 1);
      ctx.fillStyle = ink;
      ctx.fillText(glyph, x + cw / 2, y + ch / 2 + 1);
    }
    ctx.globalAlpha = 1;
  }
}
