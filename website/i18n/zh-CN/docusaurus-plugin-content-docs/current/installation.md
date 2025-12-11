---
sidebar_position: 2
---

# 安装指南

Clipboard Manager 支持主流的桌面操作系统。请根据您的系统选择合适的安装方式。

## 下载安装包

请访问我们的 [GitHub Releases](https://github.com/tipsxBase/clipboard/releases) 页面下载最新版本的安装包。

### macOS 用户

- **下载**: 根据您的 Mac 芯片类型（Apple Silicon 或 Intel）选择对应的 `.dmg` 文件。
- **安装**: 双击 `.dmg` 文件，将应用图标拖入 `Applications` 文件夹。
- **权限**: 首次运行时，系统可能会提示需要辅助功能权限（用于监听剪贴板快捷键），请按照提示在“系统设置 -> 隐私与安全性 -> 辅助功能”中授权。

### Windows 用户

- **下载**: 选择 `.msi` 安装程序或 `.exe` 文件。
- **安装**: 双击运行安装程序，按照向导完成安装。

### Linux 用户

- **下载**: 我们提供 `.deb` (Debian/Ubuntu) 和 `.AppImage` 格式。
- **安装**:
  - `.deb`: 运行 `sudo dpkg -i clipboard_x.x.x_amd64.deb`
  - `.AppImage`: 赋予执行权限 `chmod +x clipboard_x.x.x.AppImage` 后直接运行。

## 常见问题

### macOS: 提示“应用已损坏，无法打开”

如果您在打开应用时遇到“应用已损坏，无法打开”或“应该将它移到废纸篓”的提示，这通常是因为 macOS 对未公证应用的安全性限制。

解决方法：

1. 打开 **终端 (Terminal)** 应用。
2. 运行以下命令（请确保路径与您的安装位置一致）：
   ```bash
   sudo xattr -cr /Applications/clipboard.app
   ```
3. 输入您的系统密码（输入时不会显示）。
4. 再次尝试打开应用。

或者，您可以尝试在 Finder 中**右键点击**应用图标，选择**打开**，然后在弹出的对话框中点击**打开**。

### Windows: Microsoft Defender SmartScreen 警告

在 Windows 上，您可能会看到一个蓝色的窗口提示 **“Windows 已保护你的电脑”**。这是因为应用尚未获得高信誉证书。

安装方法：

1. 点击弹窗中的 **“更多信息” (More info)** 链接。
2. 点击底部的 **“仍要运行” (Run anyway)** 按钮。

### Windows: WebView2 启动失败

如果你遇到如下报错：

```
failed to create webview: WebView2 error: WindowsErrorError { code: HRESULT(0x80004002), ... }
```

这说明你的系统未安装 WebView2 Runtime。Edge 浏览器和 WebView2 是两个独立组件，安装 Edge 浏览器并不会自动安装 WebView2 Runtime。

**解决方法：**

1. 访问 [WebView2 官方下载页面](https://developer.microsoft.com/zh-cn/microsoft-edge/webview2/) 并安装 WebView2 Runtime。
2. 安装完成后重启电脑，再次运行应用。
3. 如问题仍未解决，建议升级 Windows 10 到最新版本。

**如何检查是否已安装 WebView2：**

- 打开“控制面板” → “程序和功能”，查找 “Microsoft Edge WebView2 Runtime”。
- 或在命令行输入：
  ```
  reg query "HKLM\SOFTWARE\Microsoft\EdgeUpdate\Clients" /s | findstr WebView2
  ```
  有输出则已安装。

## 自动更新

应用内置了自动更新功能。当有新版本发布时，应用会在后台自动检测并提示您进行更新。您只需点击确认，应用将自动下载并安装最新版本。
