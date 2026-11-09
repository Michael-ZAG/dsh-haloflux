# CHANGELOG

## v0.8.1 — 2026-11-09

**输入区黑边修复 + 环上仪表跟随运镜 + 构图滑杆即时生效**

### 1. 底部黑边（输入区渐变去漆）
- 会话进入运行态后，宿主的 `composerSeat`（`[data-phase=active]` 下 `position:sticky; bottom:0; z-index:7`，并带 36px 起不透明的 `--dsw-alias-bg-base` 渐变）会把窗口底部整条刷成底色；它压在 `.hfx-portal`（`z-index:1`）之上 —— 表现为「开始对话后底下多出一条黑边」，光环与右下 HUD 被切断。
- 修复：新增宿主适配规则 `[data-composer-seat],[data-conversation-region="composer"]{background:transparent!important;background-image:none!important}`。只移除涂抹，不动布局、层级与任何参数；输入框卡片自带 `--dsw-specific-input-major` 底色，观感不变。
- 用 `data-*` 钩子而非哈希类名（`an3WzG` / `mP3x-q` 随宿主编译变化），宿主升级后也不会失效。

### 2. 环上仪表跟随运镜
- `ctxArc`（上下文占用弧）、`phaseRing`（相位环，含调工具时的琥珀虚扫）、`stepTicks`（步骤刻度）、`tpsRibbon`（流速带）、`errPin`（失败钉）此前在**屏幕坐标系**绘制（函数开头 `setTransform(DPR…)` + `translate(cx,cy)`），运镜推近/平移时圆环放大而仪表钉死在视口。
- 现在它们与圆环共用同一相机矩阵：`drawGauges()` / `drawPhaseRing()` / `drawErrPins()` / `drawTpsRibbon()` 先 `camT(S, DPR)` 再 `translate(cx, cy)`；失败时的全屏红闪仍回到屏幕坐标（它需要铺满整帧）。
- 运镜关闭时 `camT()` 退化为 `setTransform(DPR,0,0,DPR,0,0)`，固定机位画面与旧版逐像素一致。

### 3. 构图滑杆即时生效
- `centerX` / `centerY` 标记 `geometry`，`scale` 标记 `resize`：拖动滑杆立刻重算构图或重建缓冲，不再需要「碰一下窗口尺寸」才生效。
- `tools/engine-smoke.cjs` 的 rebuild 参数断言同步：5 → 8（新增 `centerX` / `centerY` / `scale`）。

### 参数
- 仍为 **117 项**：无新增、无改名、无默认值变化、无表单结构变化；旧 `localStorage` 设置继续有效。

### 升级说明
- `client.js` 由 `build.mjs` 从 `src/*.js` 重新生成；`node --check client.js` 通过，`tools/client-smoke.cjs` 与 `tools/engine-smoke.cjs` 全部 PASS。
- 安装后需**完全退出宿主（含托盘进程）再启动**，浏览器才会拿到新 bundle。

## v0.8.0 — 2026-11-08

**HUD 图层下沉 + 7 面板 + 顶部安全线 + 自动淡出 + 引擎自愈**

### 1. HUD 沉到内容层之下（图层下沉）
- HUD 不再挂在 `shell.overlay`（`z-index: 20`），改为 portal 到 `.mP3x-q_frame` 内的 `.hfx-portal` 层（`z-index: 1`，`pointer-events: none`）。
- 结果：对话框、浮窗、输入框（`composerSeat`，`z-index: 7`）自然压在 HUD 之上，HUD 只做背景读数，不再抢焦点、不再遮挡滚动区域。
- portal 宿主寻找失败时自动回退到旧的 overlay 挂载，兼容其它版本宿主。

### 2. 顶部安全线 `hudTopPad`
- 新参数 `hudTopPad`（默认 44，0–120）。右栏顶端 = `--dsh-frame-chrome-top` + `hudTop` + `hudTopPad`，不再压在窗口按钮 / 会话工具栏上。
- 窗口标题栏高度变化（`--dsh-frame-chrome-top`）自动跟随。

### 3. 面板精简：8 → 7（右栏 5 + 底座 2）
- 删除机架顶部的 ADVECTION / PARTICLE SOLVER 面板（组件保留，`advOn` 默认 0，需要时置 1 可恢复）。
- 右栏 5 面板：FEED（事件流）/ AGENTS（12 宫格工具调度）/ WORKSPACE（方法工作台）/ ROUTES（抽取路由）/ INDEX（参考矩阵）。
- 右下底座 2 面板：VALIDATION（校验缓冲）/ SCENE（差分场）。
- 机架行数由 `--hfx-rack-rows` 驱动，随 `feedOn` / `advOn` 自动增减。

### 4. 无输入框页面 / 模态时自动淡出 `hudAutoHide`
- 新参数 `hudAutoHide`（默认 1）。400ms 轮询：当前页面没有任何输入控件（`textarea` / `contenteditable` / `input[type=text]`），或存在 `[aria-modal="true"]` / `[role="dialog"]` 模态时，机架与底座淡出（`opacity/visibility` 过渡 180ms），回到会话自动恢复。
- 顶部 KPI 统计条不受影响。

### 5. 顶部统计条常驻 `statsOn`
- 新参数 `statsOn`（默认 1）。顶部 KPI 读数（空闲 / 词元 / 词元·秒 / 上下文 / 步数 / 工具 / 运镜 / ⚙）不再和 `H` 共用开关：`H` 只切右侧机架 + 底座，统计条留在原地。

### 6. 引擎自愈（视觉修复）
- canvas 改为 portal 挂载后，`SinkHost` 首次渲染 `host` 为空、children 延迟挂载，导致旧的「一次性」引擎初始化（`if (!canvas) return`）永久 bail out ——表现为 HUD 正常但光环完全不画。
- 引擎初始化改为幂等 `boot()`：canvas / live 缺失时 60ms 重试；canvas 元素被 React 替换时 dispose 后重建；循环停了就 `start()`。另加 2s 看门狗兜底。
- 顶部 KPI 条新增诊断徽标（仅在出问题时显示）：`NOENG` / `SIZE0` / `PARKED` / `VOID` / `DIM 0` / `ASLEEP`。

### 参数
- 113 → **117 项**，新增 `hudTopPad` / `advOn` / `hudAutoHide` / `statsOn`（均在 `HUD` 组，`C` 控制台与设置页自动出现）。

### 升级说明
- 本版 `client.js` 由 `build.mjs` 从 `src/*.js` 重新生成，`node --check` 通过，`tools/` 下 4 个冒烟测试全部 PASS。
- 参数向后兼容：旧 localStorage 里没有的键自动回落默认值。
- 安装后需**完全退出宿主（含托盘进程）再启动**，浏览器才会拿到新 bundle。
