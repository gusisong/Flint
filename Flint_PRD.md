# Flint Product Requirements Document / Flint 产品需求文档

Version 2026-03-13 (Architecture-Aligned Edition) / 版本 2026-03-13（架构对齐版）

## 0. Document Positioning / 文档定位

- 中文：本 PRD 是 Flint 当前主基线文档，目标是让需求、实现与测试保持一致，减少后续开发中的信息噪声。
- English: This PRD is the single baseline for Flint, ensuring requirements, implementation, and tests stay aligned while minimizing noise during future development.

- 中文：本版已剔除与当前 Electron + Vue 实现无关或阶段性过时内容，保留当前可执行范围与明确的短期演进项。
- English: This edition removes content that is irrelevant to the current Electron + Vue implementation or temporarily outdated, while retaining executable scope and near-term roadmap items.

- 中文：主文档路径固定为 Flint_PRD.md。
- English: The canonical document path is Flint_PRD.md.

## 1. Product Baseline / 产品基线

### 1.1 Runtime Architecture / 运行时架构

- 中文：桌面壳层采用 Electron，无边框窗口，主进程负责系统能力与持久化，渲染进程采用 Vue 3 页面承载业务交互。
- English: The desktop shell uses Electron with a frameless window; the main process owns system capabilities and persistence, while the Vue 3 renderer pages handle business interactions.

- 中文：渲染进程通过 preload 暴露的 flintApi 调用 IPC，不直接访问 Node 能力。
- English: The renderer calls IPC through flintApi exposed by preload and does not directly access Node capabilities.

- 中文：当前核心目录为 electron_app/src/main（主进程与服务）与 electron_app/src/renderer（页面与 UI 逻辑）。
- English: The current core directories are electron_app/src/main (main process and services) and electron_app/src/renderer (pages and UI logic).

### 1.2 Technology Stack / 技术栈

| 中文 | English |
| --- | --- |
| 运行时：Electron | Runtime: Electron |
| 前端：Vue 3 + Vite | Frontend: Vue 3 + Vite |
| 语言：JavaScript (ES2022) | Language: JavaScript (ES2022) |
| 样式：原生 CSS 设计系统 | Styling: Native CSS design system |
| Excel 解析：SheetJS (xlsx) | Excel parsing: SheetJS (xlsx) |
| 邮件链路：IPC 队列驱动（当前发送结果为模拟策略） | Mail flow: IPC queue-driven (current send result uses simulation) |
| 测试：Vitest | Testing: Vitest |

### 1.3 Persistence Baseline / 持久化基线

- 中文：当前持久化方案已切换为中心数据库模式：数据目录固定在程序本体目录下的 data/，核心状态由 SQLite 文件 flint_core.db 统一承载，确保首次交付即可直接可用并为后续迁移与治理提供单一基座。
- English: Persistence has been fully switched to a central-database model: data is rooted at data/ under the program body directory, and core state is unified in the SQLite file flint_core.db, providing immediate first-delivery usability and a single base for future migration and governance.

- 中文：历史 JSON 状态文件（mail_tasks.json、inbound_uploads.json、inbound_last_review.json、suppliers.json、settings.json）已退役，仅保留一次性迁移兼容读取。
- English: Legacy JSON state files (mail_tasks.json, inbound_uploads.json, inbound_last_review.json, suppliers.json, settings.json) are retired and retained only for one-time migration compatibility reads.

- 中文：中心 SQLite 数据文件为 flint_core.db；其中 network_transport_coverage 表主键为 Site，核心字段为 Coverage。
- English: The central SQLite file is flint_core.db; within it, table network_transport_coverage uses Site as the primary key and Coverage as the core field.

- 中文：上传文件目录包括 data/mail_uploads 与 data/inbound_uploads。
- English: Upload directories include data/mail_uploads and data/inbound_uploads.

## 2. Module Scope (MVP) / 模块范围（MVP）

### 2.1 Inbound Review / Inbound 规划审查

- 中文：支持拖拽上传文件、文件移除、开始审查、问题标签展示与 CSV 导出。
- English: Supports drag-and-drop upload, file removal, review execution, issue-tag rendering, and CSV export.

