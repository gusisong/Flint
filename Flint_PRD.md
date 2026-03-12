# Flint 通用工具平台 PRD（V2.1 — Electron）

> **文档定位**：Flint 是一个基于 **Electron** 的高扩展性通用桌面工具平台。本文档定义平台基座能力及四页面 MVP（运输协议外发、Inbound 规划审查、供应商管理、系统设置）的统一需求基线。
>
> **重大变更**：V2.0 将技术栈从 Python + Flet 全面迁移至 Electron + Vue 3，以实现对 `ui/frontend_demo.html` 设计稿的 100% 视觉还原，并统一为 JavaScript 单语言栈。V2.1 在此基础上完成交互微调：右侧按钮缩放与配色重构、模块3单选行交互、模块1与模块3去除手动刷新按钮并转为自动刷新策略。

---

## 1. 系统架构与技术栈

| 层级 | 技术选型 | 说明 |
| --- | --- | --- |
| **运行时** | Electron | 桌面窗口容器，主进程 + 渲染进程 |
| **前端框架** | Vue 3 | 渲染进程，单文件组件 |
| **样式** | 原生 CSS | 复用 `ui/frontend_demo.html` 设计系统 |
| **构建工具** | Vite | Electron Forge + `@electron-forge/plugin-vite` |
| **本地存储** | SQLite3 | `better-sqlite3`（同步 API） |
| **并发控制** | `async/await` + `AbortController` | 替代 Python `threading` |
| **邮件** | Nodemailer | SMTP 发送 + 连接池 |
| **Excel 解析** | SheetJS (xlsx) | 统一处理 `.xlsx` + `.xls` |
| **加密** | Node.js `crypto` | AES-256-GCM，首次启动生成密钥 |
| **日志** | electron-log | 滚动策略（5MB × 3） |
| **测试** | Vitest | 与 Vite 集成 |
| **打包与分发** | electron-builder | Windows (NSIS) 优先，兼容跨平台 |
| **开发语言** | JavaScript (ES2022) | 可渐进迁移至 TypeScript |

### 1.1 架构概览

```text
┌──────────────────────────────────────────────┐
│  渲染进程 — Vue 3 + 原生 CSS + Vite          │
│  (前端页面、用户交互、数据展示)               │
└──────────────────┬───────────────────────────┘
                   │ IPC (contextBridge)
┌──────────────────┴───────────────────────────┐
│  主进程 — Node.js                             │
│  ┌──────────┐ ┌──────────┐ ┌───────────────┐ │
│  │ Database │ │ Security │ │ TaskManager   │ │
│  │(sqlite3) │ │ (crypto) │ │(AbortCtrl)    │ │
│  └──────────┘ └──────────┘ └───────────────┘ │
│  ┌──────────┐ ┌──────────┐ ┌───────────────┐ │
│  │Nodemailer│ │ SheetJS  │ │ electron-log  │ │
│  └──────────┘ └──────────┘ └───────────────┘ │
└──────────────────────────────────────────────┘
```

---

## 2. 核心平台基座需求

### 2.1 工作区机制

* 运行目录内创建 `data/`。
* 数据库存放 `data/platform_core.db`。
* 系统日志存放 `data/logs/system.log`。
* 加密密钥存放 `data/secret.key`（AES-256-GCM，首次启动自动生成）。

### 2.2 模块化插件系统

* 统一 `BaseModule` 接口：`getName()`、`getIcon()`、`registerIpcHandlers()`、`onShutdown()`。
* 主进程启动时加载模块注册表，通过 IPC 暴露各模块 API。
* 渲染进程通过 `contextBridge` 调用模块功能。

### 2.3 配置与安全中心

* 全局配置、模块配置统一入库，不使用明文配置文件。
* SMTP 密码等敏感信息使用 AES-256-GCM 加密存储。
* 首次启动时生成新密钥，无需迁移旧 Fernet 格式数据。

### 2.4 停机与日志

