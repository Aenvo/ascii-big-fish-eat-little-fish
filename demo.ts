import { AquariumEngine, type GoldKind } from "./src";
import { setupCatalog, type Language } from "./src/catalog";

// ?fish=ryukin,oranda,moor,koi,shark — 第一条最大，后面的依次小一点。
const KINDS: GoldKind[] = ["ryukin", "oranda", "moor", "fantail", "pearl", "calico", "clown", "koi", "shark", "angelfish", "barracuda", "butterfly", "puffer", "tang", "lionfish"];
const raw = new URLSearchParams(location.search).get("fish");
const kinds = raw
  ?.split(",")
  .map((s) => s.trim())
  .filter((s): s is GoldKind => (KINDS as string[]).includes(s));
const golds = kinds?.length
  ? kinds.map((kind, i) => ({ kind, size: Math.max(0.5, 1 - i * 0.09) }))
  : undefined;

const engine = new AquariumEngine(document.querySelector<HTMLCanvasElement>("canvas.aquarium")!, golds);
const world = engine.world;

const startScreen = document.getElementById("startScreen")!;
const gameOverScreen = document.getElementById("gameOverScreen")!;
const startBtn = document.getElementById("startBtn")!;
const restartBtn = document.getElementById("restartBtn")!;
const finalScoreEl = document.getElementById("finalScore")!;
const eatenCountEl = document.getElementById("eatenCount")!;
const survivalTimeEl = document.getElementById("survivalTime")!;
const finalSizeEl = document.getElementById("finalSize")!;
const languageSelect = document.getElementById("languageSelect")! as HTMLSelectElement;
const catalog = setupCatalog("en");

const translations = {
  en: {
    startTitle: "ASCII Big Fish Eat Little Fish",
    catalogBtn: "Fish Guide",
    startBtn: "Start Game",
    gameOverTitle: "You were eaten",
    scoreLabel: "Score",
    eatenLabel: "Creatures eaten",
    survivalLabel: "Survival time",
    sizeLabel: "Final size",
    restartBtn: "Play Again",
  },
  zh: {
    startTitle: "ASCII 大鱼吃小鱼",
    catalogBtn: "鱼类图鉴",
    startBtn: "开始游戏",
    gameOverTitle: "你被吃掉了",
    scoreLabel: "本局得分",
    eatenLabel: "吃掉生物",
    survivalLabel: "存活时间",
    sizeLabel: "最终体型",
    restartBtn: "再玩一次",
  },
} as const;
function setLanguage(next: Language) {
  for (const [id, value] of Object.entries(translations[next])) {
    document.getElementById(id)!.textContent = value;
  }
  document.documentElement.lang = next === "en" ? "en" : "zh-CN";
  document.title = translations[next].startTitle;
  languageSelect.setAttribute("aria-label", next === "en" ? "Language" : "语言");
  catalog.setLanguage(next);
}
languageSelect.addEventListener("change", () => setLanguage(languageSelect.value === "zh" ? "zh" : "en"));

let running = false;

function beginGame() {
  world.startGame();
  engine.clearTransientEffects();
  running = true;
  startScreen.classList.add("hidden");
  gameOverScreen.classList.add("hidden");
}
startBtn.addEventListener("click", beginGame);
restartBtn.addEventListener("click", beginGame);

// 游戏结束时只取一次本局数据，世界继续运行也不会改变结算。
function tick() {
  if (!running) { requestAnimationFrame(tick); return; }
  if (world.gameOver) {
    running = false;
    finalScoreEl.textContent = String(world.score);
    eatenCountEl.textContent = String(world.eatenCount);
    const seconds = Math.floor(Math.max(0, world.time - world.gameStartedAt));
    survivalTimeEl.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    finalSizeEl.textContent = String(Math.round(world.player?.size ?? 0));
    gameOverScreen.classList.remove("hidden");
    restartBtn.focus();
  }
  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);
