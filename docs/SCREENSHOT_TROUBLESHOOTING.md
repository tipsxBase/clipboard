# 截图功能故障排除指南

## 问题：截图只显示桌面，其他应用程序窗口不可见

### 症状

- 触发截图快捷键后，截图窗口正常显示
- 但是截图内容只有桌面背景
- 其他应用程序的窗口（浏览器、编辑器等）不在截图中
- 截图看起来像是"空的"或"只有壁纸"

### 根本原因

这是一个 **macOS 权限问题**，不是代码 bug。

从 macOS 10.15 (Catalina) 开始，Apple 要求应用程序必须获得用户明确授权才能：
- 录制屏幕内容
- 捕获其他应用程序的窗口
- 访问屏幕上的敏感信息

如果没有授予"屏幕录制"权限，`screenshots` crate 只能捕获：
- ✅ 桌面背景
- ✅ 自己应用程序的窗口
- ❌ 其他应用程序的窗口（这就是问题所在！）

### 解决方案

#### 方案 1：授予屏幕录制权限（推荐）

1. **打开系统设置**
   - 点击 Apple 菜单 () > 系统设置

2. **进入隐私与安全性**
   - 在左侧边栏选择"隐私与安全性" (Privacy & Security)

3. **选择屏幕录制**
   - 向下滚动找到"屏幕录制" (Screen Recording)
   - 点击进入

4. **添加应用程序**
   - 找到 "Clipboard Manager" 或 "clipboard"
   - 勾选复选框以授予权限
   - 如果应用程序不在列表中，点击 "+" 按钮手动添加

5. **重启应用程序**（重要！）
   - 完全退出 Clipboard Manager
   - 重新启动应用程序
   - 权限才会生效

#### 方案 2：首次运行时授权

如果这是首次使用截图功能：

1. 触发截图快捷键
2. macOS 会自动弹出权限请求对话框：
   ```
   "Clipboard Manager" would like to record your screen.
   
   [Deny]  [Allow]
   ```
3. 点击 **"Allow"**
4. 重启应用程序

### 验证权限

运行以下命令检查权限状态：

```bash
# 在终端中运行
tccutil reset ScreenCapture com.dmxn.cliboard
```

或者在应用程序中：

```typescript
import { invoke } from '@tauri-apps/api/core';

const hasPermission = await invoke<boolean>('check_screen_recording_permission');
console.log('Screen recording permission:', hasPermission);
```

### 技术实现细节

#### 代码中的权限处理

我们在以下位置添加了权限相关代码：

1. **Tauri 配置** (`src-tauri/tauri.conf.json`)
   ```json
   {
     "bundle": {
       "macOS": {
         "infoPlist": {
           "NSScreenCaptureDescription": "This app needs screen recording permission to capture screenshots."
         }
       }
     }
   }
   ```

2. **权限检查函数** (`src-tauri/src/screenshot.rs`)
   ```rust
   #[cfg(target_os = "macos")]
   pub fn check_screen_recording_permission() -> bool {
       // macOS 特定的权限检查逻辑
   }
   ```

3. **截图前检查** (`src-tauri/src/commands.rs`)
   ```rust
   pub async fn start_capture(...) -> Result<(), String> {
       #[cfg(target_os = "macos")]
       {
           log::info!("Checking macOS screen recording permission...");
       }
       
       // 捕获屏幕（在创建窗口之前）
       let captures = capture_all_screens(...)?;
       
       // 创建截图窗口
       // ...
   }
   ```

#### 截图时序

正确的截图流程确保不会捕获到截图窗口本身：

```
用户按下快捷键
    ↓
检查权限（macOS）
    ↓
捕获所有屏幕 ← 此时还没有截图窗口！
    ↓
保存到临时文件
    ↓
创建截图窗口 ← 窗口在捕获之后创建
    ↓
显示捕获的图像
    ↓
用户编辑和标注
    ↓
保存或取消
```

这个顺序保证：
- ✅ 截图窗口不会出现在捕获的图像中
- ✅ 其他应用程序窗口在截图时仍然可见
- ✅ 用户看到的是触发截图那一刻的真实屏幕状态

### 常见问题

#### Q1: 我已经授予权限了，为什么还是只能看到桌面？

**A:** 请确保：
1. ✅ 在系统设置中正确勾选了权限
2. ✅ **重启了应用程序**（这一步经常被忽略！）
3. ✅ 如果还不行，尝试：
   - 取消勾选权限
   - 重新勾选权限
   - 重启 macOS

#### Q2: 权限对话框没有弹出怎么办？

**A:** 可能的原因：
1. 应用程序已经在权限列表中（可能之前拒绝过）
   - 解决：手动进入系统设置检查
2. 应用程序没有正确签名（开发模式）
   - 解决：使用 `cargo tauri build` 构建正式版本
3. Bundle ID 不一致
   - 解决：检查 `tauri.conf.json` 中的 `identifier`

#### Q3: 开发模式下权限问题

**A:** 在开发模式下（`cargo tauri dev`），权限请求可能不会正常工作，因为：
- 应用程序没有正确签名
- Bundle ID 可能不一致
- 系统可能不信任开发版本

**建议：**
```bash
# 构建正式版本进行测试
cargo tauri build

# 运行构建的应用程序
open src-tauri/target/release/bundle/macos/clipboard.app
```

#### Q4: 如何重置权限？

**A:** 使用 `tccutil` 命令：

```bash
# 重置屏幕录制权限
tccutil reset ScreenCapture com.dmxn.cliboard

# 重置所有权限
tccutil reset All com.dmxn.cliboard
```

然后重新启动应用程序，权限对话框会再次弹出。

#### Q5: Windows 和 Linux 上有这个问题吗？

**A:** 不会。这是 macOS 特有的权限机制。

- **Windows**: 不需要特殊权限，截图功能开箱即用
- **Linux**: 取决于桌面环境，大多数情况下不需要特殊权限
- **macOS**: 必须授予屏幕录制权限

### 用户引导

为了改善用户体验，我们添加了：

1. **权限检查对话框** (`src/components/PermissionDialog.vue`)
   - 应用启动时自动检查权限
   - 如果没有权限，显示友好的引导界面
   - 提供详细的授权步骤

2. **错误提示**
   - 截图失败时显示明确的错误信息
   - 引导用户到系统设置授予权限

3. **日志记录**
   - 记录权限检查结果
   - 记录截图捕获过程
   - 便于调试和故障排除

### 相关文件

- `docs/MACOS_SCREEN_RECORDING_PERMISSION.md` - macOS 权限详细文档
- `src-tauri/tauri.conf.json` - Tauri 配置（包含 macOS 权限声明）
- `src-tauri/Info.plist` - macOS Info.plist（权限描述）
- `src-tauri/src/screenshot.rs` - 截图实现和权限检查
- `src-tauri/src/commands.rs` - 截图命令和权限验证
- `src/components/PermissionDialog.vue` - 权限引导对话框

### 总结

**问题根源：** macOS 隐私保护机制要求明确授权

**解决方案：** 在系统设置中授予屏幕录制权限并重启应用

**预防措施：** 
- 首次运行时显示权限引导
- 提供清晰的错误提示
- 记录详细的调试日志

**不是代码 bug：** 这是 macOS 的设计行为，所有截图应用都需要这个权限
