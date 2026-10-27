/**
 * 一缸金鱼的人工生命模拟。
 *
 * 鱼沿弧线巡游、避让并在边界转向，身体节点依次跟随头部。
 *
 * 伴随鱼：Reynolds boids（分离 / 对齐 / 聚合），金鱼靠近时会小小地炸开
 * 一下再合拢。它们被吃掉会从边缘重新游回来，人口保持稳定。
 */
import { angleDiff, clamp, current, rand, randInt, TAU } from "./math";
import { pickSpecies, SPECIES, SHRIMP_SPECIES_INDEX } from "./species";
import { LENGTH_EXPONENT, speciesLengthPixels } from "./fish-scale";
import { GREAT_WHITE_BODY_AREA } from "./anatomy";

export const SPINE_NODES = 22;
const NPC_TURN_SECONDS = 0.45;
const PLAYER_TURN_SECONDS = 0.75;

export type GoldKind =
  | "ryukin" | "oranda" | "moor" | "fantail" | "pearl" | "calico"
  | "clown" | "koi" | "shark" | "angelfish" | "barracuda"
  | "butterfly" | "puffer" | "tang" | "lionfish" | "octopus";

const CHASE_PROFILES: Partial<Record<GoldKind, readonly [number, number]>> = {
  shark: [280, 400], koi: [225, 330], barracuda: [250, 365],
  lionfish: [190, 280], octopus: [140, 210], tang: [205, 300], puffer: [145, 225],
  angelfish: [160, 240], butterfly: [165, 245], clown: [140, 210],
  ryukin: [175, 260], oranda: [165, 250], moor: [150, 235],
  fantail: [185, 275], pearl: [145, 220], calico: [180, 270],
};

/** Legacy logical-size comparison; runtime relations use rendered body areas. */
export const EAT_RATIO = 1.1;
/** Compare growth counters; species lengths are handled by visibleFoodRelation. */
export function foodRelation(playerSize: number, otherSize: number): "edible" | "danger" | "neutral" {
  if (playerSize > otherSize * EAT_RATIO) return "edible";
  if (otherSize > playerSize * EAT_RATIO) return "danger";
  return "neutral";
}
// Side-view body areas at unit length, integrated from the body profiles in
// renderer.ts. These measure the visible eating relation only; species are no
// longer resized to equal areas, which erased their real differences in length.
const BODY_AREA: Record<GoldKind, number> = {
  ryukin: 0.184163, oranda: 0.180167, moor: 0.170832,
  fantail: 0.140782, pearl: 0.189708, calico: 0.168161,
  clown: 0.161556, koi: 0.140578, shark: GREAT_WHITE_BODY_AREA,
  angelfish: 0.293876, barracuda: 0.090345, butterfly: 0.239224,
  puffer: 0.295682, tang: 0.195466, lionfish: 0.156848, octopus: 0.107091,
};
// A clear difference in body area is needed before one fish can eat another.
// Fish with very similar visible size neither eat each other nor chase.
const BODY_AREA_RATIO = 1.3;

// This aquarium mixes freshwater and marine species, so encounters are a game
// abstraction rather than a real ecosystem. Only animals known to hunt fish
// actively pursue the player; a large bottom-feeding koi is not a predator.
const FISH_PREDATORS: ReadonlySet<GoldKind> = new Set(["shark", "barracuda", "lionfish", "octopus"]);

/** Diet and the same visible area determine both eating and chase cues. */
export function visibleFoodRelation(player: Gold, other: Gold): "edible" | "danger" | "neutral" {
  const playerArea = player.length * player.length * BODY_AREA[player.kind];
  const otherArea = other.length * other.length * BODY_AREA[other.kind];
  if (playerArea > otherArea * BODY_AREA_RATIO) return "edible";
  if (FISH_PREDATORS.has(other.kind) && otherArea > playerArea * BODY_AREA_RATIO) return "danger";
  return "neutral";
}

/** Body ellipses exclude empty water ahead of the nose and trailing fin tips. */
export function bodiesTouch(a: Gold, b: Gold): boolean {
  const spanA = a.kind === "octopus" ? 0.23 : a.kind === "shark" ? 0.42 : 0.35;
  const spanB = b.kind === "octopus" ? 0.23 : b.kind === "shark" ? 0.42 : 0.35;
  const cosA = Math.cos(a.heading), sinA = Math.sin(a.heading);
  const cosB = Math.cos(b.heading), sinB = Math.sin(b.heading);
  const dx = b.nodes[0] - cosB * b.length * spanB - (a.nodes[0] - cosA * a.length * spanA);
  const dy = b.nodes[1] - sinB * b.length * spanB - (a.nodes[1] - sinA * a.length * spanA);
  const longA = a.length * spanA, longB = b.length * spanB;
  const highA = a.length * BODY_AREA[a.kind] / (Math.PI * spanA);
  const highB = b.length * BODY_AREA[b.kind] / (Math.PI * spanB);
  const relative = b.heading - a.heading;
  const along = longA + Math.hypot(longB * Math.cos(relative), highB * Math.sin(relative));
  const across = highA + Math.hypot(longB * Math.sin(relative), highB * Math.cos(relative));
  return ((dx * cosA + dy * sinA) / along) ** 2 + ((-dx * sinA + dy * cosA) / across) ** 2 <= 1;
}
export const FOOD_TIERS = [
  { name: "小丑鱼", kind: "clown", size: 6 },
  { name: "金鱼", kind: "pearl", size: 12 },
  { name: "狮子鱼", kind: "lionfish", size: 16 },
  { name: "蓝章鱼", kind: "octopus", size: 18 },
  { name: "锦鲤", kind: "koi", size: 20 },
  { name: "大梭鱼", kind: "barracuda", size: 22 },
  { name: "大白鲨", kind: "shark", size: 36 },
] as const;
const PREY_ROTATION: GoldKind[] = [
  "clown", "angelfish", "butterfly", "puffer", "clown", "puffer", "angelfish", "clown",
  "octopus", "tang", "barracuda", "moor", "lionfish", "fantail", "calico", "pearl", "ryukin", "oranda",
];
function foodSize(kind: GoldKind): number {
  if (kind === "clown") return 6;
  if (kind === "angelfish" || kind === "butterfly" || kind === "puffer") return 8;
  if (kind === "tang" || kind === "lionfish") return 16;
  if (kind === "octopus") return 18;
  if (kind === "koi") return 20;
  if (kind === "barracuda") return 22;
  if (kind === "shark") return 36;
  return 12;
}

/** 缸里放哪些金鱼；size 相对于最大的那条。 */
export type GoldSpec = { kind: GoldKind; size: number };

/**
 * 默认阵容：六条大小不一的鱼。大小拉开是刻意的——大鱼吃小鱼那种画面
 * 里，鱼总是一小群一小群、有远有近，而不是六条一样大的并列游过。
 */
const DEFAULT_GOLDS: GoldSpec[] = [
  { kind: "ryukin", size: 1 },
  { kind: "oranda", size: 0.88 },
  { kind: "moor", size: 0.8 },
  { kind: "calico", size: 0.72 },
  { kind: "fantail", size: 0.64 },
  { kind: "pearl", size: 0.58 },
];

export interface Fish {
  x: number;
  y: number;
  vx: number;
  vy: number;
  species: number;
  /** 0 平静 → 1 惊慌；会传染给邻居。 */
  alarm: number;
  alive: boolean;
  respawnAt: number;
  /** 摆尾相位。 */
  phase: number;
  /** 平滑后的角速度（rad/s）；急转时会闪亮。 */
  turn: number;
  /** 0.55 远 → 1 近。 */
  depth: number;
  /** 鱼群打旋时共享的旋向。 */
  millDir: 1 | -1;
}

export interface Gold {
  id: number;
  kind: GoldKind;
  length: number;
  /** 脊椎节点位置，鼻尖在前：[x0, y0, x1, y1, ...]。 */
  nodes: Float32Array;
  heading: number;
  speed: number;
  /** 竖向速度（px/s）。鱼不掉头，只上下让路、上下贴向鼠标。 */
  vy: number;
  /** 摆尾相位，驱动渲染时的体波。 */
  phase: number;
  /** 平滑角速度（rad/s）；转身时两侧胸鳍张开程度不同。 */
  turn: number;
  /** 每条鱼自己的快慢，一缸里不该全是同一个速度。 */
  pace: number;
  /** 它偏爱的水层（0 水面 → 1 缸底）。鼠标不在时，鱼在自己的层里游。 */
  bandY: number;
  /**
   * 视野半径（px）。只有落在这圈里的鼠标才会引起注意——远处的鱼看不见
   * 你，照旧游自己的水层。大鱼看得远，小鱼只顾眼前。
   */
  sight: number;
  /**
   * 此刻对鼠标的注意力 0..1。它是"看见"这件事的平滑结果，不是布尔值：
   * 鱼不会一进视野就猛拐，也不会一离开就立刻忘掉，中间有逐渐起意和
   * 慢慢淡出的过程。
   */
  aware: number;
  nextBubble: number;
  /** 0 远 / 1 近。 */
  depth: number;

