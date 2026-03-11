# Flint 通用工具平台 PRD（V2.0 — Electron）

> **文档定位**：Flint 是一个基于 **Electron** 的高扩展性通用桌面工具平台。本文档定义平台基座能力及四页面 MVP（运输协议外发、Inbound 规划审查、供应商管理、系统设置）的统一需求基线。
>
> **重大变更**：V2.0 将技术栈从 Python + Flet 全面迁移至 Electron + Vue 3，以实现对 `ui/frontend_demo.html` 设计稿的 100% 视觉还原，并统一为 JavaScript 单语言栈。

---

## 1. 系统架构与技术栈

| 层级 | 技术选型 | 说明 |
|------|---------|------|
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

```
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

1. 扫描工作区并生成 `PENDING` 任务。
2. 后台异步批量发送，逐条检查 `AbortSignal`。
3. 成功置 `SUCCESS`，失败重试，超过阈值置 `FAILED`。

### 3.3 限流策略

* 单连接顺序发送。
* `RATE_INITIAL_DELAY=1.0`，`RATE_MAX_DELAY=10.0`，`RATE_MIN_DELAY=0.1`。
* 421 窗口触发冷却 + 延时翻倍；连续成功后平滑降速。

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
4. 日志查看 / 导出。
5. 状态重置。

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

1. 所有已批准变更必须同步更新主 PRD。
2. 主 PRD 唯一基线为 `Flint_PRD.md`。
3. 技术栈切换为主版本升级：`V1.0`（Flet）→ `V2.0`（Electron）。
4. 小改升小版本（`V2.1`、`V2.2`）。
5. 开发过程中持续更新 PRD，确保文档与实现同步。

---

## 6. 前端信息架构（V2.0）

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
* 启动任务类按钮（`开始发送`、`开始审查`）采用浅蓝色 (`#b9dcff`)。

### 6.4 数据展示策略

* 顶部 KPI 卡片在未接入真实指标前不展示，避免假数据误导。
* Inbound 日志采用表格视图，支持关键字过滤与异常定位。

### 6.5 视觉设计基线

* 设计稿基线为 `ui/frontend_demo.html`，Electron 前端需 100% 还原。
* 设计系统采用 CSS 变量（`--bg`、`--ink`、`--brand`、`--line` 等），确保全局一致性。
* 导航激活态：线性渐变 (`#0c8f78` → `#0da387`) + `translateX(4px)` + `box-shadow` 辉光。
* 背景辉光：双 `radial-gradient` 叠加（绿 + 蓝）。
* 页面切换动画：`@keyframes reveal`（opacity + translateY）。
* 面板样式：`border-radius: 16px` + 微阴影 (`box-shadow: 0 8px 20px rgba(0,0,0,0.04)`)。
* 文件选择使用 Electron 原生 `dialog.showOpenDialog()`，支持多选与格式过滤。

---

## 7. MVP 实现基线（V2.0）

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
* 运输协议外发页面：扫描、发送、限流、重试。
* Inbound 规划审查页面：审查、落库、导出、重置、日志表格过滤。
* 供应商管理页面：新增、编辑、启停切换、列表刷新。
* 系统设置页面：SMTP、正则、签名加载与保存。

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

9. 技术栈从 Python + Flet 全面迁移至 Electron + Vue 3。
10. 开发语言切换为 JavaScript (ES2022)，后续可渐进迁移 TypeScript。
11. 前端视觉 100% 还原 `ui/frontend_demo.html`，采用原生 CSS。
12. 加密方案采用 AES-256-GCM（全新密钥，不迁移旧 Fernet 数据）。
13. Excel 解析统一使用 SheetJS，替代 `openpyxl` + `xlrd`。
14. 邮件发送使用 Nodemailer，替代 Python `smtplib`。
15. 并发控制使用 `async/await` + `AbortController`，替代 Python `threading`。
16. 文件选择使用 Electron 原生 `dialog.showOpenDialog()`，不再需要路径输入对话框。
17. 打包使用 electron-builder，替代 PyInstaller。
18. PRD 在开发过程中持续更新，确保文档与实现同步。
20. 按钮配色采用三级体系：Primary（品牌绿主操作）、Accent（蓝色强引导操作）、Ghost（浅灰次要操作）。
21. 移除系统设置中的 TLS 与 Dry Run 开关，精简不必要的配置项。
22. 支持深浅色（Dark/Light）主题自适应及手动切换。
23. 导航模块顺序调整：Inbound 规划审查作为默认首页，运输协议外发调整为第二模块。
