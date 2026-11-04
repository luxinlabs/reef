/**
 * A heavenly sky sim: flocks of birds and the great, gentle creatures that glide
 * between the clouds.
 *
 * Birds are Reynolds boids (separation / alignment / cohesion) with a blind spot
 * behind each bird. Alarm spreads through a flock, so a whole flock wheels away
 * when only its edge sees a glider. Starling flocks carry a tangential pull, which
 * forms slow murmuration vortices.
 *
 * Gliders (sky whales, mantas, koi) never hunt. They wander on a follow-the-leader
 * spine, drift in lazy circuits across the sky, and leave stardust behind them.
 *
 * Structure adapted from ascii-sharks (MIT, see ../ascii-sharks/LICENSE).
 */
import { angleDiff, clamp, current, rand, randInt, TAU } from "../ascii-sharks/math";

export const GLIDER_NODES = 20;

export type GliderKind = "humpback" | "manta" | "koi";
export type GliderSpec = { kind: GliderKind; size: number };

export const DEFAULT_GLIDERS: GliderSpec[] = [
  { kind: "humpback", size: 1 },
  { kind: "manta", size: 0.62 },
  { kind: "manta", size: 0.48 },
  { kind: "koi", size: 0.4 },
  { kind: "koi", size: 0.34 },
];

export interface Flock {
  name: string;
  cruise: number;
  maxSpeed: number;
  minSpeed: number;
  weight: number;
  size: [number, number];
  /** Personal space in grid cells (x, y). */
  spacing: [number, number];
  align: number;
  cohesion: number;
  jitter: number;
  /** Tangential pull around the local centre: >0 makes a murmuration vortex. */
  mill: number;
  /** Wingbeats per second. */
  flap: number;
}

export const FLOCKS: Flock[] = [
  { name: "dove", cruise: 34, maxSpeed: 62, minSpeed: 16, weight: 2, size: [7, 12], spacing: [2.4, 1.4], align: 1.8, cohesion: 1, jitter: 26, mill: 0, flap: 3.2 },
  { name: "swift", cruise: 52, maxSpeed: 90, minSpeed: 26, weight: 2, size: [10, 16], spacing: [1.8, 1.1], align: 3.4, cohesion: 0.5, jitter: 30, mill: 0, flap: 6 },
  { name: "starling", cruise: 40, maxSpeed: 72, minSpeed: 18, weight: 3, size: [22, 34], spacing: [1.5, 1], align: 1.6, cohesion: 1.6, jitter: 38, mill: 60, flap: 7.5 },
];
const FLOCK_WEIGHT = FLOCKS.reduce((s, f) => s + f.weight, 0);
function pickFlock() {
  let r = Math.random() * FLOCK_WEIGHT;
  for (let i = 0; i < FLOCKS.length; i++) {
    r -= FLOCKS[i].weight;
    if (r <= 0) return i;
  }
  return 0;
}

export interface Bird {
  x: number;
  y: number;
  vx: number;
  vy: number;
  flock: number;
  alarm: number;
  phase: number;
  turn: number;
  /** 0.5 far → 1 near. */
  depth: number;
  millDir: 1 | -1;
}

export interface Glider {
  id: number;
  kind: GliderKind;
  length: number;
  nodes: Float32Array;
  heading: number;
  speed: number;
  /** Swim / wingbeat phase. */
  phase: number;
  turn: number;
  wander: number;
  orbitDir: 1 | -1;
  orbitRadius: number;
  /** Each glider circles its own drifting anchor, so they spread over the sky. */
  anchorX: number;
  anchorY: number;
  depth: number;
}

export interface SkyEvent {
  kind: "burst";
  x: number;
  y: number;
}

const SEPARATION_K = 420;
const ALIGN_K = 1.4;
const COHESION_K = 1;
const FLEE_K = 900;
const BLIND_COS = -0.6;

export class World {
  width = 0;
  height = 0;
  time = 0;
  birds: Bird[] = [];
  gliders: Glider[] = [];
  events: SkyEvent[] = [];
  pointer = { x: 0, y: 0, active: false };

