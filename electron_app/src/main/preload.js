const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("flintApi", {
  getAppMeta: () => ipcRenderer.invoke("platform:get-app-meta"),
});
