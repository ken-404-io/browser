// Type declarations for the preload API
interface BookmarkData {
  url: string;
  title: string;
  addedAt: number;
}

interface HistoryData {
  url: string;
  title: string;
  visitedAt: number;
}

interface SettingsData {
  searchEngine: "google" | "duckduckgo" | "bing";
  adBlockEnabled: boolean;
  restoreSession: boolean;
}

interface DownloadData {
  id: string;
  filename: string;
  url: string;
  savePath: string;
  totalBytes: number;
  receivedBytes: number;
  state: "progressing" | "completed" | "cancelled" | "interrupted";
  startedAt: number;
}

declare global {
  interface Window {
    browserAPI: {
      minimize: () => void;
      maximize: () => void;
      close: () => void;
      isMaximized: () => Promise<boolean>;
      resolveUrl: (input: string) => Promise<string>;
      bookmarks: {
        getAll: () => Promise<BookmarkData[]>;
        add: (url: string, title: string) => Promise<BookmarkData[]>;
        remove: (url: string) => Promise<BookmarkData[]>;
        isBookmarked: (url: string) => Promise<boolean>;
      };
      history: {
        getAll: () => Promise<HistoryData[]>;
        add: (url: string, title: string) => Promise<void>;
        clear: () => Promise<void>;
        search: (query: string) => Promise<HistoryData[]>;
      };
      settings: {
        get: () => Promise<SettingsData>;
        update: (partial: Record<string, unknown>) => Promise<SettingsData>;
      };
      session: {
        get: () => Promise<Array<{ url: string; title: string }>>;
        save: (tabs: Array<{ url: string; title: string }>) => void;
      };
      downloads: {
        getAll: () => Promise<DownloadData[]>;
        clear: () => Promise<void>;
        onStarted: (cb: (item: DownloadData) => void) => void;
        onUpdated: (cb: (item: DownloadData) => void) => void;
        onDone: (cb: (item: DownloadData) => void) => void;
      };
      devtools: {
        toggle: () => void;
        onToggleWebview: (cb: () => void) => void;
      };
    };
  }
}

// --- Tab State ---

interface Tab {
  id: string;
  title: string;
  url: string;
  webview: Electron.WebviewTag | null;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
}

const tabs: Map<string, Tab> = new Map();
let activeTabId: string | null = null;

// --- DOM references ---

const tabsContainer = document.getElementById("tabs-container")!;
const webviewContainer = document.getElementById("webview-container")!;
const newTabPage = document.getElementById("new-tab-page")!;
const urlBar = document.getElementById("url-bar") as HTMLInputElement;
const ntpSearchInput = document.getElementById("ntp-search-input") as HTMLInputElement;
const btnBack = document.getElementById("btn-back") as HTMLButtonElement;
const btnForward = document.getElementById("btn-forward") as HTMLButtonElement;
const btnReload = document.getElementById("btn-reload") as HTMLButtonElement;
const omniboxIcon = document.getElementById("omnibox-icon")!;
const iconSearch = document.getElementById("icon-search")! as unknown as SVGElement;
const iconLock = document.getElementById("icon-lock")! as unknown as SVGElement;
const btnBookmark = document.getElementById("btn-bookmark")!;
const bookmarksBar = document.getElementById("bookmarks-bar")!;
const findBar = document.getElementById("find-bar")!;
const findInput = document.getElementById("find-input") as HTMLInputElement;
const findMatches = document.getElementById("find-matches")!;
const contextMenu = document.getElementById("context-menu")!;
const panelOverlay = document.getElementById("panel-overlay")!;
const downloadsPanel = document.getElementById("downloads-panel")!;
const downloadsList = document.getElementById("downloads-list")!;
const historyPanel = document.getElementById("history-panel")!;
const historyList = document.getElementById("history-list")!;
const historySearch = document.getElementById("history-search") as HTMLInputElement;
const settingsPanel = document.getElementById("settings-panel")!;

// --- Utility ---