  private perception = 60;
  private sepX: number[] = [];
  private sepY: number[] = [];
  private foreignSep = 40;
  private bucketCols = 0;
  private bucketRows = 0;
  private bucketHead = new Int32Array(0);
  private bucketNext = new Int32Array(0);
  private tmp = { x: 0, y: 0 };

  constructor(private specs: GliderSpec[] = DEFAULT_GLIDERS) {}

  resize(width: number, height: number, cellW: number, cellH: number) {
    const first = this.width === 0;
    const sx = first ? 1 : width / this.width;
    const sy = first ? 1 : height / this.height;
    this.width = width;
    this.height = height;
    this.sepX = FLOCKS.map((f) => f.spacing[0] * cellW);
    this.sepY = FLOCKS.map((f) => f.spacing[1] * cellH);
    this.perception = Math.max(cellH * 3, cellW * 5.5);
    this.foreignSep = cellW * 3;
    if (first || this.birds.length === 0) {
      this.seed();
      return;
    }
    for (const b of this.birds) {
      b.x *= sx;
      b.y *= sy;
    }
    for (const g of this.gliders) {
      g.anchorX *= sx;
      g.anchorY *= sy;
    }
  }

  seed() {
    const { width: W, height: H } = this;
    const minSide = Math.min(W, H);
    const base = clamp(minSide * 0.52, 200, 520);

    this.gliders = this.specs.map(({ kind, size }, i) => {
      const length = base * size;
      const x = rand(W * 0.15, W * 0.85);
      const y = rand(H * 0.15, H * 0.75);
      const heading = rand(0, TAU);
      const nodes = new Float32Array(GLIDER_NODES * 2);
      const seg = length / (GLIDER_NODES - 1);
      for (let n = 0; n < GLIDER_NODES; n++) {
        nodes[n * 2] = x - Math.cos(heading) * seg * n;
        nodes[n * 2 + 1] = y - Math.sin(heading) * seg * n;
      }
      return {
        id: i + 1,
        kind,
        length,
        nodes,
        heading,
        speed: 20,
        phase: rand(0, TAU),
        turn: 0,
        wander: 0,
        orbitDir: i % 2 === 0 ? 1 : -1,
        orbitRadius: minSide * rand(0.18, 0.32),
        anchorX: x,
        anchorY: y,
        depth: clamp(size, 0.4, 1),
      } satisfies Glider;
    });
    // Far (small) creatures draw first.
    this.gliders.sort((a, b) => a.length - b.length);

    const total = clamp(Math.round((W * H) / 11000), 40, 160);
    this.birds = [];
    while (this.birds.length < total) {
      const flock = pickFlock();
      const f = FLOCKS[flock];
      const n = Math.min(randInt(f.size[0], f.size[1]), total - this.birds.length);
      const cx = rand(W * 0.08, W * 0.92);
      const cy = rand(H * 0.08, H * 0.7);
      const dir = (Math.random() < 0.5 ? 0 : Math.PI) + rand(-0.4, 0.4);
      const millDir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
      for (let k = 0; k < n; k++) {
        this.birds.push({
          x: cx + rand(-1, 1) * this.sepX[flock] * Math.sqrt(n),
          y: cy + rand(-1, 1) * this.sepY[flock] * Math.sqrt(n) * 0.6,
          vx: Math.cos(dir) * f.cruise,
          vy: Math.sin(dir) * f.cruise,
          flock,
          alarm: 0,
          phase: rand(0, TAU),
          turn: 0,
          depth: rand(0.5, 1),
          millDir,
        });
      }
    }
    this.bucketNext = new Int32Array(this.birds.length);
  }

  /** A burst of light: nearby birds scatter outward. */
  burst(x: number, y: number) {
    this.events.push({ kind: "burst", x, y });
    const r = 220;
    for (const b of this.birds) {
      const dx = b.x - x;
      const dy = b.y - y;
      const d = Math.hypot(dx, dy);
      if (d > r || d < 1e-3) continue;
      const k = (1 - d / r) * 220;
      b.vx += (dx / d) * k;
      b.vy += (dy / d) * k;
      b.alarm = 1;
    }
  }

