# Clipboard Manager

A lightweight, secure, and modern clipboard manager built with **Rust (Tauri v2)** and **Vue 3**.

![License](https://img.shields.io/badge/license-GPL--3.0-blue.svg)
![Tauri](https://img.shields.io/badge/Tauri-v2-orange.svg)
![Vue](https://img.shields.io/badge/Vue-3-green.svg)

[🌐 Website & Documentation](https://tipsxBase.github.io/clipboard/)

## ✨ Features

- **📋 History Management**: Automatically records text and images copied to your clipboard.
- **🔍 Smart Search**: Quickly find clipboard history with full-text search.
- **🖼️ Image Support**: View and paste images directly from your history.
- **📸 Screenshot Tool**: Built-in screenshot tool with annotation support (rectangles, ellipses, arrows, pen, text).
- **🔒 Privacy Focused**:
  - **Sensitive Data Detection**: Manually mark items as sensitive or configure sensitive apps.
  - **App Filtering**: Ignore clipboard changes from specific applications (e.g., password managers).
  - **Memory Only**: Sensitive items can be marked to not persist to disk.
- **📌 Pinning**: Pin important items to the top of the list to prevent them from being auto-deleted.
- **⚡ Performance**: Optimized for large text content with lazy loading.
- **📚 Paste Stack**: Copy multiple items in sequence and paste them in order (FIFO/LIFO).
- **📝 OCR**: Extract text from images directly within the app (macOS & Windows).
- **📏 Compact Mode**: A dense view for power users to see more items at once.
- **⌨️ Keyboard Driven**: Vim-like navigation (`j`/`k`) and global shortcuts.
- **🌍 Internationalization**: Support for English and Chinese (简体中文).
- **🚀 Auto-start**: Option to launch automatically at system login.

## 🎮 Usage

### Global Shortcuts

- **Toggle Clipboard History**: `Cmd+Shift+V` (macOS) or `Ctrl+Shift+V` (Windows/Linux) - _Default, configurable in settings._
- **Take Screenshot**: Trigger screenshot mode to capture and annotate your screen.

### Screenshot Tool

The built-in screenshot tool allows you to capture, annotate, and save screenshots:

1. **Trigger Screenshot**: Use the configured shortcut or menu option.
2. **Select Area**: Click and drag to select the area you want to capture.
3. **Annotate**: Use the toolbar to add annotations:
   - **Rectangle** / **Ellipse** / **Arrow**: Draw shapes
   - **Pen**: Free-hand drawing
   - **Text**: Add text annotations
4. **Save**: Press `Enter` or click the checkmark to save the screenshot to your clipboard.
5. **Cancel**: Press `Esc` or click the X button to cancel.

> **macOS Users**: On first use, macOS will request **Screen Recording** permission. Please grant this permission in System Settings > Privacy & Security > Screen Recording, then restart the app.

### Navigation (Popup Window)

- **Select Item**: `↑` / `↓` or `Ctrl+n` / `Ctrl+p` or `Ctrl+j` / `Ctrl+k` (Vim style)
- **Paste Item**: `Enter`
- **Multi-Select (Paste Stack)**: `x` or `Cmd+Click` to select items. Press `Enter` to start the stack, then use the Global Shortcut to paste items sequentially.
- **Preview Item**: `Space` (Press again to close)
- **OCR (Image Preview)**: In preview mode, click the "Extract Text" button to copy text from image.
- **Close / Back**: `Esc`

### Data Storage

Your clipboard history and settings are stored locally in:

- **macOS**: `~/.clipboard-manager/`
- **Windows/Linux**: `~/.clipboard-manager/` (or standard AppData location)

> **Note**: The database is encrypted using AES-GCM for security.

## 🛠️ Tech Stack

- **Backend**: Rust, Tauri v2, SQLite
- **Frontend**: Vue 3, TypeScript, Tailwind CSS v4
- **UI Components**: Radix Vue, Lucide Icons

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [pnpm](https://pnpm.io/)
- [Rust](https://www.rust-lang.org/) (latest stable)

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/yourusername/clipboard.git
   cd clipboard
   ```

2. Install frontend dependencies:

   ```bash
   pnpm install
   ```

3. Run the development server:
   ```bash
   pnpm tauri dev
   ```

### Build

To build the application for production:

```bash
pnpm tauri build
```

The executable will be located in `src-tauri/target/release/bundle/`.

## 📝 License

This project is licensed under the **GNU General Public License v3.0**. See the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
