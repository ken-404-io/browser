import { app } from "electron";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

// ============================================
// Encryption Layer
// ============================================

const ALGORITHM = "aes-256-gcm";

function getAppKey(): Buffer {
  const keyPath = path.join(app.getPath("userData"), ".browser-key");
  if (fs.existsSync(keyPath)) {
    return Buffer.from(fs.readFileSync(keyPath, "utf-8").trim(), "hex");
  }
  const key = crypto.randomBytes(32);
  fs.writeFileSync(keyPath, key.toString("hex"), "utf-8");
  return key;
}

export function encryptData(data: string): string {
  const key = getAppKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(data, "utf-8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted}`;
}

export function decryptData(encryptedStr: string): string {
  const key = getAppKey();
  const parts = encryptedStr.split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted data");
  const iv = Buffer.from(parts[0]!, "hex");
  const tag = Buffer.from(parts[1]!, "hex");
  const encrypted = parts[2]!;
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(encrypted, "hex", "utf-8");
  decrypted += decipher.final("utf-8");
  return decrypted;
}

// ============================================
// File System Helpers
// ============================================

const baseDataDir = path.join(app.getPath("userData"), "browser-data");
let activeProfileId = "default";

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function profileDir(profileId?: string): string {
  const id = profileId ?? activeProfileId;
  const dir = path.join(baseDataDir, "profiles", id);
  ensureDir(dir);
  return dir;
}

function globalPath(name: string): string {
  ensureDir(baseDataDir);
  return path.join(baseDataDir, `${name}.json`);
}

function profilePath(name: string, profileId?: string): string {
  return path.join(profileDir(profileId), `${name}.json`);
}

function readJSON<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function writeJSON<T>(filePath: string, data: T): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

function readEncrypted<T>(filePath: string, fallback: T): T {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(decryptData(raw)) as T;
  } catch {
    return fallback;
  }
}

function writeEncrypted<T>(filePath: string, data: T): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, encryptData(JSON.stringify(data)), "utf-8");
}

// ============================================
// Profile System
// ============================================

export interface Profile {
  id: string;
  name: string;
  avatar: string;
  createdAt: number;
  isDefault: boolean;
}

export function getProfiles(): Profile[] {
  const profiles = readJSON<Profile[]>(globalPath("profiles"), []);
  if (profiles.length === 0) {
    const def: Profile = { id: "default", name: "Default", avatar: "person", createdAt: Date.now(), isDefault: true };
    writeJSON(globalPath("profiles"), [def]);
    return [def];
  }
  return profiles;
}

