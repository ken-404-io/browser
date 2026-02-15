import { app, BrowserWindow, ipcMain, session, Menu, dialog } from "electron";
import * as path from "path";
import {
  getBookmarks, addBookmark, removeBookmark, isBookmarked,
  getHistory, addHistoryEntry, clearHistory, searchHistory,
  getSettings, updateSettings,
  saveSession, getSession,
  getDownloads, saveDownload, clearDownloads,
  type DownloadItem, type Settings,
} from "./storage";

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    titleBarStyle: "hidden",
    backgroundColor: "#1a1a2e",
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "..", "renderer", "index.html"));

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// --- Window control IPC ---
ipcMain.on("window:minimize", () => mainWindow?.minimize());
ipcMain.on("window:maximize", () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});
ipcMain.on("window:close", () => mainWindow?.close());
ipcMain.handle("window:isMaximized", () => mainWindow?.isMaximized() ?? false);

// --- Navigation IPC ---
ipcMain.handle("nav:resolveUrl", (_event, input: string): string => {
  const settings = getSettings();
  const trimmed = input.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (/^[a-zA-Z0-9-]+(\.[a-zA-Z]{2,})+/.test(trimmed)) {
    return `https://${trimmed}`;
  }
  const searchUrls: Record<Settings["searchEngine"], string> = {
    duckduckgo: "https://duckduckgo.com/?q=",
    bing: "https://www.bing.com/search?q=",
  };
  return `${searchUrls[settings.searchEngine]}${encodeURIComponent(trimmed)}`;
});

// --- Bookmarks IPC ---
ipcMain.handle("bookmarks:getAll", () => getBookmarks());
ipcMain.handle("bookmarks:add", (_e, url: string, title: string) => addBookmark(url, title));
ipcMain.handle("bookmarks:remove", (_e, url: string) => removeBookmark(url));
ipcMain.handle("bookmarks:isBookmarked", (_e, url: string) => isBookmarked(url));

// --- History IPC ---
ipcMain.handle("history:getAll", () => getHistory());
ipcMain.handle("history:add", (_e, url: string, title: string) => addHistoryEntry(url, title));
ipcMain.handle("history:clear", () => clearHistory());
ipcMain.handle("history:search", (_e, query: string) => searchHistory(query));

// --- Settings IPC ---
ipcMain.handle("settings:get", () => getSettings());
ipcMain.handle("settings:update", (_e, partial: Partial<Settings>) => updateSettings(partial));

// --- Session IPC ---
ipcMain.handle("session:get", () => {
  const settings = getSettings();
  if (!settings.restoreSession) return [];
  return getSession();
});
ipcMain.on("session:save", (_e, tabs: Array<{ url: string; title: string }>) => {
  saveSession(tabs);
});

// --- Downloads IPC ---
ipcMain.handle("downloads:getAll", () => getDownloads());
ipcMain.handle("downloads:clear", () => clearDownloads());

// Track active downloads for progress updates
const activeDownloads = new Map<string, Electron.DownloadItem>();

function setupDownloadHandler(): void {
  session.defaultSession.on("will-download", (_event, item) => {
    const id = `dl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const dlItem: DownloadItem = {
      id,
      filename: item.getFilename(),
      url: item.getURL(),
      savePath: item.getSavePath(),
      totalBytes: item.getTotalBytes(),
      receivedBytes: 0,
      state: "progressing",
      startedAt: Date.now(),
    };

    activeDownloads.set(id, item);

    item.on("updated", (_e, state) => {
      dlItem.receivedBytes = item.getReceivedBytes();
      dlItem.totalBytes = item.getTotalBytes();
      dlItem.savePath = item.getSavePath();
      dlItem.state = state === "interrupted" ? "interrupted" : "progressing";
      saveDownload(dlItem);
      mainWindow?.webContents.send("download:updated", dlItem);
    });

    item.once("done", (_e, state) => {
      dlItem.receivedBytes = item.getReceivedBytes();
      dlItem.state = state === "completed" ? "completed" : "cancelled";
      saveDownload(dlItem);
      activeDownloads.delete(id);
      mainWindow?.webContents.send("download:done", dlItem);
    });

    saveDownload(dlItem);
    mainWindow?.webContents.send("download:started", dlItem);
  });
}

// --- Ad-blocking ---
function setupAdBlocking(): void {
  const settings = getSettings();
  if (!settings.adBlockEnabled) return;

  const blockedPatterns = [
    "*://*.doubleclick.net/*",
    "*://*.googlesyndication.com/*",
    "*://*.googleadservices.com/*",
    "*://creative.ak.fbcdn.net/*",
    "*://*.adbrite.com/*",
    "*://*.exponential.com/*",
    "*://*.quantserve.com/*",
    "*://*.scorecardresearch.com/*",
    "*://*.zedo.com/*",
  ];

  session.defaultSession.webRequest.onBeforeRequest(
    { urls: blockedPatterns },
    (_details, callback) => {
      callback({ cancel: true });
    }
  );
}

// --- DevTools IPC ---
ipcMain.on("devtools:toggle", () => {
  mainWindow?.webContents.send("devtools:toggleWebview");
});

// Remove default menu
Menu.setApplicationMenu(null);

app.whenReady().then(() => {
  setupAdBlocking();
  setupDownloadHandler();
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
