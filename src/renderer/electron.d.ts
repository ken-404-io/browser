// Minimal type declarations for Electron webview tag used in the renderer

interface WebviewEvent extends Event {
  url: string;
  title: string;
  favicons: string[];
}

declare namespace Electron {
  interface WebviewTag extends HTMLElement {
    src: string;
    loadURL(url: string): Promise<void>;
    reload(): void;
    stop(): void;
    goBack(): void;
    goForward(): void;
    canGoBack(): boolean;
    canGoForward(): boolean;
    findInPage(text: string, options?: { forward?: boolean; findNext?: boolean }): number;
    stopFindInPage(action: "clearSelection" | "keepSelection" | "activateSelection"): void;
    openDevTools(): void;
    closeDevTools(): void;
    isDevToolsOpened(): boolean;
    getURL(): string;
    getTitle(): string;
  }
}
