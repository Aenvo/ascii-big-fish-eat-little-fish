/**
 * 金鱼的侧视解剖。
 *
 * s 沿脊椎从吻端（0）走到尾尖（1）。俯视只需要一个“半宽”，侧视则必须
 * 分别描述背和腹：背线在肩背处高高拱起，腹线在胸腹处饱满、往尾柄收得更快。
 * `SideBody.back` 与 `SideBody.belly` 就是这两条曲线；它们共享尾柄端点，
 * 所以躯干和尾鳍不会在接缝处裂开。
 */

const PROFILE: readonly (readonly [number, number])[] = [
  [0.0, 0.0],
  [0.004, 0.1],
  [0.012, 0.175],
  [0.03, 0.25],
  [0.06, 0.33],
  [0.1, 0.42],
  [0.15, 0.5],
  [0.2, 0.555],
  [0.25, 0.595],
  [0.273, 0.612],
  [0.3, 0.605],
  [0.34, 0.66],
  [0.38, 0.745],
  [0.42, 0.845],
  [0.46, 0.93],
  [0.5, 0.99],
  [0.54, 1.0],
  [0.59, 0.986],
  [0.65, 0.95],
  [0.71, 0.898],
  [0.77, 0.833],
  [0.83, 0.757],
  [0.88, 0.69],
  [0.93, 0.615],
  [0.965, 0.545],
  [1.0, 0.47],
];

