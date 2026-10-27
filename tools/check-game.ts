/**
 * 游戏模式检验：验证"大鱼吃小鱼"的核心机制。
 *  1. 玩家鱼追鼠标（转向，不再是横穿不转弯）；
 *  2. 吃小鱼/小金鱼 → 成长 + 加分；
 *  3. 碰到鲨鱼/锦鲤 → 游戏结束；
 *  4. 难度（鲨鱼出现、体型分级）。
 *
 *   npx esbuild tools/check-game.ts --bundle --format=esm --platform=node \
 *     --outfile=tools/check-game.mjs && node tools/check-game.mjs
 */
import { World } from "../src/world";

const W = 1280;
const H = 800;
const STEP = 1 / 60;

const world = new World();
world.resize(W, H, 12, 18);
world.startGame();

const run = (seconds: number) => {
  const n = Math.round(seconds / STEP);
  for (let i = 0; i < n; i++) world.step(STEP);
};

// 鱼种与体型分布
console.log("阵容:");
for (const g of world.golds) {
  console.log(
    `  #${g.id} ${g.kind.padEnd(8)} size=${g.size.toFixed(0).padStart(3)} ` +
    `len=${g.length.toFixed(0).padStart(3)} player=${g.isPlayer ? "✓" : " "}`,
  );
}

const player = world.player!;
console.log(`\n玩家初始 size=${player.size} 位置=(${player.nodes[0].toFixed(0)},${player.nodes[1].toFixed(0)})`);

// 1. 追鼠标：把鼠标放右上角，玩家应向它靠近
world.pointer.active = true;
world.pointer.x = W * 0.8;
world.pointer.y = H * 0.2;
run(3);
const d1 = Math.hypot(world.pointer.x - player.nodes[0], world.pointer.y - player.nodes[1]);
console.log(`\n[追鼠标] 3秒后离光标 ${d1.toFixed(0)}px（应显著缩小）`);

// 2. 吃鱼成长：把鼠标对准一堆小鱼，观察 score/size 增长
const before = world.score;
run(10);
console.log(`[吃鱼] 10秒后 score=${world.score}（+${world.score - before}） size=${player.size.toFixed(1)} gameOver=${world.gameOver}`);

// 3. 游戏结束：手动把玩家贴到鲨鱼身上，应触发 gameOver
const shark = world.golds.find((g) => g.kind === "shark")!;
shark.nodes[0] = player.nodes[0];
shark.nodes[1] = player.nodes[1];
shark.respawnAt = 0;
run(1);
console.log(`[被吃] 贴脸鲨鱼后 gameOver=${world.gameOver}（应为 true）`);
console.log(`       最终分数 ${world.score} 等级 ${world.level}`);

// 4. 难度：等级随分数递增
console.log(`\n[难度] score=${world.score} → level=${Math.floor(world.score / 500) + 1}`);
