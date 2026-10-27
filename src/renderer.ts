/**
 * 把 World 画成一张 ASCII 格子图：
 *   1. 深水一样的字符格底板（暗色主题，鱼是画面里唯一的亮东西）
 *   2. 尾迹场：金鱼和小鱼游过的地方扩散出发着青光的点
 *   3. 小灯鱼：一格一个斜杠/短横，急转时闪一下
 *   4. 金鱼：逐格超采样光栅化——按光照分块的字符、密集的字形、
 *      偶尔闪过的彩色高光，外加一层慢慢上浮的气泡
 */
import { TAIL_WAIST, carpBody, sharkBody, octopusBody, inTail, tailRear, tailSpread, type SideBody, type TailSpec } from "./anatomy";
import { clamp, hash3, smoothstep } from "./math";
import { buildScenery, type Scenery } from "./scenery";
import { SPECIES, SHRIMP_SPECIES_INDEX } from "./species";
import { SPINE_NODES, type Gold, type GoldKind, type World } from "./world";

/**
 * 画字符画必须用等宽字体。用比例字体（比如中文的 Noto Sans SC）时，
 * 每个字符宽度不一样，相邻的字符会挤在一起——整条鱼就糊成一块马赛克。
 * 这里不依赖网络字体，优先用系统自带的等宽字。
 */
const MONO_STACK =
  '"Geist Mono", "Cascadia Mono", Consolas, "SF Mono", Menlo, "DejaVu Sans Mono", "Liberation Mono", "Courier New", monospace';

/** 字符要够粗，白纸上细笔画的字会散成一层灰。 */
const FONT_WEIGHT = 700;

/**
 * 底色：深水的黑，带一点冷蓝。纯黑会把整块画面压死，鱼背的暗部也会
 * 糊进背景里；留一点点蓝，暗部才有"水"的味道。
 */
const PAPER = "#05080d";
/** 沙的墨色。黑底上沙要很暗——它是缸底，不是主角。 */
const SAND_RGB: [number, number, number] = [92, 86, 72];

const ALPHA_LEVELS = 6;
const FISH_ALPHAS = [0.26, 0.4, 0.54, 0.68, 0.8];

// 点阵色阶：蓝、绿、红、灰（水中悬浮微粒）、末尾是青色尾迹。
// 白底上要当成"墨点"来配：饱和度压下去，明度提上来，才不会被纸吃掉。
const DOT_RGB: [number, number, number][] = [
  [96, 138, 232],
  [62, 196, 138],
  [236, 104, 92],
  [128, 152, 176],
  [72, 202, 232],
];
// 悬浮微粒刻意画得很淡，只做水的质感，不抢鱼。
const DOT_BASE_ALPHA = [1, 1, 1, 0.62, 0.95];
const WAKE = DOT_RGB.length - 1;

// 五花的墨斑，和眼睛的墨色。
const MARK_PIGMENT: [number, number, number] = [38, 42, 54];
const EYE_PIGMENT: [number, number, number] = [18, 20, 26];

// 亮处用疏的字形，暗处用密的字形：纹理强化明暗，而不是与之打架。
const SKIN_RAMP = ".,:;t%SX#@";
const FIN_GLYPHS = [".", ":", "'", ":", "."];
const RIDGE_GLYPHS = "|!l";
const WEN_GLYPHS = "8%@";
const PEARL_GLYPHS = "o%*";
const EDGE_HEAVY = ":;";
const EDGE_LIGHT = ".',`";

const FLAG_BODY = 1;
const FLAG_EDGE = 2;
const FLAG_FIN = 3;
const FLAG_RIDGE = 4;
const FLAG_EYE = 5;
/** 五花的深色斑块。 */
const FLAG_MARK = 6;
/** 狮子头的头瘤。 */
const FLAG_WEN = 7;
/** 珍珠鳞的高光颗粒。 */
const FLAG_PEARL = 8;
/** 腹面：与背部共用字形，但使用更浅的奶油色。 */
const FLAG_BELLY = 9;
const MARK_GLYPHS = "#%@";

/**
 * 字形阶。白纸上没有"半透明的黑"，字符画的明暗首先靠格子被墨占了多少，
 * 所以越黑的地方笔画越密。第一个是空格——最亮的地方就让它空着。
 */
/** 鳍条方向的四种字形，顺序跟 finDirection() 的 0..3 一致。 */
const FIN_DIR = ["-", "\\", "|", "/"];

/** 墨色档位。比字形细一档：底色是连续渐变的，稠了会看见等高线。 */
const TONE_STEPS = 13;
const TONE_LAST = TONE_STEPS - 1;

/**
 * 一种鱼的四种墨。白纸上的字符画只有一层字形是不够的：一个 15px 的字最多
 * 占满格子的四成，再密也只是一层灰。所以按老印刷的办法分两次上墨——
 *
 *   tint  ┃ 淡彩：先把这一格染上鱼的本色，整条鱼才是一块完整的形；
 *   mark  ┃ 刻字：再压一个**远深于淡彩**的字在上面，明暗全由它表现；
 *   soft  ┃ 边：轮廓那一圈小标点的颜色，比刻字浅、比淡彩深；
 *   deep  ┃ 最深的一档，只给眼睛、五花的墨斑和轮廓里最实的几笔。
 *
 * 关键不在档数，在**淡彩和刻字之间要拉开**。之前刻字用的是"同色系再深一点
 * 点"，压上去跟底色差不了几级，整条鱼就成了一张平涂的红板。
 */
interface Tones {
  tint: string[];
  mark: string[];
  soft: string;
  deep: string;
  /** 轮廓线。比 soft 再深一点，但不到 deep——它是笔画，不是墨块。 */
  line: string;
}

const toneCache = new Map<readonly number[], Tones>();

function inkTones(pig: readonly number[]): Tones {
  const hit = toneCache.get(pig);
  if (hit) return hit;
  const tint: string[] = [];
  const mark: string[] = [];
  for (let i = 0; i < TONE_STEPS; i++) {
    const k = i / TONE_LAST;
    // 淡彩封顶 0.4：它是"纸被染了一点色"，不是"一格实心色块"。
    // 之前一路铺到 0.8，整格就是一片不透明的杏色，字全被埋了。
    tint.push(`rgba(${pig[0]},${pig[1]},${pig[2]},${(0.04 + 0.26 * k).toFixed(2)})`);
    // 刻字恒定是"很深的鱼色"：亮度只从 0.44 压到 0.28，浓度 0.74→0.98。
    // 不按明暗大幅调色——纸上的画是刻出来的，不是调色调出来的。
    const d = 0.44 - 0.16 * k;
    mark.push(
      `rgba(${Math.round(pig[0] * d)},${Math.round(pig[1] * d)},${Math.round(pig[2] * d)},${(
        0.74 +
        0.24 * k
      ).toFixed(2)})`,
    );
  }
  const tones: Tones = {
    tint,
    mark,
    soft: `rgba(${Math.round(pig[0] * 0.55)},${Math.round(pig[1] * 0.55)},${Math.round(pig[2] * 0.55)},0.8)`,
    line: `rgba(${Math.round(pig[0] * 0.34)},${Math.round(pig[1] * 0.34)},${Math.round(pig[2] * 0.34)},0.9)`,
    deep: `rgba(${Math.round(pig[0] * 0.22)},${Math.round(pig[1] * 0.22)},${Math.round(pig[2] * 0.22)},0.96)`,
  };
  toneCache.set(pig, tones);
  return tones;
}

// 单元内的超采样点，用来做抗锯齿的轮廓。
const SUBSAMPLES = [0.25, 0.3, 0.75, 0.3, 0.25, 0.72, 0.75, 0.72];