  // ── 游泳动力学 ───────────────────────────────────────────────
  /** 尾拍频率（Hz）。速度越快摆得越快，画面上鱼身的波动也跟着变快。 */
  beat: number;
  /** 推力 0..1。0 是收鳍滑行，1 是全力摆尾——"爆发-滑行"全靠它。 */
  thrust: number;
  /** 现在是发力段还是滑行段，以及这一段还剩多久。 */
  stroking: boolean;
  strokeUntil: number;
  /** 胸鳍张开程度 0..1。 */
  fin: number;
  /** 侧倾 -1..1，转弯时压向内侧。 */
  bank: number;
  /** 受惊的余悸，0..1，自己衰减。 */
  spook: number;
  /** 性格：胆子小的游得更靠里、让得更早。 */
  shy: number;
  /** 慢速换水层的相位种子。 */
  drift: number;
  /**
   * 游荡角（rad）。参考 Nature of Code 的 wander 行为：鱼的水层起伏不是
   * 周期性的正弦，而是"游荡角随机游走 + 从它取偏移"——上一秒想去哪，
   * 下一秒还大致朝那去，方向有长期连贯性，看起来才像鱼在"想事情"，
   * 而不是被一根周期弹簧拴着。
   */
  wander: number;
  /** 本次穿屏的航向：1 向右，-1 向左。 */
  direction: 1 | -1;
  /** 完全离屏后的再次入场时间；0 表示正在水域里。 */
  respawnAt: number;
  /**
   * 游戏化用的"体型"标量（吃鱼判定依据）。渲染用的 length 是视觉体长，
   * 这个 size 是"谁吃谁"的裁判——一方 > 另一方 × 1.1 才能捕食，
   * 玩家随进食从 12 缓慢增长至最多 45。
   */
  size: number;
  /** 是否玩家控制的那条。玩家鱼会转向追鼠标，不吃则长大。 */
  isPlayer: boolean;
  /** 张嘴动作 0..1：吃到鱼时突然张嘴又合上。 */
  mouth: number;
  /** Yaw: one side → front view → the other side, 0..1. */
  turnProgress?: number;
  turnTo?: 1 | -1;
  playerVx?: number;
}

export interface Bubble {
  x: number;
  y: number;
  r: number;
  /** 上升速度（px/s）。 */
  rise: number;
  life: number;
  max: number;
  /** 左右摆动的相位种子。 */
  seed: number;
}

export interface WorldEvent {
  kind: "splash";
  x: number;
  y: number;
}

const FISH_SEPARATION_K = 420;
const FISH_ALIGN_K = 1.4;
const FISH_COHESION_K = 1;
const FISH_FLEE_K = 900;
const BLIND_COS = -0.6; // 左右各 127° 以内算看得见

export class World {
  width = 0;
  height = 0;
  time = 0;
  fish: Fish[] = [];
  golds: Gold[] = [];
  bubbles: Bubble[] = [];
  events: WorldEvent[] = [];
  pointer = { x: 0, y: 0, active: false };

  /**
   * 游戏化状态。开启后：第一条鱼变成"玩家鱼"，追鼠标、吃小鱼和大鱼成长；
   * 被更大的鱼吃掉则 gameOver。关闭时是纯观赏水族箱（金鱼横穿画面）。
   */
  gameMode = false;
  score = 0;
  level = 1;
  gameOver = false;
  eatenCount = 0;
  gameStartedAt = 0;
  /** Next prey class and the strict minimum size needed to eat it. */
  get nextFoodTier() {
    const size = this.player?.size ?? 12;
    const tiers = FOOD_TIERS.map(tier => ({ ...tier, threshold: this.preyThreshold(tier.kind) }))
      .sort((a, b) => a.threshold - b.threshold);
    const tier = tiers.find(tier => size <= tier.threshold);
    return tier ? { ...tier, threshold: Math.ceil(tier.threshold * 10) / 10 } : null;
  }
  /** Species-specific chase entry/exit distances, scaled for the current tank. */
  getChaseRanges(g: Gold) {
    const [enter, exit] = CHASE_PROFILES[g.kind] ?? [175, 260];
    const scale = clamp(Math.min(this.width, this.height) / 720, 0.55, 1.25);
    return { enter: Math.round(enter * scale), exit: Math.round(exit * scale) };
  }

  /** True only while this visible predator is actively pursuing the player. */
  isChasing(g: Gold) {
    return !!(this.gameMode && !this.gameOver && this.player && !g.isPlayer &&
      g.respawnAt === 0 && !this.biteLocks.has(g) &&
      visibleFoodRelation(this.player, g) === "danger" && this.npcReactions.get(g)?.mode === "danger");
  }
  /** 玩家鱼的引用；gameMode 下由 seed 里第一条 isPlayer 的鱼充当。 */
  player: Gold | null = null;

  /** 小鱼的感知半径；空间哈希的桶大小与之相同。 */
  private perception = 60;
  private sepX: number[] = [];
  private sepY: number[] = [];
  private foreignSep = 40;
  private bucketCols = 0;
  private bucketRows = 0;
  private bucketHead = new Int32Array(0);
  private bucketCount = new Uint16Array(0);
  private bucketNext = new Int32Array(0);
  // Victims remain visible but are held outside the simulation until the bite peaks.
  private biteLocks = new Set<Fish | Gold>();
  private biteVictims: { victim: Fish | Gold; gold: boolean; x: number; y: number; phase: number }[] = [];
  /** Short-lived reactions have a cooldown so fish do not jitter or pursue forever. */
  private npcReactions = new WeakMap<Gold, { mode: "edible" | "danger" | null; until: number; nextDecision: number; nextTurn: number }>();
  private initialSchoolPending = new Set<Fish>();
  private lastSpawn = 0;
  private preyRotation = 0;
  private tmp = { x: 0, y: 0 };
  /** 无散度洋流的复用临时向量（每帧每条鱼查一次，别分配对象）。 */
  private cur = { x: 0, y: 0 };

  /** fishCount 覆盖按面积估算的小鱼数量。 */
  constructor(
    private goldSpecs: GoldSpec[] = DEFAULT_GOLDS,
    private fishCount?: number,
  ) {}

  /** Species use researched reference lengths; size tracks growth within a species. */
  private gameLength(size: number, kind: GoldKind) {
    return speciesLengthPixels(kind, this.width, this.height) * Math.pow(size / foodSize(kind), LENGTH_EXPONENT);
  }

  /** Progress follows the actual rendered silhouette, including deep-bodied fish. */
  private preyThreshold(kind: GoldKind) {
    const playerKind = this.player?.kind ?? "pearl";
    const playerBase = speciesLengthPixels(playerKind, this.width, this.height);
    const preyBase = speciesLengthPixels(kind, this.width, this.height);
    const ratio = preyBase * preyBase * BODY_AREA[kind] * BODY_AREA_RATIO /
      (playerBase * playerBase * BODY_AREA[playerKind]);
    return foodSize(playerKind) * Math.pow(ratio, 1 / (2 * LENGTH_EXPONENT));
  }

