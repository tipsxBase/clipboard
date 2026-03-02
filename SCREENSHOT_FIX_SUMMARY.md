# 截图问题修复总结

## 问题描述

用户报告：**截图时只能看到桌面背景，其他应用程序窗口不可见**

## 根本原因

这不是代码 bug，而是 **macOS 权限问题**。

从 macOS 10.15 (Catalina) 开始，Apple 要求应用程序必须获得用户明确授权才能录制屏幕内容。如果没有授予"屏幕录制"权限，截图功能只能捕获桌面背景，无法捕获其他应用程序的窗口。

## 解决方案

### 1. 添加权限配置

#### 文件：`src-tauri/Info.plist` (新建)
添加了 macOS 权限描述：
```xml
<key>NSScreenCaptureDescription</key>
<string>此应用需要屏幕录制权限来捕获截图。</string>
```

#### 文件：`src-tauri/tauri.conf.json`
确保 macOS 配置正确（已验证）

### 2. 添加权限检查代码

#### 文件：`src-tauri/src/screenshot.rs`
```rust
/// 检查 macOS 屏幕录制权限
#[cfg(target_os = "macos")]
pub fn check_screen_recording_permission() -> bool {
    // 检查权限状态
}
```

#### 文件：`src-tauri/src/commands.rs`
```rust
/// 检查屏幕录制权限（macOS）
#[tauri::command]
pub fn check_screen_recording_permission() -> bool {
    crate::screenshot::check_screen_recording_permission()
}
```

在 `start_capture` 函数中添加了权限检查日志。

### 3. 添加用户引导

#### 文件：`src/components/PermissionDialog.vue` (新建)
创建了权限引导对话框，在应用启动时自动检查权限，如果没有权限则显示详细的授权步骤。

### 4. 添加文档

#### 文件：`docs/MACOS_SCREEN_RECORDING_PERMISSION.md`
详细的 macOS 权限问题文档，包括：
- 问题描述和根本原因
- 解决方案步骤
- 技术实现细节
- 常见问题解答

#### 文件：`docs/SCREENSHOT_TROUBLESHOOTING.md`
完整的故障排除指南，包括：
- 症状描述
- 解决方案（多种方法）
- 验证权限的方法
- 技术实现细节
- 常见问题和答案

## 用户操作步骤

### 方法 1：系统设置授权（推荐）

1. 打开"系统设置" (System Settings)
2. 进入"隐私与安全性" (Privacy & Security)
3. 选择"屏幕录制" (Screen Recording)
4. 找到 "Clipboard Manager" 并勾选
5. **重启应用程序**（重要！）

### 方法 2：首次运行授权

1. 触发截图快捷键
2. macOS 会弹出权限请求对话框
3. 点击 "Allow"
4. 重启应用程序

## 技术要点

### 截图时序（已验证正确）

代码中的截图流程是正确的：

```rust
// 1. 先捕获屏幕（此时还没有截图窗口）
let captures = capture_all_screens(cache_dir, Some(file_manager))?;

// 2. 然后创建截图窗口
for cap in &captures {
    let window = create_screenshot_window(...)?;
    window.show()?;
}
```

这个顺序确保：
- ✅ 截图窗口不会出现在捕获的图像中
- ✅ 其他应用程序窗口在截图时仍然可见
- ✅ 用户看到的是触发截图那一刻的真实屏幕状态

### 权限检查

- macOS: 使用 `NSWorkspace` API 检查权限状态
- Windows/Linux: 不需要特殊权限，默认返回 true

### 用户体验改进

1. **自动检查**: 应用启动时自动检查权限
2. **友好提示**: 显示详细的授权步骤
3. **日志记录**: 记录权限检查结果，便于调试

## 验证

### 编译状态
✅ Rust 代码编译成功（只有一些未使用代码的警告）
✅ 前端代码无错误

### 测试建议

1. **开发模式测试**:
   ```bash
   cargo tauri dev
   ```
   注意：开发模式下权限请求可能不会正常工作

2. **正式版本测试**（推荐）:
   ```bash
   cargo tauri build
   open src-tauri/target/release/bundle/macos/clipboard.app
   ```

3. **权限验证**:
   - 首次运行应该弹出权限请求对话框
   - 在系统设置中应该能看到应用程序
   - 授予权限并重启后，截图应该能捕获所有窗口

## 文件清单

### 新建文件
- `src-tauri/Info.plist` - macOS 权限配置
- `src/components/PermissionDialog.vue` - 权限引导对话框
- `docs/MACOS_SCREEN_RECORDING_PERMISSION.md` - 权限问题详细文档
- `docs/SCREENSHOT_TROUBLESHOOTING.md` - 故障排除指南
- `SCREENSHOT_FIX_SUMMARY.md` - 本文件

### 修改文件
- `src-tauri/src/screenshot.rs` - 添加权限检查函数
- `src-tauri/src/commands.rs` - 添加权限检查命令和日志
- `src-tauri/tauri.conf.json` - 验证 macOS 配置

## 总结

**问题根源**: macOS 隐私保护机制要求明确授权

**解决方案**: 
1. 添加权限配置和检查代码
2. 在系统设置中授予屏幕录制权限
3. 重启应用程序

**不是代码 bug**: 这是 macOS 的设计行为，所有截图应用都需要这个权限

**用户体验**: 添加了自动检查和友好的引导界面

## 下一步

1. 测试正式版本，验证权限请求对话框是否正常弹出
2. 验证授予权限后截图功能是否正常
3. 如果需要，可以在主窗口添加权限状态指示器
4. 考虑添加"打开系统设置"的快捷按钮（需要额外的 Tauri 插件）

## 参考资料

- [Apple 隐私文档](https://developer.apple.com/documentation/avfoundation/capture_setup/requesting_authorization_for_media_capture_on_macos)
- [Tauri macOS 配置](https://tauri.app/v1/guides/building/macos)
- [screenshots crate](https://github.com/nashaofu/screenshots-rs)
