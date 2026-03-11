# Flint 通用工具平台 PRD（四页面MVP）

> **文档定位**：本项目已从“单一邮件外发脚本”升级为**“基于 Flet 的高扩展性通用桌面平台”**。本文档定义平台基座能力及四页面MVP（运输协议外发、Inbound规划审查、供应商管理、系统设置）的统一需求基线。

## 1. 系统架构与技术栈

* **开发语言**：Python 3.10+
* **UI 框架**：**Flet**
* **本地存储**：**SQLite3**
* **并发控制**：`threading` + `threading.Event`
* **打包与分发**：PyInstaller / `flet pack`
* **运行环境**：Windows 优先，兼容跨平台

---

## 2. 核心平台基座需求

### 2.1 工作区机制

* 运行目录内创建 `data/`。
* 数据库存放 `data/platform_core.db`。
* 系统日志存放 `data/logs/system.log`。

### 2.2 模块化插件系统

* 统一 `BaseModule` 接口：`get_name()`、`get_icon()`、`build_ui()`、`on_shutdown()`。
* 平台启动时加载模块注册表并渲染左侧导航。

### 2.3 配置与安全中心

* 全局配置、模块配置统一入库，不使用明文 `.ini`。
* SMTP 密码等敏感信息加密存储（Fernet）。

### 2.4 停机与日志

* 关闭窗口时触发全局停止令牌。
* 等待后台任务安全收尾后再退出。
* 系统日志使用滚动策略（5MB * 3）。

---

## 3. 子模块A：运输协议外发

### 3.1 数据模型

1. `suppliers`：供应商与邮箱映射。
2. `email_tasks`：发送任务队列与状态。
3. `module_configs`：正则与模板等动态配置。

### 3.2 业务流

1. 扫描工作区并生成 `PENDING` 任务。
2. 后台线程批量发送，逐条检查停止令牌。
3. 成功置 `SUCCESS`，失败重试，超过阈值置 `FAILED`。

### 3.3 限流策略

* 单线程单连接。
* `RATE_INITIAL_DELAY=1.0`，`RATE_MAX_DELAY=10.0`，`RATE_MIN_DELAY=0.1`。
* 421窗口触发冷却 + 延时翻倍；连续成功后平滑降速。

---

## 4. 子模块B：Inbound规划审查

### 4.1 模块定位

* 审查 `.xlsx` / `.xls`。
* 输出可追踪日志并支持导出。
* 审查结果落库（任务表+明细表）。

### 4.2 功能范围

1. 文件选择与批量导入。
2. 规则执行（配置化存储于 `module_configs`）。
3. 同行多异常合并展示。
4. 日志查看/导出。
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

* `.xlsx`：`openpyxl`
* `.xls`：`xlrd`

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

1. 所有已批准变更必须同步更新主PRD。
2. 主PRD唯一基线为 `Flint_PRD.md`。
3. 首发版本固定 `V1.0`。
4. 小改升小版本（`V1.1`、`V1.2`）。
5. 大改升主版本（`V2.0`、`V3.0`）。

---

## 6. 前端信息架构（V1.0）

### 6.1 页面结构

1. 运输协议外发
2. Inbound规划审查
3. 供应商管理
4. 系统设置

### 6.2 导航与图标

* 四页面均作为独立模块接入左侧导航。
* 侧栏图标采用统一极简线性风格，且语义与页面功能一致。
* 项目图标使用 `assets/Flint_Icon.png`。

### 6.3 操作区布局

* 高频主操作按钮靠左。
* 低频次操作按钮靠右。
* 按钮文案需要控制在单行内显示，按钮等宽。
* 启动任务类按钮（`开始发送`、`开始审查`）采用浅蓝色。

### 6.4 数据展示策略

* 顶部KPI卡片在未接入真实指标前不展示，避免假数据误导。
* Inbound日志采用表格视图，支持关键字过滤与异常定位。

### 6.5 启动与视觉一致性（2026-03-11 增补）

* 应用入口采用 `ft.run()` 作为主启动方式，并保留旧版本兼容兜底。
* 启动失败需写入 `data/logs/startup_error.log`，并在界面弹窗提示错误与日志路径。
* 桌面端最终视觉风格需高保真对齐 `ui/frontend_demo.html`（导航、配色、按钮、表格、间距、动效）。
* Flet 控件兼容基线采用当前稳定 API：按钮统一使用 `Button`，避免使用已弃用 `ElevatedButton`。
* 视觉实现路径采用原生 Flet 高保真复刻，不引入 WebView 混合渲染。
* Inbound 文件选择在兼容性异常环境下采用路径输入对话框方案，避免 `FilePicker` 控件不可用导致界面崩溃。

---

## 7. MVP实现基线（2026-03-11）

### 7.1 已落地

* 平台入口、导航、四页面模块注册与切换。
* Core 服务：Workspace / DB / 配置 / 安全 / 任务 / 日志。
* 运输协议外发页面：扫描、发送、限流、重试。
* Inbound规划审查页面：审查、落库、导出、重置、日志表格过滤。
* 供应商管理页面：新增、编辑、启停切换、列表刷新。
* 系统设置页面：SMTP、正则、签名加载与保存。

### 7.2 自动化测试

* 已建立并通过基础测试集（11项）。

1. Core 服务：配置、加解密、任务管理。
2. 业务引擎：Inbound规则判定、邮件限流器。
3. 模块注册：四页面加载与默认配置初始化。

### 7.3 下一迭代

* 供应商导入能力与批量编辑能力。
* 系统设置更细粒度校验与安全策略提示。
* 更高覆盖率集成测试（UI交互、SMTP仿真、并发压力）。

---

## 8. 已确认决策（2026-03-11）

1. 关闭窗口必须等待后台任务安全结束。
2. 邮件扫描任务采用全状态去重。
3. Inbound Rule7 采用固定白名单（V1.0）。
4. 文档策略采用单主文档：`Flint_PRD.md`。
5. 前端本轮范围为四页面MVP。
6. 低频操作按钮保持右侧直出，按钮等宽且文案单行。
7. KPI延后至真实指标接入后再展示。
8. 系统设置页直接接入配置服务并支持保存。
9. 主入口启动策略采用 `ft.run()` + 兼容回退。
10. 启动诊断增强：错误落盘 + 启动弹窗提示。
11. 前端风格采用 `ui/frontend_demo.html` 高保真还原。
12. Flet 按钮组件统一迁移为 `Button`，保持样式一致并消除弃用风险。
13. 样式复刻路径确认：保持原生 Flet 实现。
14. 文件选择策略确认：保持路径输入对话框，规避 `Unknown control: FilePicker`。
