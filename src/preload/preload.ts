import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("browserAPI", {
  // Window controls
  minimize: () => ipcRenderer.send("window:minimize"),
  maximize: () => ipcRenderer.send("window:maximize"),
  close: () => ipcRenderer.send("window:close"),
  isMaximized: () => ipcRenderer.invoke("window:isMaximized"),

  // Navigation
  resolveUrl: (input: string) => ipcRenderer.invoke("nav:resolveUrl", input),
});
