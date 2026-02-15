import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("browserAPI", {
  // Window controls
  minimize: () => ipcRenderer.send("window:minimize"),
  maximize: () => ipcRenderer.send("window:maximize"),
  close: () => ipcRenderer.send("window:close"),
  isMaximized: () => ipcRenderer.invoke("window:isMaximized"),

  // Navigation
  resolveUrl: (input: string) => ipcRenderer.invoke("nav:resolveUrl", input),

  // Bookmarks
  bookmarks: {
    getAll: () => ipcRenderer.invoke("bookmarks:getAll"),
    add: (url: string, title: string) => ipcRenderer.invoke("bookmarks:add", url, title),
    remove: (url: string) => ipcRenderer.invoke("bookmarks:remove", url),
    isBookmarked: (url: string) => ipcRenderer.invoke("bookmarks:isBookmarked", url),
  },

  // History
  history: {
    getAll: () => ipcRenderer.invoke("history:getAll"),
    add: (url: string, title: string) => ipcRenderer.invoke("history:add", url, title),
    clear: () => ipcRenderer.invoke("history:clear"),
    search: (query: string) => ipcRenderer.invoke("history:search", query),
  },

  // Settings
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    update: (partial: Record<string, unknown>) => ipcRenderer.invoke("settings:update", partial),
  },

  // Session
  session: {
    get: () => ipcRenderer.invoke("session:get"),
    save: (tabs: Array<{ url: string; title: string }>) => ipcRenderer.send("session:save", tabs),
  },

  // Downloads
  downloads: {
    getAll: () => ipcRenderer.invoke("downloads:getAll"),
    clear: () => ipcRenderer.invoke("downloads:clear"),
    onStarted: (cb: (item: unknown) => void) => ipcRenderer.on("download:started", (_e, item) => cb(item)),
    onUpdated: (cb: (item: unknown) => void) => ipcRenderer.on("download:updated", (_e, item) => cb(item)),
    onDone: (cb: (item: unknown) => void) => ipcRenderer.on("download:done", (_e, item) => cb(item)),
  },

  // DevTools
  devtools: {
    toggle: () => ipcRenderer.send("devtools:toggle"),
    onToggleWebview: (cb: () => void) => ipcRenderer.on("devtools:toggleWebview", () => cb()),
  },

  // Profiles
  profiles: {
    getAll: () => ipcRenderer.invoke("profiles:getAll"),
    getActive: () => ipcRenderer.invoke("profiles:getActive"),
    create: (name: string, avatar: string) => ipcRenderer.invoke("profiles:create", name, avatar),
    delete: (id: string) => ipcRenderer.invoke("profiles:delete", id),
    switch: (id: string) => ipcRenderer.invoke("profiles:switch", id),
  },

  // Auth
  auth: {
    getState: () => ipcRenderer.invoke("auth:getState"),
    register: (email: string, password: string) => ipcRenderer.invoke("auth:register", email, password),
    login: (email: string, password: string) => ipcRenderer.invoke("auth:login", email, password),
    logout: () => ipcRenderer.invoke("auth:logout"),
    getSSOProviders: () => ipcRenderer.invoke("auth:getSSOProviders"),
  },

  // Search (SERP)
  search: {
    query: (q: string) => ipcRenderer.invoke("search:query", q),
  },
});
