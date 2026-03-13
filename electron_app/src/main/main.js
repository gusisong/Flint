const { app, BrowserWindow, ipcMain, Menu, dialog } = require("electron");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("path");
const { spawn } = require("node:child_process");
const {
  sanitizeFileName,
  extractSupplierCode,
  makeSubject,
} = require("./services/domain-utils");
const { reviewInboundFiles } = require("./services/inbound-review");
const { buildInboundCsvContent } = require("./services/inbound-csv");
const { checkForUpdate, downloadAndVerifyUpdate } = require("./services/ota-service");
const { NetworkTransportCoverageStore } = require("./services/network-transport-coverage-store");
const {
  checkCoverageCsvUpdate,
  getDefaultCoverageSeedCandidates,
} = require("./services/coverage-ota-service");

const isDev = !!process.env.VITE_DEV_SERVER_URL;
const MAIL_PERSIST_SUBDIR = "mail_uploads";
const INBOUND_PERSIST_SUBDIR = "inbound_uploads";

const runtime = {
  ready: false,
  dataDir: "",
  logsDir: "",
  mailUploadDir: "",
  inboundUploadDir: "",
  coreDbFile: "",
  mailTasks: [],
  inboundUploads: [],
  inboundLastReview: null,
  suppliers: [],
  settings: null,
  coverageStore: null,
};

const DEFAULT_SUPPLIERS = [
  { code: "10243", name: "ACME Corp", email: "ops@acme.example", enabled: true },
  { code: "11502", name: "东方精密", email: "dispatch@dfjm.example", enabled: true },
  { code: "11888", name: "南海零部件", email: "mail@nanhai.example", enabled: false },
];

const DEFAULT_SETTINGS = {
  smtpHost: "smtp.example.com",
  smtpPort: 587,
  smtpUser: "",
  smtpPassword: "",
  senderName: "Flint Dispatch",
  senderAddress: "flint@example.com",
  signature: "Flint 系统自动发送",
  otaManifestUrl: "",
  oneDriveCoverageDir: "",
  coverageOtaState: {
    lastSignature: "",
    lastFilePath: "",
    lastAppliedAt: "",
    lastUpserted: 0,
  },
  updatedAt: "",
};

function resolveProgramDataDir() {
  if (app.isPackaged) {
    return path.join(path.dirname(process.execPath), "data");
  }
  return path.join(app.getAppPath(), "data");
}

function normalizeCoverageOtaState(payload = {}) {
  return {
    lastSignature: String(payload.lastSignature || ""),
    lastFilePath: String(payload.lastFilePath || ""),
    lastAppliedAt: String(payload.lastAppliedAt || ""),
    lastUpserted: Number(payload.lastUpserted || 0),
  };
}

function getCoverageOtaState() {
  return normalizeCoverageOtaState(runtime.settings?.coverageOtaState || {});
}

async function applyCoverageCsvImport(csvPath) {
  if (!runtime.coverageStore) {
    throw new Error("coverageStore 未初始化");
  }
  const importResult = await runtime.coverageStore.importFromCsv(csvPath);
  const checkResult = await checkCoverageCsvUpdate({
    sharedDir: path.dirname(csvPath),
    lastSignature: "",
  });
  runtime.settings.coverageOtaState = {
    ...getCoverageOtaState(),
    lastSignature: String(checkResult.signature || ""),
    lastFilePath: csvPath,
    lastAppliedAt: new Date().toISOString(),
    lastUpserted: Number(importResult.upserted || 0),
  };
  await saveSettings();
  return {
    ...importResult,
    coverageOtaState: runtime.settings.coverageOtaState,
  };
}

async function bootstrapCoverageIfEmpty() {
  if (!runtime.coverageStore) {
    return;
  }
  const currentCount = await runtime.coverageStore.getRowCount();
  if (currentCount > 0) {
    return;
  }

  const candidates = [];
  const oneDriveDir = String(runtime.settings?.oneDriveCoverageDir || "").trim();
  if (oneDriveDir) {
    candidates.push(path.join(oneDriveDir, "NetworkTransportCoverage.csv"));
  }
  candidates.push(...getDefaultCoverageSeedCandidates());

  for (const candidate of candidates) {
    if (!candidate || !fs.existsSync(candidate)) {
      continue;
    }
    await applyCoverageCsvImport(candidate);
    break;
  }
}