- 中文：审查结果表字段为文件、行号、工厂、供应商号、供应商名称、零件号、零件名称、问题标签。
- English: Review table fields are file, line, plant, supplier code, supplier name, part number, part name, and issue tags.

- 中文：审查规则由主进程服务执行，结果通过事件与主动回读共同回填。
- English: Review rules are executed in the main-process service, and results are returned through both events and active readback.

- 中文：新增 Coverage 联动校验：按第 J 列 Site 查询本地 NetworkTransportCoverage 后参与标签判定。
- English: Added coverage-linked validation: column J Site is looked up in local NetworkTransportCoverage and used for tag decisions.

### 2.2 Mail Dispatch / 运输协议外发

- 中文：支持拖拽上传、列表多选/全选、删除文件、隐藏已发送、标题前缀确认后发送。
- English: Supports drag upload, list multi-select/select-all, file deletion, hide-sent filtering, and send-after-subject-prefix confirmation.

- 中文：发送队列由主进程维护，并通过进度事件与完成事件回推。
- English: The send queue is maintained by the main process and pushed back via progress and completion events.

- 中文：当前发送结果用于流程联调，采用模拟成功/失败策略；后续可切换为真实 SMTP 发送。
- English: Current send results are simulation-based for flow integration and can be replaced with real SMTP delivery later.

### 2.3 Supplier Management / 供应商管理

- 中文：支持新增、编辑、删除、按供应商号查询、单选行操作。
- English: Supports create, edit, delete, supplier-code filtering, and single-row selection operations.

- 中文：列表通过事件驱动自动同步。
- English: The list is synchronized automatically through event-driven updates.

### 2.4 Settings / 系统设置

- 中文：支持 SMTP 配置、发件信息、签名、OTA Manifest 地址，以及 OneDrive Coverage CSV 共享目录配置读写。
- English: Supports read/write for SMTP settings, sender info, signature, OTA manifest URL, and OneDrive shared directory configuration for Coverage CSV.

- 中文：支持手动检查更新，并在发现新版本后弹窗确认下载与安装。
- English: Supports manual update checks and prompts user confirmation for download/install when a newer version is found.

- 中文：新增 Coverage OTA 数据基座能力：支持手动检查共享目录 CSV 变更与手动应用入库，自动静默策略暂不启用。
- English: Added Coverage OTA data foundation capability: supports manual check of shared-directory CSV changes and manual apply-to-database flow, while automatic silent strategy remains disabled for now.

## 3. Core Business Rules / 核心业务规则

### 3.1 Inbound Rule Set / Inbound 规则集

- 中文：第一行视为表头，不参与审查。
- English: The first row is treated as header and excluded from review.

- 中文：A/C/D/G/H/I/J/L/M 任一缺失时标记缺少必填字段。
- English: Missing any of A/C/D/G/H/I/J/L/M triggers required-field-missing.

- 中文：D 与 J 前五位不一致时标记供应商编码不一致。
- English: If the first five digits of D and J differ, mark supplier-code mismatch.

- 中文：JIS 且距离大于 20KM、或距离与 VMI 规则冲突时标记方式/距离问题。
- English: Mark method/distance issues for JIS with distance over 20KM or when distance conflicts with VMI rules.

- 中文：G/H/I 不在白名单组合中时标记白名单外组合。
- English: Mark whitelist violation when G/H/I combination is outside the whitelist set.

- 中文：当 H 为 MR 3PL、TS 3PL-VMI、TS 3PL-CC 时，若 J 对应 Site 的 Coverage=0，则标记“站点尚未承运”。
- English: When H is MR 3PL, TS 3PL-VMI, or TS 3PL-CC, mark "站点尚未承运" if Coverage of Site mapped by J equals 0.

- 中文：当 H 为 DR Sup、TS Sup-VMI、TS Sup-CC 时，若 J 对应 Site 的 Coverage>0，则标记“站点已在承运”。
- English: When H is DR Sup, TS Sup-VMI, or TS Sup-CC, mark "站点已在承运" if Coverage of Site mapped by J is greater than 0.

