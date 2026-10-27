/** Run with the existing esbuild command documented in README.md. */
import assert from "node:assert/strict";
import { World, visibleFoodRelation, bodiesTouch, type Gold } from "../src/world";
import { FISH_SCALE, speciesLengthPixels, sizeClass } from "../src/fish-scale";
import { carpBody, sharkBody, octopusBody, GREAT_WHITE_BODY, GREAT_WHITE_BODY_AREA } from "../src/anatomy";
import { CATALOG } from "../src/encyclopedia-data";

for (const [width, height] of [[1280, 800], [760, 820], [390, 844]]) {
  const gold = speciesLengthPixels("pearl", width, height);
  const shark = speciesLengthPixels("shark", width, height);
  assert(shark / gold > 9 && shark / gold < 10, "Keep the researched interspecies size contrast");
  assert(shark <= width * 0.68 + 0.001, "A shark must fit even a narrow viewport");
  assert(shark > speciesLengthPixels("barracuda", width, height) * 2);
  assert(speciesLengthPixels("koi", width, height) > gold * 2.9);
}
assert.equal(sizeClass(FISH_SCALE.koi.lengthCm), "medium");
assert.equal(sizeClass(FISH_SCALE.barracuda.lengthCm), "large");
assert.equal(sizeClass(FISH_SCALE.shark.lengthCm), "giant");
assert(CATALOG.every(entry => !entry.kind || entry.size === sizeClass(FISH_SCALE[entry.kind].lengthCm)));
assert(GREAT_WHITE_BODY_AREA > 0.1 && GREAT_WHITE_BODY_AREA < 0.12);
assert(GREAT_WHITE_BODY.back(0.84) > 0 && GREAT_WHITE_BODY.belly(0.84) > 0, "Tail must join a nonzero peduncle");
assert(GREAT_WHITE_BODY.back(0.65) < GREAT_WHITE_BODY.back(0.35), "Long rear taper");
assert(GREAT_WHITE_BODY.belly(0.065) < GREAT_WHITE_BODY.back(0.065), "Snout projects above the jaw");

// Renderer culling bounds must contain both surfaces, including thick species.
for (const body of [GREAT_WHITE_BODY, octopusBody(),
  carpBody({ peak: 0.27, end: 0.72, wrist: 0.28, blunt: 0.7, back: 1.08, belly: 1.05 }),
  sharkBody({ peak: 0.105, end: 0.8, wrist: 0.35, blunt: 0.9 })]) {
  for (let i = 0; i <= 4096; i++) {
    assert(body.back(i / 4096) <= body.maxRadius && body.belly(i / 4096) <= body.maxRadius,
      "A culling bound must never trim the body profile");
  }
}

const world = new World();
world.resize(1280, 800, 12, 18);
world.startGame();
const player = world.player!;
const sampleFish = { ...world.fish[0] };
const shark = world.golds.find(g => g.kind === "shark")!;
const koi = world.golds.find(g => g.kind === "koi")!;
assert.equal(visibleFoodRelation(player, shark), "danger");
assert.equal(visibleFoodRelation(player, koi), "neutral", "Koi must not hunt the player");
const grown = { ...player, size: 45, length: player.length * Math.pow(45 / 12, 0.72) } as Gold;
assert.equal(visibleFoodRelation(grown, shark), "danger", "A low nominal shark growth counter must not disable its real size advantage");
shark.heading = 0;
shark.nodes[0] = 500;
shark.nodes[1] = 400;
player.heading = 0;
player.nodes[0] = 600;
player.nodes[1] = 400;
assert.equal(bodiesTouch(player, shark), false, "Empty water in front of a large shark is not a collision");
player.nodes[0] = 500;
assert.equal(bodiesTouch(player, shark), true);

world.golds = [player];
world.fish = [];
world.pointer = { x: 1000, y: 220, active: true };
const distance = Math.hypot(1000 - player.nodes[0], 220 - player.nodes[1]);
for (let i = 0; i < 180; i++) world.step(1 / 60);
assert(Math.hypot(1000 - player.nodes[0], 220 - player.nodes[1]) < distance / 2);
world.pointer.active = false;
const beforeSize = player.size;
world.fish = [{ ...sampleFish, x: player.nodes[0], y: player.nodes[1], vx: 0, vy: 0, alive: true, respawnAt: 0 }];
for (let i = 0; i < 20; i++) world.step(1 / 60);
assert(world.score > 0 && player.size > beforeSize && world.eatenCount === 1);
world.fish = [];
shark.respawnAt = 0;
shark.nodes[0] = player.nodes[0];
shark.nodes[1] = player.nodes[1];
world.golds = [player, shark];
world.step(1 / 60);
assert.equal(world.gameOver, true);
world.startGame();
assert.equal(world.gameOver, false);
assert.equal(world.score, 0);
assert.equal(world.eatenCount, 0);

// Player yaw is deliberately slower, without changing NPC turn timing.
const turningPlayer = world.player!;
world.golds = [turningPlayer];
world.fish = [];
const turnStartX = turningPlayer.nodes[0];
world.pointer = { x: turnStartX - 300, y: turningPlayer.nodes[1], active: true };
for (let i = 0; i < 24; i++) world.step(1 / 60);
assert.equal(turningPlayer.turnTo, -1, "The player must still be turning after 0.4 seconds");
assert(turningPlayer.turnProgress! > 0.75 && turningPlayer.turnProgress! < 0.85);
assert(Math.abs(turningPlayer.nodes[0] - turnStartX) < 0.1, "No horizontal jump during yaw");
for (let i = 0; i < 8; i++) world.step(1 / 60);
assert.equal(turningPlayer.turnTo, undefined);
assert.equal(turningPlayer.direction, -1);