  /**
   * 开启"大鱼吃小鱼"游戏模式：把第一条鱼设成玩家鱼，其余按体型分级
   * （金鱼 / 锦鲤 / 鲨鱼）作为可吃或危险的对手。
   */
  startGame() {
    // Drop all references to the previous round before replacing its population.
    this.cancelBite();
    this.initialSchoolPending.clear();
    this.seed();
    this.bubbles = [];
    this.events = [];
    this.lastSpawn = this.time;
    this.preyRotation = 0;
    this.gameMode = true;
    this.gameOver = false;
    this.score = 0;
    this.level = 1;
    this.eatenCount = 0;
    this.gameStartedAt = this.time;
    this.pointer.active = false;
    // 选最小的普通金鱼做玩家：大鱼吃小鱼的开局就该从"最小的鱼"玩起，
    // 一路吃上去。排除锦鲤/鲨鱼（那是敌人）。golds 已按 length 升序，
    // 取第 0 条即最小。
    const candidates = this.golds.filter(
      (g) => g.kind !== "shark" && g.kind !== "koi",
    );
    // All-predator custom lineups still need a playable fish.
    const player = candidates[0] ?? this.golds[0];
    if (!candidates.length) player.kind = "clown";
    player.isPlayer = true;
    player.size = 12;
    player.direction = 1;
    player.respawnAt = 0;
    player.heading = 0;
    // 玩家鱼保持小巧，尺寸随吃鱼成长，起步是最小的一档。
    player.length = this.gameLength(player.size, player.kind);
    // The nose is half a body length to the right of center, so the fish's
    // whole silhouette starts in the middle, not just its nose.
    player.nodes[0] = this.width * 0.5 + player.length * 0.5;
    player.nodes[1] = this.height * 0.5;
    const seg = player.length / (SPINE_NODES - 1);
    for (let k = 1; k < SPINE_NODES; k++) {
      player.nodes[k * 2] = player.nodes[(k - 1) * 2] - seg;
      player.nodes[k * 2 + 1] = player.nodes[(k - 1) * 2 + 1];
    }
    this.player = player;
    // Preserve a shark and a koi, plus a fish-eating barracuda as an
    // intermediate threat. Koi are large, but do not hunt the player.
    const others0 = this.golds.filter((g) => g !== player);
    const byLen = [...others0].sort((a, b) => b.length - a.length);
    const shark = byLen[0];
    const koi = byLen[1];
    const barracuda = byLen[2];
    if (shark) {
      shark.kind = "shark";
      shark.size = foodSize("shark");
      shark.length = this.gameLength(shark.size, shark.kind);
      // 鲨鱼延迟入场，给玩家几秒安全期，再慢慢逼近。
      shark.respawnAt = this.time + rand(5, 8);
    }
    if (koi) {
      koi.kind = "koi";
      koi.size = foodSize("koi");
      koi.length = this.gameLength(koi.size, koi.kind);
      // 锦鲤也延迟入场，但它不是追猎者。
      koi.respawnAt = this.time + rand(2.5, 5);
    }
    if (barracuda) {
      barracuda.kind = "barracuda";
      barracuda.size = foodSize("barracuda");
      barracuda.length = this.gameLength(barracuda.size, barracuda.kind);
      barracuda.respawnAt = this.time + rand(3, 5);
    }

    // 补充可吃的小鱼：游戏要有足够的目标，画面里才热闹。
    // 小丑鱼(clown)是最小的一档，玩家开局只能先吃它们，再逐步吃大的。
    let spawnId = 100;
    while (this.golds.filter((g) => !g.isPlayer && g !== shark && g !== koi && g !== barracuda).length < 7) {
      const kind = PREY_ROTATION[this.preyRotation++ % PREY_ROTATION.length];
      const len = this.gameLength(foodSize(kind), kind);
      const nodes = new Float32Array(SPINE_NODES * 2);
      const dir: 1 | -1 = spawnId % 2 === 0 ? 1 : -1;
      const x = dir > 0 ? -len : this.width + len;
      const y = this.height * (0.2 + ((spawnId * 0.37) % 0.6));
      const seg = len / (SPINE_NODES - 1);
      for (let k = 0; k < SPINE_NODES; k++) {
        nodes[k * 2] = x - Math.cos(dir > 0 ? 0 : Math.PI) * seg * k;
        nodes[k * 2 + 1] = y;
      }
      this.golds.push({
        id: spawnId++,
        kind,
        length: len,
        nodes,
        heading: dir > 0 ? 0 : Math.PI,
        speed: (40 + len * 0.1) * 0.9,
        vy: 0,
        phase: rand(0, TAU),
        turn: 0,
        pace: rand(0.84, 1.16),
        bandY: y / this.height,
        sight: len * rand(1.8, 2.4),
        aware: 0,
        nextBubble: rand(1, 6),
        depth: 0.6,
        beat: 1.2,
        thrust: 0.6,
        stroking: true,
        strokeUntil: rand(1, 3),
        fin: 0.5,
        bank: 0,
        spook: 0,
        shy: rand(0.2, 1),
        drift: rand(0, TAU),
        wander: rand(0, TAU),
        direction: dir,
        respawnAt: this.time + rand(0.2, 1.5),
        size: foodSize(kind),
        isPlayer: false,
        mouth: 0,
      });
    }

    // Existing ordinary fish follow the same tiers as the newly spawned fish.
    for (const o of others0) {
      o.isPlayer = false;
      if (o.kind !== "shark" && o.kind !== "koi") {
        o.size = foodSize(o.kind);
        o.length = this.gameLength(o.size, o.kind);
        o.sight = o.length * 2;
      }
    }

    // No other animal is on screen at the start of a round.  Large fish are
    // queued individually; predator delays remain longer than ordinary fish.
    let ordinaryIndex = 0;
    for (const g of this.golds) {
      if (g === player) continue;
      if (g !== shark && g !== koi && g !== barracuda) g.respawnAt = this.time + 1.25 + ordinaryIndex++ * 0.65;
      const outsideX = -g.length * 2;
      for (let k = 0; k < SPINE_NODES; k++) {
        g.nodes[k * 2] = outsideX - k * g.length / (SPINE_NODES - 1);
        g.nodes[k * 2 + 1] = this.height * 0.5;
      }
    }

    // School fish use their normal alive/respawn mechanism so they are neither
    // rendered nor simulated before entering in small groups from an edge.
    this.fish.forEach((fish, i) => {
      fish.alive = false;
      fish.respawnAt = this.time + 1 + Math.floor(i / 6) * 0.85;
      this.initialSchoolPending.add(fish);
    });
  }

  resize(width: number, height: number, cellW: number, cellH: number) {
    const first = this.width === 0;
    this.width = width;
    this.height = height;
    // 间距以格子为单位，保证每条鱼落在自己的字符格里。
    this.sepX = SPECIES.map((sp) => sp.spacing[0] * cellW);
    this.sepY = SPECIES.map((sp) => sp.spacing[1] * cellH);
    this.perception = Math.max(cellH * 3, cellW * 5.5);
    this.foreignSep = cellW * 3;

    if (first || this.golds.length === 0) {
      this.seed();
      return;
    }
    for (const f of this.fish) {
      f.x = clamp(f.x, 0, width);
      f.y = clamp(f.y, 0, height);
    }
    // Keep a captured target's origin inside the resized viewport as well.
    for (const entry of this.biteVictims) {
      if (!entry.gold) {
        entry.x = clamp(entry.x, 0, width);
        entry.y = clamp(entry.y, 0, height);
      }
    }
    // 窗口变了：在水里的鱼把纵向拉回安全水层，横向位置不动——
    // 穿屏模式下左右本来就没有墙；已经完全出屏的直接走"再入场"。
    for (const g of this.golds) {
      if (this.gameMode) {
        const oldLength = g.length;
        const newLength = this.gameLength(g.size, g.kind);
        const scale = oldLength > 0 ? newLength / oldLength : 1;
        const hx = g.nodes[0], hy = g.nodes[1];
        for (let k = 1; k < SPINE_NODES; k++) {
          g.nodes[k * 2] = hx + (g.nodes[k * 2] - hx) * scale;
          g.nodes[k * 2 + 1] = hy + (g.nodes[k * 2 + 1] - hy) * scale;
        }
        g.length = newLength;
        g.sight *= scale;
      }
      const L = g.length;
      // The player must remain visible after a panel is narrowed.
      const playerPad = Math.min(L * 0.4, Math.min(width, height) * 0.2);
      const dx = g.isPlayer ? clamp(g.nodes[0], playerPad, Math.max(playerPad, width - playerPad)) - g.nodes[0] : 0;
      if (dx) for (let k = 0; k < SPINE_NODES; k++) g.nodes[k * 2] += dx;
      const nose = g.nodes[0];
      const tail = g.nodes[(SPINE_NODES - 1) * 2];
      const pad = L * 0.3;
      const outAhead =
        g.direction > 0
          ? nose > width + pad && tail > width + pad
          : nose < -pad && tail < -pad;
      if (outAhead && !g.isPlayer && !this.biteLocks.has(g)) {
        if (g.respawnAt === 0) g.respawnAt = this.time + rand(0.5, 3);
        continue;
      }
      const want = clamp(g.nodes[1], L * 0.55, Math.max(L * 0.55, height - L * 0.55));
      const dy = want - g.nodes[1];
      if (dy) {
        for (let k = 0; k < SPINE_NODES; k++) {
          g.nodes[k * 2 + 1] += dy;
        }
      }
      const entry = this.biteVictims.find(item => item.victim === g);
      if (entry) {
        entry.x += dx;
        entry.y += dy;
      }
    }
  }

