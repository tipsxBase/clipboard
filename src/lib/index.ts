/**
 * 截图工具核心模块统一导出
 */

// 坐标系统
export { CoordinateSystem, coordinateSystem } from './CoordinateSystem';

// 窗口管理器
export { WindowManager, windowManager } from './WindowManager';

// 画布管理器
export { CanvasManager } from './CanvasManager';

// 标注管理器
export { AnnotationManager, annotationManager } from './AnnotationManager';

// 历史管理器
export { HistoryManager, historyManager } from './HistoryManager';

// 事件管理器
export { EventManager, eventManager } from './EventManager';

// 配置管理器
export { ConfigManager, configManager } from './ConfigManager';

// 性能工具
export {
    throttle,
    debounce,
    rafThrottle,
    BatchExecutor,
    PerformanceMonitor,
    FPSCounter,
    MemoryMonitor,
    performanceMonitor,
    fpsCounter,
    memoryMonitor,
    batchExecutor,
} from './PerformanceUtils';

// 错误处理
export {
    ErrorHandler,
    ToastManager,
    DialogManager,
    errorHandler,
    toastManager,
    dialogManager,
} from './ErrorHandler';