function generateId(): string {
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getActiveTab(): Tab | null {
  if (!activeTabId) return null;
  return tabs.get(activeTabId) ?? null;
}

function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString();
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

// --- Tab Management ---

function createTab(url?: string): void {
  const id = generateId();
  const tab: Tab = {
    id,
    title: "New Tab",
    url: url ?? "",
    webview: null,
    isLoading: false,
    canGoBack: false,
    canGoForward: false,
  };

  tabs.set(id, tab);

  const tabEl = document.createElement("div");
  tabEl.className = "tab";
  tabEl.dataset.tabId = id;
  tabEl.innerHTML = `
    <div class="tab-favicon" style="display:none"></div>
    <span class="tab-title">New Tab</span>
    <button class="tab-close" title="Close tab">
      <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
    </button>
  `;

  tabEl.addEventListener("click", (e) => {
    if (!(e.target as HTMLElement).closest(".tab-close")) {
      switchTab(id);
    }
  });

  tabEl.querySelector(".tab-close")!.addEventListener("click", (e) => {
    e.stopPropagation();
    closeTab(id);
  });

  tabsContainer.appendChild(tabEl);
  switchTab(id);

  if (url) {
    navigateTo(url);
  }
}

function switchTab(id: string): void {
  const tab = tabs.get(id);
  if (!tab) return;

  activeTabId = id;

  tabsContainer.querySelectorAll(".tab").forEach((el) => {
    el.classList.toggle("active", (el as HTMLElement).dataset.tabId === id);
  });

  webviewContainer.querySelectorAll("webview").forEach((wv) => {
    wv.classList.toggle("active", (wv as HTMLElement).dataset.tabId === id);
  });

  urlBar.value = tab.url;
  btnBack.disabled = !tab.canGoBack;
  btnForward.disabled = !tab.canGoForward;
  updateSecurityIcon(tab.url);
  updateBookmarkButton(tab.url);

  const showNtp = !tab.webview;
  newTabPage.classList.toggle("visible", showNtp);

  if (showNtp) {
    urlBar.value = "";
  }

  closeFindBar();
}

function closeTab(id: string): void {
  const tab = tabs.get(id);
  if (!tab) return;

  if (tab.webview) {
    tab.webview.remove();
  }

  const tabEl = tabsContainer.querySelector(`[data-tab-id="${id}"]`);
  tabEl?.remove();

  tabs.delete(id);

  if (tabs.size === 0) {
    createTab();
  } else if (activeTabId === id) {
    const remaining = Array.from(tabs.keys());
    switchTab(remaining[remaining.length - 1]!);
  }

  saveCurrentSession();
}

function updateTabTitle(id: string, title: string): void {
  const tab = tabs.get(id);
  if (!tab) return;
  tab.title = title;

  const tabEl = tabsContainer.querySelector(`[data-tab-id="${id}"]`);
  const titleEl = tabEl?.querySelector(".tab-title");
  if (titleEl) {
    titleEl.textContent = title;
  }
}

function updateTabLoading(id: string, isLoading: boolean): void {
  const tab = tabs.get(id);
  if (!tab) return;
  tab.isLoading = isLoading;

  const tabEl = tabsContainer.querySelector(`[data-tab-id="${id}"]`);
  if (!tabEl) return;

  const favicon = tabEl.querySelector(".tab-favicon") as HTMLElement;
  const existingSpinner = tabEl.querySelector(".tab-loading");

  if (isLoading) {
    favicon.style.display = "none";
    if (!existingSpinner) {
      const spinner = document.createElement("div");
      spinner.className = "tab-loading";
      tabEl.insertBefore(spinner, tabEl.firstChild);
    }
  } else {
    existingSpinner?.remove();
    favicon.style.display = "none";
  }
}

function updateTabFavicon(id: string, favicons: string[]): void {
  const tabEl = tabsContainer.querySelector(`[data-tab-id="${id}"]`);
  if (!tabEl) return;

  const faviconEl = tabEl.querySelector(".tab-favicon") as HTMLElement;
  if (favicons.length > 0 && favicons[0]) {
    faviconEl.style.display = "block";
    faviconEl.style.backgroundImage = `url(${favicons[0]})`;
    faviconEl.style.backgroundSize = "cover";
  }
}

// --- Navigation ---

async function navigateTo(input: string): Promise<void> {
  const tab = getActiveTab();
  if (!tab) return;

  const url = await window.browserAPI.resolveUrl(input);
  tab.url = url;

  if (!tab.webview) {
    const webview = document.createElement("webview") as Electron.WebviewTag;
    webview.dataset.tabId = tab.id;
    webview.setAttribute("src", url);
    webview.setAttribute("autosize", "on");
    webview.classList.add("active");

    attachWebviewEvents(webview, tab.id);
    webviewContainer.appendChild(webview);
    tab.webview = webview;
    newTabPage.classList.remove("visible");
  } else {
    tab.webview.loadURL(url);
  }

  urlBar.value = url;
  updateSecurityIcon(url);
  updateBookmarkButton(url);
}

function attachWebviewEvents(webview: Electron.WebviewTag, tabId: string): void {
  webview.addEventListener("did-start-loading", () => {
    updateTabLoading(tabId, true);
  });

  webview.addEventListener("did-stop-loading", () => {
    updateTabLoading(tabId, false);
  });

  webview.addEventListener("page-title-updated", (e: Event) => {
    const wvEvent = e as WebviewEvent;
    updateTabTitle(tabId, wvEvent.title);
    const tab = tabs.get(tabId);
    if (tab) {
      window.browserAPI.history.add(tab.url, wvEvent.title);
      saveCurrentSession();
    }
  });

  webview.addEventListener("page-favicon-updated", (e: Event) => {
    updateTabFavicon(tabId, (e as WebviewEvent).favicons);
  });

  webview.addEventListener("did-navigate", (e: Event) => {
    const tab = tabs.get(tabId);
    if (!tab || !tab.webview) return;
    tab.url = (e as WebviewEvent).url;
    tab.canGoBack = tab.webview.canGoBack();
    tab.canGoForward = tab.webview.canGoForward();

    if (tabId === activeTabId) {
      urlBar.value = tab.url;
      btnBack.disabled = !tab.canGoBack;
      btnForward.disabled = !tab.canGoForward;
      updateSecurityIcon(tab.url);
      updateBookmarkButton(tab.url);
    }
  });

  webview.addEventListener("did-navigate-in-page", (e: Event) => {
    const tab = tabs.get(tabId);
    if (!tab || !tab.webview) return;
    tab.url = (e as WebviewEvent).url;
    tab.canGoBack = tab.webview.canGoBack();
    tab.canGoForward = tab.webview.canGoForward();

    if (tabId === activeTabId) {
      urlBar.value = tab.url;
      btnBack.disabled = !tab.canGoBack;
      btnForward.disabled = !tab.canGoForward;
    }
  });

  webview.addEventListener("new-window", (e: Event) => {
    createTab((e as WebviewEvent).url);
  });
}

function updateSecurityIcon(url: string): void {
  if (url.startsWith("https://")) {
    iconSearch.style.display = "none";
    iconLock.style.display = "block";
  } else {
    iconSearch.style.display = "block";
    iconLock.style.display = "none";
  }
}

// --- Bookmarks ---

async function updateBookmarkButton(url: string): Promise<void> {
  if (!url) {
    btnBookmark.classList.remove("bookmarked");
    return;
  }
  const isBookmarked = await window.browserAPI.bookmarks.isBookmarked(url);
  btnBookmark.classList.toggle("bookmarked", isBookmarked);
}

async function toggleBookmark(): Promise<void> {
  const tab = getActiveTab();
  if (!tab || !tab.url) return;

  const isBookmarked = await window.browserAPI.bookmarks.isBookmarked(tab.url);
  if (isBookmarked) {
    await window.browserAPI.bookmarks.remove(tab.url);
  } else {
    await window.browserAPI.bookmarks.add(tab.url, tab.title);
  }

  await updateBookmarkButton(tab.url);
  await renderBookmarksBar();
}

async function renderBookmarksBar(): Promise<void> {
  const bookmarks = await window.browserAPI.bookmarks.getAll();
  bookmarksBar.innerHTML = "";

  if (bookmarks.length === 0) {
    bookmarksBar.classList.remove("visible");
    return;
  }

  bookmarksBar.classList.add("visible");

  for (const bm of bookmarks) {
    const item = document.createElement("div");
    item.className = "bookmark-item";
    const displayTitle = bm.title.length > 20 ? bm.title.slice(0, 20) + "..." : bm.title;
    item.textContent = displayTitle;
    item.title = bm.url;
    item.addEventListener("click", () => navigateTo(bm.url));
    bookmarksBar.appendChild(item);
  }
}

// --- History ---

async function renderHistoryPanel(query?: string): Promise<void> {
  const history = query
    ? await window.browserAPI.history.search(query)
    : await window.browserAPI.history.getAll();

  historyList.innerHTML = "";

  if (history.length === 0) {
    historyList.innerHTML = '<div class="panel-empty">No history found</div>';
    return;
  }

  for (const entry of history.slice(0, 100)) {
    const item = document.createElement("div");
    item.className = "panel-list-item";
    item.innerHTML = `
      <span class="panel-item-title">${escapeHtml(entry.title)}</span>
      <span class="panel-item-url">${escapeHtml(entry.url)}</span>
      <span class="panel-item-meta">${formatTime(entry.visitedAt)}</span>
    `;
    item.addEventListener("click", () => {
      navigateTo(entry.url);
      closeAllPanels();
    });
    historyList.appendChild(item);
  }
}

// --- Downloads ---

async function renderDownloadsPanel(): Promise<void> {
  const downloads = await window.browserAPI.downloads.getAll();
  downloadsList.innerHTML = "";

  if (downloads.length === 0) {
    downloadsList.innerHTML = '<div class="panel-empty">No downloads</div>';
    return;
  }

  for (const dl of downloads) {
    downloadsList.appendChild(createDownloadElement(dl));
  }
}

function createDownloadElement(dl: DownloadData): HTMLElement {
  const item = document.createElement("div");
  item.className = "panel-list-item download-item";
  item.dataset.downloadId = dl.id;

  const percent = dl.totalBytes > 0 ? Math.round((dl.receivedBytes / dl.totalBytes) * 100) : 0;
  const statusClass = dl.state === "completed" ? "completed" : dl.state === "cancelled" || dl.state === "interrupted" ? "failed" : "";
  const statusText = dl.state === "progressing"
    ? `${formatBytes(dl.receivedBytes)} / ${formatBytes(dl.totalBytes)} (${percent}%)`
    : dl.state === "completed"
    ? `${formatBytes(dl.totalBytes)} - Complete`
    : `Failed`;

  item.innerHTML = `
    <span class="panel-item-title">${escapeHtml(dl.filename)}</span>
    ${dl.state === "progressing" ? `<div class="download-progress"><div class="download-progress-fill" style="width:${percent}%"></div></div>` : ""}
    <span class="download-status ${statusClass}">${statusText}</span>
  `;
  return item;
}

function updateDownloadInPanel(dl: DownloadData): void {
  const existing = downloadsList.querySelector(`[data-download-id="${dl.id}"]`);
  const newEl = createDownloadElement(dl);
  if (existing) {
    existing.replaceWith(newEl);
  } else {
    downloadsList.prepend(newEl);
    // Remove "No downloads" message if present
    const empty = downloadsList.querySelector(".panel-empty");
    empty?.remove();
  }
}

// --- Settings ---

async function loadSettings(): Promise<void> {
  const settings = await window.browserAPI.settings.get();
  (document.getElementById("setting-search-engine") as HTMLSelectElement).value = settings.searchEngine;
  (document.getElementById("setting-adblock") as HTMLInputElement).checked = settings.adBlockEnabled;
  (document.getElementById("setting-restore-session") as HTMLInputElement).checked = settings.restoreSession;
}

// --- Find in Page ---

let findRequestId = 0;

function openFindBar(): void {
  findBar.classList.add("visible");
  findInput.focus();
  findInput.select();
}

function closeFindBar(): void {
  findBar.classList.remove("visible");
  findInput.value = "";
  findMatches.textContent = "0/0";
  const tab = getActiveTab();
  if (tab?.webview) {
    tab.webview.stopFindInPage("clearSelection");
  }
}

function findInPage(forward: boolean = true): void {
  const tab = getActiveTab();
  const query = findInput.value;
  if (!tab?.webview || !query) return;

  findRequestId = tab.webview.findInPage(query, { forward, findNext: true });
}

// --- Context Menu ---

function showContextMenu(x: number, y: number): void {
  contextMenu.style.left = `${Math.min(x, window.innerWidth - 240)}px`;
  contextMenu.style.top = `${Math.min(y, window.innerHeight - 250)}px`;
  contextMenu.classList.add("visible");
}

function hideContextMenu(): void {
  contextMenu.classList.remove("visible");
}

// --- Panel Management ---

function closeAllPanels(): void {
  downloadsPanel.classList.remove("open");
  historyPanel.classList.remove("open");
  settingsPanel.classList.remove("open");
  panelOverlay.classList.remove("visible");
}

function openPanel(panel: HTMLElement): void {
  closeAllPanels();
  panel.classList.add("open");
  panelOverlay.classList.add("visible");
}

// --- Session Management ---

function saveCurrentSession(): void {
  const sessionTabs: Array<{ url: string; title: string }> = [];
  for (const tab of tabs.values()) {
    if (tab.url) {
      sessionTabs.push({ url: tab.url, title: tab.title });
    }
  }
  window.browserAPI.session.save(sessionTabs);
}

async function restoreSession(): Promise<void> {
  const sessionTabs = await window.browserAPI.session.get();
  if (sessionTabs.length > 0) {
    for (const st of sessionTabs) {
      createTab(st.url);
    }
  } else {
    createTab();
  }
}

// --- Helpers ---

function escapeHtml(str: string): string {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ===========================
// Event Listeners
// ===========================

// Window controls
document.getElementById("btn-minimize")!.addEventListener("click", () => window.browserAPI.minimize());
document.getElementById("btn-maximize")!.addEventListener("click", () => window.browserAPI.maximize());
document.getElementById("btn-close")!.addEventListener("click", () => {
  saveCurrentSession();
  window.browserAPI.close();
});

// New tab
document.getElementById("btn-new-tab")!.addEventListener("click", () => createTab());

// Navigation buttons
btnBack.addEventListener("click", () => {
  const tab = getActiveTab();
  if (tab?.webview?.canGoBack()) tab.webview.goBack();
});

btnForward.addEventListener("click", () => {
  const tab = getActiveTab();
  if (tab?.webview?.canGoForward()) tab.webview.goForward();
});

btnReload.addEventListener("click", () => {
  const tab = getActiveTab();
  if (tab?.webview) {
    if (tab.isLoading) tab.webview.stop();
    else tab.webview.reload();
  }
});

// URL bar
urlBar.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const value = urlBar.value.trim();
    if (value) {
      navigateTo(value);
      urlBar.blur();
    }
  }
});