* 关闭窗口时触发全局 `AbortController.abort()`。
* 等待后台异步任务安全收尾后再退出。
* 系统日志使用 `electron-log` 滚动策略（5MB × 3）。
* 启动失败需写入 `data/logs/startup_error.log`，并在界面弹窗提示错误与日志路径。

---

## 3. 子模块A：运输协议外发

### 3.1 数据模型

1. `suppliers`：供应商与邮箱映射。
2. `email_tasks`：发送任务队列与状态。
3. `module_configs`：正则与模板等动态配置。

### 3.2 业务流

1. 用户通过固定拖拽区域上传文件（支持分批多次上传）并持久化到 `data/mail_uploads/`。
2. 列表中按“文件行为单位”勾选待发送项（支持多选与全选）。
3. 点击“开始发送”弹出标题补全对话框，标题规则：`aaa零件供货方式确认_xxxxx`（`aaa`可空，`xxxxx`为供应商5位编号）。
4. 用户确认后进入后台异步队列发送，逐条检查 `AbortSignal`。
5. 成功置 `SUCCESS`，失败置 `FAILED`。
6. 支持删除行项目，并同步删除持久化目录中的对应文件。
7. 支持“隐藏已发送”快速过滤（隐藏 `SUCCESS`，保留 `PENDING` / `FAILED`）。

### 3.3 限流策略

* 单连接顺序发送。
* `RATE_INITIAL_DELAY=1.0`，`RATE_MAX_DELAY=10.0`，`RATE_MIN_DELAY=0.1`。
* 421 窗口触发冷却 + 延时翻倍；连续成功后平滑降速。

### 3.4 列表交互能力（V2.1）

* 功能区中的所有列表模块均支持列宽手动拖拽调整；默认列宽自适应。
* 用户拖拽后的列宽需持久化到本地，下次打开应用自动恢复。
* 功能区中的所有列表模块均不提供表头排序，以保持页面视觉简洁。

---

## 4. 子模块B：Inbound 规划审查

### 4.1 模块定位

* 审查 `.xlsx` / `.xls`（使用 SheetJS 统一解析）。
* 输出可追踪日志并支持导出。
* 审查结果落库（任务表 + 明细表）。

### 4.2 功能范围

1. 文件选择（`dialog.showOpenDialog()` 系统原生对话框）与批量导入。
2. 规则执行（配置化存储于 `module_configs`）。
3. 同行多异常合并展示。
4. 一次性审查结果展示（点击“开始审查”后完成批处理并回填页面）。
5. 日志查看。
6. 日志导出（CSV）。

### 4.6 Inbound 结果表字段（V2.1）

* 字段顺序：文件、行号、工厂(C)、供应商号(D)、供应商名称(E)、零件号(A)、零件名称(B)、问题标签。
* “问题”字段采用多彩语义 Tag 展示，不再使用拼接长字符串。
* Tag 文案采用以下集合：`供应商编码不一致`、`Inbound方式错误`、`缺少必填字段`、`运输距离超限`、`VMI规则冲突`、`白名单外组合`。
* 同一行命中多个规则时展示全部 Tag。
* “级别”字段暂不展示，待后续定义等级标准后再引入。

### 4.3 规则执行约束

* 第一行为标题行，不审查。
* A/C/D/G/H/I/J/L/M 为空报缺失。
* D 与 J 前五位不一致报错。
* O >= 300 且 H 非 VMI 报错。
* O < 300 且 H 为 `TS 3PL-VMI` 报错。
* G 为 `JIS` 且 O > 20 报错。
* G/H/I 不在白名单报错。

### 4.4 解析引擎策略

* `.xlsx` 与 `.xls` 均使用 SheetJS (`xlsx` npm 包) 统一解析。

### 4.5 V1.0 固定白名单矩阵（G/H/I）

