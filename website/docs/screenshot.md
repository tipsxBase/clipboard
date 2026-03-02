---
sidebar_position: 4
---

# Screenshot Tool

The Clipboard Manager includes a powerful built-in screenshot tool that allows you to capture, annotate, and save screenshots with ease.

## Quick Start

1. **Trigger Screenshot**: Use your configured shortcut (check Settings) or select "Take Screenshot" from the menu
2. **Select Area**: Click and drag to select the area you want to capture
3. **Annotate** (optional): Use the toolbar to add shapes, arrows, text, or drawings
4. **Save**: Press `Enter` or click the checkmark to save to clipboard

## Capturing Screenshots

### Selection Methods

- **Click and Drag**: Click at one corner and drag to the opposite corner to select a rectangular area
- **Double-Click**: Double-click anywhere to capture the entire screen
- **Single Click (Small Area)**: If you click and release quickly (creating a very small selection), it will automatically expand to full screen

### Adjusting the Selection

After creating a selection, you can:

- **Resize**: Drag the edges or corners of the selection box
- **Move**: Click inside the selection and drag to reposition it (only works before adding annotations)

## Annotation Tools

Once you've selected an area, a toolbar appears at the bottom with various annotation tools:

### Available Tools

| Tool | Icon | Description | Customizable Options |
|------|------|-------------|---------------------|
| **Rectangle** | □ | Draw rectangular shapes | Color, Line Width |
| **Ellipse** | ○ | Draw circular or elliptical shapes | Color, Line Width |
| **Arrow** | → | Draw arrows to point at specific areas | Color, Line Width |
| **Pen** | ✎ | Free-hand drawing | Color, Line Width |
| **Text** | T | Add text annotations | Color, Font Size |

### Customization Options

For each tool, you can customize:

- **Color**: Click the color picker to choose from preset colors (red, yellow, green, blue, purple, white, gray, black)
- **Line Width**: Click the size picker to choose from 3 preset sizes (thin, medium, thick)
- **Font Size** (Text tool only): Automatically adjusts based on the text content

### Using Annotation Tools

1. **Select a Tool**: Click on one of the tool buttons in the toolbar
2. **Customize** (optional): Choose your preferred color and line width
3. **Draw**: Click and drag on the screenshot to create your annotation
4. **Deselect Tool**: Click the same tool button again to deselect it

### Undo/Redo

- **Undo**: Click the undo button (↶) or press `Ctrl+Z` / `Cmd+Z`
- **Redo**: Click the redo button (↷) or press `Ctrl+Y` / `Cmd+Shift+Z`

## Saving Screenshots

You have multiple options for saving your screenshot:

### Save to Clipboard

- **Keyboard**: Press `Enter`
- **Mouse**: Click the checkmark (✓) button in the toolbar

The screenshot will be:
1. Saved to your clipboard (ready to paste with `Ctrl+V` / `Cmd+V`)
2. Added to your clipboard history
3. Automatically saved to your captures folder

### Download as File

- Click the download (⬇) button in the toolbar
- The screenshot will be saved to your default downloads folder with a timestamp filename

### Cancel

- **Keyboard**: Press `Esc`
- **Mouse**: Click the X button in the toolbar

## macOS Screen Recording Permission

### Why is Permission Needed?

On macOS 10.15 (Catalina) and later, Apple requires apps to explicitly request permission to record the screen. This is a privacy protection measure to prevent unauthorized screen capture.

Without this permission, the screenshot tool can only capture:
- ✅ Desktop background
- ✅ The app's own windows
- ❌ Other application windows (this is the problem!)

### Granting Permission

#### First-Time Setup

When you first use the screenshot feature, macOS will automatically display a permission dialog:

```
"Clipboard Manager" would like to record your screen.

This allows the app to capture screenshots of your entire screen,
including other applications.

[Deny]  [Allow]
```

1. Click **"Allow"**
2. **Restart the application** (very important!)

#### Manual Setup

If the dialog doesn't appear or you accidentally denied permission:

1. Open **System Settings** (or System Preferences on older macOS versions)
2. Navigate to **Privacy & Security** > **Screen Recording**
3. Look for **"Clipboard Manager"** in the list
4. Check the checkbox next to it
5. **Restart the application**

### Troubleshooting

#### Problem: Screenshots only show desktop background

**Solution**: This means screen recording permission hasn't been granted. Follow the manual setup steps above.

#### Problem: Permission dialog doesn't appear

**Possible causes**:
- The app is already in the Screen Recording list (check manually)
- You're running in development mode (build a release version to test)
- The app isn't properly signed (expected in development)

**Solution**: Manually add the app in System Settings as described above.

#### Problem: Permission granted but still not working

**Solution**:
1. Uncheck the app in Screen Recording settings
2. Check it again
3. Restart the app
4. If still not working, restart your Mac

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Confirm/Save | `Enter` |
| Cancel | `Esc` |
| Undo | `Ctrl+Z` / `Cmd+Z` |
| Redo | `Ctrl+Y` / `Cmd+Shift+Z` |

## Tips and Tricks

1. **Quick Full Screen**: Double-click anywhere to instantly capture the full screen
2. **Precise Selection**: Hold `Shift` while dragging to create a perfect square selection (coming soon)
3. **Color Consistency**: The tool remembers your last used color and line width
4. **Multiple Annotations**: You can add as many annotations as you want before saving
5. **Preview Before Save**: Take your time to review and annotate - nothing is saved until you press Enter

## Technical Details

- **Image Format**: Screenshots are saved as PNG files for maximum quality
- **Storage Location**: 
  - Temporary files: `~/.clipboard-manager/cache/screenshots/`
  - Saved captures: `~/.clipboard-manager/captures/`
- **Cleanup**: Temporary files are automatically cleaned up when you close the screenshot window
- **Multi-Monitor Support**: The tool works seamlessly across multiple monitors

## Known Limitations

- **macOS Only**: Screen recording permission is only required on macOS
- **Development Mode**: Permission dialogs may not work correctly in development mode (`cargo tauri dev`). Use `cargo tauri build` to test the release version.
- **Wayland (Linux)**: Some Linux desktop environments using Wayland may have limited screenshot support

## Related Documentation

- [User Guide](./user-guide.md) - General usage instructions
- [Installation](./installation.md) - How to install the app
- [Development](./development.md) - Building from source