urlBar.addEventListener("focus", () => urlBar.select());

// NTP search
ntpSearchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const value = ntpSearchInput.value.trim();
    if (value) {
      navigateTo(value);
      ntpSearchInput.value = "";
    }
  }
});

// NTP shortcuts
document.querySelectorAll(".shortcut").forEach((el) => {
  el.addEventListener("click", () => {
    const url = (el as HTMLElement).dataset.url;
    if (url) navigateTo(url);
  });
});

// Bookmark button
btnBookmark.addEventListener("click", () => toggleBookmark());

// Downloads button + panel
document.getElementById("btn-downloads")!.addEventListener("click", () => {
  renderDownloadsPanel();
  openPanel(downloadsPanel);
});
document.getElementById("downloads-panel-close")!.addEventListener("click", closeAllPanels);
document.getElementById("downloads-clear")!.addEventListener("click", async () => {
  await window.browserAPI.downloads.clear();
  renderDownloadsPanel();
});

// History button + panel
document.getElementById("btn-history")!.addEventListener("click", () => {
  renderHistoryPanel();
  openPanel(historyPanel);
});
document.getElementById("history-panel-close")!.addEventListener("click", closeAllPanels);
document.getElementById("history-clear")!.addEventListener("click", async () => {
  await window.browserAPI.history.clear();
  renderHistoryPanel();
});
historySearch.addEventListener("input", () => {
  renderHistoryPanel(historySearch.value.trim() || undefined);
});