| G | H | I |
| --- | --- | --- |
| LAH | DR 3PL | ENG |
| JIS | DR Sup | DR Sup |
| JIT | DR Sup | DR Sup |
| LAH | DR Sup | DR Sup |
| JIT | MR 3PL | CFF-JIT |
| LAH | MR 3PL | CFF-LAH |
| LAH | TS 3PL-CC | CFF-LAH |
| LAH | TS Sup-CC | DR Sup |
| JIT | TS 3PL-VMI | AHKCC |
| JIT | TS 3PL-VMI | CSKCC |
| JIT | TS 3PL-VMI | ENGKCC |
| JIT | TS 3PL-VMI | FJKCC |
| JIT | TS 3PL-VMI | GDKCC |
| JIT | TS 3PL-VMI | GZKCC |
| JIT | TS 3PL-VMI | HBKCC |
| JIT | TS 3PL-VMI | JSKCC |
| JIT | TS 3PL-VMI | NCKCC |
| JIT | TS 3PL-VMI | NEKCC |
| JIT | TS 3PL-VMI | SHKCC |
| JIT | TS 3PL-VMI | ZJKCC |
| LAH | TS 3PL-VMI | AHKCC |
| LAH | TS 3PL-VMI | CSKCC |
| LAH | TS 3PL-VMI | ENGKCC |
| LAH | TS 3PL-VMI | FJKCC |
| LAH | TS 3PL-VMI | GDKCC |
| LAH | TS 3PL-VMI | GZKCC |
| LAH | TS 3PL-VMI | HBKCC |
| LAH | TS 3PL-VMI | JSKCC |
| LAH | TS 3PL-VMI | NCKCC |
| LAH | TS 3PL-VMI | NEKCC |
| LAH | TS 3PL-VMI | SHKCC |
| LAH | TS 3PL-VMI | ZJKCC |
| JIS | TS Sup-VMI | TS Sup-VMI |
| JIT | TS Sup-VMI | TS Sup-VMI |
| LAH | TS Sup-VMI | TS Sup-VMI |

---

## 5. 文档治理与版本规则

1. 所有已批准变更必须同步更新主 PRD（中英双语）。
2. 主 PRD 唯一基线为 `Flint_PRD.md`。
3. 技术栈切换为主版本升级：`V1.0`（Flet）→ `V2.0`（Electron）。
4. 小改升小版本（`V2.1`、`V2.2`）。
5. 开发过程中持续更新 PRD，确保文档与实现同步。

---

## 6. 前端信息架构（V2.1）

### 6.1 页面结构

1. Inbound 规划审查
2. 运输协议外发
3. 供应商管理
4. 系统设置

### 6.2 导航与图标

* 四页面均作为独立模块接入左侧导航。
* 侧栏图标采用 Google Material Symbols（`font-variation-settings` 控制线性风格），语义与页面功能一致。
* 项目图标使用 `assets/Flint_Icon.png`。
* 品牌字体使用 Space Grotesk，正文字体使用 Noto Sans SC。

### 6.3 操作区布局

* 高频主操作按钮靠左。
* 低频次操作按钮靠右。
* 按钮文案需控制在单行内显示，按钮等宽（`width: 132px`）。
* 右侧功能区按钮统一缩小 15%（宽度由 132px 调整为约 112px），降低视觉噪声并凸显左侧主流程按钮。
* 核心功能按钮采用高饱和强调色，非核心按钮采用低饱和中性色，确保主次对比清晰。
* 撤销“启动任务类按钮固定浅蓝色”约束，改为遵循页面整体视觉风格进行动态配色。

### 6.6 页面交互细化（V2.1）

* 模块1（Inbound）移除“刷新日志”手动按钮，不配置后台自动刷新；采用“开始审查”触发的一次性结果展示。
* 模块1移除“重置状态”按钮与对应后端重置逻辑。
* 模块2（运输协议外发）将“扫描工作区”改为“拖拽上传”模式，放弃项目文件夹管理方式。
* 模块2上传入口优化为固定拖拽区，拖拽上传替代点击上传按钮。
* 模块2支持文件行多选/全选、删除文件（同步删除持久化文件）、隐藏已发送（仅隐藏 `SUCCESS`）。
* 模块2删除按钮文案调整为“删除文件”，并采用警示色样式。
* 模块2移除“重试失败”按钮及对应后端逻辑。
* 模块2发送前弹框补全标题前缀，按 `aaa零件供货方式确认_xxxxx` 规则生成最终标题（`aaa`可空）。
* 模块3（供应商管理）新增单选行选择控件（radio），支撑“编辑供应商/切换启用”基于当前选中行执行。
* 模块3支持点击行内任意位置触发单选，不要求精确点击圆圈。
* 模块3移除“刷新列表”按钮，列表由本地状态变更与后端事件驱动自动同步。