export function createProfile(name: string, avatar: string): Profile {
  const profiles = getProfiles();
  const profile: Profile = {
    id: `profile-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    avatar,
    createdAt: Date.now(),
    isDefault: false,
  };
  profiles.push(profile);
  writeJSON(globalPath("profiles"), profiles);
  return profile;
}

export function deleteProfile(id: string): Profile[] {
  if (id === "default") return getProfiles();
  let profiles = getProfiles().filter((p) => p.id !== id);
  writeJSON(globalPath("profiles"), profiles);
  const dir = path.join(baseDataDir, "profiles", id);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  if (activeProfileId === id) activeProfileId = "default";
  return getProfiles();
}

export function switchProfile(id: string): Profile | null {
  const profiles = getProfiles();
  const profile = profiles.find((p) => p.id === id);
  if (!profile) return null;
  activeProfileId = id;
  return profile;
}

export function getActiveProfile(): Profile {
  const profiles = getProfiles();
  return profiles.find((p) => p.id === activeProfileId) ?? profiles[0]!;
}

// ============================================
// Auth System (Encrypted)
// ============================================

export interface AuthCredentials {
  email: string;
  passwordHash: string;
  salt: string;
  createdAt: number;
}

export interface AuthState {
  isLoggedIn: boolean;
  email: string | null;
  token: string | null;
  profileId: string | null;
}

const authStatePath = () => path.join(baseDataDir, "auth.enc");
const credentialsPath = () => path.join(baseDataDir, "credentials.enc");

export function getAuthState(): AuthState {
  return readEncrypted<AuthState>(authStatePath(), { isLoggedIn: false, email: null, token: null, profileId: null });
}

function saveAuthState(state: AuthState): void {
  writeEncrypted(authStatePath(), state);
}

export function registerUser(email: string, password: string): { success: boolean; error?: string } {
  const creds = readEncrypted<AuthCredentials[]>(credentialsPath(), []);
  if (creds.some((c) => c.email === email)) {
    return { success: false, error: "Email already registered" };
  }
  const salt = crypto.randomBytes(16).toString("hex");
  const passwordHash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  creds.push({ email, passwordHash, salt, createdAt: Date.now() });
  writeEncrypted(credentialsPath(), creds);
  const token = crypto.randomBytes(32).toString("hex");
  saveAuthState({ isLoggedIn: true, email, token, profileId: activeProfileId });
  return { success: true };
}

export function loginUser(email: string, password: string): { success: boolean; error?: string } {
  const creds = readEncrypted<AuthCredentials[]>(credentialsPath(), []);
  const user = creds.find((c) => c.email === email);
  if (!user) return { success: false, error: "Invalid email or password" };
  const hash = crypto.pbkdf2Sync(password, user.salt, 100000, 64, "sha512").toString("hex");
  if (hash !== user.passwordHash) return { success: false, error: "Invalid email or password" };
  const token = crypto.randomBytes(32).toString("hex");
  saveAuthState({ isLoggedIn: true, email, token, profileId: activeProfileId });
  return { success: true };
}

export function logoutUser(): void {
  saveAuthState({ isLoggedIn: false, email: null, token: null, profileId: null });
}

// SSO scaffold - returns provider URLs for OAuth flow
export function getSSOProviders(): Array<{ id: string; name: string; authUrl: string }> {
  return [
    { id: "google", name: "Google", authUrl: "https://accounts.google.com/o/oauth2/v2/auth" },
    { id: "github", name: "GitHub", authUrl: "https://github.com/login/oauth/authorize" },
    { id: "microsoft", name: "Microsoft", authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize" },
  ];
}

// ============================================
// Bookmarks (per-profile)
// ============================================

export interface Bookmark {
  url: string;
  title: string;
  addedAt: number;
}

export function getBookmarks(): Bookmark[] {
  return readJSON<Bookmark[]>(profilePath("bookmarks"), []);
}

export function addBookmark(url: string, title: string): Bookmark[] {
  const bookmarks = getBookmarks();
  if (!bookmarks.some((b) => b.url === url)) {
    bookmarks.push({ url, title, addedAt: Date.now() });
    writeJSON(profilePath("bookmarks"), bookmarks);
  }
  return bookmarks;
}

export function removeBookmark(url: string): Bookmark[] {
  let bookmarks = getBookmarks().filter((b) => b.url !== url);
  writeJSON(profilePath("bookmarks"), bookmarks);
  return bookmarks;
}

export function isBookmarked(url: string): boolean {
  return getBookmarks().some((b) => b.url === url);
}

// ============================================
// History (per-profile)
// ============================================

export interface HistoryEntry {
  url: string;
  title: string;
  visitedAt: number;
}

export function getHistory(): HistoryEntry[] {
  return readJSON<HistoryEntry[]>(profilePath("history"), []);
}

export function addHistoryEntry(url: string, title: string): void {
  const history = getHistory();
  history.unshift({ url, title, visitedAt: Date.now() });
  if (history.length > 1000) history.length = 1000;
  writeJSON(profilePath("history"), history);
}

export function clearHistory(): void {
  writeJSON(profilePath("history"), []);
}

export function searchHistory(query: string): HistoryEntry[] {
  const q = query.toLowerCase();
  return getHistory().filter(
    (h) => h.url.toLowerCase().includes(q) || h.title.toLowerCase().includes(q)
  );
}

// ============================================
// Settings (per-profile)
// ============================================

export interface Settings {
  searchEngine: "duckduckgo" | "bing";
  adBlockEnabled: boolean;
  restoreSession: boolean;
}

const defaultSettings: Settings = {
  searchEngine: "duckduckgo",
  adBlockEnabled: true,
  restoreSession: true,
};

export function getSettings(): Settings {
  return { ...defaultSettings, ...readJSON<Partial<Settings>>(profilePath("settings"), {}) };
}

export function updateSettings(partial: Partial<Settings>): Settings {
  const settings = { ...getSettings(), ...partial };
  writeJSON(profilePath("settings"), settings);
  return settings;
}

// ============================================
// Session (per-profile)
// ============================================

export interface SessionTab {
  url: string;
  title: string;
}

export function saveSession(sessionTabs: SessionTab[]): void {
  writeJSON(profilePath("session"), sessionTabs);
}

export function getSession(): SessionTab[] {
  return readJSON<SessionTab[]>(profilePath("session"), []);
}

// ============================================
// Downloads (per-profile)
// ============================================

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
  return readJSON<DownloadItem[]>(profilePath("downloads"), []);
}

export function saveDownload(item: DownloadItem): void {
  const downloads = getDownloads();
  const idx = downloads.findIndex((d) => d.id === item.id);
  if (idx >= 0) downloads[idx] = item;
  else downloads.unshift(item);
  if (downloads.length > 100) downloads.length = 100;
  writeJSON(profilePath("downloads"), downloads);
}

export function clearDownloads(): void {
  writeJSON(profilePath("downloads"), []);
}