  seed() {
    const { width: W, height: H } = this;
    // Smaller side-view fish leave room for the rest of the aquarium.
    const specs = this.goldSpecs.length ? this.goldSpecs : DEFAULT_GOLDS;
    const count = specs.length;

    this.golds = [];
    for (let i = 0; i < count; i++) {
      const { kind, size } = specs[i];
      const length = speciesLengthPixels(kind, W, H) * size;
      const direction: 1 | -1 = i % 2 === 0 ? 1 : -1;
      // 各占一层水。金鱼本来就各有各的深浅，画面才不会挤成一条。
      const band = clamp(0.22 + (i / Math.max(1, count - 1)) * 0.6 + rand(-0.05, 0.05), 0.2, 0.86);
      const gy = clamp((band + rand(-0.04, 0.04)) * H, length * 0.6, H - length * 0.6);
      // 开场先有三条已经在画面里游着，剩下的在画外排队——半秒到一秒
      // 刷一条，画面不会空着等人。
      const onScreen = i < 3;
      const x = onScreen
        ? clamp((0.16 + 0.52 * ((i * 0.618 + 0.2) % 1)) * W, length * 0.8, W - length * 0.8)
        : direction > 0
          ? -length * 0.62
          : W + length * 0.62;
      const heading = direction > 0 ? 0 : Math.PI;
      const nodes = new Float32Array(SPINE_NODES * 2);
      const seg = length / (SPINE_NODES - 1);
      for (let n = 0; n < SPINE_NODES; n++) {
        nodes[n * 2] = x - Math.cos(heading) * seg * n;
        nodes[n * 2 + 1] = gy - Math.sin(heading) * seg * n;
      }
      const g: Gold = {
        id: i + 1,
        kind,
        length,
        nodes,
        heading,
        speed: (40 + length * 0.1) * 0.9,
        vy: 0,
        phase: rand(0, TAU),
        turn: 0,
        pace: rand(0.84, 1.16),
        bandY: band,
        // 视野跟着身量走，再给个体差一点：有的鱼眼尖，有的只顾埋头游。
        sight: length * rand(1.8, 2.4),
        aware: 0,
        nextBubble: rand(1, 6),
        depth: size,
        beat: 1.2,
        thrust: 0.6,
        stroking: true,
        strokeUntil: rand(1, 3),
        fin: 0.5,
        bank: 0,
        spook: 0,
        shy: rand(0.2, 1),
        drift: rand(0, TAU),
        wander: rand(0, TAU),
        direction,
        respawnAt: onScreen ? 0 : this.time + rand(0.2, 0.6) + (i - 3) * rand(0.55, 1.05),
        size: size * foodSize(kind),
        isPlayer: false,
        mouth: 0,
      };
      this.golds.push(g);
    }
    // 小（远）的先画，大的压在上面。
    this.golds.sort((a, b) => a.length - b.length);

    const shrimpCount = this.fishCount === undefined ? clamp(Math.round(W * H / 180000), 4, 8) : Math.min(this.fishCount, 4);
    const total = this.fishCount === undefined ? clamp(Math.round((W * H) / 19000), 24, 78) : Math.max(0, this.fishCount - shrimpCount);
    this.fish = [];
    while (this.fish.length < total) {
      const species = pickSpecies();
      const sp = SPECIES[species];
      const size = Math.min(randInt(sp.schoolSize[0], sp.schoolSize[1]), total - this.fish.length);
      const millDir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
      const cx = rand(W * 0.06, W * 0.94);
      const cy = rand(H * 0.08, H * 0.92);
      // 大多是平游，鱼横着游远多于上下。
      const dir = (Math.random() < 0.5 ? 0 : Math.PI) + rand(-0.5, 0.5);
      for (let k = 0; k < size; k++) {
        this.fish.push({
          x: cx + rand(-1, 1) * this.sepX[species] * Math.sqrt(size),
          y: cy + rand(-1, 1) * this.sepY[species] * Math.sqrt(size) * 0.6,
          vx: Math.cos(dir) * sp.cruise,
          vy: Math.sin(dir) * sp.cruise,
          species,
          alarm: 0,
          alive: true,
          respawnAt: 0,
          phase: rand(0, TAU),
          turn: 0,
          depth: rand(0.55, 1),
          millDir,
        });
      }
    }
    // Put a few edible shrimp first in the opening queue, without replacing
    // the fish schools. Explicit fishCount=0 remains an empty fixture.
    const shrimp = SPECIES[SHRIMP_SPECIES_INDEX];
    for (let i = 0; i < shrimpCount; i++) {
      this.fish.unshift({
        x: rand(W * 0.1, W * 0.9), y: rand(H * 0.25, H * 0.8),
        vx: (i % 2 ? -1 : 1) * shrimp.cruise, vy: rand(-5, 5),
        species: SHRIMP_SPECIES_INDEX, alarm: 0, alive: true, respawnAt: 0,
        phase: rand(0, TAU), turn: 0, depth: rand(0.7, 1), millDir: i % 2 ? -1 : 1,
      });
    }
    this.bucketNext = new Int32Array(this.fish.length);
  }