### 6.4 数据展示策略

* 顶部 KPI 卡片在未接入真实指标前不展示，避免假数据误导。
* Inbound 日志采用表格视图，支持关键字过滤与异常定位。
* 模块1/2/3 列表统一支持：列宽拖拽与宽度持久化，不提供表头排序。

### 6.5 视觉设计基线

* 设计稿基线为 `ui/frontend_demo.html`，Electron 前端需 100% 还原。
* 设计系统采用 CSS 变量（`--bg`、`--ink`、`--brand`、`--line` 等），确保全局一致性。
* 导航激活态：线性渐变 (`#0c8f78` → `#0da387`) + `translateX(4px)` + `box-shadow` 辉光。
* 背景辉光：双 `radial-gradient` 叠加（绿 + 蓝）。
* 页面切换动画：`@keyframes reveal`（opacity + translateY）。
* 面板样式：`border-radius: 16px` + 微阴影 (`box-shadow: 0 8px 20px rgba(0,0,0,0.04)`)。
* 文件选择使用 Electron 原生 `dialog.showOpenDialog()`，支持多选与格式过滤。

### 6.7 Demo 模块化拆分基线（V2.1）

* UI Demo 采用分模块目录组织：`ui/demo_modular/index.html` + `pages/` + `styles/` + `scripts/`。
* `scripts/` 按 shared 与业务模块拆分（inbound/mail/supplier/table），避免单文件脚本膨胀。
* 后续正式开发（Electron + Vue）必须保持同等模块边界：页面层、公共组件层、业务状态层分离。
* `ui/frontend_demo.html` 保留为回退与视觉对照基线，不再继续承载新增交互逻辑。

---

## 7. MVP 实现基线（V2.1）

### 7.1 迁移范围

* 技术栈：Python + Flet → Electron + Vue 3 + JavaScript。
* 核心服务全面重写（逻辑等价）：Database、Config、Security、TaskManager、Workspace、Logging。
* 四个业务模块全面重写（逻辑等价）：邮件发送、Inbound 审查、供应商管理、系统设置。
* 前端基于 `frontend_demo.html` 改造为功能性 Vue 组件。
* 测试框架从 Python `pytest` 迁移至 `Vitest`。
* `schema.sql` 直接复用，零改动。

### 7.2 功能清单（与 V1.0 等价）

* 平台入口、导航、四页面模块注册与切换。
* Core 服务：Workspace / DB / 配置 / 安全 / 任务 / 日志。
* 运输协议外发页面：文件上传（可分批）、多选/全选、标题补全弹框发送、删除文件、隐藏已发送、上传文件持久化。
* Inbound 规划审查页面：审查、落库、导出、日志表格过滤、一次性结果展示、问题 Tag 化。
* 供应商管理页面：新增、编辑、单行选择、启停切换（基于选中行）、自动列表同步。
* 系统设置页面：SMTP、正则、签名加载与保存。

### 7.5 后端同步设计（V2.1）

