---
sidebar_position: 4
---

# Development Guide

If you are a developer and want to contribute code to this project or build it yourself, please refer to the following guide.

## Tech Stack

This project is built with a modern tech stack, balancing performance and development experience:

- **Core Framework**: [Tauri v2](https://v2.tauri.app/) (Rust + Webview)
- **Frontend Framework**: [Vue 3](https://vuejs.org/) + TypeScript
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **UI Components**: [Radix Vue](https://www.radix-vue.com/) + [Lucide Icons](https://lucide.dev/)
- **Database**: SQLite (via `rusqlite` driver)

## Recent Features & Improvements

- **Async OCR Refactor**: Windows and macOS OCR logic is now fully async, preventing deadlocks and database lock issues.
- **Robust History Management**: History deletion now includes confirmation dialogs and protects pinned/collected items unless configured otherwise.
- **Advanced Item Editing**: You can add or edit text/code/url/email/phone clipboard items directly in the app (images not supported yet).
- **Database Reliability**: All database operations are now async, ensuring the database is never locked during heavy OCR or history operations.
- **Frontend/Backend Sync**: Tray menu and frontend state are always synchronized for a seamless experience.

## Prerequisites

Before starting, please ensure your development environment has the following tools installed:

1.  **Rust**: Please install the latest stable version via [rustup](https://rustup.rs/).
2.  **Node.js**: Recommended v20 or higher.
3.  **pnpm**: Package manager (`npm install -g pnpm`).
4.  **System Dependencies**:
    - **macOS**: Requires Xcode Command Line Tools (`xcode-select --install`).
    - **Linux**: Requires `libwebkit2gtk-4.0-dev`, `build-essential`, `curl`, `wget`, `libssl-dev`, `libgtk-3-dev`, `libayatana-appindicator3-dev`, etc.

## Quick Start

1.  **Clone Repository**

    ```bash
    git clone https://github.com/tipsxBase/clipboard.git
    cd clipboard
    ```

2.  **Install Dependencies**

    ```bash
    pnpm install
    ```

3.  **Start Development Mode**

    This command will start both the frontend development server and the Tauri backend, with hot reload enabled.

    ```bash
    pnpm tauri dev
    ```

## Build & Release

Build the production application bundle:

```bash
pnpm tauri build
```

The build artifacts will be located in the `src-tauri/target/release/bundle/` directory.

## Directory Structure

```
.
├── src/                 # Frontend Vue source code
│   ├── components/      # UI Components
│   ├── composables/     # Composables (Hooks)
│   ├── lib/             # Utility functions
│   └── views/           # Page Views (MainWindow, PopupWindow)
├── src-tauri/           # Rust Backend source code
│   ├── src/
│   │   ├── db.rs        # Database operations
│   │   ├── monitor.rs   # Clipboard monitoring logic
│   │   └── ...
│   ├── tauri.conf.json  # Tauri configuration
│   └── Cargo.toml       # Rust dependencies
└── website/             # Documentation Website (Docusaurus)
```

## Contributing

Pull Requests are welcome! Before submitting, please ensure:

1.  Code passes type check (`vue-tsc --noEmit`).
2.  Rust code passes compilation (`cargo check`).
3.  Keep code style consistent.