function createWindow() {
  const iconPath = path.join(__dirname, "../../public/Flint_Icon.png");
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 1100,
    minHeight: 760,
    frame: false,
    titleBarStyle: "hidden",
    autoHideMenuBar: true,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  Menu.setApplicationMenu(null);
  win.on("maximize", () => {
    win.webContents.send("window:maximized-changed", { maximized: true });
  });
  win.on("unmaximize", () => {
    win.webContents.send("window:maximized-changed", { maximized: false });
  });
  win.once("ready-to-show", () => {
    win.maximize();
  });

  if (isDev) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
    if (process.env.FLINT_OPEN_DEVTOOLS === "1") {
      win.webContents.openDevTools({ mode: "detach" });
    }
    return;
  }

  win.loadFile(path.join(__dirname, "../../dist/renderer/index.html"));
}

async function readJsonFile(filePath, fallbackValue) {
  if (!fs.existsSync(filePath)) {
    return fallbackValue;
  }
  try {
    const raw = await fsp.readFile(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return fallbackValue;
  }
}

async function loadStateFromCoreDb(stateKey, legacyFilePath, fallbackValue) {
  if (legacyFilePath && fs.existsSync(legacyFilePath)) {
    const legacyValue = await readJsonFile(legacyFilePath, fallbackValue);
    await runtime.coverageStore.setAppState(stateKey, legacyValue);
    try {
      await fsp.unlink(legacyFilePath);
    } catch {
      // best-effort cleanup for retired JSON persistence files
    }
    return legacyValue;
  }
  return runtime.coverageStore.getAppState(stateKey, fallbackValue);
}

function broadcast(channel, payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
  }
}

async function initRuntime() {
  if (runtime.ready) {
    return;
  }

  runtime.dataDir = resolveProgramDataDir();
  runtime.logsDir = path.join(runtime.dataDir, "logs");
  runtime.mailUploadDir = path.join(runtime.dataDir, MAIL_PERSIST_SUBDIR);
  runtime.inboundUploadDir = path.join(runtime.dataDir, INBOUND_PERSIST_SUBDIR);
  runtime.coreDbFile = path.join(runtime.dataDir, "flint_core.db");

  const legacyMailStoreFile = path.join(runtime.dataDir, "mail_tasks.json");
  const legacyInboundUploadStoreFile = path.join(runtime.dataDir, "inbound_uploads.json");
  const legacyInboundLastReviewStoreFile = path.join(runtime.dataDir, "inbound_last_review.json");
  const legacySupplierStoreFile = path.join(runtime.dataDir, "suppliers.json");
  const legacySettingsStoreFile = path.join(runtime.dataDir, "settings.json");

  fs.mkdirSync(runtime.dataDir, { recursive: true });
  fs.mkdirSync(runtime.logsDir, { recursive: true });
  fs.mkdirSync(runtime.mailUploadDir, { recursive: true });
  fs.mkdirSync(runtime.inboundUploadDir, { recursive: true });

  runtime.coverageStore = new NetworkTransportCoverageStore(runtime.coreDbFile);
  await runtime.coverageStore.init();

  runtime.mailTasks = await loadStateFromCoreDb("mail_tasks", legacyMailStoreFile, []);
  runtime.inboundUploads = await loadStateFromCoreDb("inbound_uploads", legacyInboundUploadStoreFile, []);
  runtime.inboundLastReview = await loadStateFromCoreDb(
    "inbound_last_review",
    legacyInboundLastReviewStoreFile,
    null,
  );
  runtime.suppliers = await loadStateFromCoreDb("suppliers", legacySupplierStoreFile, DEFAULT_SUPPLIERS);
  runtime.suppliers = runtime.suppliers.map((item) => ({
    ...item,
    enabled: true,
  }));
  await saveSuppliers();
  runtime.settings = await loadStateFromCoreDb("settings", legacySettingsStoreFile, DEFAULT_SETTINGS);
  runtime.settings = {
    ...DEFAULT_SETTINGS,
    ...runtime.settings,
    coverageOtaState: normalizeCoverageOtaState(runtime.settings?.coverageOtaState || {}),
  };
  await saveSettings();
  await bootstrapCoverageIfEmpty();
  runtime.ready = true;
}