  /** 点一下水面：炸开一串气泡，小鱼四散，金鱼惊一下随即回神。 */
  splash(x: number, y: number) {
    this.events.push({ kind: "splash", x, y });
    const burst = randInt(10, 16);
    for (let i = 0; i < burst; i++) {
      const a = rand(0, TAU);
      const d = rand(0, 26);
      this.bubbles.push({
        x: x + Math.cos(a) * d,
        y: y + Math.sin(a) * d,
        r: rand(0.9, 2.6),
        rise: rand(16, 46),
        life: rand(3, 6.5),
        max: 6.5,
        seed: rand(0, TAU),
      });
    }
    const r = 220;
    for (const f of this.fish) {
      if (!f.alive) continue;
      const dx = f.x - x;
      const dy = f.y - y;
      const d = Math.hypot(dx, dy);
      if (d > r || d < 1e-3) continue;
      const k = (1 - d / r) * 240;
      f.vx += (dx / d) * k;
      f.vy += (dy / d) * k;
      f.alarm = 1;
    }
    // 金鱼只是被吓一跳：加速、往远离水花的那一层窜一段，方向不变。
    for (const g of this.golds) {
      if (g.respawnAt > 0) continue;
      const dx = g.nodes[0] - x;
      const dy = g.nodes[1] - y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > 340) continue;
      const flee = 1 - d / 340;
      g.speed = Math.min(g.speed + flee * 90, g.length * 0.34);
      g.vy += (dy / d) * flee * 150;
      // 惊悸：会让它冲刺一段（速度乘 2.1），然后慢慢平息。
      g.spook = Math.max(g.spook, flee);
    }
  }

  step(dt: number) {
    this.time += dt;
    this.rebuildHash();
    this.stepFish(dt);
    this.stepGolds(dt);
    if (this.gameMode && !this.gameOver) this.stepPlayer(dt);
    this.stepBubbles(dt);
    this.respawn();
  }

  private rebuildHash() {
    const size = this.perception;
    const pad = 2;
    this.bucketCols = Math.ceil(this.width / size) + pad * 2;
    this.bucketRows = Math.ceil(this.height / size) + pad * 2;
    const n = this.bucketCols * this.bucketRows;
    if (this.bucketHead.length !== n) {
      this.bucketHead = new Int32Array(n);
      this.bucketCount = new Uint16Array(n);
    }
    this.bucketHead.fill(-1);
    this.bucketCount.fill(0);
    if (this.bucketNext.length !== this.fish.length) {
      this.bucketNext = new Int32Array(this.fish.length);
    }
    for (let i = 0; i < this.fish.length; i++) {
      const f = this.fish[i];
      if (!f.alive || this.biteLocks.has(f)) continue;
      const b = this.bucketOf(f.x, f.y);
      this.bucketNext[i] = this.bucketHead[b];
      this.bucketHead[b] = i;
      this.bucketCount[b]++;
    }
  }

  private bucketOf(x: number, y: number) {
    const size = this.perception;
    const c = clamp(Math.floor(x / size) + 2, 0, this.bucketCols - 1);
    const r = clamp(Math.floor(y / size) + 2, 0, this.bucketRows - 1);
    return r * this.bucketCols + c;
  }

  private stepFish(dt: number) {
    const { fish, golds, pointer, width: W, height: H, time } = this;
    const R = this.perception;
    const R2 = R * R;
    const foreignSep = this.foreignSep;
    const size = this.perception;
    const cols = this.bucketCols;
    const rows = this.bucketRows;
    const head = this.bucketHead;
    const next = this.bucketNext;
    const cur = this.tmp;
    const calmDecay = Math.exp(-dt * 0.7);
    const contagion = Math.min(1, dt * 6);

    for (let i = 0; i < fish.length; i++) {
      const f = fish[i];
      if (!f.alive || this.biteLocks.has(f)) continue;
      const sp = SPECIES[f.species];
      // 受惊的鱼想要更大的空间：鱼群会在金鱼身边炸开，之后慢慢合拢。
      const spread = 1 + 1.8 * f.alarm;
      const sepX = this.sepX[f.species] * spread;
      const sepY = this.sepY[f.species] * spread;

      const speed = Math.hypot(f.vx, f.vy) || 1;
      const hx = f.vx / speed;
      const hy = f.vy / speed;

      let ax = 0;
      let ay = 0;
      let sx = 0;
      let sy = 0;
      let avx = 0;
      let avy = 0;
      let cx = 0;
      let cy = 0;
      let n = 0;
      let neighbourAlarm = 0;

      const bc = clamp(Math.floor(f.x / size) + 2, 0, cols - 1);
      const br = clamp(Math.floor(f.y / size) + 2, 0, rows - 1);
      for (let r = Math.max(0, br - 1); r <= Math.min(rows - 1, br + 1); r++) {
        for (let c = Math.max(0, bc - 1); c <= Math.min(cols - 1, bc + 1); c++) {
          let j = head[r * cols + c];
          while (j !== -1) {
            if (j !== i) {
              const o = fish[j];
              const dx = o.x - f.x;
              const dy = o.y - f.y;
              const d2 = dx * dx + dy * dy;
              if (d2 < R2 && d2 > 1e-6) {
                const d = Math.sqrt(d2);
                // 正后方的盲区。
                if ((dx * hx + dy * hy) / d > BLIND_COS) {
                  // 椭圆个人空间：横向宽、纵向窄。
                  const qx = dx / sepX;
                  const qy = dy / sepY;
                  const q2 = qx * qx + qy * qy;
                  if (q2 < 1) {
                    const q = Math.sqrt(q2) || 1e-3;
                    const k = (1 - q) / q;
                    sx -= qx * k;
                    sy -= qy * k;
                  }
                  if (o.species === f.species) {
                    avx += o.vx;
                    avy += o.vy;
                    cx += dx;
                    cy += dy;
                    n++;
                  } else if (d < foreignSep) {
                    // 不同种各成群。
                    const k = ((1 - d / foreignSep) / d) * 0.6;
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

      ax += sx * FISH_SEPARATION_K;
      ay += sy * FISH_SEPARATION_K;
      if (n > 0) {
        const alignK = FISH_ALIGN_K * sp.align;
        const cohesionK = FISH_COHESION_K * sp.cohesion * (1 - 0.8 * f.alarm);
        ax += (avx / n - f.vx) * alignK + (cx / n) * cohesionK;
        ay += (avy / n - f.vy) * alignK + (cy / n) * cohesionK;
        if (sp.mill > 0) {
          const cl = Math.hypot(cx, cy) || 1;
          ax += (-cy / cl) * f.millDir * sp.mill * (1 - f.alarm);
          ay += (cx / cl) * f.millDir * sp.mill * (1 - f.alarm);
        }
      }

      // 金鱼是这片水域里最大的东西：小鱼会给它让路，但不会被吃掉。
      let fear = 0;
      for (const g of golds) {
        if (this.biteLocks.has(g)) continue;
        const fearR = g.length * 0.42 + 40;
        let best = Infinity;
        let bx = 0;
        let by = 0;
        for (let k = 0; k <= 8; k += 2) {
          const nx = g.nodes[k * 2];
          const ny = g.nodes[k * 2 + 1];
          const d2 = (f.x - nx) ** 2 + (f.y - ny) ** 2;
          if (d2 < best) {
            best = d2;
            bx = nx;
            by = ny;
          }
        }
        const d = Math.sqrt(best);
        if (d >= fearR || d < 1e-3) continue;
        let w = 1 - d / fearR;
        w *= w;
        const awayX = (f.x - bx) / d;
        const awayY = (f.y - by) / d;
        // 从金鱼的航线两侧绕开，形成喷泉式的让路。
        const gx = Math.cos(g.heading);
        const gy = Math.sin(g.heading);
        const side = gx * (f.y - g.nodes[1]) - gy * (f.x - g.nodes[0]) >= 0 ? 1 : -1;
        ax += (awayX * 0.8 - gy * side * 0.7) * FISH_FLEE_K * w;
        ay += (awayY * 0.8 + gx * side * 0.7) * FISH_FLEE_K * w;
        fear = Math.max(fear, Math.sqrt(w) * 0.9);
      }

      if (pointer.active) {
        const pr = 120;
        const dx = f.x - pointer.x;
        const dy = f.y - pointer.y;
        const d = Math.hypot(dx, dy);
        if (d < pr && d > 1e-3) {
          const w = (1 - d / pr) ** 2;
          ax += (dx / d) * FISH_FLEE_K * w;
          ay += (dy / d) * FISH_FLEE_K * w;
          fear = Math.max(fear, Math.sqrt(w) * 0.8);
        }
      }

      // 惊慌：直接威胁设定它，邻居逐跳传递（每跳稍弱），自己也会衰减。
      let alarm = Math.max(f.alarm * calmDecay, fear);
      const relayed = neighbourAlarm * 0.86;
      if (relayed > alarm) alarm += (relayed - alarm) * contagion;
      f.alarm = alarm;

      // 软墙。
      const m = 36;
      if (f.x < m) ax += (m - f.x) * 7;
      else if (f.x > W - m) ax -= (f.x - (W - m)) * 7;
      if (f.y < m) ay += (m - f.y) * 7;
      else if (f.y > H - m) ay -= (f.y - (H - m)) * 7;

      // 环境水流 + 一点个体的不安分。
      current(f.x, f.y, time, cur);
      ax += cur.x * 0.5 + (Math.random() - 0.5) * sp.jitter;
      ay += cur.y * 0.5 + (Math.random() - 0.5) * sp.jitter;
      // 平游，除非在逃。
      ay -= f.vy * sp.verticalDrag * (1 - 0.7 * f.alarm);

      // 向偏好速度收敛，惊慌时更快。
      const preferred = sp.cruise * (1 + 1.3 * f.alarm);
      ax += (preferred - speed) * hx * 1.6;
      ay += (preferred - speed) * hy * 1.6;

      const before = Math.atan2(f.vy, f.vx);
      f.vx += ax * dt;
      f.vy += ay * dt;
      const maxSpeed = sp.maxSpeed * (1 + 1.8 * f.alarm);
      const s = Math.hypot(f.vx, f.vy);
      if (s > maxSpeed) {
        f.vx *= maxSpeed / s;
        f.vy *= maxSpeed / s;
      } else if (s < sp.minSpeed && s > 1e-3) {
        f.vx *= sp.minSpeed / s;
        f.vy *= sp.minSpeed / s;
      }
      // The velocity can change speed quickly, but its direction turns smoothly.
      const targetHeading = Math.atan2(f.vy, f.vx);
      const heading = before + clamp(angleDiff(before, targetHeading), -5 * dt, 5 * dt);
      const boundedSpeed = Math.hypot(f.vx, f.vy);
      f.vx = Math.cos(heading) * boundedSpeed;
      f.vy = Math.sin(heading) * boundedSpeed;
      f.turn += (angleDiff(before, Math.atan2(f.vy, f.vx)) / dt - f.turn) * Math.min(1, dt * 8);
      f.phase += dt * (7 + Math.hypot(f.vx, f.vy) * 0.12);
      f.x = clamp(f.x + f.vx * dt, -60, W + 60);
      f.y = clamp(f.y + f.vy * dt, -60, H + 60);
    }
  }

  /** Keep the front of the fish firm; only the tail can lag behind a turn. */
  private followSpine(g: Gold) {
    const nodes = g.nodes;
    const seg = g.length / (SPINE_NODES - 1);
    const bodyAngle = g.heading + Math.PI;
    let backward = bodyAngle;
    for (let k = 1; k < SPINE_NODES; k++) {
      const i = k * 2;
      const px = nodes[i - 2], py = nodes[i - 1];
      const dx = nodes[i] - px, dy = nodes[i + 1] - py;
      const target = Math.hypot(dx, dy) > 0.001 ? Math.atan2(dy, dx) : backward;
      // Constrain the total deflection from the head, not just each joint:
      // otherwise small joint bends add up to a snake-like full-body curve.
      const u = k / (SPINE_NODES - 1);
      const tail = clamp((u - 0.65) / 0.35, 0, 1);
      const limit = 0.42 * tail * tail * (3 - 2 * tail);
      const desired = bodyAngle + clamp(angleDiff(bodyAngle, target), -limit, limit);
      backward += clamp(angleDiff(backward, desired), -0.08, 0.08);
      nodes[i] = px + Math.cos(backward) * seg;
      nodes[i + 1] = py + Math.sin(backward) * seg;
    }
  }

  private stepGolds(dt: number) {
    const { golds, width: W, height: H, time } = this;
    const p = this.pointer;
    for (const g of golds) {
      if (g.isPlayer || this.biteLocks.has(g)) continue;
      if (g.respawnAt > 0) {
        const prior = this.npcReactions.get(g);
        if (prior?.mode) {
          prior.mode = null;
          prior.nextDecision = Math.max(prior.nextDecision, time + 1.2);
        }
        // A new pass starts fully side-on, even if the prior pass ended mid-turn.
        g.turnTo = undefined;
        g.turnProgress = undefined;
        if (time >= g.respawnAt) this.enterFromEdge(g);
        continue;
      }
      const L = g.length;
      const nodes = g.nodes;
      const hx = nodes[0], hy = nodes[1];
      if (time >= g.strokeUntil) this.nextStroke(g);
      current(hx, hy, time, this.cur);

      // Swim across the tank with modest vertical movement and occasional reactions.
      g.wander += rand(-0.55, 0.55) * dt * 0.9;
      const homeY = (g.bandY + Math.sin(g.wander) * 0.085) * H;

      // Curiosity only acts while the pointer is within the fish's field of view.
      let seen = 0;
      if (p.active && !this.gameMode) {
        const dx = p.x - hx, dy = p.y - hy;
        const d = Math.hypot(dx, dy);
        if (d > 0.001 && d < g.sight && Math.abs(angleDiff(g.heading, Math.atan2(dy, dx))) < 1.62) {
          seen = (1 - d / g.sight) * (0.72 + g.shy * 0.28);
        }
      }
      g.aware += (seen - g.aware) * Math.min(1, dt * (seen > g.aware ? 2.4 : 1.5));
      const padY = Math.min(H * 0.32, L * 0.45);
      let wantY = clamp(homeY + (p.active && !this.gameMode ? (p.y - homeY) * g.aware * 0.35 : 0), padY, Math.max(padY, H - padY));
      const player = this.player;
      let reaction = this.npcReactions.get(g);
      let mode: "edible" | "danger" | null = null;
      let turned = false;
      if (this.gameMode && !this.gameOver && player) {
        const tail = nodes[(SPINE_NODES - 1) * 2];
        // A large shark can see prey once its head enters; waiting for its entire
        // body to fit would let it swim past the player without ever reacting.
        const visible = hx >= 0 && hx <= W && hy >= 0 && hy <= H;
        const outOfView = (hx < -L && tail < -L) || (hx > W + L && tail > W + L) || hy < -L || hy > H + L;
        const dx = player.nodes[0] - hx, dy = player.nodes[1] - hy;
        const distance = Math.hypot(dx, dy);
        const sight = clamp(Math.max(g.sight, L * 2.8), 110, 260);
        const relation = visibleFoodRelation(player, g);
        const ranges = this.getChaseRanges(g);
        const inFront = dx * g.direction >= -L * 0.15;
        if (!reaction) {
          reaction = { mode: null, until: 0, nextDecision: 0, nextTurn: 0 };
          this.npcReactions.set(g, reaction);
        }
        const stopChase = reaction.mode === "danger" &&
          (outOfView || relation !== "danger" || distance > ranges.exit);
        const stopFlee = reaction.mode === "edible" &&
          (!visible || relation !== "edible" || distance > sight * 1.35 || time >= reaction.until);
        if (stopChase || stopFlee) {
          reaction.mode = null;
          reaction.until = 0;
          reaction.nextDecision = Math.max(reaction.nextDecision, time + 1.2);
        }
        const seesPlayer = visible && inFront &&
          (relation === "danger" ? distance <= ranges.enter : distance < sight);
        if (!reaction.mode && seesPlayer && relation !== "neutral" && time >= reaction.nextDecision) {
          // Predators chase when they see the player; prey may choose to flee.
          reaction.nextDecision = time + rand(1.6, 2.6);
          if (relation === "danger" || Math.random() < 0.75) {
            reaction.mode = relation;
            reaction.until = relation === "edible" ? time + rand(1.1, 2.1) : 0;
          }
        }
        mode = reaction.mode;
        if (mode && !outOfView) {
          const toward: 1 | -1 = dx > 0 ? 1 : -1;
          const desired: 1 | -1 = mode === "danger" ? toward : toward === 1 ? -1 : 1;
          if (g.turnTo === undefined && Math.abs(dx) > Math.max(8, L * 0.15) && desired !== g.direction && time >= reaction.nextTurn) {
            g.turnTo = desired;
            g.turnProgress = 0;
            reaction.nextTurn = time + 1.5;
          }
          const targetY = mode === "danger" ? player.nodes[1] : hy - Math.sign(dy || 1) * H * 0.25;
          wantY = clamp(targetY, padY, Math.max(padY, H - padY));
        }
      }
      // Complete an initiated yaw even if the reaction expires mid-turn.
      // Direction, body orientation and collision anchor stay in sync at the midpoint.
      let yawing = false;
      if (g.turnTo !== undefined) {
        g.turnProgress = Math.min(1, (g.turnProgress ?? 0) + dt / NPC_TURN_SECONDS);
        if (g.turnProgress >= 0.5 && g.direction !== g.turnTo) {
          g.direction = g.turnTo;
          g.heading = g.direction > 0 ? 0 : Math.PI;
          g.turn = 0;
          turned = true;
        }
        if (g.turnProgress >= 1) {
          g.turnTo = undefined;
          g.turnProgress = undefined;
        } else {
          yawing = true;
        }
      }
      const vyMax = Math.max(20, L * 0.25);
      let wantVy = clamp((wantY - hy) * 0.8, -vyMax, vyMax);

      // Neighbours pass above or below rather than forcing a full-body turn.
      let brake = 1;
      for (const other of golds) {
        if (other === g || other.respawnAt > 0 || this.biteLocks.has(other)) continue;
        if (mode === "danger" && other.isPlayer) continue;
        const dx = hx - other.nodes[0], dy = hy - other.nodes[1];
        const rangeX = (L + other.length) * 0.55;
        const rangeY = (L + other.length) * 0.25;
        if (Math.abs(dx) < rangeX && Math.abs(dy) < rangeY) {
          const urgency = (1 - Math.abs(dx) / rangeX) * (1 - Math.abs(dy) / rangeY);
          const away = dy === 0 ? (g.id % 2 ? 1 : -1) : Math.sign(dy);
          wantVy += away * vyMax * urgency;
          if (dx * g.direction < 0) brake = Math.min(brake, 1 - urgency * 0.3);
        }
      }
      const gait = g.stroking ? 1.45 : 0.7;
      // Angelfish hover and turn readily; barracudas alternate cruising and bursts.
      const speciesSpeed = g.kind === "angelfish" || g.kind === "butterfly" ? 0.78 : g.kind === "barracuda" ? (g.stroking ? 1.38 : 0.86) : g.kind === "puffer" ? 0.65 : g.kind === "tang" ? 1.16 : g.kind === "lionfish" ? 0.72 : 1;
      const burst = mode === "danger" ? 1.45 : mode === "edible" ? 1.6 : 1;
      const want = Math.min(160, (40 + L * 0.1) * g.pace * gait * speciesSpeed * (1 + g.spook * 1.1) * brake * burst);
      g.speed += (want - g.speed) * Math.min(1, dt * (want > g.speed ? 2.4 : 1.1));
      g.thrust += ((g.stroking ? 1 : 0.05) - g.thrust) * Math.min(1, dt * 7);
      g.spook = Math.max(0, g.spook - dt * 0.4);
      g.vy += (clamp(wantVy, -vyMax, vyMax) - g.vy) * Math.min(1, dt * 2.5);
      const pitch = clamp(Math.atan2(g.vy, Math.max(1, g.speed)) * 0.42, -0.14, 0.14);
      const heading = g.direction > 0 ? pitch : Math.PI - pitch;
      const delta = turned ? 0 : angleDiff(g.heading, heading);
      g.heading = heading;
      g.turn += (delta / Math.max(dt, 0.001) - g.turn) * Math.min(1, dt * 5);
      g.beat = clamp(0.7 + g.speed / Math.max(L, 1) * 8.5 + g.thrust * 0.5, 0.5, 3.6);
      g.phase += dt * g.beat * TAU;
      g.fin += (clamp(Math.abs(g.turn) / 1.65, 0, 1) * 0.8 - g.fin) * Math.min(1, dt * 6);
      g.bank += (clamp(g.turn / 1.65, -1, 1) * 0.7 - g.bank) * Math.min(1, dt * 6);
      const forward = yawing ? 0 : Math.max(g.speed * 0.65, g.speed + this.cur.x * g.direction);
      nodes[0] = hx + g.direction * forward * dt;
      nodes[1] = clamp(hy + (g.vy + this.cur.y * 0.3) * dt, padY, Math.max(padY, H - padY));
      this.followSpine(g);

      // Once the tail has left, queue a fresh pass from either side.
      const tailX = nodes[(SPINE_NODES - 1) * 2];
      const outAhead = g.direction > 0 ? tailX > W + L * 0.1 : tailX < -L * 0.1;
      if (outAhead) {
        g.respawnAt = time + rand(0.5, 2.4);
        continue;
      }

      // ── 10. 吐泡泡 ───────────────────────────────────────────
      if (time >= g.nextBubble) {
        g.nextBubble = time + rand(2.5, 7.5);
        const n = randInt(1, 2);
        for (let i = 0; i < n; i++) {
          this.bubbles.push({
            x: nodes[0] + rand(-7, 7),
            y: nodes[1] + rand(-5, 5),
            r: rand(0.7, 2),
            rise: rand(12, 30),
            life: rand(2.5, 5.5),
            max: 5.5,
            seed: rand(0, TAU),
          });
        }
      }
    }
  }

  /** 玩家横向朝向随移动方向切换，以独立的竖向速度跟随鼠标。 */
  private stepPlayer(dt: number) {
    const g = this.player;
    if (!g) return;
    const { width: W, height: H, time, pointer: p } = this;
    const L = g.length;
    const nodes = g.nodes;
    const hx = nodes[0];
    const hy = nodes[1];

    // Side-view fish move along both axes, but do not rotate into the page's
    // vertical direction. Smooth horizontal velocity through zero on reversal.
    // Stay at the spawn point until the player actually moves the pointer.
    const tx = p.active ? p.x : hx;
    const ty = p.active ? p.y : hy;
    const dx = tx - hx, dy = ty - hy;
    const dist = Math.hypot(dx, dy);
    const settled = dist <= Math.max(4, L * 0.035);
    const maxSpeed = Math.max(260, L * 1.15);
    const arriveR = Math.max(34, L * 0.55);
    const throttle = clamp(dist / arriveR, 0, 1);
    const response = 1 - Math.exp(-5 * dt);
    const targetX = dist > 0 ? dx / dist * maxSpeed * throttle : 0;
    const targetY = dist > 0 ? dy / dist * maxSpeed * throttle : 0;
    const oldVx = g.playerVx ?? g.direction * g.speed;
    let vx = settled ? 0 : oldVx + (targetX - oldVx) * response;
    g.vy = settled ? 0 : g.vy + (targetY - g.vy) * response;
    const oldDirection = g.direction;
    // Turning is a short yaw in depth, not a 180° roll in the screen plane.
    // Pause horizontal travel while the fish passes through its front view.
    const wantedDirection = targetX > 0 ? 1 : -1;
    if (g.turnTo === undefined && g.mouth <= 0 && Math.abs(dx) > Math.max(8, L * 0.12) && wantedDirection !== g.direction) {
      g.turnTo = wantedDirection;
      g.turnProgress = 0;
    }
    if (g.turnTo !== undefined) {
      g.turnProgress = Math.min(1, (g.turnProgress ?? 0) + dt / PLAYER_TURN_SECONDS);
      if (g.turnProgress >= 0.5) g.direction = g.turnTo;
      vx = 0;
      if (g.turnProgress >= 1) {
        g.turnTo = undefined;
        g.turnProgress = undefined;
      }
    } else if (Math.abs(vx) < 0.5) vx = 0;
    g.playerVx = vx;
    g.speed = Math.abs(vx);
    // A slight pitch reads as rising or sinking without turning the sprite upright.
    const pitch = clamp(g.vy / maxSpeed * 0.16, -0.16, 0.16);
    const oldPitch = oldDirection > 0 ? g.heading : Math.PI - g.heading;
    g.heading = g.direction > 0 ? pitch : Math.PI - pitch;
    const pitchRate = oldDirection === g.direction ? (pitch - oldPitch) / Math.max(dt, 0.001) : 0;
    g.turn += (pitchRate - g.turn) * Math.min(1, dt * 7);
    const speed = Math.hypot(vx, g.vy);
    const rel = speed / Math.max(L, 1);
    g.beat = clamp(0.7 + rel * 8.5 + g.thrust * 0.5, 0.5, 3.6);
    g.phase += dt * g.beat * TAU;
    g.thrust += (clamp(speed / maxSpeed, 0.1, 1) - g.thrust) * Math.min(1, dt * 5);
    g.bank += (clamp(g.turn / 1.5, -1, 1) * 0.7 - g.bank) * Math.min(1, dt * 6);
    const pad = Math.min(L * 0.4, Math.min(W, H) * 0.2);
    nodes[0] = clamp(hx + vx * dt, pad, Math.max(pad, W - pad));
    nodes[1] = clamp(hy + g.vy * dt, pad, Math.max(pad, H - pad));
    this.followSpine(g);

    // ── 5. 吃鱼 / 被吃判定 ─────────────────────────────────
    // A changing mouth cannot begin a bite, but predators remain dangerous.
    this.resolveEating(g, g.turnTo === undefined);

    // Opening reaches its peak at phase 0.5; only then is a bite committed.
    if (!this.gameOver) this.advanceBite(g, dt);

    // ── 6. 吐泡泡 ───────────────────────────────────────────
    if (time >= g.nextBubble) {
      g.nextBubble = time + rand(3, 7);
      this.bubbles.push({
        x: nodes[0] + rand(-6, 6),
        y: nodes[1] + rand(-4, 4),
        r: rand(0.7, 1.8),
        rise: rand(12, 26),
        life: rand(2.5, 5),
        max: 5.5,
        seed: rand(0, TAU),
      });
    }
  }

  /** Resolve bites using the same diet and visible-size relation as pursuit. */
  private resolveEating(g: Gold, allowPrey = true) {
    const hx = g.nodes[0], hy = g.nodes[1];
    // Check lethal contacts first so a death cannot award a simultaneous bite.
    for (const other of this.golds) {
      if (other === g || other.isPlayer || other.respawnAt > 0 || this.biteLocks.has(other)) continue;
      if (bodiesTouch(g, other) && visibleFoodRelation(g, other) === "danger") {
        this.gameOver = true;
        this.cancelBite();
        g.mouth = 0;
        return;
      }
    }

    // Turning prevents new bites but never grants immunity from predators.
    if (!allowPrey) return;

    // Finish an existing bite before catching another animal.
    if (g.mouth > 0 && (g.mouth <= 0.5 || this.biteVictims.length === 0)) return;
    const capture = (victim: Fish | Gold, gold: boolean, x: number, y: number) => {
      // One bite catches one animal; dense schools must not multiply growth.
      if (this.biteVictims.length || this.biteLocks.has(victim)) return;
      if (g.mouth <= 0) g.mouth = 1;
      this.biteLocks.add(victim);
      this.biteVictims.push({ victim, gold, x, y, phase: g.mouth });
    };
    const eatR = g.length * 0.2;
    for (const f of this.fish) {
      if (!f.alive || this.biteLocks.has(f)) continue;
      const dx = f.x - hx, dy = f.y - hy;
      if (dx * dx + dy * dy < eatR * eatR) capture(f, false, f.x, f.y);
    }
    for (const other of this.golds) {
      if (other === g || other.isPlayer || other.respawnAt > 0 || this.biteLocks.has(other)) continue;
      if (bodiesTouch(g, other) && visibleFoodRelation(g, other) === "edible") {
        capture(other, true, other.nodes[0], other.nodes[1]);
      }
    }
  }

  private advanceBite(g: Gold, dt: number) {
    const before = g.mouth;
    const after = Math.max(0, before - dt * 2.5);
    for (const entry of this.biteVictims) {
      const progress = clamp((entry.phase - after) / Math.max(0.001, entry.phase - 0.5), 0, 1);
      const eased = progress * progress * (3 - 2 * progress);
      const mouthX = g.nodes[0] + Math.cos(g.heading) * Math.max(3, g.length * 0.02);
      const mouthY = g.nodes[1] + Math.sin(g.heading) * Math.max(3, g.length * 0.02);
      const x = entry.x + (mouthX - entry.x) * eased;
      const y = entry.y + (mouthY - entry.y) * eased;
      if (entry.gold) {
        const prey = entry.victim as Gold;
        const dx = x - prey.nodes[0], dy = y - prey.nodes[1];
        for (let i = 0; i < prey.nodes.length; i += 2) {
          prey.nodes[i] += dx;
          prey.nodes[i + 1] += dy;
        }
      } else {
        const prey = entry.victim as Fish;
        prey.x = x;
        prey.y = y;
      }
    }
    if (before > 0.5 && after <= 0.5) {
      for (const entry of this.biteVictims) {
        if (entry.gold) {
          const prey = entry.victim as Gold;
          this.dismiss(prey);
          this.grow(g, prey.size * 0.08);
        } else {
          const prey = entry.victim as Fish;
          prey.alive = false;
          prey.respawnAt = this.time + rand(6, 14);
          this.grow(g, prey.species === SHRIMP_SPECIES_INDEX ? 0.25 : 0.18);
        }
      }
      this.biteVictims.length = 0;
      this.biteLocks.clear();
    }
    g.mouth = after;
  }

  private cancelBite() {
    // Return unconsumed victims to the position where the bite began.
    for (const entry of this.biteVictims) {
      if (entry.gold) {
        const prey = entry.victim as Gold;
        const dx = entry.x - prey.nodes[0], dy = entry.y - prey.nodes[1];
        for (let i = 0; i < prey.nodes.length; i += 2) {
          prey.nodes[i] += dx;
          prey.nodes[i + 1] += dy;
        }
      } else {
        const prey = entry.victim as Fish;
        prey.x = entry.x;
        prey.y = entry.y;
      }
    }
    this.biteVictims.length = 0;
    this.biteLocks.clear();
  }

  /** 成长：size 与视觉 length 一起涨，但不能无限。 */
  private grow(g: Gold, amount: number) {
    this.eatenCount++;
    g.size = Math.min(45, g.size + amount);
    this.score += Math.max(1, Math.round(amount * 4));
    g.length = this.gameLength(g.size, g.kind);
    this.level = 1 + FOOD_TIERS.slice(1).filter(tier => g.size > this.preyThreshold(tier.kind)).length;
  }

  /** 被吃掉的鱼：立即搬出画面，下一轮再从边缘入场。 */
  private dismiss(g: Gold) {
    g.respawnAt = this.time + rand(3, 8);
    // 直接把整条鱼挪到画面外，渲染层也画不到它——猎物"瞬间消失"。
    const L = g.length;
    g.nodes[0] = this.width + L * 2;
    g.nodes[1] = this.height * 0.5;
    for (let k = 1; k < SPINE_NODES; k++) {
      g.nodes[k * 2] = g.nodes[(k - 1) * 2] + L / (SPINE_NODES - 1);
      g.nodes[k * 2 + 1] = g.nodes[(k - 1) * 2 + 1];
    }
  }

  /**
   * 换一段步态：摆几下尾、借惯性滑一段。匀速是机器人的走法，
   * 一群匀速的鱼看着就像屏保。
   */
  private nextStroke(g: Gold) {
    const t = this.time;
    if (g.spook > 0.3) {
      g.stroking = true;
      g.strokeUntil = t + rand(0.5, 1.2);
      return;
    }
    if (g.stroking) {
      // 滑行：一次 0.5–1.1 秒。游得慢的时候滑得短——推力不够，惯性也小。
      g.stroking = false;
      g.strokeUntil = t + rand(0.5, 1.15) * (0.6 + g.pace * 0.5);
    } else {
      // 发力：两三个尾拍，0.3–0.6 秒。
      g.stroking = true;
      g.strokeUntil = t + rand(0.28, 0.6);
    }
  }

  /**
   * 从两侧刷出来：随机挑一边、回到自己的水层，朝画面里游。
   * 入场点在半个身长的画外，观感是"从远处游过来"，而不是突然出现。
   */
  private enterFromEdge(g: Gold) {
    const { width: W, height: H, time } = this;
    // Keep the number of bodies low while cycling through all species.
    if (this.gameMode && !g.isPlayer && g.id >= 100 && g.kind !== "shark" && g.kind !== "koi") {
      g.kind = PREY_ROTATION[this.preyRotation++ % PREY_ROTATION.length];
      g.size = foodSize(g.kind);
      g.length = this.gameLength(g.size, g.kind);
      g.sight = g.length * 2;
    }
    const L = g.length;
    g.respawnAt = 0;
    // 方向五五开：来回都同方向的话，画面会整齐得可疑。
    g.direction = Math.random() < 0.5 ? 1 : -1;
    g.heading = g.direction > 0 ? 0 : Math.PI;
    g.vy = 0;
    const x = g.direction > 0 ? -L * 0.7 : W + L * 0.7;
    const y = clamp(
      (g.bandY + rand(-0.12, 0.12)) * H,
      L * 0.5,
      Math.max(L * 0.5, H - L * 0.5),
    );
    g.nodes[0] = x;
    g.nodes[1] = y;
    const seg = L / (SPINE_NODES - 1);
    for (let k = 1; k < SPINE_NODES; k++) {
      const angle = g.heading + Math.PI;
      g.nodes[k * 2] = g.nodes[(k - 1) * 2] + Math.cos(angle) * seg;
      g.nodes[k * 2 + 1] = g.nodes[(k - 1) * 2 + 1] + Math.sin(angle) * seg;
    }
    // 带着惯性入场：正在游，不是从静止启动。
    g.speed = (40 + L * 0.1) * g.pace;
    g.spook = 0;
    g.turn = 0;
    g.aware = 0;
    g.wander = rand(0, TAU);
    g.stroking = true;
    g.strokeUntil = time + rand(0.6, 1.4);
    g.nextBubble = time + rand(1, 4);
  }

  private stepBubbles(dt: number) {
    const { bubbles, time } = this;
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      b.life -= dt;
      if (b.life <= 0) {
        bubbles.splice(i, 1);
        continue;
      }
      b.y -= b.rise * dt;
      b.x += Math.sin(time * 2.4 + b.seed) * 9 * dt;
      // 越靠近水面越大，也越快。
      b.rise += dt * 6;
      b.r += dt * 0.12;
    }
  }

  private respawn() {
    const { time, width: W, height: H } = this;
    const due: Fish[] = [];
    for (const f of this.fish) if (!f.alive && f.respawnAt <= time) due.push(f);
    if (due.length === 0) return;
    const initialDue = due.filter(f => this.initialSchoolPending.has(f));
    if (!initialDue.length && due.length < 6 && time - this.lastSpawn < 9) return;
    this.lastSpawn = time;

    // 新鱼群从随机一条边游进来。
    const side = randInt(0, 3);
    const along = rand(0.15, 0.85);
    const x = side === 0 ? -20 : side === 1 ? W + 20 : along * W;
    const y = side === 2 ? -20 : side === 3 ? H + 20 : along * H;
    const inward = Math.atan2(H / 2 - y, W / 2 - x) + rand(-0.5, 0.5);
    const species = pickSpecies();
    const sp = SPECIES[species];
    const millDir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
    const group = initialDue.length ? initialDue.slice(0, 6) : due.slice(0, sp.schoolSize[1]);
    for (const f of group) {
      f.alive = true;
      this.initialSchoolPending.delete(f);
      if (f.species !== SHRIMP_SPECIES_INDEX) f.species = species;
      f.alarm = 0;
      f.turn = 0;
      f.millDir = millDir;
      // Keep the whole entering school outside the selected edge initially.
      f.x = side === 0 ? x - rand(0, this.perception) : side === 1 ? x + rand(0, this.perception) : x + rand(-1, 1) * this.perception;
      f.y = side === 2 ? y - rand(0, this.perception) : side === 3 ? y + rand(0, this.perception) : y + rand(-1, 1) * this.perception;
      const speed = SPECIES[f.species].cruise * 1.3;
      f.vx = Math.cos(inward) * speed;
      f.vy = Math.sin(inward) * speed;
    }
  }
}
