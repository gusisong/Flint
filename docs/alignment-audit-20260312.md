# Flint 对齐审计报告（2026-03-12）

## 1. 审计范围

本次对齐审计覆盖三层：

1. PRD 需求基线（Flint_PRD.md）
2. Demo 设计与交互实现（ui/frontend_demo.html 与 ui/demo_modular）
3. 当前项目架构与代码状态（Python/Flet 运行代码、Electron 迁移草案）

## 2. 对齐结论（摘要）

- PRD 与 Demo：高对齐（已包含 V2.1 已确认需求，且已新增模块化 Demo 结构约束）。
- Demo 与正式开发目标：中对齐（UI 和交互方案清晰，但正式 Electron/Vue 工程尚未落地）。
- 当前代码与 PRD：低对齐（当前运行态仍是 Python + Flet，和 PRD 的 Electron/Vue 目标栈存在阶段性偏差）。

## 3. 已对齐项

1. UI 文案与交互

- 左上角副标题已更新为“入厂物流规划运营工具平台”。
- 模块1支持拖拽上传后展示文件名清单并可删除。
- 模块2“隐藏/显示已发送”具备图标态。

1. Demo 组织结构

- 新增模块化 Demo：
  - ui/demo_modular/index.html
  - ui/demo_modular/pages/*
  - ui/demo_modular/styles/main.css
  - ui/demo_modular/scripts/core/*
  - ui/demo_modular/scripts/modules/*
- 保留 ui/frontend_demo.html 作为视觉回退与对照。

1. 文档治理

- PRD 已同步新增“Demo 模块化拆分基线（V2.1）”。
- PRD 已新增中英双语决策条目（含模块化架构约束）。

## 4. 主要缺口项（需在正式开发中补齐）

1. 技术栈落地缺口

- PRD 目标：Electron + Vue 3 + JS。
- 当前可运行代码：Python + Flet（main.py / modules/*）。

1. Mail 模块能力缺口（运行代码 vs PRD）

- 当前 Python 模块仍包含“扫描工作区”“重试失败”逻辑，尚未完全切换到“拖拽上传 + 多选发送 + 删除文件 + 隐藏已发送”流程。

1. Inbound 模块能力缺口（运行代码 vs PRD）

- 当前 Python 模块仍使用“选择路径输入”“刷新日志”“重置状态”“级别列”等旧逻辑，未完全映射至 V2.1 目标交互。

1. Supplier 模块能力缺口（运行代码 vs PRD）

- 当前 Python 模块仍有“刷新列表”入口，且交互模型与 PRD 的单选行+自动同步策略未完全一致。

## 5. 建议的正式开发基线（执行约束）

1. 前端工程组织需与 demo_modular 一致

- 页面层：pages/
- 共享能力层：core/
- 业务模块层：modules/
- 入口装配层：app/bootstrap

1. 保持“视觉基线 + 交互基线 + 代码边界”三重一致

- 视觉对照：ui/frontend_demo.html
- 交互对照：ui/demo_modular
- 工程边界：docs/electron-vue-ipc-mapping-draft.md

1. 开发顺序建议

- 第1步：搭建 Electron + Vue 工程骨架（按模块边界）
- 第2步：优先实现 Inbound/Mail/Supplier 三个核心页面交互
- 第3步：接入 IPC 与主进程服务，实现真实数据链路

## 6. 进入正式开发前的就绪检查

- [x] PRD 已包含 V2.1 决策
- [x] Demo 已模块化拆分并可作为前端实现蓝本
- [x] 架构映射草案已存在（IPC/状态机/时序图）
- [ ] Electron + Vue 项目骨架未创建
- [ ] 主进程 IPC 与服务未落地
- [ ] 现有 Python 运行版仍需并行维护或冻结策略确认