### 3.2 Inbound Tag Semantics / Inbound 标签语义

- 中文：标签展示以语义分组为主，允许同一行展示多个标签。
- English: Tags are rendered by semantic groups, and multiple tags can coexist on the same row.

- 中文：现网标签文案与历史文案兼容映射，避免升级期间出现展示断层。
- English: Current and legacy tag labels are compatibility-mapped to prevent display gaps during upgrades.

## 4. Data and IPC Contract / 数据与 IPC 约定

### 4.1 Data Models (Current) / 数据模型（当前）

- 中文：app_state（SQLite）采用 key/payload 结构统一承载业务状态，当前键包括 mail_tasks、inbound_uploads、inbound_last_review、suppliers、settings。
- English: app_state (SQLite) uses a key/payload structure to unify business state persistence; current keys include mail_tasks, inbound_uploads, inbound_last_review, suppliers, and settings.

- 中文：settings 负载包含 SMTP、发件人、签名、OTA 地址，以及 oneDriveCoverageDir 与 coverageOtaState（lastSignature、lastFilePath、lastAppliedAt、lastUpserted）。
- English: The settings payload includes SMTP, sender, signature, OTA URL, and oneDriveCoverageDir with coverageOtaState (lastSignature, lastFilePath, lastAppliedAt, lastUpserted).

- 中文：network_transport_coverage（SQLite）记录 Site 与 Coverage，用于 Inbound 审查规则联动查询。
- English: network_transport_coverage (SQLite) stores Site and Coverage for rule-linked lookup during inbound review.

- 中文：schema_version 记录中心库版本（当前键 flint_core = 1），用于后续数据库迁移治理。
- English: schema_version records central database versioning (current key flint_core = 1) for future migration governance.

### 4.2 IPC Channels (Baseline) / IPC 通道（基线）

- 中文：窗口控制通道包括 window:minimize、window:toggle-maximize、window:is-maximized、window:close。
- English: Window control channels include window:minimize, window:toggle-maximize, window:is-maximized, and window:close.

- 中文：Inbound 通道包括 inbound:upload-files、inbound:get-uploads、inbound:remove-upload、inbound:start-review、inbound:get-last-review、inbound:export-csv。
- English: Inbound channels include inbound:upload-files, inbound:get-uploads, inbound:remove-upload, inbound:start-review, inbound:get-last-review, and inbound:export-csv.

- 中文：Mail 通道包括 mail:upload-files、mail:get-tasks、mail:start-send、mail:delete-tasks，以及事件 mail:queue-progress、mail:queue-completed。
- English: Mail channels include mail:upload-files, mail:get-tasks, mail:start-send, mail:delete-tasks, and events mail:queue-progress and mail:queue-completed.

- 中文：Supplier 通道包括 supplier:get-list、supplier:create、supplier:update、supplier:delete、supplier:update-status，以及事件 supplier:list-updated。
- English: Supplier channels include supplier:get-list, supplier:create, supplier:update, supplier:delete, supplier:update-status, and event supplier:list-updated.

- 中文：Settings 与 Update 通道包括 settings:get、settings:save、update:check、update:download-install。
- English: Settings and update channels include settings:get, settings:save, update:check, and update:download-install.

- 中文：Coverage 与数据 OTA 通道新增 coverage:import-csv、coverage:get-by-site、ota:data-check-coverage、ota:data-apply-coverage。
- English: Coverage and data OTA channels add coverage:import-csv, coverage:get-by-site, ota:data-check-coverage, and ota:data-apply-coverage.

## 5. UX and Interaction Baseline / 交互与视觉基线

- 中文：四页面导航结构固定为 Inbound、运输协议外发、供应商管理、系统设置。
- English: The four-page navigation order is fixed as Inbound, Mail Dispatch, Supplier Management, and Settings.

- 中文：上传入口统一为拖拽区域，避免多入口行为差异。
- English: Upload entry is unified as drag-and-drop zones to avoid inconsistent multi-entry behavior.

- 中文：列表能力基线为多选（按模块需要）、自动同步、标签化问题展示。
- English: List baseline includes module-appropriate multi-select, automatic synchronization, and tag-based issue display.