* Inbound 模块新增单次完成事件：`inbound:review-completed`，用于一次性回填审查结果。
* Mail 模块新增上传持久化与队列接口：`mail:upload-files`、`mail:get-tasks`、`mail:delete-tasks`、`mail:start-send`。
* Mail 模块从“渲染进程本地状态”升级为“主进程 IPC 队列驱动”，发送进度通过 `mail:queue-progress` / `mail:queue-completed` 事件回推。
* Mail 模块新增发送前标题规则参数：`subjectPrefix`（允许空字符串），主进程按供应商编码生成最终标题。
* Mail 模块新增过滤参数：`hideSent=true` 时默认隐藏 `SUCCESS` 项。
* Inbound 模块补齐上传与结果链路：`inbound:upload-files`、`inbound:get-uploads`、`inbound:remove-upload`、`inbound:start-review`、`inbound:get-last-review`、`inbound:export-csv`。
* Supplier 模块新增选择态相关接口：`supplier:update-status(code, enabled)`、`supplier:get-list()`，前端基于单选行提交状态切换。
* Supplier 模块补齐维护接口：`supplier:create`、`supplier:update`，并通过 `supplier:list-updated` 实现列表自动同步。
* Settings 模块新增配置读写接口：`settings:get`、`settings:save`，主进程持久化保存 SMTP 与发件配置。
* 列表刷新策略调整为“写入后自动回读 + 事件广播”：主进程写库成功后主动推送 `supplier:list-updated`。
* 移除模块1/模块3对手动刷新按钮的依赖，避免无效重复请求（模块1保留“导出 CSV”按钮）。

### 7.3 自动化测试

* 使用 Vitest 建立等价测试集。
* Core 服务：配置、加解密、任务管理。
* 业务引擎：Inbound 规则判定、邮件限流器。
* 模块注册：四页面加载与默认配置初始化。

### 7.4 下一迭代

* 供应商导入能力与批量编辑能力。
* 系统设置更细粒度校验与安全策略提示。
* 更高覆盖率集成测试（UI 交互、SMTP 仿真、并发压力）。
* 自动更新集成（electron-updater）。

---

## 8. 已确认决策

### V1.0 决策（保留）

1. 关闭窗口必须等待后台任务安全结束。
2. 邮件扫描任务采用全状态去重。
3. Inbound Rule7 采用固定白名单（V1.0）。
4. 文档策略采用单主文档：`Flint_PRD.md`。
5. 前端本轮范围为四页面 MVP。
6. 低频操作按钮保持右侧直出，按钮等宽且文案单行。
7. KPI 延后至真实指标接入后再展示。
8. 系统设置页直接接入配置服务并支持保存。

### V2.0 新增决策（2026-03-11）

* 编号 9：技术栈从 Python + Flet 全面迁移至 Electron + Vue 3。
* 编号 10：开发语言切换为 JavaScript (ES2022)，后续可渐进迁移 TypeScript。
* 编号 11：前端视觉 100% 还原 `ui/frontend_demo.html`，采用原生 CSS。
* 编号 12：加密方案采用 AES-256-GCM（全新密钥，不迁移旧 Fernet 数据）。
* 编号 13：Excel 解析统一使用 SheetJS，替代 `openpyxl` + `xlrd`。
* 编号 14：邮件发送使用 Nodemailer，替代 Python `smtplib`。
* 编号 15：并发控制使用 `async/await` + `AbortController`，替代 Python `threading`。
* 编号 16：文件选择使用 Electron 原生 `dialog.showOpenDialog()`，不再需要路径输入对话框。
* 编号 17：打包使用 electron-builder，替代 PyInstaller。
* 编号 18：PRD 在开发过程中持续更新，确保文档与实现同步。
* 编号 20：按钮配色采用三级体系：Primary（品牌绿主操作）、Accent（蓝色强引导操作）、Ghost（浅灰次要操作）。
* 编号 21：移除系统设置中的 TLS 与 Dry Run 开关，精简不必要的配置项。
* 编号 22：支持深浅色（Dark/Light）主题自适应及手动切换。
* 编号 23：导航模块顺序调整：Inbound 规划审查作为默认首页，运输协议外发调整为第二模块。

### V2.1 新增决策（2026-03-12）