/** 单调三次 Hermite：保形，不会在肩背处过冲出一个包。 */
function monotoneCubic(pts: readonly (readonly [number, number])[]) {
  const n = pts.length;
  const xs = new Float32Array(n);
  const ys = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    xs[i] = pts[i][0];
    ys[i] = pts[i][1];
  }
  const d = new Float32Array(n - 1);
  for (let i = 0; i < n - 1; i++) d[i] = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]);
  const m = new Float32Array(n);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) m[i] = 0;
    else {
      const w1 = 2 * (xs[i + 1] - xs[i]) + (xs[i] - xs[i - 1]);
      const w2 = xs[i + 1] - xs[i] + 2 * (xs[i] - xs[i - 1]);
      m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
    }
  }
  return (x: number) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (i < n - 2 && x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const t = (x - xs[i]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] +
      (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

const profile = monotoneCubic(PROFILE);
const PEAK_U = 0.54;
const EDGE_TAIL = profile(1);

export interface BodySpec {
  /** 躯干最厚处的基准半高 / 全长。 */
  peak: number;
  /** 吻端到尾柄基部占全长。 */
  end: number;
  /** 尾柄半高 / 最厚处基准半高。 */
  wrist: number;
  /** 越小吻端越钝。 */
  blunt: number;
  /** 最厚处前后微调。 */
  shoulder?: number;
  /** 背线、腹线各自的厚度系数。 */
  back?: number;
  belly?: number;
}

export interface SideBody {
  /** 基准半高，供尾柄和包围盒使用。 */
  (s: number): number;
  /** 从侧线到背鳍基底的距离 / 全长。 */
  back(s: number): number;
  /** 从侧线到腹缘的距离 / 全长。 */
  belly(s: number): number;
}

export function carpBody(spec: BodySpec): SideBody {
  const { peak, end, wrist, blunt } = spec;
  const shoulder = spec.shoulder ?? 0;
  const backScale = spec.back ?? 1.04;
  const bellyScale = spec.belly ?? 0.9;
  const base = (s: number) => {
    if (s <= 0) return 0;
    if (s > end) return 0;
    const u = Math.min(1, s / end);
    const x = u + shoulder * 0.1 * u * (1 - u);
    const r = profile(x);
    return peak * (x <= PEAK_U
      ? Math.pow(r, blunt)
      : 1 - ((1 - wrist) * (1 - r)) / (1 - EDGE_TAIL));
  };
  const body = base as SideBody;
  body.back = (s) => base(s) * backScale;
  // 腹部在头段稍收、胸腹段饱满；尾柄处仍与背线使用同一个基准。
  body.belly = (s) => {
    const u = end > 0 ? Math.max(0, Math.min(1, s / end)) : 0;
    const chest = 0.9 + 0.1 * Math.sin(Math.PI * u);
    return base(s) * bellyScale * chest;
  };
  return body;
}

/**
 * 鲨鱼的侧视身体：流线型。它和金鱼不是同一
 * 条解剖曲线——金鱼圆滚滚，鲨鱼是纺锤形。这里只描述"从侧线到背/腹缘的
 * 距离"，供渲染层画侧视轮廓用；背鳍单独立在外（渲染层处理），不走这条
 * 体曲线。
 */
export function sharkBody(spec: BodySpec): SideBody {
  const { peak, end, wrist, blunt } = spec;
  const backScale = spec.back ?? 1.0;
  const bellyScale = spec.belly ?? 0.82;
  // 鲨鱼剖面：吻端尖、前躯渐宽、最宽在中前部、尾柄细长收束。
  const base = (s: number) => {
    if (s <= 0) return 0;
    if (s > end) return 0;
    const u = Math.min(1, s / end);
    // 纺锤形包络：0→急升→缓降到尾柄。
    const env = Math.sin(Math.PI * Math.pow(u, 0.72));
    return peak * Math.pow(env, 1.15) * (wrist + (1 - wrist) * (1 - 0.0 * u));
  };
  const body = base as SideBody;
  body.back = (s) => base(s) * backScale;
  body.belly = (s) => base(s) * bellyScale * (0.88 + 0.12 * Math.sin(Math.PI * Math.min(1, s / end)));
  return body;
}

/** Side view of an octopus swimming mantle-first, followed by a smaller head; arms are drawn separately. */
export function octopusBody(): SideBody {
  const body = ((s: number) => {
    const mantle = s > 0 && s < 0.39 ? 0.145 * Math.sqrt(Math.max(0, 1 - ((s - 0.195) / 0.195) ** 2)) : 0;
    const head = s > 0.30 && s < 0.54 ? 0.07 * Math.sqrt(Math.max(0, 1 - ((s - 0.42) / 0.12) ** 2)) : 0;
    return Math.max(mantle, head);
  }) as SideBody;
  body.back = body;
  body.belly = body;
  return body;
}

export interface TailSpec {
  root: number;
  span: number;
  flare: number;
  fork: number;
}

const MISS = { hit: false, edge: 0 };
const clamp01 = (x: number) => x < 0 ? 0 : x > 1 ? 1 : x;

/** 尾鳍叶心：上下两叶在这里最靠后。 */
export const LOBE_AT = 0.5;

/** 前缘从尾柄向上下两叶展开。命中与矢量剪影共用这一份几何。 */
export function tailSpread(u: number, wMax: number, baseHalf: number) {
  return baseHalf + (wMax - baseHalf) * Math.pow(u, 1.08);
}

/** 后缘：中间是 V 形缺口，叶尖略收圆。 */
export function tailRear(n: number, fork: number) {
  const q = Math.abs(n);
  if (q < LOBE_AT) return 1 - fork * Math.pow(1 - q / LOBE_AT, 1.4);
  return 1 - 0.1 * Math.pow((q - LOBE_AT) / (1 - LOBE_AT), 1.4);
}

export const TAIL_WAIST = 1.0;

export function inTail(
  s: number,
  a: number,
  L: number,
  tail: TailSpec,
  baseHalf: number,
): { hit: boolean; edge: number } {
  if (s <= tail.root) return MISS;
  const reach = tail.span * L;
  const u = ((s - tail.root) * L) / reach;
  if (u > 1) return MISS;
  const w0 = baseHalf * TAIL_WAIST;
  const wMax = Math.max(w0 * 1.2, tail.flare * reach);
  const q = Math.abs(a);
  const n = q / wMax;
  if (n > 1 || q > tailSpread(u, wMax, w0) || u > tailRear(n, tail.fork)) return MISS;
  return { hit: true, edge: clamp01(u) };
}
