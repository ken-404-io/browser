// Type declaration for the preload API
declare global {
  interface Window {
    browserAPI: {
      minimize: () => void;
      maximize: () => void;
      close: () => void;
      isMaximized: () => Promise<boolean>;
      resolveUrl: (input: string) => Promise<string>;
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
const securityIcon = document.getElementById("security-icon")!;

// --- Utility ---

function generateId(): string {
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getActiveTab(): Tab | null {
  if (!activeTabId) return null;
  return tabs.get(activeTabId) ?? null;
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

  // Create tab element
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

  // Update tab UI
  tabsContainer.querySelectorAll(".tab").forEach((el) => {
    el.classList.toggle("active", (el as HTMLElement).dataset.tabId === id);
  });

  // Show/hide webviews
  webviewContainer.querySelectorAll("webview").forEach((wv) => {
    wv.classList.toggle("active", (wv as HTMLElement).dataset.tabId === id);
  });

  // Update nav bar state
  urlBar.value = tab.url;
  btnBack.disabled = !tab.canGoBack;
  btnForward.disabled = !tab.canGoForward;
  updateSecurityIcon(tab.url);

  // Show/hide new tab page
  const showNtp = !tab.webview;
  newTabPage.classList.toggle("visible", showNtp);

  if (showNtp) {
    urlBar.value = "";
  }
}

function closeTab(id: string): void {
  const tab = tabs.get(id);
  if (!tab) return;

  // Remove webview
  if (tab.webview) {
    tab.webview.remove();
  }

  // Remove tab element
  const tabEl = tabsContainer.querySelector(`[data-tab-id="${id}"]`);
  tabEl?.remove();

  tabs.delete(id);

  // Switch to another tab or create new one
  if (tabs.size === 0) {
    createTab();
  } else if (activeTabId === id) {
    const remaining = Array.from(tabs.keys());
    switchTab(remaining[remaining.length - 1]!);
  }
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
    // Create webview
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
}

function attachWebviewEvents(webview: Electron.WebviewTag, tabId: string): void {
  webview.addEventListener("did-start-loading", () => {
    updateTabLoading(tabId, true);
  });

  webview.addEventListener("did-stop-loading", () => {
    updateTabLoading(tabId, false);
  });

  webview.addEventListener("page-title-updated", (e) => {
    updateTabTitle(tabId, (e as any).title);
  });

  webview.addEventListener("page-favicon-updated", (e) => {
    updateTabFavicon(tabId, (e as any).favicons);
  });

  webview.addEventListener("did-navigate", (e) => {
    const tab = tabs.get(tabId);
    if (!tab || !tab.webview) return;
    tab.url = (e as any).url;
    tab.canGoBack = tab.webview.canGoBack();
    tab.canGoForward = tab.webview.canGoForward();

    if (tabId === activeTabId) {
      urlBar.value = tab.url;
      btnBack.disabled = !tab.canGoBack;
      btnForward.disabled = !tab.canGoForward;
      updateSecurityIcon(tab.url);
    }
  });

  webview.addEventListener("did-navigate-in-page", (e) => {
    const tab = tabs.get(tabId);
    if (!tab || !tab.webview) return;
    tab.url = (e as any).url;
    tab.canGoBack = tab.webview.canGoBack();
    tab.canGoForward = tab.webview.canGoForward();

    if (tabId === activeTabId) {
      urlBar.value = tab.url;
      btnBack.disabled = !tab.canGoBack;
      btnForward.disabled = !tab.canGoForward;
    }
  });

  webview.addEventListener("new-window", (e) => {
    createTab((e as any).url);
  });
}

function updateSecurityIcon(url: string): void {
  if (url.startsWith("https://")) {
    securityIcon.classList.add("secure");
  } else {
    securityIcon.classList.remove("secure");
  }
}

// --- Event Listeners ---

// Window controls
document.getElementById("btn-minimize")!.addEventListener("click", () => window.browserAPI.minimize());
document.getElementById("btn-maximize")!.addEventListener("click", () => window.browserAPI.maximize());
document.getElementById("btn-close")!.addEventListener("click", () => window.browserAPI.close());

// New tab button
document.getElementById("btn-new-tab")!.addEventListener("click", () => createTab());

// Navigation buttons
btnBack.addEventListener("click", () => {
  const tab = getActiveTab();
  if (tab?.webview?.canGoBack()) {
    tab.webview.goBack();
  }
});

btnForward.addEventListener("click", () => {
  const tab = getActiveTab();
  if (tab?.webview?.canGoForward()) {
    tab.webview.goForward();
  }
});

btnReload.addEventListener("click", () => {
  const tab = getActiveTab();
  if (tab?.webview) {
    if (tab.isLoading) {
      tab.webview.stop();
    } else {
      tab.webview.reload();
    }
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

urlBar.addEventListener("focus", () => {
  urlBar.select();
});

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
    if (url) {
      navigateTo(url);
    }
  });
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
createTab();

export {};