* 编号 24：右侧功能区按钮统一缩小 15%（132px → 112px），降低侧向视觉重量。
* 编号 25：按钮配色策略调整为“核心高饱和、非核心低饱和”，并废止“启动按钮固定浅蓝色”要求。
* 编号 26：供应商管理页新增单选行控件（radio），右侧动作按钮基于单选行执行。
* 编号 27：Inbound 页面移除“刷新日志”按钮，改为“开始审查”后一次性展示机制。
* 编号 28：供应商管理页移除“刷新列表”按钮，改为自动同步机制。
* 编号 29：Inbound 不配置后台自动刷新日志；点击“开始审查”后一次性展示结果。
* 编号 30：Inbound 结果表新增字段：工厂(C)、供应商号(D)、供应商名称(E)、零件号(A)、零件名称(B)。
* 编号 31：Inbound “问题”字段改为多彩语义 Tag，且同一行展示全部命中 Tag。
* 编号 32：Inbound 结果表移除“级别”字段，等待等级标准确定后再启用。
* 编号 33：功能区所有列表支持列宽拖拽，默认自适应，用户调整结果持久化本地。
* 编号 34：功能区所有列表不支持表头排序，避免排序箭头影响页面美观。
* 编号 35：模块2改为“拖拽上传”模式，支持分批多次上传并持久化至 `data/mail_uploads/`。
* 编号 36：模块2列表支持文件行多选/全选、删除行项目（同步删除持久化文件）、隐藏已发送（仅 `SUCCESS`）。
* 编号 37：模块2发送前弹框补全标题，`aaa`允许为空；最终标题格式为 `aaa零件供货方式确认_xxxxx`。
* 编号 38：模块3支持点击行任意位置触发单选，提升操作便利性。
* 编号 39：模块1移除“重置状态”按钮及对应后端逻辑。
* 编号 40：模块2删除按钮文案调整为“删除文件”，并采用警示色样式。
* 编号 41：模块2移除“重试失败”按钮及对应后端逻辑。
* 编号 42：所有上传入口改为固定拖拽区域，拖拽上传替代点击上传按钮。
* 编号 43：模块1拖拽上传区下方需显示已上传文件名清单（浅色小字体），并支持点击“小叉”移除文件。
* 编号 44：模块2“隐藏已发送 / 显示已发送”按钮需配套状态图标，强化当前过滤状态识别。
* 编号 45：左上角平台副标题由“物流运营工具平台”更新为“入厂物流规划运营工具平台”。
* 编号 46：Demo 从单文件拆分为模块化目录结构（pages/styles/scripts），并要求后续正式开发保持同架构边界。
* 编号 47：模块2“隐藏已发送 / 显示已发送”按钮图标实现定版为 Unicode：`🚫`（隐藏已发送）与 `👁`（显示已发送）。
* 编号 48：模块1上传文件清单在 Demo 中增加本地持久化队列（模拟后端同步），新增/删除文件需实时更新队列状态。
* 编号 49：正式开发已启动，工程骨架目录固定为 `electron_app/`。
* 编号 50：旧栈（Python + Flet）采用“逐步替换”策略，不一次性下线。（已被编号 60 覆盖）
* 编号 51：首批迁移模块优先选择模块1（Inbound 规划审查）。
* 编号 52：首批迁移阶段采用“渲染进程本地状态 + IPC 预留”数据链路。
* 编号 53：第二批迁移优先模块2（运输协议外发），先完成前端可交互闭环。
* 编号 54：模块2迁移阶段发送结果策略采用“随机成功/失败”，删除策略为“仅删除当前勾选项”。
* 编号 55：模块2已切换为主进程 IPC 数据链路（上传/查询/发送/删除 + 进度事件），上传文件持久化路径迁移到 Electron `userData/data/mail_uploads/`。
* 编号 56：模块1已切换为主进程 IPC 数据链路，上传队列与最近审查结果持久化到 Electron `userData/data/`。
* 编号 57：模块3已完成主进程持久化联通，支持新增/编辑/启停并通过事件驱动自动同步列表。
* 编号 58：模块4已完成配置中心读写链路，SMTP 与发件配置持久化到本地数据目录。
* 编号 59：Electron 工程新增 Vitest 自动化测试基线，`npm test` 为交付验收必跑项。
* 编号 60：旧栈（Python + Flet）已正式下线，仓库中所有 Python 运行时代码与依赖文件已清理，运行栈统一为 Electron + Vue。