  step(dt: number) {
    this.time += dt;
    this.rebuildHash();
    this.stepBirds(dt);
    this.stepGliders(dt);
  }

  private rebuildHash() {
    const size = this.perception;
    this.bucketCols = Math.ceil(this.width / size) + 4;
    this.bucketRows = Math.ceil(this.height / size) + 4;
    const n = this.bucketCols * this.bucketRows;
    if (this.bucketHead.length !== n) this.bucketHead = new Int32Array(n);
    this.bucketHead.fill(-1);
    if (this.bucketNext.length !== this.birds.length) this.bucketNext = new Int32Array(this.birds.length);
    for (let i = 0; i < this.birds.length; i++) {
      const b = this.birds[i];
      const c = clamp(Math.floor(b.x / size) + 2, 0, this.bucketCols - 1);
      const r = clamp(Math.floor(b.y / size) + 2, 0, this.bucketRows - 1);
      const k = r * this.bucketCols + c;
      this.bucketNext[i] = this.bucketHead[k];
      this.bucketHead[k] = i;
    }
  }

  private stepBirds(dt: number) {
    const { birds, gliders, pointer, width: W, height: H, time } = this;
    const R = this.perception;
    const R2 = R * R;
    const size = R;
    const cols = this.bucketCols;
    const rows = this.bucketRows;
    const head = this.bucketHead;
    const next = this.bucketNext;
    const cur = this.tmp;
    const calmDecay = Math.exp(-dt * 0.8);
    const contagion = Math.min(1, dt * 6);

    for (let i = 0; i < birds.length; i++) {
      const b = birds[i];
      const fl = FLOCKS[b.flock];
      const spread = 1 + 1.6 * b.alarm;
      const sepX = this.sepX[b.flock] * spread;
      const sepY = this.sepY[b.flock] * spread;
      const speed = Math.hypot(b.vx, b.vy) || 1;
      const hx = b.vx / speed;
      const hy = b.vy / speed;

      let ax = 0, ay = 0, sx = 0, sy = 0, avx = 0, avy = 0, cx = 0, cy = 0, n = 0, neighbourAlarm = 0;
      const bc = clamp(Math.floor(b.x / size) + 2, 0, cols - 1);
      const br = clamp(Math.floor(b.y / size) + 2, 0, rows - 1);
      for (let r = Math.max(0, br - 1); r <= Math.min(rows - 1, br + 1); r++) {
        for (let c = Math.max(0, bc - 1); c <= Math.min(cols - 1, bc + 1); c++) {
          let j = head[r * cols + c];
          while (j !== -1) {
            if (j !== i) {
              const o = birds[j];
              const dx = o.x - b.x;
              const dy = o.y - b.y;
              const d2 = dx * dx + dy * dy;
              if (d2 < R2 && d2 > 1e-6) {
                const d = Math.sqrt(d2);
                if ((dx * hx + dy * hy) / d > BLIND_COS) {
                  const qx = dx / sepX;
                  const qy = dy / sepY;
                  const q2 = qx * qx + qy * qy;
                  if (q2 < 1) {
                    const q = Math.sqrt(q2) || 1e-3;
                    const k = (1 - q) / q;
                    sx -= qx * k;
                    sy -= qy * k;
                  }
                  if (o.flock === b.flock) {
                    avx += o.vx;
                    avy += o.vy;
                    cx += dx;
                    cy += dy;
                    n++;
                  } else if (d < this.foreignSep) {
                    const k = ((1 - d / this.foreignSep) / d) * 0.6;
                    sx -= dx * k;
                    sy -= dy * k;
                  }
                  if (o.alarm > neighbourAlarm) neighbourAlarm = o.alarm;
                }
              }
            }
            j = next[j];
          }
        }
      }

      ax += sx * SEPARATION_K;
      ay += sy * SEPARATION_K;
      if (n > 0) {
        const alignK = ALIGN_K * fl.align;
        const cohesionK = COHESION_K * fl.cohesion * (1 - 0.8 * b.alarm);
        ax += (avx / n - b.vx) * alignK + (cx / n) * cohesionK;
        ay += (avy / n - b.vy) * alignK + (cy / n) * cohesionK;
        if (fl.mill > 0) {
          const cl = Math.hypot(cx, cy) || 1;
          ax += (-cy / cl) * b.millDir * fl.mill * (1 - b.alarm);
          ay += (cx / cl) * b.millDir * fl.mill * (1 - b.alarm);
        }
      }

      // Give the big gliders a respectful berth.
      let fear = 0;
      for (const g of gliders) {
        const fearR = g.length * 0.45 + 40;
        let best = Infinity, gx = 0, gy = 0;
        for (let k = 0; k <= 14; k += 2) {
          const nx = g.nodes[k * 2];
          const ny = g.nodes[k * 2 + 1];
          const d2 = (b.x - nx) ** 2 + (b.y - ny) ** 2;
          if (d2 < best) {
            best = d2;
            gx = nx;
            gy = ny;
          }
        }
        const d = Math.sqrt(best);
        if (d >= fearR || d < 1e-3) continue;
        let w = 1 - d / fearR;
        w *= w;
        ax += ((b.x - gx) / d) * FLEE_K * w;
        ay += ((b.y - gy) / d) * FLEE_K * w;
        fear = Math.max(fear, Math.sqrt(w) * 0.7);
      }

      if (pointer.active) {
        const pr = 110;
        const dx = b.x - pointer.x;
        const dy = b.y - pointer.y;
        const d = Math.hypot(dx, dy);
        if (d < pr && d > 1e-3) {
          const w = (1 - d / pr) ** 2;
          ax += (dx / d) * FLEE_K * w;
          ay += (dy / d) * FLEE_K * w;
          fear = Math.max(fear, Math.sqrt(w) * 0.8);
        }
      }

      let alarm = Math.max(b.alarm * calmDecay, fear);
      const relayed = neighbourAlarm * 0.84;
      if (relayed > alarm) alarm += (relayed - alarm) * contagion;
      b.alarm = alarm;

      // Birds wrap horizontally (they fly across the whole sky) but stay
      // above the cloud sea and below the top edge.
      const top = 30;
      const floor = H * 0.86;
      if (b.y < top) ay += (top - b.y) * 6;
      else if (b.y > floor) ay -= (b.y - floor) * 6;

      // Thermals and a breeze.
      current(b.x, b.y, time, cur);
      ax += cur.x * 0.45 + (Math.random() - 0.5) * fl.jitter;
      ay += cur.y * 0.35 + (Math.random() - 0.5) * fl.jitter;
      ay -= b.vy * 0.9 * (1 - 0.6 * b.alarm);

      const preferred = fl.cruise * (1 + 1.1 * b.alarm);
      ax += (preferred - speed) * hx * 1.6;
      ay += (preferred - speed) * hy * 1.6;

      const before = Math.atan2(b.vy, b.vx);
      b.vx += ax * dt;
      b.vy += ay * dt;
      const maxSpeed = fl.maxSpeed * (1 + 1.4 * b.alarm);
      const s = Math.hypot(b.vx, b.vy);
      if (s > maxSpeed) {
        b.vx *= maxSpeed / s;
        b.vy *= maxSpeed / s;
      } else if (s < fl.minSpeed && s > 1e-3) {
        b.vx *= fl.minSpeed / s;
        b.vy *= fl.minSpeed / s;
      }
      b.turn += (angleDiff(before, Math.atan2(b.vy, b.vx)) / dt - b.turn) * Math.min(1, dt * 8);
      b.phase += dt * TAU * fl.flap * (0.8 + 0.6 * b.alarm);
      b.x += b.vx * dt;
      b.y = clamp(b.y + b.vy * dt, -40, H + 40);
      if (b.x < -30) b.x += W + 60;
      else if (b.x > W + 30) b.x -= W + 60;
    }
  }

