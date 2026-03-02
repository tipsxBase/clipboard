# 截图工具核心模块文档

本目录包含截图工具的所有核心模块，提供完整的截图、标注、历史管理等功能。

## 模块概览

### 1. CoordinateSystem（坐标系统）
负责处理逻辑像素和物理像素之间的转换，支持多显示器场景。

```typescript
import { coordinateSystem } from '@/lib';

// 初始化屏幕信息
coordinateSystem.initScreens(screens);

// 坐标转换
const physical = coordinateSystem.logicalToPhysical({ x: 100, y: 100 }, 0);
const logical = coordinateSystem.physicalToLogical(physical, 0);
```

### 2. WindowManager（窗口管理器）
管理所有截图窗口的生命周期，包括创建、关闭和事件处理。

```typescript
import { windowManager } from '@/lib';

// 创建截图窗口
const windows = await windowManager.createCaptureWindows(captures);

// 注册窗口关闭回调
windowManager.onWindowClosed((windowId) => {
  console.log(`Window ${windowId} closed`);
});

// 关闭所有窗口
await windowManager.closeAllWindows();
```

### 3. CanvasManager（画布管理器）
管理多层画布的渲染和交互，包括背景、遮罩、标注和放大镜。

```typescript
import { CanvasManager } from '@/lib';

const canvasManager = new CanvasManager();

// 初始化画布
canvasManager.initCanvas(
  backgroundCanvas,
  maskCanvas,
  annotationCanvas,
  magnifierCanvas,
  screenIndex
);

// 设置背景图片
await canvasManager.setBackgroundImage(imageUrl);

// 渲染选区遮罩
canvasManager.renderMask(selection);

// 获取像素颜色
const color = canvasManager.getPixelColor({ x: 100, y: 100 });
```

### 4. AnnotationManager（标注管理器）
管理所有标注工具和标注对象，支持矩形、椭圆、箭头、画笔、文字、马赛克和模糊。

```typescript
import { annotationManager } from '@/lib';

// 设置当前工具
annotationManager.setActiveTool('rect');

// 创建标注
const annotation = annotationManager.createAnnotation(
  'rect',
  { x: 10, y: 10, width: 100, height: 100 },
  annotationManager.getStyle()
);

// 应用马赛克效果
annotationManager.applyMosaic(ctx, region, 10);

// 应用模糊效果
annotationManager.applyBlur(ctx, region, 5);
```

### 5. HistoryManager（历史管理器）
管理撤销/重做历史记录和截图历史。

```typescript
import { historyManager } from '@/lib';

// 保存状态（带防抖）
historyManager.saveState(JSON.stringify(state));

// 撤销/重做
const previousState = historyManager.undo();
const nextState = historyManager.redo();

// 保存截图到历史
await historyManager.saveScreenshot({
  id: 'screenshot_1',
  thumbnail: thumbnailDataUrl,
  fullImage: fullImagePath,
  width: 1920,
  height: 1080,
  createdAt: Date.now(),
  annotations: [],
});

// 获取截图历史
const history = await historyManager.getScreenshotHistory();
```

### 6. EventManager（事件管理器）
提供事件发布/订阅机制，解耦模块间通信。

```typescript
import { eventManager } from '@/lib';

// 订阅事件
const unsubscribe = eventManager.on('capture:completed', (payload) => {
  console.log('Capture completed:', payload);
});

// 发布事件
eventManager.emit('capture:completed', { screenCount: 2 });

// 取消订阅
unsubscribe();
```

### 7. ConfigManager（配置管理器）
管理用户配置和快捷键。

```typescript
import { configManager } from '@/lib';

// 加载配置
const config = await configManager.loadConfig();

// 更新配置
await configManager.updateConfig({
  saveOptions: {
    defaultFormat: 'jpg',
    defaultQuality: 85,
  },
});

// 验证快捷键
const isValid = configManager.validateShortcut('Ctrl+Shift+A');

// 检测快捷键冲突
const conflicts = configManager.detectShortcutConflicts(config.shortcuts);
```

### 8. PerformanceUtils（性能工具）
提供节流、防抖、性能监控等工具。

