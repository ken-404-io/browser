# Browser

A fast, modular Chromium-based browser built with TypeScript and Electron.

## Tech Stack

- **TypeScript** - Type-safe codebase
- **Electron** - Chromium rendering engine + Node.js backend
- **Node.js** - Backend IPC, URL resolution, ad blocking

## Features

- Tabbed browsing with full lifecycle management
- Smart URL bar (auto-detects URLs vs search queries)
- Keyboard shortcuts (Ctrl+T, Ctrl+W, Ctrl+L, Ctrl+R, Alt+Left/Right)
- Custom frameless window with dark theme
- New tab page with search and quick shortcuts
- Basic ad/tracker blocking
- Secure context isolation (preload bridge)

## Architecture

```
src/
  main/          # Electron main process (window, IPC, ad blocking)
  preload/       # Secure bridge between main and renderer
  renderer/      # Browser UI (tabs, navigation, webviews)
```

## Development

```bash
npm install
npm run build    # Compile TypeScript + copy assets
npm start        # Build and launch
npm run dev      # Quick dev build and launch
```