// Settings button + panel
document.getElementById("btn-settings")!.addEventListener("click", () => {
  loadSettings();
  openPanel(settingsPanel);
});
document.getElementById("settings-panel-close")!.addEventListener("click", closeAllPanels);

document.getElementById("setting-search-engine")!.addEventListener("change", (e) => {
  window.browserAPI.settings.update({ searchEngine: (e.target as HTMLSelectElement).value });
});
document.getElementById("setting-adblock")!.addEventListener("change", (e) => {
  window.browserAPI.settings.update({ adBlockEnabled: (e.target as HTMLInputElement).checked });
});
document.getElementById("setting-restore-session")!.addEventListener("change", (e) => {
  window.browserAPI.settings.update({ restoreSession: (e.target as HTMLInputElement).checked });
});

// Panel overlay click to close
panelOverlay.addEventListener("click", closeAllPanels);

// Find bar
document.getElementById("find-next")!.addEventListener("click", () => findInPage(true));
document.getElementById("find-prev")!.addEventListener("click", () => findInPage(false));
document.getElementById("find-close")!.addEventListener("click", closeFindBar);
findInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    findInPage(!e.shiftKey);
  } else if (e.key === "Escape") {
    closeFindBar();
  }
});
findInput.addEventListener("input", () => {
  const tab = getActiveTab();
  const query = findInput.value;
  if (!tab?.webview || !query) {
    findMatches.textContent = "0/0";
    return;
  }
  findRequestId = tab.webview.findInPage(query);
});