/** 平滑的值噪声，给五花的斑块用。 */
function noise2(x: number, y: number, seed: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const u = smoothstep(0, 1, x - xi);
  const v = smoothstep(0, 1, y - yi);
  const a = hash3(xi, yi, seed);
  const b = hash3(xi + 1, yi, seed);
  const c = hash3(xi, yi + 1, seed);
  const d = hash3(xi + 1, yi + 1, seed);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

/** 真实鲫鱼的躯干比例、鳍位、眼位。所有数字都是**全长**的比例。 */
/**
 * 体波振幅包络，按脊椎节点预计算。
 *
 * 它只跟 s 有关——每条鱼、每一帧都是同一张表。之前每帧要为此跑几十次
 * Math.pow，纯属浪费；现在一条曲线一张表，查一下就行。
 */
const WAVE_ENV = (() => {
  const a = new Float32Array(SPINE_NODES);
  for (let k = 0; k < SPINE_NODES; k++) {
    const u = k / (SPINE_NODES - 1);
    // A rigid front body and a smooth wave confined to the tail stock.
    const tail = clamp((u - 0.6) / 0.4, 0, 1);
    a[k] = tail * tail * (3 - 2 * tail);
  }
  return a;
})();

interface GoldShape {
  label: string;
  body: SideBody;
  /** 躯干（吻端 → 尾柄基部）占全长多少。carpBody 的 end，画轮廓时要用。 */
  bodyEnd: number;
  /** 胸鳍：沿身中点、沿身半长、横向伸出。比例都是全长。 */
  pectoral: [number, number, number];
  /** 腹鳍，同上。 */
  pelvic: [number, number, number];
  /** 背鳍基底范围与最大高度（侧视时立在背线之外）。 */
  dorsal: [number, number];
  dorsalHeight: number;
  /** 尾鳍：深叉形的双叶。 */
  tail: TailSpec;
  /** 眼睛沿身的位置区间。 */
  eye: [number, number] | null;
  /** 眼睛在中线到体侧的哪个位置才算眼睛。 */
  eyeAcross: number;
  /** 头瘤的范围（狮子头），null 表示没有。 */
  wen: [number, number] | null;
  marks: "none" | "calico" | "pearl" | "clown" | "butterfly" | "puffer" | "tang" | "lionfish" | "barracuda" | "octopus" | "koi";
  pigment: [number, number, number];
  tailPigment?: [number, number, number];
  wenPigment?: [number, number, number];
  ink: number;
}

/**
 * 六种金鱼。注意它们**共用同一条解剖曲线**（`anatomy.ts` 里那份鲫鱼测量），
 * 只在三个旋钮上分家：
 *
 *   peak     —— 最宽处有多宽（决定"胖"）
 *   end      —— 躯干占全长多少（决定"短"）
 *   wrist    —— 尾柄收得多细（决定屁股有没有"柄"）
 *
 * 这三个旋钮恰好就是养殖品种之间真正的差别：蛋鱼把 peak 和 end 一起调，
 * 草金把 end 拉长、peak 收窄，琉金把 shoulder 往后推。
 */
const SHAPES: Record<GoldKind, GoldShape> = {
  // 琉金：短圆的蛋身，高背，尾柄粗短，一片摊得最开的蝶尾。
  //
  // 所有品种共用同一套测量（见 anatomy.ts），品种之间的差别只在几个
  // 比例上：body 的 peak/end/wrist 决定"多胖多长"，tail 的 span/flare
  // 决定"尾巴多大多飘"。躯干占七成上下、最宽处只有躯干长的三成，
  // 这两个数是"鱼"和"瓜子"的分界，别再动了。
  ryukin: {
    label: "琉金",
    body: carpBody({ peak: 0.192, end: 0.68, wrist: 0.36, blunt: 0.68, shoulder: 0.16 }),
    bodyEnd: 0.68,
    pectoral: [0.25, 0.078, 0.072],
    pelvic: [0.37, 0.055, 0.03],
    dorsal: [0.29, 0.55],
    dorsalHeight: 0.15,
    tail: { root: 0.68, span: 0.29, flare: 0.95, fork: 0.26 },
    eye: [0.075, 0.115],
    eyeAcross: 0.3,
    wen: null,
    marks: "none",
    pigment: [244, 105, 10],
    ink: 0.12,
  },
  // 狮子头：银白身，头顶一大团肉瘤，所以吻端更钝、头更宽。
  oranda: {
    label: "狮子头",
    body: carpBody({ peak: 0.183, end: 0.69, wrist: 0.35, blunt: 0.62, shoulder: 0.12 }),
    bodyEnd: 0.69,
    pectoral: [0.25, 0.075, 0.069],
    pelvic: [0.37, 0.053, 0.03],
    dorsal: [0.29, 0.55],
    dorsalHeight: 0.15,
    tail: { root: 0.69, span: 0.28, flare: 0.98, fork: 0.26 },
    eye: [0.076, 0.116],
    eyeAcross: 0.3,
    wen: [0, 0.2],
    marks: "none",
    pigment: [238, 231, 207],
    wenPigment: [238, 68, 18],
    ink: 0.16,
  },
  // 黑龙睛：墨绒一身，眼球凸出到头顶两侧之外，尾最大最飘。
  moor: {
    label: "黑龙睛",
    body: carpBody({ peak: 0.177, end: 0.69, wrist: 0.33, blunt: 0.686, shoulder: 0.1 }),
    bodyEnd: 0.69,
    pectoral: [0.25, 0.075, 0.068],
    pelvic: [0.37, 0.053, 0.03],
    dorsal: [0.29, 0.55],
    dorsalHeight: 0.15,
    tail: { root: 0.69, span: 0.29, flare: 1.0, fork: 0.28 },
    eye: [0.07, 0.11],
    eyeAcross: 0.26,
    wen: null,
    marks: "none",
    // 黑水里的黑鱼不能是纯黑——给它一层青铜反光，靠亮边和釉面读出来。
    pigment: [86, 72, 66],
    ink: 0.78,
  },
  // 丹凤：身子细长，尾叶分得最深，游起来像一缕纱。
  fantail: {
    label: "丹凤",
    body: carpBody({ peak: 0.158, end: 0.66, wrist: 0.32, blunt: 0.84, shoulder: 0.26 }),
    bodyEnd: 0.66,
    pectoral: [0.26, 0.073, 0.063],
    pelvic: [0.38, 0.05, 0.028],
    dorsal: [0.28, 0.53],
    dorsalHeight: 0.125,
    tail: { root: 0.66, span: 0.31, flare: 0.9, fork: 0.3 },
    eye: [0.086, 0.126],
    eyeAcross: 0.3,
    wen: null,
    marks: "none",
    pigment: [241, 73, 22],
    ink: 0.14,
  },
  // 珍珠鳞：最圆的一只，鳞片鼓成一颗颗小珠子。
  pearl: {
    label: "珍珠鳞",
    body: carpBody({ peak: 0.196, end: 0.68, wrist: 0.38, blunt: 0.66, shoulder: 0.14 }),
    bodyEnd: 0.68,
    pectoral: [0.25, 0.073, 0.071],
    pelvic: [0.37, 0.053, 0.03],
    dorsal: [0.29, 0.55],
    dorsalHeight: 0.15,
    tail: { root: 0.68, span: 0.29, flare: 0.95, fork: 0.25 },
    eye: [0.074, 0.114],
    eyeAcross: 0.3,
    wen: null,
    marks: "pearl",
    pigment: [239, 163, 22],
    ink: 0.2,
  },
  // 五花：橙底上撒着墨蓝和黑色的斑，最像老瓦缸里那一条。
  calico: {
    label: "五花",
    body: carpBody({ peak: 0.171, end: 0.7, wrist: 0.35, blunt: 0.688, shoulder: 0.18 }),
    bodyEnd: 0.7,
    pectoral: [0.26, 0.075, 0.067],
    pelvic: [0.38, 0.052, 0.028],
    dorsal: [0.3, 0.56],
    dorsalHeight: 0.14,
    tail: { root: 0.7, span: 0.28, flare: 0.95, fork: 0.26 },
    eye: [0.078, 0.118],
    eyeAcross: 0.3,
    wen: null,
    marks: "calico",
    pigment: [242, 112, 24],
    ink: 0.16,
  },
  // 小丑鱼：橙身三道白色竖纹（头后、身中、尾柄前），带黑边。体小而
  // 圆，是游戏里最小的一档猎物。竖纹靠 marks 机制近似（用宽白环）。
  clown: {
    label: "小丑鱼",
    body: carpBody({ peak: 0.17, end: 0.68, wrist: 0.34, blunt: 0.7, shoulder: 0.1 }),
    bodyEnd: 0.68,
    pectoral: [0.26, 0.075, 0.07],
    pelvic: [0.38, 0.052, 0.028],
    dorsal: [0.28, 0.55],
    dorsalHeight: 0.14,
    tail: { root: 0.68, span: 0.28, flare: 0.95, fork: 0.26 },
    eye: [0.078, 0.118],
    eyeAcross: 0.3,
    wen: null,
    marks: "clown",
    pigment: [244, 106, 14],
    ink: 0.14,
  },
  // 白底红斑的红白锦鲤（Kohaku）：鲤形长身与浅分叉尾。
  koi: {
    label: "锦鲤",
    body: carpBody({ peak: 0.132, end: 0.78, wrist: 0.35, blunt: 0.82, shoulder: 0.24 }),
    bodyEnd: 0.78,
    pectoral: [0.26, 0.072, 0.045],
    pelvic: [0.38, 0.05, 0.023],
    dorsal: [0.27, 0.67],
    dorsalHeight: 0.065,
    tail: { root: 0.78, span: 0.21, flare: 0.85, fork: 0.38 },
    eye: [0.082, 0.122],
    eyeAcross: 0.3,
    wen: null,
    marks: "koi",
    pigment: [232, 228, 211],
    wenPigment: [222, 78, 40],
    ink: 0.2,
  },
  // 大白鲨：纺锤形身体、高三角背鳍、细尾柄及上下近等长的新月形尾鳍。
  // 背鳍单独立着（渲染层从背线外立），这里体曲线用 sharkBody。
  shark: {
    label: "鲨鱼",
    body: sharkBody({ peak: 0.145, end: 0.74, wrist: 0.5, blunt: 0.9, back: 1.0, belly: 0.8 }),
    bodyEnd: 0.74,
    pectoral: [0.28, 0.1, 0.12],
    pelvic: [0.5, 0.055, 0.035],
    dorsal: [0.31, 0.49],
    dorsalHeight: 0.15,
    tail: { root: 0.74, span: 0.25, flare: 0.8, fork: 0.82 },
    eye: [0.1, 0.14],
    eyeAcross: 0.35,
    wen: null,
    marks: "none",
    pigment: [105, 122, 130],
    ink: 0.5,
  },
  // 高身、长背鳍和腹鳍，让神仙鱼的剪影与圆身金鱼不同。
  angelfish: {
    label: "神仙鱼",
    body: carpBody({ peak: 0.27, end: 0.72, wrist: 0.28, blunt: 0.7, back: 1.08, belly: 1.05 }),
    bodyEnd: 0.72,
    pectoral: [0.25, 0.065, 0.065],
    pelvic: [0.38, 0.07, 0.09],
    dorsal: [0.2, 0.62],
    dorsalHeight: 0.23,
    tail: { root: 0.72, span: 0.24, flare: 0.7, fork: 0.12 },
    eye: [0.07, 0.12],
    eyeAcross: 0.3,
    wen: null,
    marks: "none",
    pigment: [195, 194, 152],
    ink: 0.22,
  },
  // 狭长的梭形身躯与深叉尾，搭配短促冲刺。
  barracuda: {
    label: "梭形鱼",
    body: sharkBody({ peak: 0.105, end: 0.8, wrist: 0.35, blunt: 0.9, back: 0.95, belly: 0.78 }),
    bodyEnd: 0.8,
    pectoral: [0.31, 0.07, 0.045],
    pelvic: [0.49, 0.05, 0.03],
    dorsal: [0.39, 0.48],
    dorsalHeight: 0.10,
    tail: { root: 0.8, span: 0.19, flare: 0.8, fork: 0.72 },
    eye: [0.08, 0.12],
    eyeAcross: 0.32,
    wen: null,
    marks: "barracuda",
    pigment: [125, 186, 180],
    ink: 0.28,
  },
  // 蝴蝶鱼：高身、短吻和斜向条纹。
  butterfly: {
    label: "蝴蝶鱼",
    body: carpBody({ peak: 0.24, end: 0.72, wrist: 0.28, blunt: 0.68 }),
    bodyEnd: 0.72,
    pectoral: [0.25, 0.065, 0.06], pelvic: [0.38, 0.05, 0.055],
    dorsal: [0.23, 0.61], dorsalHeight: 0.14,
    tail: { root: 0.72, span: 0.23, flare: 0.62, fork: 0.12 },
    eye: [0.075, 0.115], eyeAcross: 0.3, wen: null,
    marks: "butterfly", pigment: [244, 205, 48], ink: 0.18,
  },
  // 刺豚：圆鼓身体、短小尾鳍与斑点。
  puffer: {
    label: "刺豚",
    body: carpBody({ peak: 0.245, end: 0.79, wrist: 0.2, blunt: 0.54, back: 1.03, belly: 1.08 }),
    bodyEnd: 0.79,
    pectoral: [0.28, 0.06, 0.06], pelvic: [0.43, 0.04, 0.025],
    dorsal: [0.59, 0.74], dorsalHeight: 0.07,
    tail: { root: 0.79, span: 0.17, flare: 0.52, fork: 0.04 },
    eye: [0.08, 0.13], eyeAcross: 0.3, wen: null,
    marks: "puffer", pigment: [209, 171, 98], ink: 0.24,
  },
  // 蓝倒吊：蓝身、深色标记和黄色尾鳍。
  tang: {
    label: "蓝倒吊",
    body: carpBody({ peak: 0.19, end: 0.75, wrist: 0.28, blunt: 0.72 }),
    bodyEnd: 0.75,
    pectoral: [0.27, 0.07, 0.06], pelvic: [0.4, 0.05, 0.04],
    dorsal: [0.25, 0.67], dorsalHeight: 0.115,
    tail: { root: 0.75, span: 0.22, flare: 0.75, fork: 0.22 },
    eye: [0.075, 0.115], eyeAcross: 0.3, wen: null,
    marks: "tang", pigment: [55, 128, 229], tailPigment: [245, 209, 55], ink: 0.18,
  },
  // 狮子鱼：宽大的鳍、较高的背鳍与红褐色竖纹。
  lionfish: {
    label: "狮子鱼",
    body: carpBody({ peak: 0.16, end: 0.7, wrist: 0.37, blunt: 0.72 }),
    bodyEnd: 0.7,
    pectoral: [0.29, 0.12, 0.15], pelvic: [0.42, 0.08, 0.10],
    dorsal: [0.18, 0.63], dorsalHeight: 0.24,
    tail: { root: 0.7, span: 0.28, flare: 0.8, fork: 0.08 },
    eye: [0.075, 0.12], eyeAcross: 0.3, wen: null,
    marks: "lionfish", pigment: [194, 105, 78], ink: 0.26,
  },
  // Eight flexible arms trail a rounded mantle during mantle-first swimming.
  octopus: {
    label: "章鱼", body: octopusBody(), bodyEnd: 0.54,
    pectoral: [0, 0, 0], pelvic: [0, 0, 0], dorsal: [0, 0], dorsalHeight: 0,
    tail: { root: 1, span: 0, flare: 0, fork: 0 },
    eye: [0.38, 0.44], eyeAcross: 0.45, wen: null,
    marks: "octopus", pigment: [190, 91, 72], ink: 0.2,
  },
};

const KINDS = Object.keys(SHAPES) as GoldKind[];

function inTriangle(
  px: number, py: number,
  ax: number, ay: number, bx: number, by: number, cx: number, cy: number,
) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

/** 可见的深灰字符格网，对齐到设备像素。 */
export function paintGrid(g: CanvasRenderingContext2D, W: number, H: number, cw: number, ch: number, dpr: number) {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.strokeStyle = "rgba(120,170,220,0.030)";
  g.lineWidth = 1;
  g.beginPath();
  for (let c = 0; c <= Math.ceil(W / cw); c++) {
    const x = Math.round(c * cw * dpr) + 0.5;
    g.moveTo(x, 0);
    g.lineTo(x, H * dpr);
  }
  for (let r = 0; r <= Math.ceil(H / ch); r++) {
    const y = Math.round(r * ch * dpr) + 0.5;
    g.moveTo(0, y);
    g.lineTo(W * dpr, y);
  }
  g.stroke();
}

export class AsciiRenderer {
  private ctx: CanvasRenderingContext2D;
  private bg: HTMLCanvasElement;
  private dpr = 1;
  private width = 0;
  private height = 0;
  private cw = 12;
  private ch = 18;
  private cols = 0;
  private rows = 0;
  private fontFamily = MONO_STACK;

  private dotKind = new Uint8Array(0); // 0 无, 1 蓝, 2 绿, 3 红, 4 灰白
  private dotPhase = new Float32Array(0);
  private dotFreq = new Float32Array(0);
  private energy = new Float32Array(0);
  private energyTmp = new Float32Array(0);
  /** 点水面时炸开的光斑，很快衰减。 */
  private spark = new Float32Array(0);
  private bucketOf = new Uint8Array(0);
  private bucketOrder = new Int32Array(0);
  private bucketCounts = new Int32Array(DOT_RGB.length * ALPHA_LEVELS + 1);
  private dotStyles: string[] = [];

  private goldFlag = new Uint8Array(0);
  private goldShade = new Float32Array(0);
  private goldKey = new Uint32Array(0);
  /**
   * 每一格落在鱼身上的位置：沿身体的 s（0 吻端 → 1 尾尖），
   * 以及横向偏移 v / 全长（带正负号）。
   *
   * 画字的时候要用它来排鳞——"一格一鳞"必须知道这一格在鱼皮的哪儿。
   * 存的是**归一化**的值，所以跟鱼的大小无关：同一条鱼大一点小一点，
   * 鳞片的排法完全一样。
   */
  private goldS = new Float32Array(0);
  private goldVN = new Float32Array(0);
  private goldDepth = new Float32Array(0);
  private goldKind = new Uint8Array(0);
  /** 被鱼影压暗的格子。 */
  private goldShadow = new Uint8Array(0);
  private spine = new Float32Array(SPINE_NODES * 2);
  /** spinePoint() 的复用输出，避免每帧几千次分配。 */
  private pt = { x: 0, y: 0, nx: 0, ny: 0 };
  private arc = new Float32Array(SPINE_NODES);
  private arcTotal = 1;
  private shape = SHAPES.ryukin;
  private animalPhase = 0;
  private goldId = 0;
  private finTipLeft = 0;
  private finTipRight = 0;
  /** 尾叶随摆尾轻轻开合的相位。 */
  private tailFlutter = 0;
  /** 局部坐标的哪一侧是背。左右转向前进时背始终朝屏幕上。 */
  private backSign: 1 | -1 = 1;
  private facingBlend = 1;
  // sampleGold() 的复用输出，避免每次采样都分配对象。
  private hitFlag = 0;
  private hitShade = 0;
  private hitS = 0;
  private hitV = 0;
  private hitDist = 0;
  /** 调试用：只画剪影和淡彩，不画字。 */
  silhouetteOnly = false;

  /** 缸里的景：底砂、水草、珊瑚。 */
  private scenery: Scenery = { weeds: [], corals: [], sand: 20, surface: 16 };
  /** 本帧已经落过水草的格子，避免同一格叠两层墨。 */
  private weedStamp = new Uint32Array(0);
  private weedFrame = 0;

  /** 本帧有鱼的格子（帧号），点阵会跳过它们。 */
  private fishStamp = new Uint32Array(0);
  private frameId = 0;
  /** 小鱼按 种类 × 明度 × 朝向 分桶，每桶一次 fillStyle。 */
  private fishBuckets: number[][] = [];
  private fishStyles: string[] = [];
  private readonly fishGlyphs = ["-", "\\", "|", "/"];

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("2D canvas unavailable");
    this.ctx = ctx;
    this.bg = document.createElement("canvas");

    for (let c = 0; c < DOT_RGB.length; c++) {
      const [r, g, b] = DOT_RGB[c];
      for (let l = 0; l < ALPHA_LEVELS; l++) {
        const a = (DOT_BASE_ALPHA[c] * (l + 1)) / ALPHA_LEVELS;
        this.dotStyles.push(`rgba(${r},${g},${b},${a.toFixed(3)})`);
      }
    }
  }

  get cellWidth() {
    return this.cw;
  }

  get cellHeight() {
    return this.ch;
  }

  setFontFamily(family: string) {
    const f = (family || "").toLowerCase();
    // 只有等宽字体能用来画字符画；拿到别的就继续用内置的栈。
    if (f && (f.includes("mono") || f.includes("consol") || f.includes("courier"))) {
      this.fontFamily = family;
    }
  }

  resize(width: number, height: number, dpr: number) {
    const prevCols = this.cols;
    const prevRows = this.rows;
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    // 格子的宽度决定了两件事，而这两件事是**打架**的：
    //   格子越小 → 鱼身上能排下的字越多，轮廓越准；
    //   格子越小 → 每个字的笔画越细，最后退化成一格一个色点，不再是"字"。
    //
    // 这一版的取舍跟上一版相反，理由是硬的：**鱼身上能排多少个字，直接
    // 决定它还像不像鱼**。145 列（1280 宽下 cw≈9）的时候，一条 520 px
    // 的鱼只有 45 字长、9 字宽——九格横排的鱼，不管轮廓函数多准，读出来
    // 都是一个长方块。现在 205 列（cw≈6）：七十多字长、十五字宽，脊背的
    // 弧度、鳃盖的收、尾柄的细，才有格子去交代。
    //
    // 6 px 上等宽字的笔画确实只剩一像素，但这一版的鱼身不是靠笔画"画"出
    // 来的——形是矢量的，明暗是渐变的，字只负责质感（鳞、鳍条、鳍条之间
    // 的空隙）。小字在这里不是缺点，它更像一道细网。
    this.cw = clamp(Math.round(width / 205), 4, 7);
    this.ch = Math.round(this.cw * 1.45);
    this.cols = Math.ceil(width / this.cw);
    this.rows = Math.ceil(height / this.ch);

    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.bg.width = this.canvas.width;
    this.bg.height = this.canvas.height;

    const n = this.cols * this.rows;
    if (this.cols !== prevCols || this.rows !== prevRows) {
      this.dotKind = new Uint8Array(n);
      this.dotPhase = new Float32Array(n);
      this.dotFreq = new Float32Array(n);
      this.energy = new Float32Array(n);
      this.energyTmp = new Float32Array(n);
      this.spark = new Float32Array(n);
      this.bucketOf = new Uint8Array(n);
      this.bucketOrder = new Int32Array(n);
      this.goldFlag = new Uint8Array(n);
      this.goldShade = new Float32Array(n);
      this.goldKey = new Uint32Array(n);
      this.goldS = new Float32Array(n);
      this.goldVN = new Float32Array(n);
      this.goldDepth = new Float32Array(n);
      this.goldKind = new Uint8Array(n);
      this.goldShadow = new Uint8Array(n);
      this.fishStamp = new Uint32Array(n);
      this.weedStamp = new Uint32Array(n);
    }
    this.scenery = buildScenery(width, height);

    for (let i = 0; i < n; i++) {
      const col = i % this.cols;
      const row = (i / this.cols) | 0;
      // 一层很淡的悬浮微粒，水才是"水里"而不是黑屏。只有约 9% 的格子有点。
      this.dotKind[i] = hash3(col, row, 61) < 0.045 ? 4 : 0;
      this.dotPhase[i] = hash3(col, row, 23) * Math.PI * 2;
      this.dotFreq[i] = 0.3 + hash3(col, row, 37) * 1.1;
    }
    this.paintBackground();
  }

  private paintBackground() {
    const g = this.bg.getContext("2d");
    if (!g) return;
    const { width: W, height: H, dpr, cw, ch } = this;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = PAPER;
    g.fillRect(0, 0, W, H);

    // 光柱：几束从水面斜射下来的白光。白纸上只能靠"比纸更白"来表达光。
    for (let i = 0; i < 3; i++) {
      const x0 = W * (0.1 + i * 0.32) + (hash3(i, 2, 5) - 0.5) * W * 0.12;
      const w0 = W * (0.045 + hash3(i, 3, 7) * 0.055);
      const slide = H * 0.5;
      const grd = g.createLinearGradient(x0, 0, x0 + slide, H);
      grd.addColorStop(0, "rgba(120,190,235,0.055)");
      grd.addColorStop(0.55, "rgba(96,165,215,0.028)");
      grd.addColorStop(1, "rgba(80,150,205,0)");
      g.fillStyle = grd;
      g.beginPath();
      g.moveTo(x0, 0);
      g.lineTo(x0 + w0, 0);
      g.lineTo(x0 + w0 + slide, H);
      g.lineTo(x0 + slide, H);
      g.closePath();
      g.fill();
    }

    paintGrid(g, W, H, cw, ch, dpr);
    this.paintSand(g);
  }

  /**
   * 缸底的沙：上沿是一条起伏的线，越往下越密、越深。
   * 沙是静态的，所以只画一次进背景层。
   */
  private paintSand(g: CanvasRenderingContext2D) {
    const { cols, rows, cw, ch, scenery } = this;
    const top = this.height - scenery.sand;
    g.font = `${FONT_WEIGHT} ${Math.round(cw * 1.5)}px ${this.fontFamily}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    for (let row = 0; row < rows; row++) {
      const y = row * ch;
      if (y + ch < top) continue;
      for (let col = 0; col < cols; col++) {
        // 沙面的上沿不是一条直线，起起伏伏才是缸底。
        const edge = top + (hash3(col, 91, 3) - 0.5) * ch * 1.6 + Math.sin(col * 0.21) * ch * 0.5;
        if (y + ch * 0.6 < edge) continue;
        const depth = clamp((y + ch * 0.5 - edge) / Math.max(1, scenery.sand), 0, 1);
        const h = hash3(col, row, 71);
        if (h > 0.42 + depth * 0.5) continue;
        // 沙粒：小点、逗号、偶尔一颗石子。
        const glyph = h < 0.06 ? "o" : h < 0.3 ? ":" : h < 0.62 ? "·" : ",";
        const a = 0.3 + depth * 0.38;
        g.fillStyle = `rgba(${SAND_RGB[0]},${SAND_RGB[1]},${SAND_RGB[2]},${a.toFixed(2)})`;
        g.fillText(glyph, col * cw + cw / 2, y + ch / 2 + 1);
      }
    }
  }

  render(world: World, dt: number) {
    const { ctx, dpr, cols, cw } = this;
    if (cols === 0) return;
    const t = world.time;

    this.consumeEvents(world);
    this.rasterizeGolds(world.golds, t);
    this.depositWake(world);
    this.diffuse(dt);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.bg, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 字号 1.5 × 格宽，不是 1.62。等宽字在 1.62 倍上，字宽正好等于格宽，
    // 相邻两个字是**贴着**的：一排 `+` 会连成一条横线。留出这半个像素的
    // 缝，一排字才是一排字。
    ctx.font = `${FONT_WEIGHT} ${Math.round(cw * 1.5)}px ${this.fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    this.drawSurface(t);
    this.drawCorals(t);
    this.drawWeeds(t);
    this.drawDots(t);
    this.markFish(world);

    this.drawSpark();
    this.drawFish();
    // 鱼的形全部由格子铺出来。矢量剪影只在调试开关下画——一旦叠上来，
    // 格子就成了浮在一块色板上的花纹，两个东西。
    if (this.silhouetteOnly) this.drawBodies(world.golds);
    else this.drawGolds(t);
    this.drawMouths(world.golds);
    this.drawBubbles(world);
    this.drawChaseAlerts(world);
  }

  /** Clear trails from the previous scene when a new round begins. */
  clearTransientEffects() {
    this.energy.fill(0);
    this.energyTmp.fill(0);
    this.spark.fill(0);
  }

  /** Show an ASCII alert only while a fish is actively chasing the player. */
  private drawChaseAlerts(world: World) {
    const player = world.player;
    if (!world.gameMode || world.gameOver || !player) return;
    const { ctx, width, height, cw, ch } = this;
    ctx.save();
    ctx.font = `700 ${Math.max(12, Math.round(cw * 1.4))}px ${this.fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#05080d";
    ctx.fillStyle = "#ff8b80";
    for (const g of world.golds) {
      if (g.isPlayer || g.respawnAt > 0 || !world.isChasing(g)) continue;
      const tailX = g.nodes[g.nodes.length - 2];
      const reach = g.length * 0.45;
      if (Math.max(g.nodes[0], tailX) + reach < 0 || Math.min(g.nodes[0], tailX) - reach > width ||
          g.nodes[1] + reach < 0 || g.nodes[1] - reach > height) continue;
      const x = clamp(g.nodes[0] - Math.cos(g.heading) * g.length * 0.32, cw, Math.max(cw, width - cw));
      const y = clamp(g.nodes[1] - Math.max(ch * 1.7, g.length * 0.36), ch, Math.max(ch, height - ch));
      ctx.strokeText("!", x, y);
      ctx.fillText("!", x, y);
    }
    ctx.restore();
  }

  // ── 模拟 → 场 ─────────────────────────────────────────────────────

  private cellIndex(x: number, y: number) {
    const c = Math.floor(x / this.cw);
    const r = Math.floor(y / this.ch);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return -1;
    return r * this.cols + c;
  }

  private stamp(field: Float32Array, x: number, y: number, radius: number, amount: number) {
    const c0 = Math.floor(x / this.cw);
    const r0 = Math.floor(y / this.ch);
    for (let r = r0 - radius; r <= r0 + radius; r++) {
      for (let c = c0 - radius; c <= c0 + radius; c++) {
        if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) continue;
        const d = Math.hypot(c - c0, (r - r0) * 1.4);
        if (d > radius + 0.5) continue;
        const i = r * this.cols + c;
        field[i] = Math.min(1.6, field[i] + amount * (1 - d / (radius + 1)));
      }
    }
  }

  private consumeEvents(world: World) {
    for (const e of world.events) {
      if (e.kind === "splash") {
        this.stamp(this.spark, e.x, e.y, 2, 1);
        this.stamp(this.energy, e.x, e.y, 6, 1.4);
      }
    }
    world.events.length = 0;
  }

  private depositWake(world: World) {
    const { energy } = this;
    for (const f of world.fish) {
      if (!f.alive) continue;
      const i = this.cellIndex(f.x, f.y);
      if (i >= 0) energy[i] = Math.min(1.6, energy[i] + 0.006 + f.alarm * 0.03);
    }
    // 金鱼尾鳍扫过的水最多，气泡也带一点涟漪。
    for (const g of world.golds) {
      for (let k = SPINE_NODES - 8; k < SPINE_NODES; k++) {
        const i = this.cellIndex(g.nodes[k * 2], g.nodes[k * 2 + 1]);
        if (i >= 0) energy[i] = Math.min(1.6, energy[i] + 0.05 + g.speed * 0.0015);
      }
      const hi = this.cellIndex(g.nodes[0], g.nodes[1]);
      if (hi >= 0) energy[hi] = Math.min(1.6, energy[hi] + 0.02);
    }
    for (const b of world.bubbles) {
      const i = this.cellIndex(b.x, b.y);
      if (i >= 0) energy[i] = Math.min(1.6, energy[i] + 0.02);
    }
    if (world.pointer.active) {
      this.stamp(energy, world.pointer.x, world.pointer.y, 1, 0.06);
    }
  }

  /** 模糊 + 衰减，让尾迹像涟漪一样散开又淡掉。 */
  private diffuse(dt: number) {
    const { cols, rows, energy, energyTmp: tmp, spark } = this;
    const decay = Math.exp(-dt * 1.5);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const l = c > 0 ? energy[i - 1] : energy[i];
        const rt = c < cols - 1 ? energy[i + 1] : energy[i];
        const u = r > 0 ? energy[i - cols] : energy[i];
        const d = r < rows - 1 ? energy[i + cols] : energy[i];
        tmp[i] = (energy[i] * 4 + l + rt + u + d) * 0.125 * decay;
      }
    }
    this.energy = tmp;
    this.energyTmp = energy;
    const sparkDecay = Math.exp(-dt * 2.6);
    for (let i = 0; i < spark.length; i++) spark[i] *= sparkDecay;
  }

  // ── 金鱼 ───────────────────────────────────────────────────────────

  /**
   * 判断一个点是否落在当前这条金鱼身上（spine / arc 已构建）。
   * 身体坐标：s 沿脊椎（0 鼻尖 → 1 尾端），v 垂直脊椎。
   * 结果写进 hit* 字段，返回是否命中。
   */
  private sampleGold(px: number, py: number, L: number) {
    const { spine, arc } = this;
    const N = SPINE_NODES;
    let best = Infinity;
    let bestS = 0;
    let bestSign = 1;
    let bestNx = 0;
    let bestNy = 0;
    for (let k = 0; k < N - 1; k++) {
      const ax = spine[k * 2];
      const ay = spine[k * 2 + 1];
      const sx = spine[(k + 1) * 2] - ax;
      const sy = spine[(k + 1) * 2 + 1] - ay;
      const len2 = sx * sx + sy * sy || 1;
      const u = clamp(((px - ax) * sx + (py - ay) * sy) / len2, 0, 1);
      const qx = ax + sx * u;
      const qy = ay + sy * u;
      const d2 = (px - qx) ** 2 + (py - qy) ** 2;
      if (d2 < best) {
        best = d2;
        const len = Math.sqrt(len2);
        bestS = (arc[k] + u * len) / this.arcTotal;
        bestSign = sx * (py - ay) - sy * (px - ax) >= 0 ? 1 : -1;
        bestNx = (-sy / len) * bestSign;
        bestNy = (sx / len) * bestSign;
      }
    }

    const a = Math.sqrt(best);
    const s = bestS;
    const shape = this.shape;
    const onBack = bestSign === this.backSign;
    // Side-view fish cross an edge-on pose while turning through vertical.
    // Blend the two body profiles there instead of swapping them abruptly.
    const sideBlend = this.facingBlend;
    const backWeight = (1 + bestSign * sideBlend) * 0.5;
    const finVisibility = Math.abs(sideBlend);
    // 侧视的核心：背与腹不再共用一个半宽。背线高高拱起，腹线在胸腹处
    // 饱满，往尾柄收得更快；朝左游时两条线仍会翻到正确的屏幕方向。
    const w = (shape.body.back(s) * backWeight + shape.body.belly(s) * (1 - backWeight)) * L;
    this.hitDist = a;
    this.hitS = s;
    this.hitV = a * bestSign;
    const wEdge = w > 0 ? w + L * 0.009 : 0;

    if (a <= wEdge) {
      const across = clamp(a / (w || 1), 0, 1);
      const fac = clamp((bestNx * -0.45 + bestNy * -0.89) * 0.5 + 0.5, 0, 1);
      const flank = clamp((across - 0.76) / 0.24, 0, 1);
      const spec = Math.exp(-Math.pow((across - 0.4) / 0.25, 2)) * fac;
      // 背部橙金浓郁，体侧有金属反光，腹部明亮偏奶油色。
      let darkness = 0.38 + 0.14 * across + 0.2 * (1 - fac) - 0.1 * spec + 0.18 * Math.pow(flank, 0.85);
      darkness -= 0.13 * (1 - backWeight) * (1 - across * 0.35);
      // 侧线在体侧中部，不是背脊上的一道白缝。
      if (s > 0.25 && s < shape.bodyEnd - 0.035 && across > 0.12 && across < 0.23) darkness += 0.045;
      let shade = 1 - clamp(darkness, 0, 1);
      let flag = onBack ? FLAG_BODY : FLAG_BELLY;
      if (shape.eye && onBack && finVisibility > 0.35 && s > shape.eye[0] && s < shape.eye[1] &&
          Math.abs(across - shape.eyeAcross) < 0.2) {
        // 侧视只能看见朝向观众的一只眼睛。
        flag = FLAG_EYE;
        shade = 0;
      } else if (shape.wen && onBack && s > shape.wen[0] && s < shape.wen[1] && across > 0.34) {
        flag = FLAG_WEN;
        shade = 0.58 + 0.24 * (1 - across);
      } else if (shape === SHAPES.shark && s > 0.20 && s < 0.29 && across < 0.84 && Math.abs(((s - 0.20) % 0.018) - 0.009) < 0.0035) {
        // A shark has five gill slits, rather than a bony fish's single gill cover.
        shade *= 0.52;
      } else if (shape !== SHAPES.shark && shape.marks !== "octopus" && Math.abs(s - (0.19 + (1 - across) * 0.045)) < 0.009 && across < 0.92) {
        // 鳃盖是一道向后弯的弧。
        shade *= 0.76;
      } else if (shape.marks === "pearl" && this.pearlSpot(s, a * bestSign, L)) {
        flag = FLAG_PEARL;
        shade = 0.82;
      } else if (shape.marks === "calico" && this.calicoPatch(s, a * bestSign, L)) {
        flag = FLAG_MARK;
      } else if (shape.marks === "clown" && this.clownBand(s, a * bestSign, L)) {
        // 小丑鱼的白色竖纹：整条高亮，压过橙底。
        flag = FLAG_WEN;
        shade = 0.96;
      } else if (shape.marks === "koi" && (((s - 0.19) / 0.12) ** 2 + ((across - 0.48) / 0.62) ** 2 < 1 ||
                 ((s - 0.48) / 0.11) ** 2 + ((across - 0.40) / 0.65) ** 2 < 1)) {
        // Kohaku koi have separate red patches on a pale body.
        flag = FLAG_WEN;
        shade = 0.8;
      } else if (
        (shape.marks === "butterfly" && s > 0.14 && s < 0.67 && Math.sin((s * 10 + across * 0.5) * Math.PI) > 0.55) ||
        (shape.marks === "lionfish" && s > 0.12 && s < 0.67 && Math.sin((s * 13 - across * 0.32) * Math.PI) > 0.32) ||
        (shape.marks === "puffer" && s > 0.13 && s < 0.68 && hash3(Math.floor(s * 28), Math.floor(across * 12), 83) > 0.73) ||
        (shape.marks === "tang" && s > 0.22 && s < 0.65 && across < 0.55 && (across > 0.32 || s > 0.53)) ||
        (shape.marks === "barracuda" && !onBack && s > 0.40 && s < 0.78 && across > 0.35 && hash3(Math.floor(s * 28), Math.floor(across * 9), 14) > 0.82)
      ) {
        flag = FLAG_MARK;
      } else if (s < 0.04) {
        shade = Math.max(shade, 0.72);
      }
      this.hitFlag = flag;
      this.hitShade = shade;
      return true;
    }

    if (shape.marks === "octopus") {
      // Eight arms trail the head during mantle-first swimming. In side view
      // their bases overlap, but their tips fan out as they slowly recover
      // and draw in on the faster power stroke.
      const v = a * bestSign / L;
      if (s >= 0.43 && s <= 1) {
        const phase = ((this.animalPhase * 0.5) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
        const spread = phase < Math.PI * 1.5
          ? 0.76 + 0.24 * (phase / (Math.PI * 1.5))
          : 1 - 0.24 * ((phase - Math.PI * 1.5) / (Math.PI * 0.5));
        for (let arm = 0; arm < 8; arm++) {
          const side = arm < 4 ? -1 : 1;
          const rank = arm % 4;
          const t = (s - 0.43) / (0.57 * (1 - 0.035 * rank));
          if (t > 1) continue;
          const center = side * (0.035 + (0.065 + 0.105 * rank) * t * spread)
            + 0.012 * t * Math.sin(3.4 * t - this.animalPhase * 0.65 + arm * 0.7);
          // Respect the character grid at small sizes without filling the gaps.
          const width = Math.max(0.027, Math.min(0.032, this.ch * 0.35 / L)) * (1 - 0.16 * t);
          if (Math.abs(v - center) < width) {
            this.hitFlag = FLAG_FIN;
            this.hitShade = 0.72 - 0.1 * t;
            return true;
          }
        }
      }
      return false;
    }

    // 背鳍：从背线向外立起，前缘高、后缘低，不是身体上的一条脊线。
    if (onBack && finVisibility > 0.02 && s > shape.dorsal[0] && s < shape.dorsal[1]) {
      const t = (s - shape.dorsal[0]) / (shape.dorsal[1] - shape.dorsal[0]);
      // 狮子鱼的背鳍分出多根尖刺；其他鱼维持连续鳍缘。
      const spines = shape.marks === "lionfish" ? 0.24 + 0.76 * Math.pow(Math.abs(Math.sin(t * Math.PI * 7)), 1.5) : 1;
      const finShape = shape === SHAPES.shark ? (t < 0.36 ? t / 0.36 : (1 - t) / 0.64) : Math.pow(Math.sin(Math.PI * t), 0.72) * (1 - 0.24 * t);
      const height = L * shape.dorsalHeight * finVisibility * finShape * spines;
      const e = a - w;
      if (e >= -L * 0.016 && e <= height) {
        this.hitFlag = FLAG_FIN;
        this.hitShade = 0.55 + 0.25 * (1 - e / Math.max(1, height));
        return true;
      }
    }

    // Both the white shark and barracuda have a separate, small second dorsal fin.
    if (onBack && finVisibility > 0.02 && (shape === SHAPES.shark || shape.marks === "barracuda") && s > 0.66 && s < 0.73) {
      const t = (s - 0.66) / 0.07;
      const height = L * (shape === SHAPES.shark ? 0.025 : 0.07) * finVisibility * Math.sin(Math.PI * t);
      if (a - w >= -L * 0.01 && a - w <= height) {
        this.hitFlag = FLAG_FIN;
        this.hitShade = 0.64;
        return true;
      }
    }

    // 尾鳍仍由 anatomy 的双叶曲线判定；侧视时上下两叶就是真实的上下叶。
    const tl = shape.tail;
    // White shark's caudal fin is a narrow, almost symmetrical crescent, not
    // the broad, trailing fan used for goldfish. Both pointed lobes sweep back.
    if (shape === SHAPES.shark) {
      const u = (s - tl.root) / tl.span;
      const n = a / (L * 0.17);
      if (u > 0 && u < 1 && n <= 1 && u >= 0.7 * Math.pow(n, 1.4) && u <= 0.3 + 0.7 * Math.pow(n, 0.9)) {
        this.hitFlag = FLAG_FIN;
        this.hitShade = 0.54 + 0.3 * (1 - u);
        return true;
      }
    } else {
      const tail = inTail(s, a, L, tl, shape.body(tl.root) * L);
      if (tail.hit) {
        this.hitFlag = FLAG_FIN;
        this.hitShade = 0.54 + 0.3 * (1 - tail.edge);
        return true;
      }
    }

    // 可见一侧的胸鳍、腹鳍和臀鳍：从腹缘长出，向后下方舒展。
    if (bestSign === -this.backSign && finVisibility > 0.02) {
      if (shape === SHAPES.shark) {
        // Pectoral fins arise just behind the gills, with long swept-back tips.
        // Pelvic fins are smaller; the minute anal fin sits under the second dorsal.
        const swept = (rootFront: number, rootRear: number, tip: number, reach: number) => {
          const h = (a - wEdge) / (L * reach * finVisibility);
          if (h < 0 || h > 1) return false;
          const front = rootFront + (tip - rootFront) * h;
          const rear = rootRear + (tip - rootRear) * h;
          if (s < front || s > rear) return false;
          this.hitFlag = FLAG_FIN;
          this.hitShade = 0.64 + 0.14 * (1 - h);
          return true;
        };
        if (swept(0.265, 0.335, 0.43, 0.15) ||
            swept(0.51, 0.57, 0.62, 0.065) ||
            swept(0.67, 0.71, 0.715, 0.025)) return true;
        return false;
      }
      const blade = (root: number, len: number, reach: number, shade: number) => {
        const z = (s - root) / len;
        if (z <= 0 || z >= 1) return false;
        const outer = L * reach * finVisibility * Math.pow(Math.sin(Math.PI * z), 0.78) * (1 - 0.18 * z);
        const e = a - wEdge;
        if (e < 0 || e > outer) return false;
        this.hitFlag = FLAG_FIN;
        this.hitShade = shade + 0.16 * (1 - e / Math.max(1, outer));
        return true;
      };
      const [pm, pl, pr] = shape.pectoral;
      if (blade(pm - pl * 0.55, pl * 2.1, pr * 2.05, 0.62)) return true;
      const [vm, vl, vr] = shape.pelvic;
      if (blade(vm - vl * 0.35, vl * 2.15, vr * 2.55, 0.6)) return true;
      if (blade(shape.bodyEnd - 0.13, 0.105, 0.068, 0.58)) return true;
    }
    return false;
  }

  /**
   * 鳍条的方向，取 0..3（对应 `-` `\` `|` `/`）。
   *
   * 鱼鳍上的纹路不是随机的：尾鳍的鳍条从尾柄基部**放射**出去，胸鳍腹鳍的
   * 鳍条基本顺着身体向后掠。把这件事实写进字形里，尾巴才是一片扇；写不
   * 进去，就是一把乱撒的斜杠——这也是上一版尾巴看着像碎纸的原因。
   *
   * 方向必须在**世界坐标**里算：鱼转了个身，屏幕上那些斜杠也得跟着转。
   */
  private finDirection(s: number, v: number, L: number) {
    const shape = this.shape;
    const N = SPINE_NODES;
    const { spine } = this;
    const k = Math.max(0, Math.min(N - 2, Math.round(s * (N - 1))));
    let tx = spine[(k + 1) * 2] - spine[k * 2];
    let ty = spine[(k + 1) * 2 + 1] - spine[k * 2 + 1];
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    // 局部 (沿身, 横向) → 世界：沿身是切线，横向是它的法线。
    let along: number;
    let across: number;
    if (s > shape.tail.root) {
      along = (s - shape.tail.root) * L;
      across = v * 1.5;
    } else {
      along = -L * 0.1;
      across = v;
    }
    const dx = tx * along - ty * across;
    const dy = ty * along + tx * across;
    const a = Math.atan2(dy, dx);
    return ((Math.round(a / (Math.PI / 4)) % 4) + 4) % 4;
  }


  /** 珍珠鳞：鳞片鼓成一颗颗珠子，沿身体排成错开的网格。 */
  private pearlSpot(s: number, v: number, L: number) {
    if (s < 0.1 || s > 0.58) return false;
    const gu = (s * L) / (L * 0.062);
    const gv = v / (L * 0.052);
    const row = Math.floor(gv);
    const cu = Math.floor(gu + (row % 2 === 0 ? 0 : 0.5));
    return (gu + (row % 2 === 0 ? 0 : 0.5) - cu - 0.5) ** 2 + (gv - row - 0.5) ** 2 < 0.085;
  }

  /** 五花：一片片墨蓝/黑的色斑，用平滑噪声做成不规则的团。 */
  private calicoPatch(s: number, v: number, L: number) {
    if (s < 0.06) return false;
    const n = noise2(s * 6.5, v / (L * 0.1) + 3.1, this.goldId * 17 + 5);
    const n2 = noise2(s * 13, v / (L * 0.05) - 1.7, this.goldId * 29 + 11);
    // 阈值 0.68：斑块收小、收散。0.6 的时候整片体侧连成一横条，
    // 看着像鱼身上贴了一道黑胶带。
    return n * 0.7 + n2 * 0.3 > 0.68;
  }

  /** 小丑鱼的三道白色竖纹：头后、身中、尾柄前。 */
  private clownBand(s: number, v: number, L: number) {
    // 三条竖纹的中心位置（占体长比例）。
    const centers = [0.16, 0.44, 0.66];
    for (const c of centers) {
      // 竖纹：横向窄带，纵向贯穿整个体高。
      if (Math.abs(s - c) < 0.05) return true;
    }
    return false;
  }

  /**
   * 鱼的**形**：一条解析出来的剪影，一层淡彩，一道发丝样的轮廓线。
   *
   * 为什么不再靠格子拼：
   *
   *   网格拼出来的剪影，本质上是把一条光滑的曲线量化到 9 × 13 的方块上。
   *   鱼背的圆弧被压成一级一级的台阶，鱼头被切成一堵方墙，尾柄突然断开——
   *   无论怎么调明暗、怎么加密格子，它读起来都是一个"剪影形状的色块"，
   *   因为它的边**本来就是方块**。这不是配色的问题，是媒介的问题。
   *
   * 所以形交给矢量：body(s) 是半宽函数，脊椎是曲线，两者一乘就得到左右
   * 两条边界，连起来就是鱼的外轮廓。它是解析的，放大一百倍仍是同一条曲线。
   *
   * 明暗交给一道**横跨鱼身的渐变**：背脊受光（几乎透明，纸自己亮着），
   * 两侧压深。这道渐变跟着鱼一起转，所以鱼掉头的时候受光面不会翻。
   *
   * 而字，只负责质感——鳞、鳃、鳍条、墨斑。三层各管一件事，这才是
   * 一张"印出来的图"，而不是一格格填色。
   */
  private drawBodies(golds: Gold[]) {
    const { ctx } = this;
    const pt = this.pt;
    for (const g of golds) {
      if (g.respawnAt > 0) continue;
      this.buildSpine(g);
      const shape = this.shape;
      const L = g.length;
      const tones = inkTones(shape.pigment);
      // 身体画到尾柄基部就停，剩下的交给尾鳍。两边在这一点上的半宽是
      // 同一个数（body(end)，也就是 wrist × peak），所以接缝是平的——
      // 身体在这一头**不收口**，尾鳍从同一个宽度接着长出去。
      const end = Math.min(shape.bodyEnd, 0.98);

      // 身体：沿脊椎走一趟，右边界去、左边界回。
      ctx.beginPath();
      const SEG = 64;
      for (let i = 0; i <= SEG; i++) {
        const s = (i / SEG) * end;
        const w = shape.body.back(s) * L * this.backSign;
        this.spinePoint(s, pt);
        const x = pt.x + pt.nx * w;
        const y = pt.y + pt.ny * w;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      for (let i = SEG; i >= 0; i--) {
        const s = (i / SEG) * end;
        const w = shape.body.belly(s) * L * this.backSign;
        this.spinePoint(s, pt);
        ctx.lineTo(pt.x - pt.nx * w, pt.y - pt.ny * w);
      }
      ctx.closePath();
      this.fillFish(ctx, g, tones, shape, 1, false, false);
      this.strokeBodySides(shape, tones, end, L, 1);

      // 尾鳍：一个解析的扇面。
      //
      // 边界由两条约束的**交点**决定，不能各描各的：
      //   外缘  |a| = spread(u)     ——鳍从尾柄张开的那条弧
      //   后缘  u   = tailRear(n)   ——后边那道 V 形缺口
      // 只要外缘还在后缘里面，边界就是外缘；一旦越过去，边界换成后缘。
      // 先算出这个交点，再从交点往两侧走：外缘到尾柄、后缘到中线。
      //
      // 之前把"外缘走到 0.9 就直接跳到最宽处"当成扇面，画出来是一把
      // 后缘齐平的铲子——那一步跳过去，正好把叶尖削掉了。
      const tl = shape.tail;
      const baseHalf = shape.body(tl.root) * L * TAIL_WAIST;
      const reach = tl.span * L;
      // 尾鳍不是一块固定的纸片：发力时张开、滑行时收拢，这是真鱼的屈肌反射。
      const wMax = Math.max(baseHalf * 1.2, tl.flare * reach * (0.85 + 0.22 * g.thrust));
      let uJoin = 0.2;
      let nJoin = 0.6;
      for (let u = 0.2; u < 0.999; u += 0.02) {
        const n = Math.min(1, tailSpread(u, wMax, baseHalf) / wMax);
        if (u > tailRear(n, tl.fork)) break;
        uJoin = u;
        nJoin = n;
      }
      // 尾鳍是薄纱，靠水推着走，不是焊在骨头上的：它总比尾柄慢半拍。
      // 整个扇面绕尾柄转一个滞后角，甩尾才有"跟上来"的那一下。
      this.spinePoint(tl.root, pt);
      const baseX = pt.x;
      const baseY = pt.y;
      const lag = 0.18 * Math.sin(g.phase - 5.9);
      const cosL = Math.cos(lag);
      const sinL = Math.sin(lag);
      const at = (u: number, a: number) => {
        this.spinePoint(tl.root + u * tl.span, pt);
        const rx = pt.x + pt.nx * a - baseX;
        const ry = pt.y + pt.ny * a - baseY;
        return [baseX + rx * cosL - ry * sinL, baseY + rx * sinL + ry * cosL] as const;
      };
      ctx.beginPath();
      let first = true;
      const push = (u: number, a: number) => {
        const [x, y] = at(u, a);
        if (first) {
          ctx.moveTo(x, y);
          first = false;
        } else ctx.lineTo(x, y);
      };
      for (let i = 0; i <= 12; i++) {
        const u = (i / 12) * uJoin;
        push(u, tailSpread(u, wMax, baseHalf));
      }
      for (let i = 1; i <= 24; i++) {
        const n = nJoin * (1 - i / 12);
        push(tailRear(n, tl.fork), n * wMax);
      }
      for (let i = 1; i <= 12; i++) {
        const u = uJoin * (1 - i / 12);
        push(u, -tailSpread(u, wMax, baseHalf));
      }
      ctx.closePath();
      this.fillFish(ctx, g, tones, shape, 0.85);

      // 胸鳍：贴着体侧向后掠的一片叶。转弯时内侧张开、外侧收起——
      // 这一只鳍是"鱼在使劲"最直接的信号，比整条鱼转过去更早被看见。
      const [pm, pl, pr] = shape.pectoral;
      for (const side of [-1, 1]) {
        const reachFin = side > 0 ? this.finTipRight : this.finTipLeft;
        if (reachFin < L * 0.01) continue;
        ctx.beginPath();
        for (let i = 0; i <= 14; i++) {
          const dx = -1 + (i / 14) * 2;
          const s = pm + dx * pl;
          const e = Math.sqrt(Math.max(0, 1 - dx * dx)) * reachFin;
          this.spinePoint(s, pt);
          const w = shape.body(s) * L;
          const x = pt.x + pt.nx * side * (w + e);
          const y = pt.y + pt.ny * side * (w + e);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        for (let i = 14; i >= 0; i--) {
          const dx = -1 + (i / 14) * 2;
          const s = pm + dx * pl;
          this.spinePoint(s, pt);
          const w = shape.body(s) * L;
          ctx.lineTo(pt.x + pt.nx * side * w, pt.y + pt.ny * side * w);
        }
        ctx.closePath();
        this.fillFish(ctx, g, tones, shape, 0.62, true);
      }

      // 眼睛。整幅画里唯一"实"的两个点：鱼身上其余地方都是字攒出来的灰，
      // 只有这里是一小块墨。俯视看鱼，第一眼找的就是它们。
      if (shape.eye) {
        const es = (shape.eye[0] + shape.eye[1]) * 0.5;
        this.spinePoint(es, pt);
        const w = shape.body(es) * L;
        const r = Math.max(2.2, L * 0.016);
        const side = this.backSign;
        const ex = pt.x + pt.nx * side * w * shape.eyeAcross;
        const ey = pt.y + pt.ny * side * w * shape.eyeAcross;
        ctx.beginPath();
        ctx.arc(ex, ey, r, 0, Math.PI * 2);
        ctx.fillStyle = "rgb(249,183,51)";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(ex, ey, r * 0.62, 0, Math.PI * 2);
        ctx.fillStyle = tones.deep;
        ctx.fill();
      }
    }
  }

  /**
   * 给刚闭合的路径上色：横跨鱼身的一道渐变 + 一道细轮廓。
   *
   * 渐变的方向是**鱼的法线**，不是屏幕的上下。所以鱼转身的时候，受光面
   * 跟着鱼转——画面上永远有一条"光从左上方来"的统一光，鱼怎么游都成立。
   */
  private fillFish(
    ctx: CanvasRenderingContext2D,
    g: Gold,
    tones: Tones,
    shape: GoldShape,
    strength = 1,
    thin = false,
    edge = true,
  ) {
    const L = g.length;
    const pt = this.pt;
    const end = Math.min(shape.bodyEnd, 0.98);
    // 取躯干中段作为渐变的锚：那里的法线最能代表整条鱼。
    this.spinePoint(end * 0.45, pt);
    const w = shape.body(end * 0.45) * L;
    // 光从左上方来：世界坐标里 (-0.76, -0.65)。投影到法线上，决定哪一侧深。
    const lit = pt.nx * -0.76 + pt.ny * -0.65;
    const sign = lit >= 0 ? 1 : -1;
    const x0 = pt.x + pt.nx * sign * w * 1.25;
    const y0 = pt.y + pt.ny * sign * w * 1.25;
    const x1 = pt.x - pt.nx * sign * w * 1.25;
    const y1 = pt.y - pt.ny * sign * w * 1.25;
    const grd = ctx.createLinearGradient(x0, y0, x1, y1);
    // **体量在这一层**。字只画鳞，不再铺明暗，所以这块淡淡的色块得把
    // "这是个圆的、有厚度、光从左上打过来"讲完：受光那条边几乎透明
    // （纸自己亮着），三分之一处一道浅浅的镜面反光，背光那条边压到最重。
    //
    // alpha 封顶 0.5。再重就是一块塑料色块，鱼就成了贴纸；0.5 落在纸上
    // 刚好是"一层薄薄的水彩"——色够浓能读出形，纸纹还透得出来。
    const a = 0.5 * strength;
    const [r, gg, b] = shape.pigment;
    grd.addColorStop(0, `rgba(${r},${gg},${b},${(a * 0.18).toFixed(3)})`);
    grd.addColorStop(0.26, `rgba(${r},${gg},${b},${(a * 0.1).toFixed(3)})`);
    grd.addColorStop(0.52, `rgba(${r},${gg},${b},${(a * 0.42).toFixed(3)})`);
    grd.addColorStop(0.8, `rgba(${r},${gg},${b},${(a * 0.74).toFixed(3)})`);
    grd.addColorStop(1, `rgba(${r},${gg},${b},${(a * 0.95).toFixed(3)})`);
    ctx.fillStyle = grd;
    ctx.fill();
    // 一道发丝样的轮廓线。
    //
    // 这不是"描边"——描边是把形框起来，这里是把形**交代**出来：铜版画的
    // 边就是一刀细线压住一片网点，让眼睛知道图案到此为止。少了它，淡彩
    // 的边缘和纸的界限只是一次 alpha 的跳变，鱼会显得毛。
    if (edge && !thin) {
      ctx.strokeStyle = tones.line;
      ctx.lineWidth = 0.85;
      ctx.globalAlpha = 0.35 + 0.4 * strength;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  /**
   * 只描躯干的**两条侧线**，不描首尾的封口。
   *
   * 躯干是一个封闭多边形：从吻端沿一侧走到尾柄，再沿另一侧走回吻端。
   * 中间必有两条封口线——吻端那一条长度为 0（宽度本来就是 0，看不出来），
   * 尾柄那一条却是一道横跨屁股的**短墙**。分段描边的时候它是一条明明白白
   * 的直线，于是鱼屁股上总有一道"接缝"。
   *
   * 所以填充照旧用闭合路径（填充需要闭合），描边拆成两条开口曲线：
   * 各自从吻端走到尾柄，谁也不连回去。尾巴的轮廓线会把接口盖住。
   */
  private strokeBodySides(shape: GoldShape, tones: Tones, end: number, L: number, strength: number) {
    const { ctx } = this;
    const pt = this.pt;
    ctx.strokeStyle = tones.line;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.55 + 0.4 * strength;
    const SEG = 64;
    for (const side of [1, -1]) {
      ctx.beginPath();
      for (let i = 0; i <= SEG; i++) {
        const s = (i / SEG) * end;
        const sideWidth = side === this.backSign ? shape.body.back(s) : shape.body.belly(s);
        const w = sideWidth * L;
        this.spinePoint(s, pt);
        const x = pt.x + pt.nx * side * w;
        const y = pt.y + pt.ny * side * w;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /**
   * 沿模拟节点的局部方向保长积分；鱼头和前躯保持稳定，行波集中在尾部。
   */
  private buildSpine(g: Gold) {
    const { spine, arc } = this;
    const N = SPINE_NODES;
    const L = g.length;
    const inv = 1 / (N - 1);
    // 摆得多用力只看推力：滑行时身体几乎绷直，发力时整个后半身甩起来。
    const swim = 0.24 + 0.92 * g.thrust;
    this.shape = SHAPES[g.kind];
    this.animalPhase = g.phase;
    this.goldId = g.id;
    // 朝右时局部正侧是屏幕上，朝左时相反。这样两种航向都是背朝上、
    // 腹朝下，不会把一条向左游的鱼画成肚皮朝天。
    this.backSign = Math.cos(g.heading) >= 0 ? 1 : -1;
    this.facingBlend = clamp(Math.cos(g.heading) / 0.32, -1, 1);

    // 波数（每身长的弧度）。位移波长 2π/K ≈ 1.43 个身长。
    const K = 4.4;
    const amp = L * (g.kind === "octopus" ? 0.006 : 0.035) * swim;

    // 模拟节点记录头部转向后的身体曲线；渲染只叠加尾摆，不把曲线拉直。
    let x = g.nodes[0];
    let y = g.nodes[1];
    spine[0] = x;
    spine[1] = y;
    for (let k = 1; k < N; k++) {
      // 位移场 d(s) = amp·env(s)·sin(phase − K·s) 的中心差分，再除以体长
      // 换成真正的切线角。两个采样点正好落在节点上，包络直接查表。
      const hi = WAVE_ENV[k] * Math.sin(g.phase - K * k * inv);
      const lo = WAVE_ENV[k - 1] * Math.sin(g.phase - K * (k - 1) * inv);
      const slope = (amp * (hi - lo)) / inv / L;
      // 沿模拟节点的局部切线积分，使头先转、身体和尾部逐节跟随。
      const ndx = g.nodes[k * 2] - g.nodes[(k - 1) * 2];
      const ndy = g.nodes[k * 2 + 1] - g.nodes[(k - 1) * 2 + 1];
      const baseAngle = Math.hypot(ndx, ndy) > 0.001 ? Math.atan2(ndy, ndx) : g.heading + Math.PI;
      const th = baseAngle + Math.atan(slope);
      x += Math.cos(th) * L * inv;
      y += Math.sin(th) * L * inv;
      spine[k * 2] = x;
      spine[k * 2 + 1] = y;
    }
    arc[0] = 0;
    for (let k = 1; k < N; k++) {
      arc[k] =
        arc[k - 1] +
        Math.hypot(spine[k * 2] - spine[(k - 1) * 2], spine[k * 2 + 1] - spine[(k - 1) * 2 + 1]);
    }
    this.arcTotal = arc[N - 1] || 1;
  }

  /**
   * 按弧长比例 s 取脊椎上的一点，连同当地的切线/法线。
   * 结果写进 out，不分配对象——这条路径每帧要跑几千次。
   */
  private spinePoint(s: number, out: { x: number; y: number; nx: number; ny: number }) {
    const { spine, arc } = this;
    const N = SPINE_NODES;
    const target = clamp(s, 0, 1) * this.arcTotal;
    let k = 0;
    while (k < N - 2 && arc[k + 1] < target) k++;
    const a0 = arc[k];
    const a1 = arc[k + 1];
    const u = a1 > a0 ? clamp((target - a0) / (a1 - a0), 0, 1) : 0;
    const x0 = spine[k * 2];
    const y0 = spine[k * 2 + 1];
    const x1 = spine[(k + 1) * 2];
    const y1 = spine[(k + 1) * 2 + 1];
    out.x = x0 + (x1 - x0) * u;
    out.y = y0 + (y1 - y0) * u;
    const tx = x1 - x0;
    const ty = y1 - y0;
    const l = Math.hypot(tx, ty) || 1;
    out.nx = -ty / l;
    out.ny = tx / l;
  }

  /**
   * 从模拟脊椎生成一条更平滑、会波动的水中脊椎，然后对包围盒里的
   * 每个格子做超采样。完全覆盖的格子画成实心鱼身，部分覆盖的画成描边字符。
   */
  private rasterizeGolds(golds: Gold[], t: number) {
    const { goldFlag, goldShade, goldKey, goldDepth, goldKind, goldShadow, goldS, goldVN, spine, arc, cw, ch, cols, rows } = this;
    goldFlag.fill(0);
    goldShadow.fill(0);

    for (const g of golds) {
      if (g.respawnAt > 0) continue;
      const L = g.length;
      const N = SPINE_NODES;
      const flutter = Math.sin(g.phase);
      this.buildSpine(g);
      const kindIndex = KINDS.indexOf(g.kind);
      // mouth 是进食相位，1 → 0；中途张到最大，再自然闭合。
      const mouthOpen = Math.sin(Math.PI * clamp(g.mouth, 0, 1));
      const mouthDepth = Math.max(cw * 2, L * 0.14);
      const mouthHalf = Math.max(ch * 1.1, L * 0.10) * mouthOpen;
      const mouthCos = Math.cos(g.heading);
      const mouthSin = Math.sin(g.heading);
      // Project the side silhouette through a front-facing view during yaw.
      // Sample on the existing ASCII grid so the turn never becomes a vector overlay.
      const yaw = g.turnTo !== undefined ? (g.turnProgress ?? 0) : 0;
      const front = Math.sin(Math.PI * yaw);
      const projection = Math.max(0.18, Math.abs(Math.cos(Math.PI * yaw)));
      const sampleProjected = (x: number, y: number) => {
        // Keep the frontal silhouette legible even for small fish on a coarse grid.
        const ax = (x - g.nodes[0]) / Math.max(0.001, Math.max(cw * 1.6, L * 0.17) * front);
        const ay = (y - g.nodes[1]) / Math.max(0.001, Math.max(ch * 1.2, L * 0.23) * front);
        if (front > 0.18 && ax * ax + ay * ay <= 1) {
          // Frontal head: paired eyes and a softly shaded body at the pivot.
          this.hitS = 0.08;
          this.hitV = y - g.nodes[1];
          this.hitDist = 0;
          const eyeX = Math.abs(ax) - 0.46;
          const eyeY = ay + 0.2;
          this.hitFlag = eyeX * eyeX + eyeY * eyeY < 0.15 ? FLAG_EYE : FLAG_BODY;
          this.hitShade = this.hitFlag === FLAG_EYE ? 0 : 0.72 - 0.16 * Math.abs(ay);
          return true;
        }
        const hit = this.sampleGold(g.nodes[0] + (x - g.nodes[0]) / projection, y, L);
        if (front > 0.18 && !hit) this.hitDist = 0;
        return hit;
      };
      const mouthCut = (x: number, y: number) => {
        if (g.kind === "octopus") return false;
        if (g.turnTo !== undefined) return false;
        if (mouthOpen < 0.02) return false;
        const dx = x - g.nodes[0];
        const dy = y - g.nodes[1];
        const along = dx * mouthCos + dy * mouthSin;
        const across = -dx * mouthSin + dy * mouthCos;
        return along >= -mouthDepth && along <= cw &&
          Math.abs(across) < mouthHalf * clamp((along + mouthDepth) / mouthDepth, 0, 1.2);
      };

      // 胸鳍：转弯时**内侧**张开当刹车，外侧收起。这是鱼转向的物理机制，
      // 做出来以后转弯就不是"整体旋转"，而是"一侧抵住水"。
      // 平时也在慢慢划水——频率只有尾摆的一半，慢速巡游的鱼就是这样，
      // 靠胸鳍找平衡、偶尔划一下，不是一直张着。
      const bank = clamp(g.bank, -1, 1) * 0.5;
      const flex =
        0.95 +
        0.09 * Math.sin(g.phase * 0.5 + g.id * 1.7) +
        0.12 * clamp(Math.abs(g.vy) / 40, 0, 1);
      const reachFin = this.shape.pectoral[2];
      this.finTipRight = L * reachFin * flex * (1 - bank);
      this.finTipLeft = L * reachFin * flex * (1 + bank);
      this.tailFlutter = flutter;

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (let k = 0; k < N; k++) {
        minX = Math.min(minX, spine[k * 2]);
        maxX = Math.max(maxX, spine[k * 2]);
        minY = Math.min(minY, spine[k * 2 + 1]);
        maxY = Math.max(maxY, spine[k * 2 + 1]);
      }
      // 背鳍和腹鳍都在身体轮廓之外，包围盒要把它们一起包住。
      const reach = L * 0.52;
      const c0 = Math.max(0, Math.floor((minX - reach) / cw));
      const c1 = Math.min(cols - 1, Math.floor((maxX + reach) / cw));
      const r0 = Math.max(0, Math.floor((minY - reach) / ch));
      const r1 = Math.min(rows - 1, Math.floor((maxY + reach) / ch));
      if (c0 > c1 || r0 > r1) continue;

      const skipBeyond = reach + Math.hypot(cw, ch);
      const shadowDc = Math.round((L * 0.03) / cw) + 1;
      const shadowDr = Math.round((L * 0.018) / ch) + 1;

      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const x = c * cw;
          const y = r * ch;
          const centerHit = sampleProjected(x + cw / 2, y + ch / 2) &&
            !mouthCut(x + cw / 2, y + ch / 2);
          if (!centerHit && this.hitDist > skipBeyond) continue;
          const flag = this.hitFlag;
          const shade = this.hitShade;
          const s = this.hitS;
          const v = this.hitV;

          let hits = centerHit ? 1 : 0;
          for (let k = 0; k < SUBSAMPLES.length; k += 2) {
            const sx = x + SUBSAMPLES[k] * cw;
            const sy = y + SUBSAMPLES[k + 1] * ch;
            if (sampleProjected(sx, sy) && !mouthCut(sx, sy)) hits++;
          }
          if (hits === 0) continue;
          const coverage = hits / 5;

          const i = r * cols + c;
          // 以身体为锚的 key，字符才会跟着皮肤一起移动。
          // 鳍例外：鳍条的**走向**就是那片鳍的形状，随机换字的话尾巴就成了
          // 一把撒出去的斜杠。所以鳍格里存的不是噪声，是鳍条的方向（0..3）。
          const key =
            flag === FLAG_FIN
              ? this.finDirection(s, v, L)
              : (hash3(Math.round(s * 52), Math.round(v / (cw * 0.9)), g.id) * 4294967295) >>> 0;
          goldKey[i] = key;
          goldS[i] = s;
          goldVN[i] = v / L;
          goldDepth[i] = g.depth;
          goldKind[i] = kindIndex;

          if (centerHit && coverage >= 0.42) {
            goldFlag[i] = flag;
            const flicker = (hash3(c, r, Math.floor(t * 5)) - 0.5) * 0.05;
            goldShade[i] = clamp(shade + flicker, 0, 1);
            const sc = c + shadowDc;
            const sr = r + shadowDr;
            if (sc < cols && sr < rows) goldShadow[sr * cols + sc] = 1;
          } else {
            goldFlag[i] = FLAG_EDGE;
            goldShade[i] = coverage;
          }
        }
      }
    }
  }

  /**
   * 金鱼：逐格铺彩，再在上面刻字。
   *
   * 这一版是**印**出来的，不是描出来的：
   *
   *   ① 铺彩  每一格先用 `fillRect` 填一块实心颜色，四边各内缩半像素，
   *           格子之间于是留着一道头发丝的缝。一整片铺开以后是一张排过
   *           版的色块，而不是一块塑料板——这道缝就是"印刷感"的全部来源。
   *   ② 刻字  字比底色深得多，压在色块上。明暗靠**字有多黑、该不该加粗**
   *           交代，色块的深浅交给下面那一段算。
   *   ③ 收边  被鱼盖住一半的格子不铺彩，只落一个小小的标点。一串这样的
   *           点就是轮廓：近看是点，退开一步就是线。
   *
   * 所有颜色都从一个数推出来：`pigment`，这条鱼的本色。亮部把纸白往本色
   * 里调四分之一（纸被染了一层水彩），暗部把本色压到三成（浓墨），字永远
   * 是本色乘 0.28。所以不管哪条鱼，它身上最深的字就是**它自己的颜色调暗**，
   * 不是一律的黑色——一缸五条鱼，五套墨。
   */
  private drawGolds(t: number) {
    const { ctx, cols, rows, cw, ch, goldFlag, goldShade, goldKey, goldDepth, goldKind, goldS } = this;
    const n = cols * rows;
    const flick = Math.floor(t * 6);
    // 色块内缩的半像素。在 8~9 px 的格子上，这样留出来的缝刚好是一条
    // 格子线；再宽就成了一块一块的瓷砖，鱼身上全是缝。
    const inset = 0.5;

    for (let i = 0; i < n; i++) {
      const flag = goldFlag[i];
      if (!flag) continue;
      const col = i % cols;
      const row = (i / cols) | 0;
      const x = col * cw;
      const y = row * ch;
      const cx = x + cw / 2;
      const cy = y + ch / 2 + 1;
      const key = goldKey[i];
      const shape = SHAPES[KINDS[goldKind[i]]];
      const wen = flag === FLAG_WEN && shape.wenPigment;
      const tail = flag === FLAG_FIN && goldS[i] >= shape.tail.root && shape.tailPigment;
      const [pr, pg, pb] = wen ? shape.wenPigment! : tail ? shape.tailPigment! : shape.pigment;
      const ink = clamp(1 - goldShade[i], 0, 1);
      // 远一点的鱼整体淡一档，一缸水才有前后。
      const dim = 0.72 + 0.28 * goldDepth[i];
      const dark = shape.ink > 0.5;

      if (flag === FLAG_EDGE) {
        // 半覆盖的格子：不铺彩，只落一个浅点。浓淡按覆盖率走，边就散开了。
        const cover = clamp(goldShade[i], 0, 1);
        const set = cover >= 0.5 ? EDGE_HEAVY : EDGE_LIGHT;
        ctx.globalAlpha = (0.4 + 0.5 * cover) * dim;
        // 黑底上的轮廓不是"更深的鱼色"，而是"更暗的鱼身"——正好反过来。
        ctx.fillStyle = `rgb(${Math.round(52 + pr * 0.52)},${Math.round(46 + pg * 0.5)},${Math.round(44 + pb * 0.48)})`;
        ctx.fillText(set[(key >>> 8) % set.length], cx, cy);
        ctx.globalAlpha = 1;
        continue;
      }

      // 尾鳍只铺一层极淡的彩（下面那段里按 0.16 处理）：俯视看一条鱼，
      // 尾巴是一片半透明的纱，底下的水看得见。完全铺满就成了两块贴在屁股
      // 上的实心瓦片；一点不铺，几十根鳍条就是撒出去的一把碎纸，读不出
      // "一片尾巴"。一层薄到几乎看不见的彩，正好把扇面兜住。
      const sheer = false;

      // ① 铺彩。w = 0 是纸白，w = 1 是浓墨。
      if (!sheer) {
        // ink 的实际范围只有 0.30（脊上的反光）到 0.85（贴边的折面），
        // 直接拿它当插值参数，整条鱼会全部落进暗部、糊成一块木头。
        // 先把 0.30~0.82 拉满到 0~1，再取平方把它们压向"浅"那一头——
        // 鱼身上七成面积是浅彩，只有背光和折边才沉下去。
        // 从参考图取的是“亮橙金 → 金 → 奶油白”的关系，不是把深棕
        // 本色往纸白里稀释。亮部先得到足够饱和的鱼皮色，再连续过渡到
        // 暗部；腹面单独降低色素浓度，形成金鱼特有的浅色肚皮。
        const belly = flag === FLAG_BELLY;
        const pale = pr > 220 && pg > 200;
        const lightMix = belly ? 0.3 : dark ? 0.38 : pale ? 0.86 : 0.7;
        const luma = pr * 0.3 + pg * 0.59 + pb * 0.11;
        const hr = luma + (pr - luma) * 0.9;
        const hg = luma + (pg - luma) * 0.9;
        const hb = luma + (pb - luma) * 0.9;
        const lr = 252 + (hr - 252) * lightMix;
        const lg = 251 + (hg - 251) * lightMix;
        const lb = 247 + (hb - 247) * lightMix;
        const t = Math.pow(clamp((ink - 0.22) / 0.68, 0, 1), 1.35);
        const darkFactor = belly ? 0.8 : 0.52;
        const markFactor = flag === FLAG_MARK && shape.marks !== "calico" ? 0.32 : 1;
        const fr = (lr + (pr * darkFactor - lr) * t) * markFactor;
        const fg = (lg + (pg * darkFactor - lg) * t) * markFactor;
        const fb = (lb + (pb * darkFactor - lb) * t) * markFactor;
        const a = flag === FLAG_FIN ? 0.52 + 0.3 * (1 - clamp((goldS[i] - shape.tail.root) / 0.1, 0, 1)) : 1;
        if (shape === SHAPES.shark && flag === FLAG_BELLY) {
          // Great white countershading: a distinctly pale ventral surface.
          const light = (0.94 + 0.06 * goldShade[i]) * dim;
          ctx.fillStyle = `rgb(${Math.round(235 * light)},${Math.round(239 * light)},${Math.round(235 * light)})`;
        } else if (shape === SHAPES.shark && flag === FLAG_BODY) {
          const light = (0.82 + 0.18 * goldShade[i]) * dim;
          ctx.fillStyle = `rgb(${Math.round(105 * light)},${Math.round(126 * light)},${Math.round(137 * light)})`;
        } else {
          ctx.fillStyle = a === 1
            ? `rgb(${Math.round(fr * dim)},${Math.round(fg * dim)},${Math.round(fb * dim)})`
            : `rgba(${Math.round(hr)},${Math.round(hg)},${Math.round(hb)},${(a * dim).toFixed(3)})`;
        }
        ctx.fillRect(x + inset, y + inset, cw - inset * 2, ch - inset * 2);
      }

      // ② 刻字。
      let glyph: string;
      let weight = 0;

      if (flag === FLAG_EYE) {
        // 侧视眼睛：金色虹膜、深色瞳孔和一粒高光。只用黑方块会像纽扣，
        // 用 @ 又会在小格子里变成空心圈。
        const e = Math.min(cw, ch) * 0.39;
        ctx.fillStyle = shape === SHAPES.shark ? "rgba(15,20,25,0.98)" : dark ? "rgba(202,157,74,0.95)" : "rgba(249,183,51,0.96)";
        ctx.fillRect(cx - e, cy - e, e * 2, e * 2);
        ctx.fillStyle = "rgba(20,20,24,0.97)";
        ctx.fillRect(cx - e * 0.58, cy - e * 0.58, e * 1.16, e * 1.16);
        ctx.fillStyle = "rgba(255,255,246,0.95)";
        ctx.fillRect(cx - e * 0.32, cy - e * 0.36, Math.max(1, e * 0.28), Math.max(1, e * 0.28));
        continue;
      } else if (flag === FLAG_MARK) {
        // 五花的墨斑：一团一团的黑，不是一行一行的字。
        const h = hash3(key, flick, 23);
        glyph = h < 0.42 ? "#" : h < 0.78 ? "+" : "*";
      } else if (flag === FLAG_PEARL) {
        glyph = hash3(key, flick, 31) < 0.5 ? "o" : "*";
      } else if (flag === FLAG_WEN) {
        // 头瘤：疙疙瘩瘩的一团肉，大半是小点、偶尔一个 8。
        glyph = hash3(key, flick, 17) < 0.35 ? "8" : hash3(key, flick, 29) < 0.6 ? "o" : ":";
      } else if (flag === FLAG_RIDGE) {
        // 背鳍：俯视只看到脊上一道浅痕。
        glyph = hash3(key, flick, 19) < 0.5 ? ":" : "\u00b7";
      } else if (flag === FLAG_FIN) {
        // 鳍条：一串同向的斜杠连起来，就是一根鳍条。方向来自鳍本身的
        // 走向（finDirection），不是掷骰子。
        // 边界格要么是鳍、要么是"鳍和水的交界"（FLAG_EDGE）——尾鳍很薄，
        // 外缘那一圈几乎全是后者。只认 FLAG_FIN 的话，扇面永远没有边，
        // 几十根鳍条就散成了一片碎纸。
        const finAt = (c2: number, r2: number) => {
          if (c2 < 0 || c2 >= cols || r2 < 0 || r2 >= rows) return false;
          const f = goldFlag[r2 * cols + c2];
          return f === FLAG_FIN || f === FLAG_EDGE;
        };
        const rim =
          goldS[i] > shape.tail.root &&
          (!finAt(col - 1, row) || !finAt(col + 1, row) ||
            !finAt(col, row - 1) || !finAt(col, row + 1));
        if (rim) {
          // 鳍的外缘：一道实住的边，扇面才收得住。不勾这道边，几十根
          // 斜线就是撒出去的一把碎纸，读不出"一片尾巴"。
          ctx.globalAlpha = 0.3 * dim;
          ctx.fillStyle = `rgb(${pr},${pg},${pb})`;
          ctx.fillRect(x + inset, y + inset, cw - inset * 2, ch - inset * 2);
          ctx.globalAlpha = 1;
          glyph = "-";
          weight = 0.5;
        } else {
          // 内部：隔一格空一格，鳍才透得过光。
          //
          // 这里的哈希必须用**格子坐标**，不能用 key——鳍格的 key 存的是
          // 鳍条方向（0..3），拿它当种子，整片鳍会一起被跳过、或者一起
          // 被留下，结果是一片整齐的斜纹，不是鳍条。
          if ((col + row * 2) % 3 === 1) continue;
          glyph = FIN_DIR[key & 3];
        }
      } else {
        // 鱼身。四档，档间抖动——不抖的话一整片落在同一个字上，一排字
        // 连起来就是一条横线，那是条纹，不是网点。
        const st = ink * 3;
        const lo = Math.floor(st);
        const up = hash3(key, 19, 11) < st - lo ? 1 : 0;
        const lv = clamp(lo + up, 0, 3);
        glyph = lv === 0 ? ":" : lv === 1 ? "*" : lv === 2 ? "*" : "#";
        // 中段微微加重、最重那一档再重一点。早了鱼身两侧就挂上一串黑疙瘩。
        weight = lv >= 3 ? 0.9 : lv === 2 ? 0.35 : 0;
      }

      // ③ 字色：本色乘 0.28。暗部的字再压一档，才压得住底下的浓墨块。
      const gs = 0.36 * (ink > 0.6 ? 0.78 : 1);
      ctx.fillStyle = `rgba(${Math.round(pr * gs)},${Math.round(pg * gs)},${Math.round(pb * gs)},${(0.9 * dim).toFixed(2)})`;
      if (weight) {
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = weight;
        ctx.strokeText(glyph, cx, cy);
      }
      ctx.fillText(glyph, cx, cy);
    }
  }

  /** 用鱼身颜色的字符描出张开的上下唇，与身体缺口保持一致。 */
  private drawMouths(golds: Gold[]) {
    const { ctx, cw, ch } = this;
    for (const g of golds) {
      const open = Math.sin(Math.PI * clamp(g.mouth, 0, 1));
      if (open < 0.08 || g.respawnAt > 0 || g.turnTo !== undefined || g.kind === "octopus") continue;
      const depth = Math.max(cw * 2, g.length * 0.14);
      const half = Math.max(ch * 1.1, g.length * 0.10) * open;
      const [r, green, b] = SHAPES[g.kind].pigment;
      ctx.save();
      ctx.translate(g.nodes[0], g.nodes[1]);
      ctx.rotate(g.heading);
      ctx.fillStyle = `rgb(${Math.min(255, Math.round(r * 0.85 + 44))},${Math.min(255, Math.round(green * 0.85 + 44))},${Math.min(255, Math.round(b * 0.85 + 44))})`;
      // 同鱼身一样用字符而非实心矢量，唇线从口角延伸到吻端。
      const count = Math.max(2, Math.ceil(depth / cw));
      for (let k = 1; k <= count; k++) {
        const u = k / count;
        const x = -depth * (1 - u);
        const y = half * u;
        ctx.fillText(k === count ? ":" : ";", x, -y);
        ctx.fillText(k === count ? ":" : ";", x, y);
      }
      ctx.restore();
    }
  }

  // ── 景 ─────────────────────────────────────────────────────────────

  /**
   * 水面：两道错开的波，越往下越淡。
   * 水面必须动——一缸死水看着就是一张壁纸。
   */
  private drawSurface(t: number) {
    const { ctx, cols, cw, ch, scenery } = this;
    const bands = Math.max(2, Math.round(scenery.surface / ch));
    for (let r = 0; r < bands; r++) {
      const y = r * ch + ch / 2 + 1;
      const fade = 0.62 - r * (0.46 / bands);
      let style = "";
      for (let c = 0; c < cols; c++) {
        const w1 = Math.sin(c * 0.19 + t * 1.15 + r * 1.9);
        const w2 = Math.sin(c * 0.071 - t * 0.62 + r * 0.7);
        const v = w1 + w2;
        if (v < 0.45) continue;
        const heavy = v > 1.15;
        const next = `rgba(118,186,222,${(heavy ? fade * 1.1 : fade * 0.72).toFixed(2)})`;
        if (next !== style) {
          style = next;
          ctx.fillStyle = next;
        }
        ctx.fillText(heavy ? "~" : "-", c * cw + cw / 2, y);
      }
    }
  }

  /**
   * 水草：一丛几片叶子，从沙里长出来，随水流摆。
   *
   * 叶片沿一条二次贝塞尔弧线长出来——直上直下的一排竖线不像水草，像篱笆。
   * 叶片朝同一侧倒（水流的方向一致），但每片的弧度、长短、节奏都不同。
   */
  private drawWeeds(t: number) {
    const { ctx, cols, rows, cw, ch, scenery, weedStamp } = this;
    const frame = ++this.weedFrame;
    for (const w of scenery.weeds) {
      const [r, g, bl] = w.color;
      for (const b of w.blades) {
        const len = w.height * b.scale;
        const x0 = w.x + b.offset;
        const y0 = w.base;
        const sway = Math.sin(t * b.freq + b.phase) * len * b.sway;
        // 控制点决定"弓"的弧度，终点决定倒向哪边。
        const cxp = x0 + b.lean * 0.35 + sway * 0.35;
        const cyp = y0 - len * 0.58;
        const x1 = x0 + b.lean + sway;
        const y1 = y0 - len;
        const steps = Math.max(10, Math.round(len / (ch * 0.42)));
        let px = x0;
        let py = y0;
        for (let k = 0; k <= steps; k++) {
          const p = k / steps;
          const q = 1 - p;
          const x = q * q * x0 + 2 * q * p * cxp + p * p * x1;
          const y = q * q * y0 + 2 * q * p * cyp + p * p * y1;
          const dx = x - px;
          const dy = y - py || -1;
          px = x;
          py = y;
          const col = Math.floor(x / cw);
          const row = Math.floor(y / ch);
          if (col < 0 || col >= cols || row < 0 || row >= rows) continue;
          const slope = dx / dy;
          const glyph = p > 0.94 ? "'" : Math.abs(slope) < 0.45 ? "|" : slope < 0 ? "\\" : "/";
          const a = w.alpha * (0.4 + 0.6 * (1 - p));
          const i = row * cols + col;
          if (weedStamp[i] !== frame) {
            weedStamp[i] = frame;
            ctx.fillStyle = `rgba(${r},${g},${bl},${a.toFixed(2)})`;
            ctx.fillText(glyph, col * cw + cw / 2, row * ch + ch / 2 + 1);
          }
          // 粗叶再描一格，才有"片子"的厚度。
          if (b.weight > 1 && col + 1 < cols) {
            const j = row * cols + col + 1;
            if (weedStamp[j] !== frame) {
              weedStamp[j] = frame;
              ctx.fillStyle = `rgba(${r},${g},${bl},${(a * 0.58).toFixed(2)})`;
              ctx.fillText(glyph, (col + 1) * cw + cw / 2, row * ch + ch / 2 + 1);
            }
          }
          // 每隔几格往外挑一片小叶。一条光溜溜的弧线看着像划痕，
          // 长出叶子才是一株草。
          if (k % 3 === 1) {
            const side = k % 6 === 1 ? 1 : -1;
            const lc = col + side;
            if (lc >= 0 && lc < cols) {
              const j = row * cols + lc;
              if (weedStamp[j] !== frame) {
                weedStamp[j] = frame;
                ctx.fillStyle = `rgba(${r},${g},${bl},${(a * 0.72).toFixed(2)})`;
                ctx.fillText(side > 0 ? "," : "'", lc * cw + cw / 2, row * ch + ch / 2 + 1);
              }
            }
          }
        }
      }
    }
  }

  /** 鹿角珊瑚：粗根向上分叉，枝梢再分出短枝，以字符格保持背景画风。 */
  private drawCorals(_t: number) {
    const { ctx, cols, rows, cw, ch, scenery } = this;
    for (const c of scenery.corals) {
      const [r, g, b] = c.color;
      const occupied = new Set<number>();
      const stamp = (x: number, y: number, tip = false) => {
        const col = Math.floor(x / cw), row = Math.floor(y / ch);
        if (col < 0 || col >= cols || row < 0 || row >= rows) return;
        const cell = row * cols + col;
        if (occupied.has(cell)) return;
        occupied.add(cell);
        const texture = hash3(col, row, c.seed);
        const glyph = tip ? (texture > 0.5 ? "o" : "*") : texture > 0.65 ? "%" : texture > 0.3 ? "+" : "#";
        const alpha = c.alpha * (tip ? 0.8 : 0.68 + texture * 0.22);
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha.toFixed(2)})`;
        ctx.fillText(glyph, col * cw + cw / 2, row * ch + ch / 2 + 1);
      };
      const branch = (x0: number, y0: number, x1: number, y1: number, thick = false) => {
        const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0) / cw, Math.abs(y1 - y0) / ch) * 2));
        for (let i = 0; i <= steps; i++) {
          const p = i / steps;
          const x = x0 + (x1 - x0) * p, y = y0 + (y1 - y0) * p;
          stamp(x, y, i === steps);
          if (thick && p < 0.7) stamp(x + cw, y);
        }
      };
      const h = c.height;
      const lean = (hash3(c.seed, 2, 7) - 0.5) * h * 0.12;
      branch(c.x, c.base, c.x + lean, c.base - h * 0.92, true);
      for (let i = 0; i < c.branches; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const level = 0.2 + 0.52 * Math.floor(i / 2) / Math.max(1, Math.ceil(c.branches / 2) - 1);
        const x0 = c.x + lean * level;
        const y0 = c.base - h * level;
        const spread = h * (0.25 + 0.13 * hash3(c.seed, i, 19));
        const x1 = x0 + side * spread;
        const y1 = y0 - h * (0.20 + 0.12 * hash3(c.seed, i, 37));
        branch(x0, y0, x1, y1, true);
        branch(x1, y1, x1 + side * h * 0.08, y1 - h * 0.18);
        branch(x1, y1, x1 - side * h * 0.11, y1 - h * 0.13);
      }
    }
  }

  // ── 小鱼、点阵、气泡 ───────────────────────────────────────────────

  /**
   * 把每条小鱼吸附到格子上，按 明度 × 朝向 分桶：远的暗、近的亮，
   * 急转或受惊的会闪。两条鱼落在同一格时，近的那条优先。
   */
  private markFish(world: World) {
    const { fishStamp, goldFlag } = this;
    const frame = ++this.frameId;
    if (this.fishBuckets.length === 0) {
      // 样式只跟 种类 × 明度 有关，朝向只决定字形。
      for (const sp of SPECIES) {
        const [r, g, b] = sp.color;
        for (const a of FISH_ALPHAS) {
          for (let q = 0; q < this.fishGlyphs.length; q++) {
            this.fishStyles.push(`rgba(${r},${g},${b},${a})`);
          }
        }
      }
      const buckets = SPECIES.length * FISH_ALPHAS.length * this.fishGlyphs.length;
      for (let i = 0; i < buckets; i++) this.fishBuckets.push([]);
    }
    for (const bucket of this.fishBuckets) bucket.length = 0;
    for (let pass = 0; pass < 2; pass++) {
      for (const f of world.fish) {
        if (!f.alive || (f.depth > 0.78 ? 0 : 1) !== pass) continue;
        const i = this.cellIndex(f.x, f.y);
        if (i < 0 || fishStamp[i] === frame || goldFlag[i]) continue;
        fishStamp[i] = frame;
        const glint = clamp(Math.abs(f.turn) / 3.5, 0, 1);
        const v = 0.3 + (0.4 * (f.depth - 0.55)) / 0.45 + 0.3 * Math.max(glint, f.alarm);
        const lvl = clamp(Math.floor(v * FISH_ALPHAS.length), 0, FISH_ALPHAS.length - 1);
        // 朝向决定用短横、竖线还是斜杠，小鱼才会"顺着游"。
        const ang = Math.atan2(f.vy, f.vx);
        const q = f.species === SHRIMP_SPECIES_INDEX ? (f.vx >= 0 ? 0 : 1) : ((Math.round(ang / (Math.PI / 4)) % 4 + 4) % 4);
        const bucket = (f.species * FISH_ALPHAS.length + lvl) * this.fishGlyphs.length + q;
        this.fishBuckets[bucket].push(i);
      }
    }
  }

  private drawFish() {
    const { ctx, cw, ch, cols, fishBuckets, fishStyles, fishGlyphs } = this;
    const qCount = fishGlyphs.length;
    for (let b = 0; b < fishBuckets.length; b++) {
      const bucket = fishBuckets[b];
      if (!bucket.length) continue;
      ctx.fillStyle = fishStyles[b];
      const species = Math.floor(b / (FISH_ALPHAS.length * qCount));
      // A tiny curved segmented ASCII body distinguishes shrimp from shoal fish.
      const glyph = species === SHRIMP_SPECIES_INDEX ? (b % qCount === 0 ? "(:>" : "<:)") : fishGlyphs[b % qCount];
      for (const i of bucket) {
        ctx.fillText(glyph, (i % cols) * cw + cw / 2, ((i / cols) | 0) * ch + ch / 2 + 1);
      }
    }
  }

  /** 点水面时的白色光斑，一闪就散。 */
  private drawSpark() {
    const { ctx, spark, cols, cw, ch } = this;
    for (let i = 0; i < spark.length; i++) {
      const h = spark[i];
      if (h < 0.1) continue;
      const col = i % cols;
      const row = (i / cols) | 0;
      ctx.fillStyle = h > 0.55 ? `rgba(150,225,255,${(h * 0.95).toFixed(2)})` : `rgba(96,186,240,${(h * 1.15).toFixed(2)})`;
      ctx.fillText(h > 0.6 ? "*" : "·", col * cw + cw / 2, row * ch + ch / 2 + 1);
    }
  }

  /** 气泡：吸到格子上，用 "o" / "·" 画，越接近水面越淡。 */
  private drawBubbles(world: World) {
    const { ctx, cw, ch, cols, rows } = this;
    // 两档大小，每档一次 fillStyle。
    for (let pass = 0; pass < 2; pass++) {
      const big = pass === 1;
      let styleSet = false;
      for (const b of world.bubbles) {
        if (b.r > 1.5 !== big) continue;
        const col = Math.round(b.x / cw);
        const row = Math.round(b.y / ch);
        if (col < 0 || row < 0 || col >= cols || row >= rows) continue;
        if (!styleSet) {
          const fade = (a: number) => a.toFixed(2);
          ctx.fillStyle = big
            ? `rgba(126,206,238,${fade(0.95)})`
            : `rgba(96,178,214,${fade(0.72)})`;
          styleSet = true;
        }
        // 快消失的气泡先暗下去。
        ctx.globalAlpha = clamp(b.life / 1.4, 0, 1);
        ctx.fillText(big ? "o" : "·", col * cw + cw / 2, row * ch + ch / 2 + 1);
      }
      if (styleSet) ctx.globalAlpha = 1;
    }
  }

  /**
   * 每个格子的点按自己的时钟闪烁，受缓慢的焦散光带调制，
   * 尾迹强的格子亮成青色。按 颜色/透明度 分桶，每桶一次 fillStyle。
   */
  private drawDots(t: number) {
    const { ctx, cols, rows, cw, ch, dotKind, dotPhase, dotFreq, energy, goldFlag, goldShadow, fishStamp, frameId } = this;
    const { bucketOf, bucketOrder, bucketCounts } = this;
    const n = cols * rows;
    const SKIP = bucketCounts.length - 1;
    bucketCounts.fill(0);

    for (let i = 0; i < n; i++) {
      const e = energy[i];
      const kind = dotKind[i];
      if (goldFlag[i] || fishStamp[i] === frameId || (kind === 0 && e < 0.45)) {
        bucketOf[i] = SKIP;
        continue;
      }
      let bucket: number;
      if (e > 0.45) {
        const level = clamp(Math.floor((e - 0.45) * 5), 0, ALPHA_LEVELS - 1);
        bucket = WAKE * ALPHA_LEVELS + level;
      } else {
        const col = i % cols;
        const row = (i / cols) | 0;
        // 点保持清澈；闪烁是一次轻轻的呼吸，不是淡出。
        const twinkle = 0.5 + 0.5 * Math.sin(t * dotFreq[i] + dotPhase[i]);
        const caustic = 0.85 + 0.15 * Math.sin(col * 0.11 + t * 0.35) * Math.sin(row * 0.17 - t * 0.27);
        let v = clamp((0.55 + 0.45 * twinkle) * caustic + e * 2, 0, 1);
        if (goldShadow[i]) v *= 0.2;
        bucket = (kind - 1) * ALPHA_LEVELS + clamp(Math.floor(v * ALPHA_LEVELS), 0, ALPHA_LEVELS - 1);
      }
      bucketOf[i] = bucket;
      bucketCounts[bucket]++;
    }

    // 计数排序，把格子按桶排好。
    const starts = new Int32Array(bucketCounts.length);
    for (let b = 1; b < bucketCounts.length; b++) starts[b] = starts[b - 1] + bucketCounts[b - 1];
    const cursor = starts.slice();
    for (let i = 0; i < n; i++) {
      const b = bucketOf[i];
      if (b !== SKIP) bucketOrder[cursor[b]++] = i;
    }

    const small = Math.max(2, Math.round(cw * 0.19));
    const large = small + 1;
    for (let b = 0; b < SKIP; b++) {
      const count = bucketCounts[b];
      if (!count) continue;
      ctx.fillStyle = this.dotStyles[b];
      const size = b >= WAKE * ALPHA_LEVELS ? large : small;
      const start = starts[b];
      for (let k = start; k < start + count; k++) {
        const i = bucketOrder[k];
        const col = i % cols;
        const row = (i / cols) | 0;
        // 尘埃微粒缓慢漂浮：沿一条很慢的 Lissajous 轨迹上下左右漂，
        // 相位各不相同，看着像水里的悬浮物，而不是钉死在格子里的点。
        let ox = 0;
        let oy = 0;
        if (b < WAKE * ALPHA_LEVELS && dotKind[i] !== 0) {
          const ph = dotPhase[i];
          const f = dotFreq[i];
          ox = Math.sin(t * f * 0.6 + ph) * cw * 0.4;
          oy = Math.sin(t * f * 0.47 + ph * 1.7) * ch * 0.55;
        }
        // 点落在格子的右下，和参考图一致；加上漂移就是悬浮微粒。
        ctx.fillRect(
          Math.round(col * cw + cw * 0.66 - size / 2 + ox),
          Math.round(row * ch + ch * 0.64 - size / 2 + oy),
          size,
          size,
        );
      }
    }
  }
}
