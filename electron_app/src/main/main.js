const { app, BrowserWindow, ipcMain } = require("electron");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("path");
const {
  sanitizeFileName,
  extractSupplierCode,
  makeSubject,
  toCsvCell,
} = require("./services/domain-utils");

const isDev = !!process.env.VITE_DEV_SERVER_URL;
const MAIL_PERSIST_SUBDIR = "mail_uploads";
const INBOUND_PERSIST_SUBDIR = "inbound_uploads";

const runtime = {
  ready: false,
  dataDir: "",
  logsDir: "",
  mailUploadDir: "",
  inboundUploadDir: "",
  mailStoreFile: "",
  inboundUploadStoreFile: "",
  inboundLastReviewStoreFile: "",
  supplierStoreFile: "",
  settingsStoreFile: "",
  mailTasks: [],
  inboundUploads: [],
  inboundLastReview: null,
  suppliers: [],
  settings: null,
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
  updatedAt: "",
};

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 1100,
    minHeight: 760,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
    win.webContents.openDevTools({ mode: "detach" });
    return;
  }

  win.loadFile(path.join(__dirname, "../../dist/renderer/index.html"));
}

async function readJsonFile(filePath, fallbackValue) {
  if (!fs.existsSync(filePath)) {
    await fsp.writeFile(filePath, JSON.stringify(fallbackValue, null, 2), "utf-8");
    return fallbackValue;
  }
  try {
    const raw = await fsp.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    return parsed;
  } catch {
    await fsp.writeFile(filePath, JSON.stringify(fallbackValue, null, 2), "utf-8");
    return fallbackValue;
  }
}

async function writeJsonFile(filePath, payload) {
  await fsp.writeFile(filePath, JSON.stringify(payload, null, 2), "utf-8");
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

  runtime.dataDir = path.join(app.getPath("userData"), "data");
  runtime.logsDir = path.join(runtime.dataDir, "logs");
  runtime.mailUploadDir = path.join(runtime.dataDir, MAIL_PERSIST_SUBDIR);
  runtime.inboundUploadDir = path.join(runtime.dataDir, INBOUND_PERSIST_SUBDIR);

  runtime.mailStoreFile = path.join(runtime.dataDir, "mail_tasks.json");
  runtime.inboundUploadStoreFile = path.join(runtime.dataDir, "inbound_uploads.json");
  runtime.inboundLastReviewStoreFile = path.join(runtime.dataDir, "inbound_last_review.json");
  runtime.supplierStoreFile = path.join(runtime.dataDir, "suppliers.json");
  runtime.settingsStoreFile = path.join(runtime.dataDir, "settings.json");

  fs.mkdirSync(runtime.dataDir, { recursive: true });
  fs.mkdirSync(runtime.logsDir, { recursive: true });
  fs.mkdirSync(runtime.mailUploadDir, { recursive: true });
  fs.mkdirSync(runtime.inboundUploadDir, { recursive: true });

  runtime.mailTasks = await readJsonFile(runtime.mailStoreFile, []);
  runtime.inboundUploads = await readJsonFile(runtime.inboundUploadStoreFile, []);
  runtime.inboundLastReview = await readJsonFile(runtime.inboundLastReviewStoreFile, null);
  runtime.suppliers = await readJsonFile(runtime.supplierStoreFile, DEFAULT_SUPPLIERS);
  runtime.settings = await readJsonFile(runtime.settingsStoreFile, DEFAULT_SETTINGS);
  runtime.ready = true;
}

async function saveMailTasks() {
  await writeJsonFile(runtime.mailStoreFile, runtime.mailTasks);
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
  await writeJsonFile(runtime.inboundUploadStoreFile, runtime.inboundUploads);
}

async function saveInboundLastReview() {
  await writeJsonFile(runtime.inboundLastReviewStoreFile, runtime.inboundLastReview);
}

async function saveSuppliers() {
  await writeJsonFile(runtime.supplierStoreFile, runtime.suppliers);
}

async function saveSettings() {
  await writeJsonFile(runtime.settingsStoreFile, runtime.settings);
}

function generateInboundRows(fileName, indexSeed) {
  const issueSets = [
    ["供应商编码不一致", "Inbound方式错误"],
    ["缺少必填字段"],
    ["运输距离超限", "VMI规则冲突"],
    ["白名单外组合"],
  ];

  return [
    {
      file: fileName,
      line: 10 + indexSeed,
      plant: ["WUH", "NAN", "SHA", "HUB"][indexSeed % 4],
      supplierCode: String(10000 + ((indexSeed * 37) % 90000)),
      supplierName: ["ACME Corp", "东方精密", "联创供应", "星河工业"][indexSeed % 4],
      partNo: `P-${String(indexSeed + 1000)}`,
      partName: ["前桥总成", "稳定杆", "转向节", "悬挂臂"][indexSeed % 4],
      tags: issueSets[indexSeed % issueSets.length],
    },
  ];
}

function normalizeSupplierCode(code) {
  return String(code || "").trim();
}

function registerIpcHandlers() {
  ipcMain.handle("platform:get-app-meta", async () => {
    await initRuntime();
    return {
      name: "Flint",
      stack: "Electron + Vue",
      phase: "mvp-ipc",
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

    for (let idx = 0; idx < files.length; idx += 1) {
      const file = files[idx] || {};
      const fileName = file.name || `unknown_${idx}`;
      const targetName = `${now}_${idx}_${sanitizeFileName(fileName)}`;
      const storedPath = path.join(runtime.inboundUploadDir, targetName);
      if (file.path && fs.existsSync(file.path)) {
        try {
          await fsp.copyFile(file.path, storedPath);
        } catch {
          // best-effort
        }
      }
      created.push({
        id: `inbound_${now}_${idx}_${Math.random().toString(36).slice(2, 8)}`,
        fileName,
        storedPath,
        originalPath: file.path || "",
        uploadedAt: new Date().toISOString(),
      });
    }

    runtime.inboundUploads = [...runtime.inboundUploads, ...created];
    await saveInboundUploads();
    return { files: runtime.inboundUploads };
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

    const rows = [];
    targets.forEach((file, idx) => {
      rows.push(...generateInboundRows(file.fileName, idx + 1));
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

    const header = ["文件", "行号", "工厂", "供应商号", "供应商名称", "零件号", "零件名称", "问题标签"];
    const lines = [header.map(toCsvCell).join(",")];
    for (const row of rows) {
      lines.push(
        [
          row.file,
          row.line,
          row.plant,
          row.supplierCode,
          row.supplierName,
          row.partNo,
          row.partName,
          Array.isArray(row.tags) ? row.tags.join("|") : "",
        ]
          .map(toCsvCell)
          .join(","),
      );
    }

    const filePath = path.join(runtime.logsDir, `inbound_review_${Date.now()}.csv`);
    await fsp.writeFile(filePath, `${lines.join("\n")}\n`, "utf-8");
    return { filePath };
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