// Listen for find results on webviews
document.addEventListener("found-in-page", ((e: CustomEvent) => {
  // This doesn't fire on document; we need to listen on each webview
}) as EventListener);

// Context menu
document.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  showContextMenu(e.clientX, e.clientY);
});

document.addEventListener("click", (e) => {
  if (!(e.target as HTMLElement).closest("#context-menu")) {
    hideContextMenu();
  }
});

document.querySelectorAll("#context-menu .menu-item").forEach((item) => {
  item.addEventListener("click", () => {
    const action = (item as HTMLElement).dataset.action;
    const tab = getActiveTab();

    switch (action) {
      case "back":
        if (tab?.webview?.canGoBack()) tab.webview.goBack();
        break;
      case "forward":
        if (tab?.webview?.canGoForward()) tab.webview.goForward();
        break;
      case "reload":
        if (tab?.webview) tab.webview.reload();
        break;
      case "bookmark":
        toggleBookmark();
        break;
      case "find":
        openFindBar();
        break;
      case "devtools":
        if (tab?.webview) {
          if (tab.webview.isDevToolsOpened()) {
            tab.webview.closeDevTools();
          } else {
            tab.webview.openDevTools();
          }
        }
        break;
    }
    hideContextMenu();
  });
});

// Menu button (hamburger) — opens context menu
document.getElementById("btn-menu")!.addEventListener("click", (e) => {
  const rect = (e.target as HTMLElement).closest(".toolbar-btn")!.getBoundingClientRect();
  showContextMenu(rect.right - 220, rect.bottom + 4);
});

