/**
 * 陪伴鱼（灯科小鱼）。金鱼是主角，这群小鱼提供尺度感与群游的动感。
 *
 * 参数含义与原项目一致：align / cohesion / jitter / mill 决定群体形状。
 * 小鱼比原来游得更慢、更贴，像水族箱里一群不离不散的红绿灯。
 */
export interface Species {
  name: string;
  cruise: number;
  maxSpeed: number;
  minSpeed: number;
  /** 新鱼群成为这一种的概率权重。 */
  weight: number;
  schoolSize: [number, number];
  /** 个人空间（单位：格子），保证每条鱼占一个字符格。 */
  spacing: [number, number];
  align: number;
  cohesion: number;
  jitter: number;
  /** 绕局部中心的切向力：>0 会让鱼群转成漩涡。 */
  mill: number;
  /** 抑制垂直速度：真鱼大多平游。 */
  verticalDrag: number;
  /** 这条小鱼的字符色。 */
  color: [number, number, number];
}

export const SPECIES: Species[] = [
  {
    name: "neon",
    cruise: 26, maxSpeed: 46, minSpeed: 12, weight: 3,
    schoolSize: [20, 32], spacing: [1.45, 0.95],
    align: 2.2, cohesion: 1.9, jitter: 26, mill: 0, verticalDrag: 1.2,
    color: [84, 176, 226],
  },
  {
    name: "cardinal",
    cruise: 28, maxSpeed: 50, minSpeed: 14, weight: 3,
    schoolSize: [18, 28], spacing: [1.5, 1],
    align: 2.4, cohesion: 1.7, jitter: 28, mill: 0, verticalDrag: 1.3,
    color: [232, 118, 118],
  },
  {
    name: "glowlight",
    cruise: 24, maxSpeed: 44, minSpeed: 12, weight: 2,
    schoolSize: [14, 22], spacing: [1.55, 1],
    align: 2, cohesion: 2, jitter: 24, mill: 0, verticalDrag: 1,
    color: [214, 176, 96],
  },
  {
    name: "rasbora",
    cruise: 30, maxSpeed: 54, minSpeed: 14, weight: 2,
    schoolSize: [12, 20], spacing: [1.7, 1.05],
    align: 2.6, cohesion: 1.4, jitter: 30, mill: 0, verticalDrag: 1.6,
    color: [206, 146, 126],
  },
  {
    name: "guppy",
    cruise: 22, maxSpeed: 42, minSpeed: 10, weight: 1,
    schoolSize: [8, 14], spacing: [1.9, 1.15],
    align: 1.6, cohesion: 1.6, jitter: 34, mill: 0, verticalDrag: 1.4,
    color: [158, 142, 218],
  },
  {
    // Shrimp are deliberately seeded, rather than selected as an ordinary school.
    name: "shrimp",
    cruise: 21, maxSpeed: 40, minSpeed: 8, weight: 0,
    schoolSize: [4, 8], spacing: [2.1, 1.4],
    align: 1.3, cohesion: 1.1, jitter: 28, mill: 0, verticalDrag: 1,
    color: [245, 155, 118],
  },
];

export const SHRIMP_SPECIES_INDEX = SPECIES.length - 1;

const TOTAL_WEIGHT = SPECIES.reduce((sum, s) => sum + s.weight, 0);

export function pickSpecies() {
  let r = Math.random() * TOTAL_WEIGHT;
  for (let i = 0; i < SPECIES.length; i++) {
    r -= SPECIES[i].weight;
    if (r <= 0) return i;
  }
  return 0;
}
