const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("flintApi", {
  minimizeWindow: () => ipcRenderer.invoke("window:minimize"),
  toggleMaximizeWindow: () => ipcRenderer.invoke("window:toggle-maximize"),
  isWindowMaximized: () => ipcRenderer.invoke("window:is-maximized"),
  closeWindow: () => ipcRenderer.invoke("window:close"),
  onWindowMaximizedChanged: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on("window:maximized-changed", listener);
    return () => ipcRenderer.removeListener("window:maximized-changed", listener);
  },

  getAppMeta: () => ipcRenderer.invoke("platform:get-app-meta"),
  checkForUpdate: (manifestUrl) => ipcRenderer.invoke("update:check", { manifestUrl }),
  downloadAndInstallUpdate: (payload) => ipcRenderer.invoke("update:download-install", payload),

  inboundUploadFiles: (files) => ipcRenderer.invoke("inbound:upload-files", { files }),
  inboundGetUploads: () => ipcRenderer.invoke("inbound:get-uploads"),
  inboundRemoveUpload: (id) => ipcRenderer.invoke("inbound:remove-upload", { id }),
  inboundStartReview: (fileIds) => ipcRenderer.invoke("inbound:start-review", { fileIds }),
  inboundGetLastReview: () => ipcRenderer.invoke("inbound:get-last-review"),
  inboundExportCsv: (rows) => ipcRenderer.invoke("inbound:export-csv", { rows }),
  onInboundReviewCompleted: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on("inbound:review-completed", listener);
    return () => ipcRenderer.removeListener("inbound:review-completed", listener);
  },

  mailUploadFiles: (files) => ipcRenderer.invoke("mail:upload-files", { files }),
  mailGetTasks: (hideSent) => ipcRenderer.invoke("mail:get-tasks", { hideSent }),
  mailStartSend: (taskIds, subjectPrefix) =>
    ipcRenderer.invoke("mail:start-send", { taskIds, subjectPrefix }),
  mailDeleteTasks: (taskIds, deleteFiles = true) =>
    ipcRenderer.invoke("mail:delete-tasks", { taskIds, deleteFiles }),
  onMailQueueProgress: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on("mail:queue-progress", listener);
    return () => ipcRenderer.removeListener("mail:queue-progress", listener);
  },
  onMailQueueCompleted: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on("mail:queue-completed", listener);
    return () => ipcRenderer.removeListener("mail:queue-completed", listener);
  },

  supplierGetList: () => ipcRenderer.invoke("supplier:get-list"),
  supplierCreate: (payload) => ipcRenderer.invoke("supplier:create", payload),
  supplierUpdate: (payload) => ipcRenderer.invoke("supplier:update", payload),
  supplierUpdateStatus: (code, enabled) => ipcRenderer.invoke("supplier:update-status", { code, enabled }),
  onSupplierListUpdated: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on("supplier:list-updated", listener);
    return () => ipcRenderer.removeListener("supplier:list-updated", listener);
  },

  settingsGet: () => ipcRenderer.invoke("settings:get"),
  settingsSave: (payload) => ipcRenderer.invoke("settings:save", payload),
});