  private stepGliders(dt: number) {
    const { gliders, width: W, height: H, time } = this;
    for (const g of gliders) {
      const L = g.length;
      const nodes = g.nodes;
      const hx = nodes[0];
      const hy = nodes[1];

      // The anchor drifts slowly across the sky, so circuits never repeat.
      g.anchorX += Math.cos(time * 0.03 + g.id * 2.1) * dt * 9;
      g.anchorY += Math.sin(time * 0.023 + g.id * 1.3) * dt * 6;
      g.anchorX = clamp(g.anchorX, W * 0.12, W * 0.88);
      g.anchorY = clamp(g.anchorY, H * 0.14, H * 0.72);

      let dx = Math.cos(g.heading);
      let dy = Math.sin(g.heading);
      g.wander = clamp(g.wander + (Math.random() - 0.5) * dt * 2.4, -0.9, 0.9);
      dx += Math.cos(g.heading + g.wander) * 0.4;
      dy += Math.sin(g.heading + g.wander) * 0.4;

      // Lazy circuit around the anchor.
      const rx = hx - g.anchorX;
      const ry = hy - g.anchorY;
      const r = Math.hypot(rx, ry) || 1;
      const radial = clamp((g.orbitRadius - r) / g.orbitRadius, -1, 1);
      dx += ((-ry / r) * g.orbitDir + (rx / r) * radial * 0.9) * 0.6;
      dy += ((rx / r) * g.orbitDir + (ry / r) * radial * 0.9) * 0.6;

      for (const other of gliders) {
        if (other === g) continue;
        for (let k = 0; k < GLIDER_NODES; k += 4) {
          const ox = hx - other.nodes[k * 2];
          const oy = hy - other.nodes[k * 2 + 1];
          const d = Math.hypot(ox, oy);
          const range = (L + other.length) * 0.42;
          if (d < range && d > 1e-3) {
            const w = (1 - d / range) * 2.6;
            dx += (ox / d) * w;
            dy += (oy / d) * w;
          }
        }
      }

      const over = Math.max(-hx, hx - W, -hy, hy - H * 0.92);
      if (over > -L * 0.1) {
        const w = clamp((over + L * 0.1) / (L * 0.4), 0, 1) * 3;
        const toX = W / 2 - hx;
        const toY = H * 0.45 - hy;
        const d = Math.hypot(toX, toY) || 1;
        dx += (toX / d) * w;
        dy += (toY / d) * w;
      }

      const desired = Math.atan2(dy, dx);
      const maxTurn = Math.min(0.55, g.speed / (L * 0.25)) * dt;
      const turned = clamp(angleDiff(g.heading, desired), -maxTurn, maxTurn);
      g.heading += turned;
      g.turn += (turned / dt - g.turn) * Math.min(1, dt * 2.5);

      const cruise = g.kind === "koi" ? 26 + L * 0.05 : 14 + L * 0.03;
      g.speed += (cruise * (1 + 0.15 * Math.sin(time * 0.4 + g.id)) - g.speed) * Math.min(1, dt * 0.8);
      const beat = g.kind === "manta" ? 1.1 : g.kind === "humpback" ? 0.9 : 2.4;
      g.phase += dt * (beat + g.speed / 40);

      nodes[0] += Math.cos(g.heading) * g.speed * dt;
      nodes[1] += Math.sin(g.heading) * g.speed * dt;

      const seg = L / (GLIDER_NODES - 1);
      const maxBend = g.kind === "koi" ? 0.2 : 0.1;
      let prevAngle = g.heading + Math.PI;
      for (let k = 1; k < GLIDER_NODES; k++) {
        const px = nodes[(k - 1) * 2];
        const py = nodes[(k - 1) * 2 + 1];
        let angle = Math.atan2(nodes[k * 2 + 1] - py, nodes[k * 2] - px);
        angle = prevAngle + clamp(angleDiff(prevAngle, angle), -maxBend, maxBend);
        nodes[k * 2] = px + Math.cos(angle) * seg;
        nodes[k * 2 + 1] = py + Math.sin(angle) * seg;
        prevAngle = angle;
      }
    }
  }
}
