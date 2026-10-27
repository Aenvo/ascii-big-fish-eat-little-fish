# ASCII Big Fish Eat Little Fish

[中文](#中文) | [English](#english)

## 中文

ASCII 大鱼吃小鱼：使用 TypeScript 和 Canvas 绘制字符鱼群的网页小游戏。移动鼠标控制玩家鱼，吃掉较小的生物成长，避开捕食者。

[在线游玩](https://aenvo.github.io/ascii-big-fish-eat-little-fish/)

### 本地运行

需要 Node.js 和 npm；可使用与项目 CI 一致的 Node.js 22。

```sh
npm ci
npm run dev
```

打开终端显示的本地地址，点击开始游戏。页面支持中英文切换，鱼类图鉴可查看不同体型生物的介绍与资料来源。

### 构建与检查

```sh
npm run typecheck
npm run build
npm run preview
```

构建结果位于 `dist/`，可部署到静态站点服务。`preview` 用于本地预览构建结果。

推送 `main` 后，[Pages 工作流](.github/workflows/pages.yml)会自动执行类型检查、游戏模拟检查、构建并部署到 GitHub Pages。

游戏模拟检查覆盖物种尺寸与分类、鱼体边界、鲨鱼轮廓与出场间隔、接触判定、玩家移动、吃鱼成长、被捕食、重新开始和转身行为：

```sh
npx --no-install esbuild tools/check-game.ts --bundle --format=esm --platform=node --outfile=tools/check-game.mjs
node tools/check-game.mjs
```

### 代码结构

- `index.html`、`demo.ts`：游戏页面、开始与结算流程、语言切换。
- `src/world.ts`：鱼群模拟、玩家移动、捕食、成长与计分。
- `src/renderer.ts`、`src/anatomy.ts`、`src/scenery.ts`：字符渲染、鱼体轮廓与环境。
- `src/catalog.ts`、`src/encyclopedia-data.ts`：鱼类图鉴与资料链接。
- `src/engine.ts`：Canvas、输入事件与模拟循环。

### 外部资源与游戏设定

页面通过 Google Fonts 加载 Geist Mono 字体；字体不可用时使用系统等宽字体。图鉴的资料链接指向相应外部网站。鱼体尺寸采用资料中的参考值，游戏内显示进行了缩放；不同栖息环境的物种相遇和捕食关系属于游戏设定。

### 来源与许可

本项目基于 [ascii-sharks](https://github.com/stackedlol/ascii-sharks) 改造，保留了部分实现，包括 `src/math.ts`，并重做和扩展了鱼体、渲染与游戏逻辑。原项目版权署名为 drewdi，保留于 [MIT 许可证](./LICENSE)。

开发参考还包括 [animal-proc-anim](https://github.com/argonautcode/animal-proc-anim) 的程序化动画思路、[The Nature of Code](https://natureofcode.com/) 的自主智能体模型，以及 [FishyGames](https://github.com/bluelyw/FishyGames) 的玩法设计。

## English

A browser game with ASCII fish rendered using TypeScript and Canvas. Move the mouse to control your fish, eat smaller creatures to grow, and avoid predators.

[Play online](https://aenvo.github.io/ascii-big-fish-eat-little-fish/)

### Run locally

Node.js and npm are required. Node.js 22 matches the version used in this project's CI.

```sh
npm ci
npm run dev
```

Open the local address shown in the terminal and select **Start Game**. The interface supports English and Chinese. The Fish Guide includes size categories, species descriptions, and source links.

### Build and check

```sh
npm run typecheck
npm run build
npm run preview
```

The build output is written to `dist/` for static hosting. `preview` serves the production build locally.

Pushing to `main` triggers the [Pages workflow](.github/workflows/pages.yml), which runs type checking, game simulation checks, and the build before deploying to GitHub Pages.

The simulation checks cover species sizes and categories, body bounds, shark proportions and appearance intervals, contact detection, player movement, eating and growth, predation, restarting, and turning behavior:

```sh
npx --no-install esbuild tools/check-game.ts --bundle --format=esm --platform=node --outfile=tools/check-game.mjs
node tools/check-game.mjs
```

### Code structure

- `index.html`, `demo.ts`: game page, start and results screens, and language switching.
- `src/world.ts`: fish simulation, player movement, predation, growth, and scoring.
- `src/renderer.ts`, `src/anatomy.ts`, `src/scenery.ts`: ASCII rendering, body shapes, and the underwater environment.
- `src/catalog.ts`, `src/encyclopedia-data.ts`: Fish Guide and reference links.
- `src/engine.ts`: Canvas, input events, and the simulation loop.

### External resources and game setting

The page loads Geist Mono through Google Fonts and falls back to system monospace fonts when unavailable. Fish Guide reference links lead to external websites. Fish sizes use published reference values with scaling for the game display. Encounters and predation between species from different habitats are part of the game setting.

### Credits and license

This project is adapted from [ascii-sharks](https://github.com/stackedlol/ascii-sharks). It retains parts of the original implementation, including `src/math.ts`, while reworking and extending fish anatomy, rendering, and gameplay. The original copyright attribution to drewdi is preserved in the [MIT license](./LICENSE).

Other development references include procedural animation ideas from [animal-proc-anim](https://github.com/argonautcode/animal-proc-anim), autonomous-agent models from [The Nature of Code](https://natureofcode.com/), and gameplay design from [FishyGames](https://github.com/bluelyw/FishyGames).