world.pointer.active = false;
const idleX = turningPlayer.nodes[0], idleY = turningPlayer.nodes[1];
const idlePhase = turningPlayer.phase;
for (let i = 0; i < 240; i++) world.step(1 / 60);
assert(turningPlayer.idle! > 0.99);
assert(turningPlayer.beat >= 0.4 && turningPlayer.beat <= 0.56, "Idle rhythm must stay slow");
assert(turningPlayer.phase > idlePhase + Math.PI * 2, "Idle animation must keep advancing");
assert.equal(turningPlayer.nodes[0], idleX, "Idle breathing must not drift horizontally");
assert.equal(turningPlayer.nodes[1], idleY, "Idle breathing must not drift vertically");
world.pointer = { x: idleX + 300, y: idleY, active: true };
for (let i = 0; i < 24; i++) world.step(1 / 60);
assert(turningPlayer.idle! < 0.25, "Idle breathing must fade out when swimming resumes");

const npcWorld = new World([{ kind: "barracuda", size: 1 }], 0);
npcWorld.resize(1280, 800, 12, 18);
const turningNpc = npcWorld.golds[0];
turningNpc.direction = 1;
turningNpc.heading = 0;
turningNpc.turnTo = -1;
turningNpc.turnProgress = 0;
for (let i = 0; i < 30; i++) npcWorld.step(1 / 60);
assert.equal(turningNpc.turnTo, undefined, "NPCs retain their shorter turn duration");
assert.equal(turningNpc.direction, -1);

// First appearance and repeat passes use separate pacing, including restarts.
const sharkWorld = new World();
sharkWorld.resize(1280, 800, 12, 18);
sharkWorld.startGame();
const delayedShark = sharkWorld.golds.find(g => g.kind === "shark")!;
const safePlayer = sharkWorld.player!;
sharkWorld.golds = [safePlayer, delayedShark];
sharkWorld.fish = [];
const firstPass = delayedShark.respawnAt;
assert(firstPass - sharkWorld.time >= 18 && firstPass - sharkWorld.time <= 24);
for (let i = 0; i < 17 * 60; i++) sharkWorld.step(1 / 60);
assert(delayedShark.respawnAt > sharkWorld.time, "No shark during the opening feeding period");
while (sharkWorld.time < firstPass + 1 / 60) sharkWorld.step(1 / 60);
assert.equal(delayedShark.respawnAt, 0, "The delayed shark must eventually enter");
delayedShark.direction = 1;
delayedShark.heading = 0;
for (let i = 0; i < delayedShark.nodes.length; i += 2) {
  delayedShark.nodes[i] = 3000 - i;
  delayedShark.nodes[i + 1] = 400;
}
sharkWorld.step(1 / 60);
const nextPass = delayedShark.respawnAt;
assert(nextPass - sharkWorld.time >= 24 && nextPass - sharkWorld.time <= 36);
for (let i = 0; i < 23 * 60; i++) sharkWorld.step(1 / 60);
assert.equal(delayedShark.respawnAt, nextPass, "A departing shark must not immediately reappear");
while (sharkWorld.time < nextPass + 1 / 60) sharkWorld.step(1 / 60);
assert.equal(delayedShark.respawnAt, 0);
sharkWorld.startGame();
const restartedShark = sharkWorld.golds.find(g => g.kind === "shark")!;
assert(restartedShark.respawnAt - sharkWorld.time >= 18, "Restart restores the opening delay");

// Predators usually pass by; a declined reversal must not reroll next frame.
function pursuingWorld() {
  const w = new World();
  w.resize(1280, 800, 12, 18);
  w.startGame();
  const hunter = w.golds.find(g => g.kind === "barracuda")!;
  const player = w.player!;
  w.golds = [player, hunter];
  w.fish = [];
  Object.assign(hunter, { length: 200, direction: 1, heading: 0, respawnAt: 0, turnTo: undefined, strokeUntil: Infinity, nextBubble: Infinity });
  for (let i = 0; i < hunter.nodes.length; i += 2) {
    hunter.nodes[i] = 700 - i * 4;
    hunter.nodes[i + 1] = 280;
  }
  player.nodes[0] = 780;
  player.nodes[1] = 470;
  w.step(1 / 60);
  assert(w.isChasing(hunter), "Acquire the player ahead before testing a reversal");
  player.nodes[0] = 600;
  return { w, hunter };
}
const skippedTurn = pursuingWorld();
const acceptedTurn = pursuingWorld();
const savedRandom = Math.random;
try {
  Math.random = () => 0.8;
  skippedTurn.w.step(1 / 60);
  assert.equal(skippedTurn.hunter.turnTo, undefined, "Most pursuit reversal decisions are declined");
  Math.random = () => 0;
  for (let i = 0; i < 30; i++) skippedTurn.w.step(1 / 60);
  assert.equal(skippedTurn.hunter.turnTo, undefined, "No per-frame reroll after a declined turn");
  assert.equal(skippedTurn.hunter.direction, 1);
  acceptedTurn.w.step(1 / 60);
  assert.equal(acceptedTurn.hunter.turnTo, -1, "Occasional pursuit reversals remain possible");
  for (let i = 0; i < 30; i++) acceptedTurn.w.step(1 / 60);
  assert.equal(acceptedTurn.hunter.direction, -1, "An accepted reversal completes normally");
} finally { Math.random = savedRandom; }
console.log("PASS: scales, anatomy, movement, eating, restart, turn timings, shark pacing and rare pursuit reversals");
