---
sidebar_position: 3
---

# User Guide

## Basic Operations

### Summon Interface

By default, you can use the following global shortcut to summon the clipboard history panel:

- **macOS**: `Cmd + Shift + V`
- **Windows / Linux**: `Ctrl + Shift + V`

> **Tip**: You can modify this shortcut in the application settings.

### Screenshot Tool

The built-in screenshot tool allows you to capture and annotate your screen:

#### Taking a Screenshot

1. **Trigger Screenshot**: Use the configured shortcut or menu option to enter screenshot mode.
2. **Select Area**: Click and drag to select the area you want to capture. You can also:
   - **Double-click** anywhere to capture the full screen
   - **Click once** to select a small area (will auto-expand to full screen)
3. **Adjust Selection**: Drag the edges or corners to resize the selection area.

#### Annotation Tools

Once you've selected an area, a toolbar will appear with the following tools:

- **Rectangle** (□): Draw rectangular shapes
- **Ellipse** (○): Draw circular/elliptical shapes
- **Arrow** (→): Draw arrows to point at specific areas
- **Pen** (✎): Free-hand drawing
- **Text** (T): Add text annotations

For each tool, you can customize:
- **Color**: Choose from preset colors
- **Line Width**: Adjust the thickness (except for text)

#### Saving or Canceling

- **Save**: Press `Enter` or click the checkmark (✓) button to save the screenshot to your clipboard
- **Download**: Click the download button to save the screenshot as a file
- **Reset**: Click the reset button to clear the selection and start over
- **Cancel**: Press `Esc` or click the X button to exit without saving

#### macOS Screen Recording Permission

> **Important for macOS Users**

On macOS 10.15 (Catalina) and later, apps require explicit permission to record the screen. When you first use the screenshot feature:

1. macOS will display a permission dialog asking for **Screen Recording** access
2. Click **"Allow"** to grant permission
3. **Restart the application** for the permission to take effect

If the dialog doesn't appear or you accidentally denied permission:

1. Open **System Settings** (or System Preferences)
2. Go to **Privacy & Security** > **Screen Recording**
3. Find and check **"Clipboard Manager"** in the list
4. **Restart the application**

Without this permission, screenshots will only capture the desktop background, not other application windows.

### List Navigation

To improve efficiency, we support multiple navigation methods so your hands don't have to leave the keyboard:

- **Move Up/Down**:
  - Arrow keys `↑` / `↓`
  - Vim style `j` (down) / `k` (up)
  - Emacs style `Ctrl+n` (down) / `Ctrl+p` (up)
- **Confirm/Paste**: Press `Enter` to paste the selected item into the current active window and automatically close the panel.
- **Preview Details**: Press `Space` to view detailed information of the currently selected item (useful for long text or large images). Press `Space` again to close the preview.
- **Close Panel**: Press `Esc`.

## Advanced Features

### Paste Stack (Queue)

The Paste Stack allows you to copy multiple items and paste them in a specific order. This is extremely useful for filling out forms or moving data between applications.

### New Features (2026)

- **Async OCR**: Text extraction from images is now fully async on Windows/macOS, ensuring no deadlocks or database lock issues.
- **History Protection**: When clearing history, pinned/collected items are protected by default and a confirmation dialog is shown.
- **Edit/Add Clipboard Items**: You can now add or edit text/code/url/email/phone items directly in the app (images not supported yet). Use the “Edit” or “Add” button in the main window.
- **Database Reliability**: All database operations are async, so the app remains responsive even during heavy OCR or history operations.
- **Tray & UI Sync**: Tray menu and main window always stay in sync for a seamless experience.

1.  **Select Items**:
    - **Keyboard**: Navigate to an item and press `x` to select/deselect it.
    - **Mouse**: Hold `Cmd` (macOS) or `Ctrl` (Windows) and click on items.
    - A numbered badge (e.g., ①, ②) will appear on selected items indicating the paste order.
2.  **Start Queue**: Press `Enter`. The first item will be copied to your clipboard, and the window will close.
3.  **Paste Sequentially**:
    - Paste the first item (`Cmd+V`).
    - Press the **Global Shortcut** (default `Cmd+Shift+V`) to automatically copy the _next_ item in the queue.
    - Repeat until the queue is empty.

### OCR (Text Extraction)

> **Note**: Currently available on macOS and Windows.

You can extract text from images stored in your clipboard history.

1.  Select an image item in the list.
2.  Press `Space` to open the preview.
3.  Click the **"Extract Text"** button at the bottom right.
4.  The extracted text will be copied to your clipboard and added as a new text item in your history.

### Compact Mode

For users who prefer a denser information view, you can enable **Compact Mode** in Settings. This mode:

- Reduces the height of each list item.
- Hides image previews in the list (showing `[Image]` text instead).
- Displays more items on the screen at once.

## Features

### Pinning Items

You can pin important items to the top of the list. Pinned items will:

- Always stay at the top of the history list.
- **Not be automatically deleted** even if the history size limit is reached.

To pin an item, hover over it and click the Pin icon, or use the context menu.

### Sensitive Data

You can mark items as "Sensitive". Sensitive items are:

- Encrypted in the database.
- Blurred in the UI until hovered.

> **Note**: Automatic detection of sensitive content (based on entropy) has been removed to prevent false positives. You can still configure "Sensitive Applications" in settings to ignore clipboard content from specific apps (like password managers).

## Search Function

There is a search box at the top of the panel. After opening the panel, type keywords directly to filter history records.

- Supports fuzzy search.
- Search scope includes text content and source application name.

## Data Management

### Storage Location

To ensure your data privacy, all data is stored locally on your device:

- **macOS**: `~/.clipboard-manager/`
- **Windows**: `C:\Users\<Username>\.clipboard-manager\`
- **Linux**: `~/.clipboard-manager/`

### Database Security

- The database file is named `history.db`.
- The database uses **AES-GCM** algorithm for encryption, and the key is stored in a local secure location. This means that even if someone obtains your database file, they cannot read its content without the key.

### Privacy Settings

In settings, you can:

- **Pause Recording**: Temporarily stop listening for clipboard changes.
- **Ignore Applications**: Add application names (e.g., `1Password`, `KeyChain`) that should not be recorded to protect sensitive information.
- **Clear History**: One-click delete all locally stored history records.