async function saveMailTasks() {
  await runtime.coverageStore.setAppState("mail_tasks", runtime.mailTasks);
}

function getMailTasks(hideSent) {
  if (hideSent) {
    return runtime.mailTasks.filter((x) => x.status !== "SUCCESS");
  }
  return runtime.mailTasks;
}

function startMailQueue(jobId, taskIds, subjectPrefix) {
  const queue = runtime.mailTasks.filter((x) => taskIds.includes(x.id));
  if (!queue.length) {
    broadcast("mail:queue-completed", { jobId, success: 0, failed: 0 });
    return;
  }

  let sent = 0;
  let success = 0;
  let failed = 0;

  const timer = setInterval(async () => {
    if (sent >= queue.length) {
      clearInterval(timer);
      await saveMailTasks();
      broadcast("mail:queue-completed", { jobId, success, failed });
      return;
    }

    const current = queue[sent];
    const ok = Math.random() > 0.2;
    runtime.mailTasks = runtime.mailTasks.map((x) => {
      if (x.id !== current.id) {
        return x;
      }
      return {
        ...x,
        status: ok ? "SUCCESS" : "FAILED",
        subject: makeSubject(subjectPrefix, x.supplierCode),
        failReason: ok ? "" : "SMTP 421 限流",
        updatedAt: new Date().toISOString(),
      };
    });

    sent += 1;
    if (ok) {
      success += 1;
    } else {
      failed += 1;
    }
    broadcast("mail:queue-progress", { jobId, sent, total: queue.length });
    await saveMailTasks();
  }, 700);
}

async function saveInboundUploads() {
  await runtime.coverageStore.setAppState("inbound_uploads", runtime.inboundUploads);
}

async function saveInboundLastReview() {
  await runtime.coverageStore.setAppState("inbound_last_review", runtime.inboundLastReview);
}

async function saveSuppliers() {
  await runtime.coverageStore.setAppState("suppliers", runtime.suppliers);
}

async function saveSettings() {
  await runtime.coverageStore.setAppState("settings", runtime.settings);
}

function normalizeSupplierCode(code) {
  return String(code || "").trim();
}

