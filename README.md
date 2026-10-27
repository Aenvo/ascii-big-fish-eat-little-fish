# ASCII Big Fish Eat Little Fish

ASCII 大鱼吃小鱼：使用 TypeScript 和 Canvas 绘制字符鱼群的网页小游戏。移动鼠标控制玩家鱼，吃掉较小的生物成长，避开捕食者。

## 本地运行

需要 Node.js 和 npm；开发服务器与构建工具的 Node.js 版本要求见依赖包声明。

```sh
npm ci
npm run dev
```

打开终端显示的本地地址，点击开始游戏。页面支持中英文切换，鱼类图鉴可查看不同体型生物的介绍与资料来源。

## 构建与检查

```sh
npm run typecheck
npm run build
npm run preview
```

构建结果位于 `dist/`，可部署到静态站点服务。`preview` 用于本地预览构建结果。

保留的游戏模拟诊断脚本会输出追踪、成长及被捕食状态，供开发时检查；它不是完整的自动化断言测试：

```sh
npx --no-install esbuild tools/check-game.ts --bundle --format=esm --platform=node --outfile=tools/check-game.mjs
node tools/check-game.mjs
```

## 代码结构

- `index.html`、`demo.ts`：游戏页面、开始与结算流程、语言切换。
- `src/world.ts`：鱼群模拟、玩家移动、捕食、成长与计分。
- `src/renderer.ts`、`src/anatomy.ts`、`src/scenery.ts`：字符渲染、鱼体轮廓与环境。
- `src/catalog.ts`、`src/encyclopedia-data.ts`：鱼类图鉴与资料链接。
- `src/engine.ts`：Canvas、输入事件与模拟循环。

页面通过 Google Fonts 加载 Geist Mono 字体。图鉴的资料链接指向相应外部网站；游戏体型分类和相遇关系属于游戏设定。

## 来源与许可

本项目基于 [ascii-sharks](https://github.com/stackedlol/ascii-sharks) 改造，保留了部分实现，包括 `src/math.ts`，并重做和扩展了鱼体、渲染与游戏逻辑。原项目版权署名为 drewdi，保留于 [MIT 许可证](./LICENSE)。

开发参考还包括 [animal-proc-anim](https://github.com/argonautcode/animal-proc-anim) 的程序化动画思路、[The Nature of Code](https://natureofcode.com/) 的自主智能体模型，以及 [FishyGames](https://github.com/bluelyw/FishyGames) 的玩法设计。