```typescript
import { throttle, debounce, performanceMonitor, fpsCounter } from '@/lib';

// 节流函数（16ms 间隔）
const throttledHandler = throttle(handleMouseMove, 16);

// 防抖函数（300ms 延迟）
const debouncedSave = debounce(saveState, 300);

// 性能监控
performanceMonitor.startTimer('render');
// ... 执行渲染操作
const duration = performanceMonitor.endTimer('render');

// FPS 计数
fpsCounter.start();
const fps = fpsCounter.getFPS();
```

### 9. ErrorHandler（错误处理）
统一的错误处理和用户反馈。

```typescript
import { errorHandler, toastManager, dialogManager } from '@/lib';

// 记录错误
errorHandler.logError('CAPTURE_FAILED', 'Failed to capture screen', error);

// 显示提示
toastManager.success('截图保存成功');
toastManager.error('截图失败，请重试');

// 显示对话框
const confirmed = await dialogManager.confirm('确认', '是否保存截图？');
```

## 使用示例

### 完整的截图流程

```typescript
import {
  windowManager,
  coordinateSystem,
  CanvasManager,
  annotationManager,
  historyManager,
  eventManager,
  errorHandler,
  toastManager,
} from '@/lib';

async function startScreenshot() {
  try {
    // 1. 捕获屏幕
    eventManager.emit('capture:started');
    const captures = await invoke('capture_all_screens');

    // 2. 初始化坐标系统
    coordinateSystem.initScreens(
      captures.map((c) => ({
        index: c.id,
        x: c.x,
        y: c.y,
        width: c.width,
        height: c.height,
        scaleFactor: c.scale_factor,
      }))
    );

    // 3. 创建窗口
    const windows = await windowManager.createCaptureWindows(captures);

    // 4. 初始化画布
    const canvasManager = new CanvasManager();
    canvasManager.initCanvas(
      backgroundCanvas,
      maskCanvas,
      annotationCanvas,
      magnifierCanvas,
      0
    );

    // 5. 加载背景图片
    await canvasManager.setBackgroundImage(captures[0].path);

    // 6. 设置标注工具
    annotationManager.setActiveTool('rect');

    // 7. 保存截图
    const dataUrl = canvasManager.exportSelection(selection);
    await historyManager.saveScreenshot({
      id: `screenshot_${Date.now()}`,
      thumbnail: await historyManager.generateThumbnail(dataUrl),
      fullImage: dataUrl,
      width: selection.width,
      height: selection.height,
      createdAt: Date.now(),
      annotations: annotationManager.getAllAnnotations(),
    });

    // 8. 清理
    await windowManager.closeAllWindows();
    eventManager.emit('capture:completed');
    toastManager.success('截图保存成功');
  } catch (error) {
    errorHandler.logError('CAPTURE_FAILED', 'Screenshot failed', error);
    toastManager.error('截图失败，请重试');
  }
}
```

## 架构特点

1. **模块化设计**：每个模块职责单一，低耦合高内聚
2. **类型安全**：完整的 TypeScript 类型定义
3. **性能优化**：离屏画布、RAF、防抖节流
4. **错误处理**：完善的错误捕获和日志记录
5. **事件驱动**：使用事件总线解耦模块间通信
6. **资源管理**：自动清理临时文件和过期数据

## 注意事项

1. 所有单例实例（如 `windowManager`、`annotationManager` 等）在应用中全局共享
2. 画布管理器需要为每个屏幕创建独立实例
3. 性能监控工具在开发模式下使用，生产环境可以禁用
4. 错误处理器会自动捕获全局错误和未处理的 Promise 拒绝
5. 配置管理器使用 localStorage 持久化配置

## 测试

每个模块都应该有对应的单元测试，使用 Vitest 进行测试：

```bash
# 运行所有测试
npm run test

# 运行特定模块测试
npm run test -- CoordinateSystem
```

## 贡献

在修改核心模块时，请确保：
1. 保持类型定义的完整性
2. 添加详细的中文注释
3. 更新相关文档
4. 编写单元测试
5. 遵循代码风格规范