// Download events from main process
window.browserAPI.downloads.onStarted((dl) => updateDownloadInPanel(dl));
window.browserAPI.downloads.onUpdated((dl) => updateDownloadInPanel(dl));
window.browserAPI.downloads.onDone((dl) => updateDownloadInPanel(dl));

// DevTools toggle from main process
window.browserAPI.devtools.onToggleWebview(() => {
  const tab = getActiveTab();
  if (tab?.webview) {
    if (tab.webview.isDevToolsOpened()) {
      tab.webview.closeDevTools();
    } else {
      tab.webview.openDevTools();
    }
  }
});

// Keyboard shortcuts
document.addEventListener("keydown", (e) => {
  // Ctrl+T: New tab
  if (e.ctrlKey && e.key === "t") {
    e.preventDefault();
    createTab();
  }
  // Ctrl+W: Close tab
  if (e.ctrlKey && e.key === "w") {
    e.preventDefault();
    if (activeTabId) closeTab(activeTabId);
  }
  // Ctrl+L: Focus URL bar
  if (e.ctrlKey && e.key === "l") {
    e.preventDefault();
    urlBar.focus();
  }
  // Ctrl+R / F5: Reload
  if ((e.ctrlKey && e.key === "r") || e.key === "F5") {
    e.preventDefault();
    const tab = getActiveTab();
    if (tab?.webview) tab.webview.reload();
  }
  // Ctrl+D: Bookmark
  if (e.ctrlKey && e.key === "d") {
    e.preventDefault();
    toggleBookmark();
  }
  // Ctrl+F: Find in page
  if (e.ctrlKey && e.key === "f") {
    e.preventDefault();
    openFindBar();
  }
  // Ctrl+H: History
  if (e.ctrlKey && e.key === "h") {
    e.preventDefault();
    renderHistoryPanel();
    openPanel(historyPanel);
  }
  // Ctrl+J: Downloads
  if (e.ctrlKey && e.key === "j") {
    e.preventDefault();
    renderDownloadsPanel();
    openPanel(downloadsPanel);
  }
  // Escape: Close panels / find bar / context menu
  if (e.key === "Escape") {
    closeFindBar();
    closeAllPanels();
    hideContextMenu();
  }
  // F12: DevTools
  if (e.key === "F12") {
    e.preventDefault();
    const tab = getActiveTab();
    if (tab?.webview) {
      if (tab.webview.isDevToolsOpened()) {
        tab.webview.closeDevTools();
      } else {
        tab.webview.openDevTools();
      }
    }
  }
  // Alt+Left: Back
  if (e.altKey && e.key === "ArrowLeft") {
    e.preventDefault();
    const tab = getActiveTab();
    if (tab?.webview?.canGoBack()) tab.webview.goBack();
  }
  // Alt+Right: Forward
  if (e.altKey && e.key === "ArrowRight") {
    e.preventDefault();
    const tab = getActiveTab();
    if (tab?.webview?.canGoForward()) tab.webview.goForward();
  }
});

// --- Initialize ---
async function init(): Promise<void> {
  await renderBookmarksBar();
  await restoreSession();
}

init();

export {};