---

## 9. Approved Delta (Bilingual, V2.1)

1. CN: 右侧功能区按钮统一缩小 15%，提升主流程按钮的视觉聚焦。
    EN: Right-side action buttons are reduced by 15% to improve visual focus on primary workflow actions.
2. CN: 按钮配色改为“核心高饱和 / 非核心低饱和”，不再强制使用浅蓝启动按钮。
    EN: Button colors now follow a "high-saturation for core actions / low-saturation for non-core actions" strategy, replacing the fixed light-blue start-button rule.
3. CN: 供应商管理引入单选行交互，编辑与启停操作必须绑定当前选中供应商。
    EN: Supplier Management introduces single-row selection; edit and enable/disable actions must be bound to the currently selected supplier.
4. CN: Inbound 页面改为自动日志刷新，移除手动刷新入口。
    EN: Inbound removes manual refresh entry points and uses a one-shot result display after each review run.
5. CN: 供应商列表改为自动同步，移除手动刷新按钮。
    EN: Supplier list synchronization is now automatic, and the manual refresh button is removed.
6. CN: 后端新增事件驱动同步：`inbound:review-completed` 与 `supplier:list-updated`。
    EN: Backend uses event-driven sync channels: `inbound:review-completed` and `supplier:list-updated`.
7. CN: Inbound 结果表新增 5 个业务字段（工厂、供应商号、供应商名称、零件号、零件名称），并移除“级别”字段。
    EN: Inbound result table adds five business fields (plant, supplier code, supplier name, part number, part name) and removes the "severity" column.
8. CN: Inbound 问题展示改为语义化多彩 Tag，标签文案为用户确认版本，且同一行展示全部标签。
    EN: Inbound issue display is converted to user-approved semantic colored tags, and all matched tags are shown for each row.
9. CN: 所有列表支持列宽拖拽与本地持久化，不提供表头排序。
    EN: All list modules support manual column resizing with local persistence, without header sorting.
10. CN: 模块2改为文件上传与行选择发送模式，支持多选/全选、删除行项目与隐藏已发送。
    EN: Module 2 is redesigned to file-upload and row-selection sending, including multi-select/select-all, row deletion, and hide-sent filtering.
11. CN: 模块2上传文件持久化目录固定为 `data/mail_uploads/`，删除行项目需同步删除对应文件。
    EN: Module 2 persists uploaded files under `data/mail_uploads/`, and row deletion must remove corresponding persisted files.
12. CN: 模块3支持点击行任意位置完成单选，不再要求精确点击单选圆圈。
    EN: Module 3 supports single-select by clicking anywhere on a row, removing the need to click the radio circle precisely.
13. CN: 模块1移除“重置状态”，模块2移除“重试失败”，减少冗余操作。
    EN: Module 1 removes "Reset Status" and Module 2 removes "Retry Failed" to reduce redundant actions.
14. CN: 所有上传入口统一改为拖拽上传区域，替代点击上传按钮。
    EN: All upload entry points are unified as drag-and-drop zones, replacing click-upload buttons.
15. CN: 模块1上传区下方新增已上传文件名清单（浅色小字体），最多展示10条，并支持点击“小叉”移除文件。
    EN: Module 1 adds an uploaded-file name list below the drop zone (light small text), shows up to 10 entries, and supports removing files via a small close icon.
16. CN: 模块2“隐藏已发送 / 显示已发送”按钮增加状态图标，便于快速识别当前过滤模式。
    EN: Module 2 adds state icons to the "Hide Sent / Show Sent" toggle to improve quick recognition of the current filter mode.
17. CN: 左上角平台副标题更新为“入厂物流规划运营工具平台”。
    EN: The top-left platform subtitle is updated to "Inbound Logistics Planning & Operations Toolkit Platform".
