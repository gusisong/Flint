# 通用工具平台与邮件批量外发子模块 — 全新架构 PRD (v2.0)

> **文档定位**：本项目已从“单一的邮件外发脚本”正式升级为**“基于 Flet 的高扩展性通用桌面平台”**。本文档为该平台的基座架构及首个核心业务模块（SMTP 批量外发）的详细需求说明，用于指导后续的代码生成与开发。

## 1. 系统架构与技术栈

* **开发语言**：Python 3.10+
* **UI 框架**：**Flet** (用于构建现代化、响应式的桌面端应用)。
* **本地存储**：**SQLite3** (替代原有的 CSV 和 文件目录流转，用于配置、状态机和任务管理)。
* **并发控制**：`threading` (主线程运行 Flet UI，工作线程执行耗时任务，通过 `threading.Event` 实现优雅停机与任务取消)。
* **打包与分发**：PyInstaller (通过 `flet pack` 打包为单文件独立 `.exe`)。
* **运行环境**：跨平台（主打 Windows 无 Python 环境离线运行）。

---

## 2. 核心平台基座需求 (The Host Platform)

平台本身是一个“壳”，提供底层服务，业务功能通过模块（Plugin）接入。

### 2.1 目录隔离与工作区机制 (Workspace)

* **代码与资源**：打包在 EXE 内部，运行时解压到系统临时目录（`sys._MEIPASS`）。
* **工作区 (Workspace)**：用户实际存放数据的地方。通过 `os.path.dirname(sys.executable)` 获取 EXE 所在目录（开发环境下为项目根目录）。
* **数据中心化**：工作区内自动生成 `data/` 目录，存放核心数据库 `platform_core.db` 和系统级日志 `logs/system.log`。

### 2.2 模块化插件系统 (Plugin Architecture)

* 设计一个 `BaseModule` 接口类。
* 所有业务子模块（如 `email_sender`）需继承该类，并实现以下接口：
  * `get_name()`: 返回模块侧边栏名称。
  * `get_icon()`: 返回模块图标。
  * `build_ui()`: 返回该模块在主界面的 Flet 容器布局。
  * `on_shutdown()`: 接收主程序的退出信号，安全释放资源。
* 平台启动时，动态扫描并加载已注册的模块，生成左侧导航栏。

### 2.3 统一配置与安全中心 (Config & Security)

* **废弃所有明文 `.ini` 文件**。所有全局配置和模块级配置统生存入 SQLite 的 `system_configs` 表。
* **凭证加密**：平台首次运行生成本地密钥（如基于 `cryptography.fernet`），对 SMTP 密码等敏感信息进行加密存储。前端提供统一的设置界面用于修改配置。

### 2.4 OTA 自升级机制 (Auto Updater)

* 启动时后台线程静默访问远端（OneDrive 直链 / 内部 HTTP 服务器）的 `version.json`。
* 若发现新版本，提示用户更新。下载新版 EXE 到临时目录。
* 利用 Python `subprocess` 生成临时 `.bat` 脚本 -> 退出主程序 -> `.bat` 替换旧 EXE 并重启 -> 删除自身。

### 2.5 优雅停机与日志观测 (Graceful Shutdown & Logging)

* **取消令牌**：全局维护一个 `stop_event = threading.Event()`。
* 拦截 Flet 的 `page.on_window_event` (窗口关闭事件)。若有后台任务正在运行，弹出遮罩层提示“正在安全停止任务...”，触发 `stop_event`。工作线程完成当前原子操作后退出，应用彻底关闭。
* **系统日志**：使用 `RotatingFileHandler`（单文件 5MB，保留 3 份）记录底层 ERROR/INFO。
* **业务日志**：通过 UI 组件（如只读的 Flet TextField 控制台或 Datatable）实时展现给用户。

---

## 3. 首个子模块：SMTP 邮件批量外发模块

该模块用于读取指定目录下的附件，匹配供应商邮箱，并实施自适应限流发送。

### 3.1 数据模型重构 (SQLite 替代 CSV/目录流转)

数据库需建立以下表结构（概念模型）：

1. **`suppliers` (供应商表)**: 替代原 `EmailAddress.csv`。字段包含：`supplier_code` (唯一主键), `supplier_name`, `emails` (分号分隔), `is_active`。
2. **`email_tasks` (任务队列)**: 替代原“待外发/已外发/failed”文件夹。字段包含：`task_id`, `project_name`, `supplier_code`, `attachments` (JSON数组，记录文件物理路径), `status` (PENDING/SENDING/SUCCESS/FAILED), `retry_count`, `error_msg`, `update_time`。
3. **`module_configs` (动态规则配置)**: 存储易变业务规则（如附件名匹配正则，默认存入 `r'_(\d{5})_[^/]+$'`）。

