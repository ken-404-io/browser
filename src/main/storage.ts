import { app } from "electron";
import * as fs from "fs";
import * as path from "path";

const dataDir = path.join(app.getPath("userData"), "browser-data");

function ensureDir(): void {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function filePath(name: string): string {
  ensureDir();
  return path.join(dataDir, `${name}.json`);
}

function readJSON<T>(name: string, fallback: T): T {
  try {
    const raw = fs.readFileSync(filePath(name), "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJSON<T>(name: string, data: T): void {
  fs.writeFileSync(filePath(name), JSON.stringify(data, null, 2), "utf-8");
}

// --- Bookmarks ---

export interface Bookmark {
  url: string;
  title: string;
  addedAt: number;
}

export function getBookmarks(): Bookmark[] {
  return readJSON<Bookmark[]>("bookmarks", []);
}

export function addBookmark(url: string, title: string): Bookmark[] {
  const bookmarks = getBookmarks();
  if (!bookmarks.some((b) => b.url === url)) {
    bookmarks.push({ url, title, addedAt: Date.now() });
    writeJSON("bookmarks", bookmarks);
  }
  return bookmarks;
}

export function removeBookmark(url: string): Bookmark[] {
  let bookmarks = getBookmarks();
  bookmarks = bookmarks.filter((b) => b.url !== url);
  writeJSON("bookmarks", bookmarks);
  return bookmarks;
}

export function isBookmarked(url: string): boolean {
  return getBookmarks().some((b) => b.url === url);
}

// --- History ---

export interface HistoryEntry {
  url: string;
  title: string;
  visitedAt: number;
}

export function getHistory(): HistoryEntry[] {
  return readJSON<HistoryEntry[]>("history", []);
}

export function addHistoryEntry(url: string, title: string): void {
  const history = getHistory();
  history.unshift({ url, title, visitedAt: Date.now() });
  // Keep last 1000 entries
  if (history.length > 1000) {
    history.length = 1000;
  }
  writeJSON("history", history);
}

export function clearHistory(): void {
  writeJSON("history", []);
}

export function searchHistory(query: string): HistoryEntry[] {
  const q = query.toLowerCase();
  return getHistory().filter(
    (h) => h.url.toLowerCase().includes(q) || h.title.toLowerCase().includes(q)
  );
}

// --- Settings ---

export interface Settings {
  searchEngine: "google" | "duckduckgo" | "bing";
  adBlockEnabled: boolean;
  restoreSession: boolean;
}

const defaultSettings: Settings = {
  searchEngine: "google",
  adBlockEnabled: true,
  restoreSession: true,
};

export function getSettings(): Settings {
  return { ...defaultSettings, ...readJSON<Partial<Settings>>("settings", {}) };
}

export function updateSettings(partial: Partial<Settings>): Settings {
  const settings = { ...getSettings(), ...partial };
  writeJSON("settings", settings);
  return settings;
}

// --- Session ---

export interface SessionTab {
  url: string;
  title: string;
}

export function saveSession(sessionTabs: SessionTab[]): void {
  writeJSON("session", sessionTabs);
}

export function getSession(): SessionTab[] {
  return readJSON<SessionTab[]>("session", []);
}

// --- Downloads ---

export interface DownloadItem {
  id: string;
  filename: string;
  url: string;
  savePath: string;
  totalBytes: number;
  receivedBytes: number;
  state: "progressing" | "completed" | "cancelled" | "interrupted";
  startedAt: number;
}

export function getDownloads(): DownloadItem[] {
  return readJSON<DownloadItem[]>("downloads", []);
}

export function saveDownload(item: DownloadItem): void {
  const downloads = getDownloads();
  const idx = downloads.findIndex((d) => d.id === item.id);
  if (idx >= 0) {
    downloads[idx] = item;
  } else {
    downloads.unshift(item);
  }
  // Keep last 100
  if (downloads.length > 100) {
    downloads.length = 100;
  }
  writeJSON("downloads", downloads);
}

export function clearDownloads(): void {
  writeJSON("downloads", []);
}