18. CN: Demo 由单文件拆分为模块化目录（pages/styles/scripts），正式开发需保持同等模块边界。
    EN: The demo is split from a single file into a modular directory (pages/styles/scripts), and formal development must preserve equivalent module boundaries.
19. CN: 模块2“隐藏已发送 / 显示已发送”状态图标定版为 Unicode（`🚫` / `👁`），以最小实现满足可识别性。
    EN: Module 2 finalizes the "Hide Sent / Show Sent" state icons as Unicode (`🚫` / `👁`) for minimal yet clear status recognition.
20. CN: 模块1上传清单在 Demo 中引入本地持久化队列以模拟后端同步，文件新增/删除需即时写回。
    EN: Module 1 introduces a locally persisted upload queue in the demo to simulate backend synchronization; file add/remove actions must be written back immediately.
21. CN: 正式开发阶段已启动，Electron + Vue 工程骨架目录固定为 `electron_app/`。
    EN: Formal development has started, and the Electron + Vue project skeleton is fixed under `electron_app/`.
22. CN: 旧栈（Python + Flet）按“逐步替换”策略迁移，避免一次性切换风险。（已被条目 32 覆盖）
    EN: The legacy stack (Python + Flet) was planned for gradual replacement to avoid one-shot cutover risks. (Superseded by item 32.)
23. CN: 首批业务迁移优先模块1（Inbound 规划审查），用于验证新架构落地链路。
    EN: The first business migration wave prioritizes Module 1 (Inbound Review) to validate the new architecture delivery path.
24. CN: 首批迁移阶段数据链路采用“渲染进程本地状态 + IPC 预留”，后续再切换真实主进程服务。
    EN: The first migration wave uses "renderer local state + IPC reservation" as the data path, then switches to real main-process services later.
25. CN: 第二批迁移优先模块2（运输协议外发），本轮先交付拖拽上传、多选发送、过滤与标题弹框的前端闭环。
    EN: The second migration wave prioritizes Module 2 (Mail Dispatch), delivering a frontend interactive loop for drag upload, multi-select sending, filtering, and subject-prefix modal.
26. CN: 模块2迁移阶段发送结果采用随机成功/失败模拟，删除策略固定为仅删除当前勾选行。
    EN: During Module 2 migration, send results are simulated with random success/failure, and deletion is limited to currently selected rows.
27. CN: 模块2已从渲染进程本地状态升级为主进程 IPC 队列驱动，新增 `mail:queue-progress` 与 `mail:queue-completed` 事件回推。
    EN: Module 2 has been upgraded from renderer-local state to a main-process IPC queue flow, with `mail:queue-progress` and `mail:queue-completed` event callbacks.
28. CN: 模块1已完成上传/移除/审查/导出全链路 IPC 落地，审查完成通过 `inbound:review-completed` 回推前端。
    EN: Module 1 now has end-to-end IPC for upload/remove/review/export, and review completion is pushed to the renderer via `inbound:review-completed`.
29. CN: 模块3已完成 `supplier:create` / `supplier:update` / `supplier:update-status`，列表通过 `supplier:list-updated` 自动刷新。
    EN: Module 3 now supports `supplier:create` / `supplier:update` / `supplier:update-status`, with list auto-refresh via `supplier:list-updated`.
30. CN: 模块4已完成 `settings:get` / `settings:save`，系统设置页可直接读写 SMTP 与发件配置。
    EN: Module 4 now supports `settings:get` / `settings:save`, enabling direct SMTP and sender-configuration read/write from the settings page.
31. CN: Electron 工程建立 Vitest 自动化测试基线并纳入 `npm test`，作为本轮交付验收门槛。
    EN: The Electron project now includes a Vitest baseline integrated into `npm test`, used as a release acceptance gate in this delivery.
32. CN: 旧栈（Python + Flet）已正式下线并完成仓库清理，后续仅维护 Electron + Vue 单栈代码。
    EN: The legacy Python + Flet stack has been formally retired and removed from the repository; future development is maintained on the Electron + Vue single stack only.