- 中文：视觉基线延续现有 CSS 变量体系与页面动画，不在本 PRD 中重复定义历史 Demo 细节。
- English: The visual baseline follows the existing CSS-variable system and page animations, while historical demo details are intentionally not duplicated here.

## 6. Testing and Quality / 测试与质量

### 6.1 Current Test Coverage / 当前测试覆盖

- 中文：domain-utils.test 覆盖文件名清洗、供应商号提取、邮件标题拼装与 CSV 单元格转义。
- English: domain-utils.test covers filename sanitization, supplier-code extraction, subject composition, and CSV cell escaping.

- 中文：inbound-review.test 覆盖 Inbound 审查规则关键路径与标签产出。
- English: inbound-review.test covers key rule paths and tag outputs of inbound review.

- 中文：inbound-csv.test 覆盖 UTF-8 BOM 与中文内容导出正确性。
- English: inbound-csv.test verifies UTF-8 BOM and Chinese-content export correctness.

### 6.2 Current Gaps / 当前缺口

- 中文：尚未形成窗口控制、IPC 失败重试、OTA 下载链路的自动化测试。
- English: Automated tests are still missing for window controls, IPC failure retries, and OTA download flow.

- 中文：Coverage OTA 基座已接入但静默调度、冲突策略、失败重试和回滚策略仍待专项评审后定版。
- English: Coverage OTA foundation is integrated, but silent scheduling, conflict policy, retry behavior, and rollback strategy are pending dedicated review before finalization.

- 中文：尚未覆盖真实 SMTP 集成与长队列压力场景。
- English: Real SMTP integration and long-queue stress scenarios are not covered yet.

## 7. De-scoped and Removed Content / 已剔除与降级内容

- 中文：已剔除与当前实现不一致的过时持久化描述；当前以 flint_core.db 中心数据库为唯一主基线。
- English: Outdated persistence descriptions inconsistent with implementation are removed; flint_core.db central database is now the sole authoritative baseline.

- 中文：已剔除大量迁移期历史决策与 Demo 过程性细节，避免对后续开发造成干扰。
- English: Large portions of migration-stage historical decisions and demo process details are removed to avoid distracting future development.

- 中文：安全加密目标保留为演进项，不再标注为当前已完成能力。
- English: Security encryption remains a roadmap item and is no longer labeled as a completed capability.

## 8. Near-term Roadmap / 近期演进路线

- 中文：优先补齐配置敏感字段保护方案（例如系统凭据存储能力），降低明文风险。
- English: Prioritize protection for sensitive config fields (for example, OS credential storage integration) to reduce plaintext risk.

- 中文：将邮件发送从模拟结果切换为真实 SMTP 发送，并补充重试与限流策略。
- English: Replace simulated mail results with real SMTP delivery and add retry/rate-control policies.

- 中文：增强 OTA 安装流程的异常处理与回滚提示，提升稳定性与可解释性。
- English: Improve OTA install flow with better exception handling and rollback guidance for stability and explainability.

- 中文：覆盖率数据 OTA 当前仅完成基座（检查/应用入口与状态追踪）；静默后台更新频率、触发时机、幂等与冲突处理将在后续专题讨论中单独确认。
- English: Coverage-data OTA currently provides only the foundation (check/apply entry and state tracking); silent background update cadence, trigger timing, idempotency, and conflict handling will be finalized in a separate follow-up discussion.

## 9. Governance Rules / 治理规则

- 中文：所有经批准需求与变更必须同步更新 Flint_PRD.md，且采用同段中英双语。
- English: All approved requirements and changes must be synchronized into Flint_PRD.md using paragraph-level bilingual format.

- 中文：PRD 仅描述“当前已实现能力 + 已确认近期计划”，不保留无排期的理想化设计。
- English: The PRD must describe only current implemented capabilities and confirmed near-term plans, excluding unscheduled idealized designs.

- 中文：如实现与 PRD 发生偏差，以代码现状为准先修正文档，再决策是否调整实现。
- English: If implementation and PRD diverge, update documentation to reflect code reality first, then decide whether implementation changes are required.
