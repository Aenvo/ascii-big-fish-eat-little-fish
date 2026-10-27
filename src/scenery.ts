/**
 * 缸里的景：底砂、水草、水面的波纹。
 *
 * 这些是"这幅画的背景"，不是人工生命——所以全部由确定性哈希生成，
 * 窗口大小变的时候重新长一遍，位置不会乱跳（用随机数就会每次 resize 变样）。
 */
import { clamp, hash3 } from "./math";

/** 一片叶子。一丛水草是几片从同一个根长出来的叶子。 */
export interface Blade {
  /** 相对植株中心的横向偏移（px）。 */
  offset: number;
  /** 相对植株高度的比例。 */
  scale: number;
  /** 整体倾斜量（px），水流推过去的方向。 */
  lean: number;
  phase: number;
  freq: number;
  /** 摆幅（占叶长的比例）。 */
  sway: number;
  /** 叶子粗细：1 = 单格，2 = 双格。 */
  weight: number;
}

export interface Weed {
  x: number;
  base: number;
  height: number;
  color: [number, number, number];
  alpha: number;
  blades: Blade[];
  seed: number;
}

/** 一丛珊瑚：几根分叉的枝条，颜色各异。 */
export interface Coral {
  kind: "staghorn" | "fan";
  x: number;
  base: number;
  height: number;
  color: [number, number, number];
  alpha: number;
  /** 枝条数。 */
  branches: number;
  seed: number;
}

export interface Scenery {
  weeds: Weed[];
  corals: Coral[];
  /** 沙面在屏幕上的高度（px，从底边算）。 */
  sand: number;
  /** 水面带的高度。 */
  surface: number;
}

// 黑水里的草：比白天看水族箱时更亮一档，但仍然是冷的、暗的，
// 它是背景，不能和鱼抢注意力。
const WEED_COLORS: [number, number, number][] = [
  [74, 151, 108],
  [88, 163, 96],
  [59, 134, 108],
  [106, 158, 84],
  [65, 141, 119],
];

// 珊瑚的颜色要丰富：粉、橙、紫、青、黄，是缸底最鲜亮的一抹，
// 但整体仍压在暗水调下，不和鱼抢。
const CORAL_COLORS: [number, number, number][] = [
  [196, 158, 106], // Staghorn: golden brown, with lighter growing tips.
  [188, 119, 159], // Sea fan: muted rose and violet.
  [177, 145, 95],
  [156, 116, 180],
  [207, 170, 118],
  [204, 136, 121],
];

export function buildScenery(W: number, H: number): Scenery {
  const sand = clamp(Math.round(H * 0.12), 28, 130);
  const surface = clamp(Math.round(H * 0.05), 14, 70);

  const weeds: Weed[] = [];
  const count = clamp(Math.round(W / 190), 5, 11);
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    // 位置带一点随机：均匀排开就成了一排篱笆，水草是一丛一丛的。
    const x = W * (0.04 + t * 0.9) + (hash3(i, 3, 11) - 0.5) * W * 0.11;
    const h = clamp(H * (0.13 + hash3(i, 5, 19) * 0.20), 35, 245);
    const near = 0.42 + hash3(i, 9, 23) * 0.58;
    const c = WEED_COLORS[i % WEED_COLORS.length];
    // Seagrass: unbranched ribbon leaves emerge in dense basal tufts.
    const n = 5 + Math.round(hash3(i, 21, 47) * 4);
    const blades: Blade[] = [];
    for (let b = 0; b < n; b++) {
      const r1 = hash3(i * 31 + b, 2, 53);
      const r2 = hash3(i * 31 + b, 5, 59);
      blades.push({
        offset: (b - (n - 1) / 2) * (3 + r1 * 5),
        scale: 0.62 + r2 * 0.46,
        // 水流是一个方向，所以叶片都朝同侧倒，但幅度各不相同。
        lean: (b / Math.max(1, n - 1) - 0.42) * h * 0.55 + 12,
        phase: hash3(i * 31 + b, 7, 61) * Math.PI * 2,
        freq: 0.4 + hash3(i * 31 + b, 11, 67) * 0.55,
        sway: 0.06 + r2 * 0.08,
        weight: r1 > 0.34 ? 2 : 1,
      });
    }
    weeds.push({
      x,
      base: H - sand * (0.35 + hash3(i, 7, 29) * 0.5),
      height: h,
      color: c,
      alpha: 0.34 + near * 0.56,
      blades,
      seed: i * 37 + 7,
    });
  }

  // 珊瑚丛：散布在沙面上，矮墩墩、分枝、颜色鲜艳。
  const corals: Coral[] = [];
  const coralCount = clamp(Math.round(W / 250), 3, 6);
  for (let i = 0; i < coralCount; i++) {
    const t = (i + 0.5) / coralCount;
    const x = W * (0.06 + t * 0.86) + (hash3(i, 41, 7) - 0.5) * W * 0.14;
    const c = CORAL_COLORS[i % CORAL_COLORS.length];
    const near = 0.45 + hash3(i, 43, 17) * 0.55;
    corals.push({
      kind: i % 2 === 0 ? "staghorn" : "fan",
      x,
      base: H - sand * (0.2 + hash3(i, 47, 13) * 0.3),
      height: clamp(H * (0.10 + hash3(i, 53, 19) * 0.12), 42, 175),
      color: c,
      alpha: 0.54 + near * 0.38,
      branches: 4 + Math.round(hash3(i, 59, 23) * 2),
      seed: i * 101 + 3,
    });
  }

  return { weeds, corals, sand, surface };
}