### 3.2 核心业务流转 (Task Lifecycle)

1. **扫描入库 (Scan)**：
    * 用户在 UI 点击“扫描工作区”。
    * 程序遍历工作区下符合规则的项目目录，读取附件。
    * 结合动态正则规则提取供应商代码，与 `suppliers` 表关联校验。
    * 校验通过的，在 `email_tasks` 表生成 `PENDING` 任务。文件**留在原地**，不进行物理移动。
2. **调度执行 (Process)**：
    * 用户点击“开始发送”。开启独立工作线程。
    * 查询 `PENDING` 任务，构建邮件对象（正文 + Signature.txt + 附件 + CC当前登录账号）。
    * 通过 SMTP 依次发送。每次发送前检查 `stop_event`。
3. **状态回写 (Update)**：
    * 发送成功：`UPDATE status='SUCCESS'`。
    * 发送失败：`retry_count + 1`，记录 `error_msg`。重试3次仍失败则 `status='FAILED'`。

### 3.3 自适应限流发送引擎

内置以下常量规则，不可供普通用户修改，通过全局限流器 `RateLimiter` 实现：

* **单线程单连接**：复用 SMTP 连接，防并发限流。
* `RATE_INITIAL_DELAY` = 1.0s (初始间隔)
* `RATE_MAX_DELAY` = 10.0s (最大间隔)
* `RATE_MIN_DELAY` = 0.1s (最小间隔)
* **调速策略**：遇到 421 错误（`THRESHOLD_421=3`, 窗口 `WINDOW_421=60s`），触发冷却 `COOLDOWN_SECONDS=30s`，随后延迟翻倍；连续成功 3 次，延迟减少 10% (EMA平滑因子 0.3)。

---

## 4. 界面与交互设计 (Flet UI/UX)

界面需遵循现代化设计风格，主体分为左侧边栏和右侧内容区。

### 4.1 全局布局

* **左侧导航 (NavigationRail)**：
  * 邮件外发中心 (Email Module)
  * 供应商管理 (Supplier DB)
  * 系统设置 (Settings)
* **右侧内容区**：根据左侧点击动态切换视图。

### 4.2 模块视图设计

1. **供应商管理视图**：
    * 提供基于 `suppliers` 表的 `DataTable`。
    * 支持“新增/编辑/删除”供应商记录。
    * 支持从旧版 `EmailAddress.csv` 一键导入数据（过渡期兼容功能）。
2. **系统设置视图**：
    * **SMTP 设置**：服务器地址、端口、SSL/TLS 开关、用户名、密码（密码框隐藏显示，存入加密库）。
    * **规则设置**：允许高级用户修改“匹配正则表达式”、“邮件主题模板”。
    * **签名设置**：富文本框或多行输入框维护签名内容。
3. **邮件外发工作台 (核心看板)**：
    * **顶部控制区**：【扫描工作区】按钮、【开始批量发送】按钮（防抖防误触，发送中置灰）。
    * **进度区**：展示 `ProgressBar`，中央悬浮百分比。右侧文本显示 **平均发送速率 (封/秒)** 与 **预估剩余时间 (ETA)**。
    * **数据看板**：展示 `email_tasks` 表的视图，分页显示当前批次的任务明细。
        * 列：状态(图标展示✅/⏳/❌)、项目名、供应商、附件数、失败原因。
        * 支持筛选（如仅看 FAILED）。支持“一键重试失败任务”。

## 5. 异常与边界行为规范

1. **数据库锁定/冲突**：使用 `sqlite3` 的 `check_same_thread=False`，并加入必要的写锁以支持后台线程与 UI 线程同时访问 DB。
2. **网络异常断开**：捕捉 `socket.error` 及 `smtplib.SMTPException`，执行退避并进入重试逻辑，不要导致程序崩溃。
3. **无邮箱或文件破损**：扫描阶段发现无邮箱的供应商，任务标记为 `FAILED`，记录“未找到邮箱映射”，不下发给发送引擎。
4. **环境缺失**：若未找到 SQLite DB 文件，系统首次启动时必须自动执行 DDL 脚本完成数据库与表的初始化。