function registerIpcHandlers() {
  ipcMain.handle("window:minimize", async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.minimize();
    return { ok: true };
  });

  ipcMain.handle("window:toggle-maximize", async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) {
      return { ok: false, maximized: false };
    }
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
    return { ok: true, maximized: win.isMaximized() };
  });

  ipcMain.handle("window:is-maximized", async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return { maximized: !!win?.isMaximized() };
  });

  ipcMain.handle("window:close", async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.close();
    return { ok: true };
  });

  ipcMain.handle("platform:get-app-meta", async () => {
    await initRuntime();
    return {
      name: "Flint",
      stack: "Electron + Vue",
      phase: "mvp-ipc",
      version: app.getVersion(),
    };
  });

  ipcMain.handle("update:check", async (_event, payload = {}) => {
    await initRuntime();
    const manifestUrl = String(payload.manifestUrl || runtime.settings?.otaManifestUrl || "").trim();
    if (!manifestUrl) {
      return {
        hasUpdate: false,
        currentVersion: app.getVersion(),
        latestVersion: app.getVersion(),
        reason: "otaManifestUrl 未配置",
      };
    }
    try {
      return await checkForUpdate({
        manifestUrl,
        currentVersion: app.getVersion(),
      });
    } catch (error) {
      return {
        hasUpdate: false,
        currentVersion: app.getVersion(),
        latestVersion: app.getVersion(),
        reason: error?.message || "检查更新失败",
      };
    }
  });

  ipcMain.handle("update:download-install", async (_event, payload = {}) => {
    await initRuntime();
    const installerUrl = String(payload.installerUrl || "").trim();
    const expectedSha256 = String(payload.sha256 || "").trim();
    const version = String(payload.version || "").trim();
    if (!installerUrl || !expectedSha256 || !version) {
      throw new Error("installerUrl/sha256/version 不能为空");
    }

    const saveDir = path.join(runtime.dataDir, "updates");
    const result = await downloadAndVerifyUpdate({
      installerUrl,
      expectedSha256,
      saveDir,
      version,
    });

    spawn(result.filePath, [], {
      detached: true,
      stdio: "ignore",
    }).unref();

    setTimeout(() => {
      app.quit();
    }, 300);

    return { ok: true, filePath: result.filePath };
  });

  ipcMain.handle("coverage:import-csv", async (_event, payload = {}) => {
    await initRuntime();
    const directPath = String(payload.csvPath || "").trim();
    const fromOneDrive = String(runtime.settings?.oneDriveCoverageDir || "").trim();
    const csvPath = directPath || (fromOneDrive ? path.join(fromOneDrive, "NetworkTransportCoverage.csv") : "");
    if (!csvPath) {
      throw new Error("csvPath 不能为空，且 oneDriveCoverageDir 未配置");
    }
    return applyCoverageCsvImport(csvPath);
  });

  ipcMain.handle("coverage:get-by-site", async (_event, payload = {}) => {
    await initRuntime();
    const site = String(payload.site || "").trim();
    const coverage = await runtime.coverageStore.getCoverageBySite(site);
    return { site, coverage };
  });

  ipcMain.handle("ota:data-check-coverage", async () => {
    await initRuntime();
    const oneDriveCoverageDir = String(runtime.settings?.oneDriveCoverageDir || "").trim();
    const state = getCoverageOtaState();
    return checkCoverageCsvUpdate({
      sharedDir: oneDriveCoverageDir,
      lastSignature: state.lastSignature,
    });
  });

  ipcMain.handle("ota:data-apply-coverage", async (_event, payload = {}) => {
    await initRuntime();
    const force = !!payload.force;
    const oneDriveCoverageDir = String(runtime.settings?.oneDriveCoverageDir || "").trim();
    const state = getCoverageOtaState();
    const checkResult = await checkCoverageCsvUpdate({
      sharedDir: oneDriveCoverageDir,
      lastSignature: state.lastSignature,
    });

    if (!checkResult.hasCandidate) {
      return {
        ok: false,
        applied: false,
        reason: checkResult.reason || "共享目录内未找到覆盖率CSV",
      };
    }
    if (!force && !checkResult.needsUpdate) {
      return {
        ok: true,
        applied: false,
        reason: "未检测到新Coverage数据",
        check: checkResult,
      };
    }

    const importResult = await applyCoverageCsvImport(checkResult.filePath);
    return {
      ok: true,
      applied: true,
      check: checkResult,
      importResult,
    };
  });

  ipcMain.handle("mail:upload-files", async (_event, payload = {}) => {
    await initRuntime();
    const files = Array.isArray(payload.files) ? payload.files : [];
    const now = Date.now();

    const createdTasks = [];
    for (let idx = 0; idx < files.length; idx += 1) {
      const file = files[idx] || {};
      const fileName = file.name || `unknown_${idx}`;
      const targetName = `${now}_${idx}_${sanitizeFileName(fileName)}`;
      const storedPath = path.join(runtime.mailUploadDir, targetName);
      if (file.path && fs.existsSync(file.path)) {
        try {
          await fsp.copyFile(file.path, storedPath);
        } catch {
          // copy failed: keep task but mark an in-memory path for traceability
        }
      }

      const task = {
        id: `mail_${now}_${idx}_${Math.random().toString(36).slice(2, 8)}`,
        status: "PENDING",
        fileName,
        supplierCode: extractSupplierCode(fileName),
        storedPath,
        originalPath: file.path || "",
        subject: "",
        failReason: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      createdTasks.push(task);
    }

    runtime.mailTasks = [...runtime.mailTasks, ...createdTasks];
    await saveMailTasks();
    return { tasks: createdTasks };
  });

  ipcMain.handle("mail:get-tasks", async (_event, payload = {}) => {
    await initRuntime();
    return { tasks: getMailTasks(!!payload.hideSent) };
  });

  ipcMain.handle("mail:start-send", async (_event, payload = {}) => {
    await initRuntime();
    const taskIds = Array.isArray(payload.taskIds) ? payload.taskIds : [];
    const subjectPrefix = String(payload.subjectPrefix || "");
    const jobId = `mail_job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    if (taskIds.length === 0) {
      return { jobId };
    }
    startMailQueue(jobId, taskIds, subjectPrefix);
    return { jobId };
  });

  ipcMain.handle("mail:delete-tasks", async (_event, payload = {}) => {
    await initRuntime();
    const taskIds = Array.isArray(payload.taskIds) ? payload.taskIds : [];
    const deleteFiles = payload.deleteFiles !== false;
    const toDelete = runtime.mailTasks.filter((x) => taskIds.includes(x.id));

    if (deleteFiles) {
      for (const task of toDelete) {
        if (task.storedPath && fs.existsSync(task.storedPath)) {
          try {
            await fsp.unlink(task.storedPath);
          } catch {
            // best-effort cleanup
          }
        }
      }
    }

    runtime.mailTasks = runtime.mailTasks.filter((x) => !taskIds.includes(x.id));
    await saveMailTasks();
    return { deletedCount: toDelete.length };
  });

  ipcMain.handle("inbound:upload-files", async (_event, payload = {}) => {
    await initRuntime();
    const files = Array.isArray(payload.files) ? payload.files : [];
    const now = Date.now();
    const created = [];
    const skipped = [];

    for (let idx = 0; idx < files.length; idx += 1) {
      const file = files[idx] || {};
      const fileName = file.name || `unknown_${idx}`;
      const originalPath = String(file.path || "").trim();
      if (!originalPath || !fs.existsSync(originalPath)) {
        skipped.push({ fileName, reason: "source-path-unavailable" });
        continue;
      }
      const targetName = `${now}_${idx}_${sanitizeFileName(fileName)}`;
      const storedPath = path.join(runtime.inboundUploadDir, targetName);
      try {
        await fsp.copyFile(originalPath, storedPath);
      } catch {
        skipped.push({ fileName, reason: "copy-failed" });
        continue;
      }
      created.push({
        id: `inbound_${now}_${idx}_${Math.random().toString(36).slice(2, 8)}`,
        fileName,
        storedPath,
        originalPath,
        uploadedAt: new Date().toISOString(),
      });
    }

    if (created.length > 0) {
      runtime.inboundUploads = [...runtime.inboundUploads, ...created];
      await saveInboundUploads();
    }
    return { files: runtime.inboundUploads, importedCount: created.length, skipped };
  });

  ipcMain.handle("inbound:get-uploads", async () => {
    await initRuntime();
    return { files: runtime.inboundUploads };
  });

  ipcMain.handle("inbound:remove-upload", async (_event, payload = {}) => {
    await initRuntime();
    const id = String(payload.id || "");
    const target = runtime.inboundUploads.find((x) => x.id === id);
    if (target && target.storedPath && fs.existsSync(target.storedPath)) {
      try {
        await fsp.unlink(target.storedPath);
      } catch {
        // best-effort cleanup
      }
    }
    runtime.inboundUploads = runtime.inboundUploads.filter((x) => x.id !== id);
    await saveInboundUploads();
    return { files: runtime.inboundUploads };
  });

  ipcMain.handle("inbound:start-review", async (_event, payload = {}) => {
    await initRuntime();
    const fileIds = Array.isArray(payload.fileIds) ? payload.fileIds : [];
    const targets = fileIds.length
      ? runtime.inboundUploads.filter((x) => fileIds.includes(x.id))
      : runtime.inboundUploads;

    const rows = await reviewInboundFiles(targets, {
      resolveCoverageBySite: (site) => runtime.coverageStore.getCoverageBySite(site),
    });

    const jobId = `inbound_job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const payloadOut = {
      jobId,
      finishedAt: new Date().toISOString(),
      summary: {
        totalRows: rows.length,
        totalIssues: rows.reduce((sum, row) => sum + row.tags.length, 0),
        fileCount: targets.length,
      },
      rows,
    };

    runtime.inboundLastReview = payloadOut;
    await saveInboundLastReview();
    broadcast("inbound:review-completed", payloadOut);
    return { jobId };
  });

  ipcMain.handle("inbound:get-last-review", async () => {
    await initRuntime();
    return { review: runtime.inboundLastReview };
  });

  ipcMain.handle("inbound:export-csv", async (_event, payload = {}) => {
    await initRuntime();
    const rows = Array.isArray(payload.rows)
      ? payload.rows
      : Array.isArray(runtime.inboundLastReview?.rows)
      ? runtime.inboundLastReview.rows
      : [];

    const defaultPath = path.join(runtime.logsDir, `inbound_review_${Date.now()}.csv`);
    const win = BrowserWindow.fromWebContents(_event.sender);
    const selection = await dialog.showSaveDialog(win || undefined, {
      title: "导出 Inbound 审查日志",
      defaultPath,
      buttonLabel: "导出",
      filters: [
        { name: "CSV 文件", extensions: ["csv"] },
      ],
    });

    if (selection.canceled || !selection.filePath) {
      return { canceled: true };
    }

    await fsp.writeFile(selection.filePath, buildInboundCsvContent(rows), "utf-8");
    return { canceled: false, filePath: selection.filePath };
  });

  ipcMain.handle("supplier:get-list", async () => {
    await initRuntime();
    return { items: runtime.suppliers };
  });

  ipcMain.handle("supplier:create", async (_event, payload = {}) => {
    await initRuntime();
    const code = normalizeSupplierCode(payload.code);
    const name = String(payload.name || "").trim();
    const email = String(payload.email || "").trim();

    if (!code || !name || !email) {
      throw new Error("code/name/email 不能为空");
    }
    if (runtime.suppliers.some((x) => x.code === code)) {
      throw new Error(`供应商号已存在: ${code}`);
    }

    const created = { code, name, email, enabled: true };
    runtime.suppliers = [created, ...runtime.suppliers];
    await saveSuppliers();
    broadcast("supplier:list-updated", { items: runtime.suppliers });
    return { ok: true, created };
  });

  ipcMain.handle("supplier:update", async (_event, payload = {}) => {
    await initRuntime();
    const code = normalizeSupplierCode(payload.code);
    const name = String(payload.name || "").trim();
    const email = String(payload.email || "").trim();
    const target = runtime.suppliers.find((x) => x.code === code);
    if (!target) {
      throw new Error(`供应商不存在: ${code}`);
    }
    target.name = name || target.name;
    target.email = email || target.email;
    await saveSuppliers();
    broadcast("supplier:list-updated", { items: runtime.suppliers });
    return { ok: true, updated: target };
  });

  ipcMain.handle("supplier:delete", async (_event, payload = {}) => {
    await initRuntime();
    const code = normalizeSupplierCode(payload.code);
    const before = runtime.suppliers.length;
    runtime.suppliers = runtime.suppliers.filter((x) => x.code !== code);
    if (runtime.suppliers.length === before) {
      throw new Error(`供应商不存在: ${code}`);
    }
    await saveSuppliers();
    broadcast("supplier:list-updated", { items: runtime.suppliers });
    return { ok: true, code };
  });

  ipcMain.handle("supplier:update-status", async (_event, payload = {}) => {
    await initRuntime();
    const code = normalizeSupplierCode(payload.code);
    const enabled = !!payload.enabled;
    const target = runtime.suppliers.find((x) => x.code === code);
    if (!target) {
      throw new Error(`供应商不存在: ${code}`);
    }
    target.enabled = enabled;
    await saveSuppliers();
    broadcast("supplier:list-updated", { items: runtime.suppliers });
    return { ok: true, updated: target };
  });

  ipcMain.handle("settings:get", async () => {
    await initRuntime();
    return { config: runtime.settings };
  });

  ipcMain.handle("settings:save", async (_event, payload = {}) => {
    await initRuntime();
    runtime.settings = {
      ...runtime.settings,
      ...payload,
      smtpPort: Number(payload.smtpPort || runtime.settings.smtpPort || 587),
      otaManifestUrl: String(payload.otaManifestUrl ?? runtime.settings.otaManifestUrl ?? ""),
      oneDriveCoverageDir: String(
        payload.oneDriveCoverageDir ?? runtime.settings.oneDriveCoverageDir ?? "",
      ),
      coverageOtaState: normalizeCoverageOtaState(
        payload.coverageOtaState ?? runtime.settings.coverageOtaState ?? {},
      ),
      updatedAt: new Date().toISOString(),
    };
    await saveSettings();
    return { ok: true, config: runtime.settings };
  });
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", async () => {
  if (runtime.coverageStore) {
    await runtime.coverageStore.close();
  }
});
