# 多屏幕 ESC 键修复

## 问题描述

在多屏幕环境下使用截图功能时，按 ESC 键只会关闭当前聚焦的截图窗口，其他屏幕的截图窗口仍然保持打开状态，用户可以继续在其他窗口进行框选等操作。

## 问题原因

原来的 ESC 键处理逻辑如下：

```typescript
const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === "Escape") {
    e.preventDefault();
    if (selection.value) {
      resetSelection();  // 如果有选区，只重置选区
    } else {
      close();           // 如果没有选区，才关闭窗口
    }
  }
};
```

这个逻辑有两个问题：

1. **有选区时不关闭窗口**: 当用户已经选择了区域时，按 ESC 只会重置选区，不会关闭窗口
2. **只关闭当前窗口**: 即使调用 `close()`，用户可能认为只关闭了当前窗口

实际上，`close()` 函数会调用后端的 `close_capture` 命令，该命令会关闭**所有**截图窗口：

```rust
#[tauri::command]
pub async fn close_capture(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Closing all screenshot windows");
    for (label, window) in app.webview_windows() {
        if label.starts_with("screenshot_") {
            let _ = window.close();  // 关闭所有截图窗口
        }
    }
    // ... 清理临时文件等
}
```

## 解决方案

修改 ESC 键处理逻辑，使其**总是**关闭所有截图窗口，不管是否有选区：

```typescript
const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === "Escape") {
    e.preventDefault();
    // ESC 键应该总是关闭所有截图窗口，不管是否有选区
    close();
  } else if (e.key === "Enter" && selection.value) {
    e.preventDefault();
    confirmSelection();
  }
};
```

## 修改的文件

- `src/views/ScreenshotWindow.vue` - 修改了 `handleKeyDown` 函数

## 行为变化

### 修改前

| 场景 | 按 ESC 的行为 |
|------|--------------|
| 没有选区 | 关闭所有截图窗口 ✅ |
| 有选区 | 只重置选区，不关闭窗口 ❌ |
| 多屏幕 + 有选区 | 只重置当前窗口的选区 ❌ |

### 修改后

| 场景 | 按 ESC 的行为 |
|------|--------------|
| 没有选区 | 关闭所有截图窗口 ✅ |
| 有选区 | 关闭所有截图窗口 ✅ |
| 多屏幕 + 有选区 | 关闭所有截图窗口 ✅ |

## 用户体验改进

1. **一致性**: ESC 键的行为现在是一致的 - 总是退出截图模式
2. **符合预期**: 用户按 ESC 通常期望"取消"或"退出"，而不是"重置"
3. **多屏幕友好**: 在多屏幕环境下，一次按键就能关闭所有截图窗口
4. **简化操作**: 用户不需要在每个屏幕上分别按 ESC

## 替代方案（如果需要重置选区功能）

如果将来需要"重置选区"功能，可以考虑：

1. **添加工具栏按钮**: 在工具栏添加"重新选择"按钮（已有 RotateCcw 按钮）
2. **使用不同快捷键**: 例如 `Ctrl+R` 或 `Cmd+R` 重置选区
3. **双 ESC 逻辑**: 第一次 ESC 重置选区，第二次 ESC 关闭窗口（不推荐，容易混淆）

## 测试建议

### 单屏幕测试

1. 触发截图
2. 不选择区域，直接按 ESC → 应该关闭截图窗口 ✅
3. 触发截图
4. 选择一个区域，按 ESC → 应该关闭截图窗口 ✅

### 多屏幕测试

1. 在多屏幕环境下触发截图
2. 在屏幕 A 上选择区域
3. 聚焦到屏幕 A，按 ESC → 应该关闭所有屏幕的截图窗口 ✅
4. 触发截图
5. 在屏幕 A 上选择区域
6. 聚焦到屏幕 B（没有选区），按 ESC → 应该关闭所有屏幕的截图窗口 ✅

## 相关代码

### 前端 (src/views/ScreenshotWindow.vue)

```typescript
// ESC 键处理
const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === "Escape") {
    e.preventDefault();
    close();  // 总是关闭所有窗口
  } else if (e.key === "Enter" && selection.value) {
    e.preventDefault();
    confirmSelection();
  }
};

// 关闭函数
const close = async () => {
  isReady.value = false;
  selection.value = null;
  captures.value = [];
  setActiveTool(null);
  disposeFabricCanvas();
  
  // 调用后端命令关闭所有截图窗口
  await invoke("close_capture");
};
```

### 后端 (src-tauri/src/commands.rs)

```rust
#[tauri::command]
pub async fn close_capture(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Closing all screenshot windows");
    
    // 关闭所有截图窗口
    for (label, window) in app.webview_windows() {
        if label.starts_with("screenshot_") {
            let _ = window.close();
        }
    }

    // 清理临时文件
    let file_manager = state.file_manager.clone();
    tauri::async_runtime::spawn_blocking(move || {
        if let Err(e) = file_manager.delete_all_temp_files() {
            log::error!("Failed to cleanup temp files: {}", e);
        }
    })
    .await
    .map_err(|e| e.to_string())?;

    // 清空当前捕获状态
    if let Ok(mut c) = state.current_captures.lock() {
        *c = None;
    }

    Ok(())
}
```

## 总结

这个修复确保了在多屏幕环境下，按 ESC 键能够正确关闭所有截图窗口，提供了更一致和符合用户预期的体验。
