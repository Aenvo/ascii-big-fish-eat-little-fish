import { AsciiRenderer } from "./renderer";
import { World, SPINE_NODES } from "./world";
import { CATALOG, type CatalogEntry, type CatalogSize } from "./encyclopedia-data";

export type Language = "en" | "zh";
const copy = {
  en: { title: "Fish Guide", note: "Sizes and encounters are game conventions: freshwater and marine species do not share one natural habitat. Facts describe the named species or an example.", small: "Small", medium: "Medium", large: "Large", close: "Close", tabs: "Size categories", source: "Source" },
  zh: { title: "鱼类图鉴", note: "体型分类和相遇是游戏设定；淡水与海洋物种并不生活在同一自然水域。习性资料针对所列物种或代表种。", small: "小型", medium: "中型", large: "大型", close: "关闭", tabs: "体型分类", source: "资料来源" },
} as const;
const categories: CatalogSize[] = ["small", "medium", "large"];

/** Render the same ASCII fish or shoal glyph that is used by the game. */
function drawPreview(canvas: HTMLCanvasElement, entry: CatalogEntry) {
  const width = 320, height = 180;
  const source = entry.kind ? canvas : document.createElement("canvas");
  const renderer = new AsciiRenderer(source);
  renderer.setFontFamily('"Cascadia Mono", Consolas, Menlo, monospace');
  renderer.resize(width, height, 1);
  if (!entry.kind) {
    // Keep the tiny in-game glyph unobstructed by scenery in the specimen view.
    const previewRenderer = renderer as unknown as {
      scenery: { weeds: unknown[]; corals: unknown[] };
      dotKind: Uint8Array;
    };
    previewRenderer.scenery.weeds = [];
    previewRenderer.scenery.corals = [];
    previewRenderer.dotKind.fill(0);
  }
  const world = new World(entry.kind ? [{ kind: entry.kind, size: 1 }] : [], 0);
  world.resize(width, height, renderer.cellWidth, renderer.cellHeight);
  world.golds = entry.kind ? [world.golds[0]] : [];
  world.fish = [];
  world.bubbles = [];
  world.events = [];
  if (entry.kind) {
    const fish = world.golds[0];
    const length = 156;
    fish.length = length;
    fish.respawnAt = 0;
    fish.heading = 0;
    fish.direction = 1;
    fish.phase = 1.3;
    fish.thrust = 0.55;
    fish.depth = 0.95;
    for (let k = 0; k < SPINE_NODES; k++) {
      fish.nodes[k * 2] = 237 - k * length / (SPINE_NODES - 1);
      fish.nodes[k * 2 + 1] = 81;
    }
  } else if (entry.speciesIndex !== undefined) {
    world.fish.push({ x: width / 2, y: height / 2, vx: 25, vy: 0, species: entry.speciesIndex, alarm: 0, alive: true, respawnAt: 0, phase: 0, turn: 0, depth: 1, millDir: 1 });
  }
  renderer.render(world, 1 / 60);
  if (!entry.kind) {
    // Shoal creatures are intentionally tiny in the game; enlarge their actual
    // glyphs to make the specimen view readable without inventing an illustration.
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#05080d";
      ctx.fillRect(0, 0, width, height);
      ctx.imageSmoothingEnabled = false;
      // Crop only the occupied character cells, then enlarge them without
      // stretching the glyph or retaining the surrounding aquarium scenery.
      const cw = renderer.cellWidth, ch = renderer.cellHeight;
      const centerX = (Math.floor((width / 2) / cw) + 0.5) * cw;
      const centerY = (Math.floor((height / 2) / ch) + 0.5) * ch + 1;
      const cropWidth = cw * (entry.id === "shrimp" ? 5 : 2.5);
      const cropHeight = ch * 2;
      const scale = Math.min(width * 0.65 / cropWidth, height * 0.68 / cropHeight);
      const dw = cropWidth * scale, dh = cropHeight * scale;
      ctx.drawImage(source, centerX - cropWidth / 2, centerY - cropHeight / 2, cropWidth, cropHeight,
        (width - dw) / 2, (height - dh) / 2, dw, dh);
    }
  }
}

export function setupCatalog(initialLanguage: Language) {
  const dialog = document.getElementById("catalogDialog") as HTMLDialogElement;
  const openButton = document.getElementById("catalogBtn") as HTMLButtonElement;
  const closeButton = document.getElementById("catalogClose") as HTMLButtonElement;
  const tablist = dialog.querySelector('[role="tablist"]') as HTMLElement;
  const tabs = Array.from(dialog.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  const panel = document.getElementById("catalogPanel")!;
  const grid = document.getElementById("catalogGrid")!;
  let language = initialLanguage;
  let category: CatalogSize = "small";

  function updateCopy() {
    const t = copy[language];
    document.getElementById("catalogTitle")!.textContent = t.title;
    document.getElementById("catalogNote")!.textContent = t.note;
    closeButton.setAttribute("aria-label", t.close);
    tablist.setAttribute("aria-label", t.tabs);
    for (const tab of tabs) tab.textContent = t[tab.dataset.category as CatalogSize];
  }

  function render() {
    const entries = CATALOG.filter(entry => entry.size === category);
    panel.scrollTop = 0;
    grid.replaceChildren();
    for (const entry of entries) {
      const card = document.createElement("article");
      card.className = "catalog-card";
      const canvas = document.createElement("canvas");
      canvas.className = "catalog-preview";
      canvas.setAttribute("aria-hidden", "true");
      const description = document.createElement("div");
      description.className = "catalog-copy";
      const heading = document.createElement("h3");
      heading.textContent = entry.name[language];
      const habit = document.createElement("p");
      habit.textContent = entry.habit[language];
      const source = document.createElement("a");
      source.href = entry.source.url;
      source.target = "_blank";
      source.rel = "noopener noreferrer";
      source.textContent = `${copy[language].source}: ${entry.source.label}`;
      description.append(heading, habit, source);
      card.append(canvas, description);
      grid.append(card);
      // Only the selected tab's specimens are rendered, once each.
      drawPreview(canvas, entry);
    }
    for (const tab of tabs) {
      const active = tab.dataset.category === category;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    }
    panel.setAttribute("aria-labelledby", `tab-${category}`);
  }

  openButton.addEventListener("click", () => {
    updateCopy();
    render();
    dialog.showModal();
    tabs.find(tab => tab.dataset.category === category)?.focus();
  });
  closeButton.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => { grid.replaceChildren(); openButton.focus(); });
  for (const tab of tabs) {
    tab.addEventListener("click", () => { category = tab.dataset.category as CatalogSize; render(); });
    tab.addEventListener("keydown", event => {
      const current = categories.indexOf(category);
      let next: number;
      if (event.key === "ArrowRight") next = (current + 1) % categories.length;
      else if (event.key === "ArrowLeft") next = (current + categories.length - 1) % categories.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = categories.length - 1;
      else return;
      event.preventDefault();
      category = categories[next];
      render();
      tabs[next].focus();
    });
  }
  updateCopy();
  return {
    setLanguage(next: Language) { language = next; updateCopy(); if (dialog.open) render(); },
  };
}
