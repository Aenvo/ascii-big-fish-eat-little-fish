/** Run with the existing esbuild command documented in README.md. */
import assert from "node:assert/strict";
import { World, visibleFoodRelation, bodiesTouch, type Gold } from "../src/world";
import { FISH_SCALE, speciesLengthPixels, sizeClass } from "../src/fish-scale";
import { GREAT_WHITE_BODY, GREAT_WHITE_BODY_AREA } from "../src/anatomy";
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
for (let i = 0; i < 30; i++) world.step(1 / 60);
assert.equal(turningPlayer.turnTo, -1, "The player must still be turning after half a second");
assert(turningPlayer.turnProgress! > 0.6 && turningPlayer.turnProgress! < 0.8);
assert(Math.abs(turningPlayer.nodes[0] - turnStartX) < 0.1, "No horizontal jump during yaw");
for (let i = 0; i < 18; i++) world.step(1 / 60);
assert.equal(turningPlayer.turnTo, undefined);
assert.equal(turningPlayer.direction, -1);

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
console.log("PASS: species scales, classification, shark proportions, body contact, movement, eating/growth, predation, restart and separate player/NPC yaw timings");
