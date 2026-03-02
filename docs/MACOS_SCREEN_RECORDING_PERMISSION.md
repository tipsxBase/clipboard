# macOS 屏幕录制权限问题

## 问题描述

在 macOS 上使用截图功能时，可能会遇到以下问题：
- 截图只显示桌面背景，其他应用程序窗口不可见
- 截图内容为空白或黑屏
- 截图功能完全无法工作

## 根本原因

从 macOS 10.15 (Catalina) 开始，Apple 引入了更严格的隐私保护机制。应用程序需要明确请求"屏幕录制"权限才能捕获屏幕内容，包括其他应用程序的窗口。

如果没有授予权限，`screenshots` crate 的 `Screen::capture()` 方法只能捕获到：
- 桌面背景
- 自己应用程序的窗口
- 系统 UI 元素（部分）

但无法捕获：
- 其他应用程序的窗口内容
- 浏览器内容
- 其他用户应用程序

## 解决方案

### 1. 配置应用程序权限声明

我们已经在以下文件中添加了权限声明：

#### `src-tauri/tauri.conf.json`
```json
{
  "bundle": {
    "macOS": {
      "infoPlist": {
        "NSScreenCaptureDescription": "This app needs screen recording permission to capture screenshots.",
        "NSAppleEventsUsageDescription": "This app needs to control other applications for clipboard management."
      }
    }
  }
}
```

#### `src-tauri/Info.plist`
```xml
<key>NSScreenCaptureDescription</key>
<string>This app needs screen recording permission to capture screenshots.</string>
```

### 2. 用户授予权限

用户需要在 macOS 系统设置中手动授予权限：

1. 打开"系统设置" (System Settings)
2. 进入"隐私与安全性" (Privacy & Security)
3. 选择"屏幕录制" (Screen Recording)
4. 找到 "Clipboard Manager" 应用
5. 勾选复选框以授予权限
6. **重启应用程序**（这一步很重要！）

### 3. 首次运行提示

当应用程序首次尝试截图时，macOS 会自动弹出权限请求对话框：

```
"Clipboard Manager" would like to record your screen.

This allows the app to capture screenshots of your entire screen, including other applications.

[Deny]  [Allow]
```

用户必须点击 "Allow" 才能使用截图功能。

### 4. 权限检查

应用程序会在截图前检查权限状态：

```rust
// 在 screenshot.rs 中
pub fn check_screen_recording_permission() -> bool {
    // macOS 特定的权限检查逻辑
}
```

如果没有权限，应用程序会：
1. 记录警告日志
2. 显示用户友好的错误提示
3. 引导用户到系统设置授予权限

## 技术细节

### 权限检查时机

```rust
// 在 commands.rs 的 start_capture 函数中
pub async fn start_capture(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Starting screen capture...");
    
    // 1. 在 macOS 上检查权限
    #[cfg(target_os = "macos")]
    {
        if !crate::screenshot::check_screen_recording_permission() {
            return Err("Screen recording permission not granted. Please enable it in System Settings > Privacy & Security > Screen Recording.".to_string());
        }
    }
    
    // 2. 确保缓存目录存在
    // 3. 捕获屏幕（在创建窗口之前）
    // 4. 创建截图窗口
    // ...
}
```

### 截图时序

正确的截图流程：

```
1. 用户触发截图快捷键
   ↓
2. 检查屏幕录制权限
   ↓
3. 捕获所有屏幕内容（此时还没有截图窗口）
   ↓
4. 保存截图到临时文件
   ↓
5. 创建截图窗口并显示捕获的图像
   ↓
6. 用户进行标注和编辑
   ↓
7. 确认保存或取消
```

这个顺序确保：
- 截图窗口不会出现在捕获的图像中
- 其他应用程序窗口在截图时仍然可见
- 用户看到的是触发截图那一刻的屏幕状态

## 常见问题

### Q: 为什么我授予了权限但还是只能看到桌面？

A: 请确保：
1. 在系统设置中正确勾选了权限
2. **重启了应用程序**（这一步经常被忽略）
3. 如果还不行，尝试重启 macOS

### Q: 权限对话框没有弹出怎么办？

A: 
1. 检查应用程序是否已经在权限列表中（可能之前拒绝过）
2. 手动进入系统设置添加权限
3. 如果应用程序不在列表中，尝试：
   - 完全卸载应用程序
   - 删除 `~/Library/Application Support/com.dmxn.cliboard/`
   - 重新安装并运行

### Q: 开发模式下权限问题

A: 在开发模式下（`cargo tauri dev`），权限请求可能不会正常工作，因为：
- 应用程序没有正确签名
- Bundle ID 可能不一致
- 建议使用 `cargo tauri build` 构建正式版本进行测试

### Q: 如何在代码中检测权限状态？

A: 使用我们提供的命令：

```typescript
import { invoke } from '@tauri-apps/api/core';

const hasPermission = await invoke<boolean>('check_screen_recording_permission');

if (!hasPermission) {
  // 显示权限引导 UI
  alert('Please grant screen recording permission in System Settings');
}
```

## 相关资源

- [Apple 隐私文档](https://developer.apple.com/documentation/avfoundation/capture_setup/requesting_authorization_for_media_capture_on_macos)
- [Tauri macOS 配置](https://tauri.app/v1/guides/building/macos)
- [screenshots crate](https://github.com/nashaofu/screenshots-rs)

## 更新日志

- 2024-02-28: 添加 macOS 屏幕录制权限配置和检查逻辑
- 2024-02-28: 创建权限问题文档
