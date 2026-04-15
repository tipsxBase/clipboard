/**
 * @deprecated NON-MAINLINE — This composable is superseded by useFabricCanvas.ts.
 * Do NOT extend or use in new code. The maintained screenshot mainline is
 * ScreenshotWindow.vue + useFabricCanvas.ts.
 *
 * 截图窗口 Composable
 * 集成所有核心模块，提供完整的截图功能
 */
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen, emit, type UnlistenFn } from '@tauri-apps/api/event';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import type { CaptureResult } from '@/types';
import { ErrorType } from '@/types';

// 导入核心模块
import {
  CanvasManager,
  annotationManager,
  historyManager,
  eventManager,
  errorHandler,
  toastManager,
  throttle,
} from '@/lib';

export function useScreenshotWindow() {
  // ==================== 状态管理 ====================
  const captures = ref<CaptureResult[]>([]);
  const isReady = ref(false);
  const currentScreenId = ref<number | null>(null);

  // 画布引用
  const bgCanvas = ref<HTMLCanvasElement | null>(null);
  const maskCanvas = ref<HTMLCanvasElement | null>(null);
  const magnifierCanvas = ref<HTMLCanvasElement | null>(null);
  const annotationCanvas = ref<HTMLCanvasElement | null>(null);

  // 画布管理器实例
  let canvasManager: CanvasManager | null = null;

  // 缩放因子
  const scaleFactor = ref({ x: 1, y: 1 });

  // 坐标转换辅助函数
  const clientToCanvas = (clientX: number, clientY: number) => ({
    x: clientX * scaleFactor.value.x,
    y: clientY * scaleFactor.value.y,
  });

  // 选区状态
  const selection = ref<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  const isSelecting = ref(false);
  const isDragging = ref(false);
  const isResizing = ref(false);
  const resizeHandle = ref<string | null>(null);

  // 鼠标位置
  const mousePos = ref({ x: 0, y: 0 });
  const startPos = ref({ x: 0, y: 0 });
  const dragStartPos = ref({ x: 0, y: 0 });
  const dragStartSelection = ref<typeof selection.value>(null);

  // 像素颜色
  const pixelColor = ref({ r: 0, g: 0, b: 0, hex: '#000000' });

  // 事件监听器
  let unlistenCapture: UnlistenFn | null = null;
  let unlistenSelection: UnlistenFn | null = null;

  // ==================== 计算属性 ====================
  const bounds = computed(() => {
    if (captures.value.length > 0) {
      const c = captures.value[0];
      return { x: 0, y: 0, width: c.width, height: c.height };
    }
    return {
      x: 0,
      y: 0,
      width: window.innerWidth * window.devicePixelRatio,
      height: window.innerHeight * window.devicePixelRatio,
    };
  });

  const selectionSize = computed(() => {
    if (!selection.value) return '';
    return `${Math.round(selection.value.width)} × ${Math.round(selection.value.height)}`;
  });

  // ==================== 初始化 ====================
  const initializeCanvas = async () => {
    if (!bgCanvas.value || !maskCanvas.value || !magnifierCanvas.value || !annotationCanvas.value) {
      return;
    }

    try {
      // 创建画布管理器实例
      canvasManager = new CanvasManager();

      // 设置画布尺寸
      const w = bounds.value.width;
      const h = bounds.value.height;

      bgCanvas.value.width = w;
      bgCanvas.value.height = h;
      maskCanvas.value.width = w;
      maskCanvas.value.height = h;
      annotationCanvas.value.width = w;
      annotationCanvas.value.height = h;

      // 计算缩放因子
      await nextTick();
      const rect = bgCanvas.value.getBoundingClientRect();
      scaleFactor.value = {
        x: w / rect.width,
        y: h / rect.height,
      };

      // 初始化画布
      canvasManager.initCanvas(
        bgCanvas.value,
        maskCanvas.value,
        annotationCanvas.value,
        magnifierCanvas.value
      );

      console.log('Canvas manager initialized');
    } catch (error) {
      errorHandler.logError(ErrorType.CANVAS_RENDER_FAILED, 'Canvas initialization failed', error);
      toastManager.error('画布初始化失败');
    }
  };

  const renderBackground = async () => {
    if (!canvasManager || captures.value.length === 0) return;

    try {
      const capture = captures.value[0];
      const imageUrl = convertFileSrc(capture.path);

      // 加载背景图片
      await canvasManager.setBackgroundImage(imageUrl);

      console.log('Background rendered');
    } catch (error) {
      errorHandler.logError(ErrorType.CANVAS_RENDER_FAILED, 'Background render failed', {
        capturePath: captures.value[0]?.path,
        error,
      });
      toastManager.error('背景图片加载失败');
    }
  };

  // ==================== 选区操作 ====================
  const renderMask = () => {
    if (!canvasManager) return;
    canvasManager.renderMask(selection.value);
  };

  const resetSelection = () => {
    selection.value = null;
    isSelecting.value = false;
    isDragging.value = false;
    isResizing.value = false;
    resizeHandle.value = null;
    dragStartSelection.value = null;

    // 清除标注
    annotationManager.clearAll();
    historyManager.clearHistory();

    renderMask();

    // 发布事件
    eventManager.emit('selection:cancelled');
  };

  // ==================== 鼠标事件处理 ====================
  const handleGlobalMouseMove = throttle((e: MouseEvent) => {
    mousePos.value = { x: e.clientX, y: e.clientY };

    if (!canvasManager) return;

    // 转换为物理像素坐标
    const physicalPos = clientToCanvas(e.clientX, e.clientY);

    // 更新像素颜色
    const color = canvasManager.getPixelColor(physicalPos);
    pixelColor.value = color;

    // 更新放大镜
    if (!selection.value) {
      canvasManager.renderMagnifier(physicalPos, true);
    }
  }, 16);

  const handleMouseDown = (e: MouseEvent) => {
    const target = e.target as HTMLElement;

    // 忽略工具栏点击
    if (target.closest('.toolbar') || target.closest('button')) return;

    if (!canvasManager) return;

    const pos = clientToCanvas(e.clientX, e.clientY);

    if (selection.value) {
      // 已有选区，检查是否在调整手柄上
      const handle = getResizeHandle(pos.x, pos.y);
      if (handle) {
        isResizing.value = true;
        resizeHandle.value = handle;
        dragStartPos.value = pos;
        dragStartSelection.value = { ...selection.value };
        return;
      }

      // 检查是否在选区内（拖动）
      if (isInsideSelection(pos.x, pos.y)) {
        isDragging.value = true;
        dragStartPos.value = pos;
        dragStartSelection.value = { ...selection.value };
        return;
      }

      // 点击在选区外，不允许重新创建选区
      return;
    }

    // 开始新选区
    isSelecting.value = true;
    startPos.value = pos;
    selection.value = { x: pos.x, y: pos.y, width: 0, height: 0 };

    // 通知其他窗口
    emit('selection-started', { id: currentScreenId.value });
    eventManager.emit('selection:created');

    renderMask();
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!canvasManager) return;

    const pos = clientToCanvas(e.clientX, e.clientY);

    if (isSelecting.value) {
      const x = Math.min(startPos.value.x, pos.x);
      const y = Math.min(startPos.value.y, pos.y);
      const width = Math.abs(pos.x - startPos.value.x);
      const height = Math.abs(pos.y - startPos.value.y);

      selection.value = { x, y, width, height };
      renderMask();
      eventManager.emit('selection:updated', selection.value);
      return;
    }

    if (isDragging.value && dragStartSelection.value) {
      const dx = pos.x - dragStartPos.value.x;
      const dy = pos.y - dragStartPos.value.y;

      let newX = dragStartSelection.value.x + dx;
      let newY = dragStartSelection.value.y + dy;

      // 边界限制
      newX = Math.max(0, Math.min(bounds.value.width - dragStartSelection.value.width, newX));
      newY = Math.max(0, Math.min(bounds.value.height - dragStartSelection.value.height, newY));

      selection.value = {
        x: newX,
        y: newY,
        width: dragStartSelection.value.width,
        height: dragStartSelection.value.height,
      };

      renderMask();
      eventManager.emit('selection:updated', selection.value);
      return;
    }

    if (isResizing.value && dragStartSelection.value && resizeHandle.value) {
      const dx = pos.x - dragStartPos.value.x;
      const dy = pos.y - dragStartPos.value.y;

      const { x: sx, y: sy, width: sw, height: sh } = dragStartSelection.value;
      let newX = sx,
        newY = sy,
        newW = sw,
        newH = sh;

      // 根据手柄类型调整选区
      switch (resizeHandle.value) {
        case 'nw':
          newX = sx + dx;
          newY = sy + dy;
          newW = sw - dx;
          newH = sh - dy;
          break;
        case 'ne':
          newY = sy + dy;
          newW = sw + dx;
          newH = sh - dy;
          break;
        case 'sw':
          newX = sx + dx;
          newW = sw - dx;
          newH = sh + dy;
          break;
        case 'se':
          newW = sw + dx;
          newH = sh + dy;
          break;
        case 'n':
          newY = sy + dy;
          newH = sh - dy;
          break;
        case 's':
          newH = sh + dy;
          break;
        case 'w':
          newX = sx + dx;
          newW = sw - dx;
          break;
        case 'e':
          newW = sw + dx;
          break;
      }

      // 处理负尺寸
      if (newW < 0) {
        newX = newX + newW;
        newW = -newW;
      }
      if (newH < 0) {
        newY = newY + newH;
        newH = -newH;
      }

      // 边界限制
      newX = Math.max(0, newX);
      newY = Math.max(0, newY);
      newW = Math.min(bounds.value.width - newX, newW);
      newH = Math.min(bounds.value.height - newY, newH);

      selection.value = { x: newX, y: newY, width: newW, height: newH };
      renderMask();
      eventManager.emit('selection:updated', selection.value);
    }
  };

  const handleMouseUp = () => {
    if (isSelecting.value) {
      isSelecting.value = false;

      // 如果选区太小，选中全屏
      if (selection.value && (selection.value.width < 10 || selection.value.height < 10)) {
        selection.value = {
          x: 0,
          y: 0,
          width: bounds.value.width,
          height: bounds.value.height,
        };
      }

      renderMask();
      eventManager.emit('selection:created', selection.value);
    }

    isDragging.value = false;
    isResizing.value = false;
    resizeHandle.value = null;
    dragStartSelection.value = null;
  };

  // ==================== 辅助函数 ====================
  const getResizeHandle = (x: number, y: number): string | null => {
    if (!selection.value) return null;

    const { x: sx, y: sy, width: w, height: h } = selection.value;
    const threshold = 12;

    // 检查角点
    if (Math.abs(x - sx) < threshold && Math.abs(y - sy) < threshold) return 'nw';
    if (Math.abs(x - (sx + w)) < threshold && Math.abs(y - sy) < threshold) return 'ne';
    if (Math.abs(x - sx) < threshold && Math.abs(y - (sy + h)) < threshold) return 'sw';
    if (Math.abs(x - (sx + w)) < threshold && Math.abs(y - (sy + h)) < threshold) return 'se';

    // 检查边
    if (Math.abs(x - sx) < threshold && y > sy && y < sy + h) return 'w';
    if (Math.abs(x - (sx + w)) < threshold && y > sy && y < sy + h) return 'e';
    if (Math.abs(y - sy) < threshold && x > sx && x < sx + w) return 'n';
    if (Math.abs(y - (sy + h)) < threshold && x > sx && x < sx + w) return 's';

    return null;
  };

  const isInsideSelection = (x: number, y: number): boolean => {
    if (!selection.value) return false;
    const { x: sx, y: sy, width: w, height: h } = selection.value;
    return x > sx && x < sx + w && y > sy && y < sy + h;
  };

  // ==================== 键盘事件 ====================
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (selection.value) {
        resetSelection();
      } else {
        close();
      }
    } else if (e.key === 'Enter' && selection.value) {
      e.preventDefault();
      confirmSelection();
    }
  };

  // ==================== 确认和关闭 ====================
  const confirmSelection = async () => {
    if (!selection.value || !canvasManager) return;

    try {
      // 导出选区图片
      const dataUrl = canvasManager.exportSelection(selection.value);

      // 保存到剪贴板
      const savedPath = await invoke('save_captured_image', {
        base64Data: dataUrl,
      });

      await invoke('set_clipboard_item', {
        content: savedPath as string,
        kind: 'image',
        id: null,
        htmlContent: null,
      });

      toastManager.success('截图已保存到剪贴板');

      // 发布事件
      eventManager.emit('selection:confirmed', { path: savedPath });

      // 关闭窗口
      await close();
    } catch (error) {
      errorHandler.logError(ErrorType.CAPTURE_FAILED, 'Confirm selection failed', {
        selection: selection.value,
        error,
      });
      toastManager.error('保存失败: ' + String(error));
    }
  };

  const close = async () => {
    try {
      isReady.value = false;
      selection.value = null;
      captures.value = [];

      // 清理画布
      if (canvasManager) {
        canvasManager.clearAll();
        canvasManager = null;
      }

      // 清理标注和历史
      annotationManager.clearAll();
      historyManager.clearHistory();

      // 通知后端清理
      await invoke('close_capture');

      // 发布事件
      eventManager.emit('capture:completed');
    } catch (error) {
      errorHandler.logError(ErrorType.WINDOW_CREATE_FAILED, 'Close window failed', error);
    }
  };

  // ==================== 生命周期 ====================
  onMounted(async () => {
    try {
      // 添加事件监听
      document.addEventListener('keydown', handleKeyDown);
      document.addEventListener('mousemove', handleGlobalMouseMove);

      // 获取屏幕 ID
      const urlParams = new URLSearchParams(window.location.search);
      const screenIdParam = urlParams.get('screen_id');
      currentScreenId.value = screenIdParam ? parseInt(screenIdParam, 10) : null;

      // 监听选区开始事件
      unlistenSelection = await listen('selection-started', (event: any) => {
        if (event.payload.id !== currentScreenId.value) {
          resetSelection();
        }
      });

      // 处理捕获数据
      const processCaptures = async (allCaptures: CaptureResult[]) => {
        const sId = currentScreenId.value;
        const targetCapture = sId !== null ? allCaptures.find((c) => c.id === sId) : allCaptures[0];

        if (targetCapture) {
          captures.value = [targetCapture];
          await nextTick();
          await initializeCanvas();
          await renderBackground();
          resetSelection();
          isReady.value = true;
          getCurrentWindow().setFocus();
        }
      };

      // 监听截图捕获事件
      unlistenCapture = await listen<CaptureResult[]>('screenshot-captured', async (event) => {
        await processCaptures(event.payload);
      });

      // 尝试立即获取数据
      try {
        const data = await invoke<CaptureResult[]>('get_capture_data');
        await processCaptures(data);
      } catch (e) {
        console.log('No initial capture data found, waiting for event.', e);
      }
    } catch (error) {
      errorHandler.logError(ErrorType.CAPTURE_FAILED, 'Mount failed', error);
      toastManager.error('初始化失败');
    }
  });

  onUnmounted(() => {
    // 移除事件监听
    document.removeEventListener('keydown', handleKeyDown);
    document.removeEventListener('mousemove', handleGlobalMouseMove);

    if (unlistenCapture) unlistenCapture();
    if (unlistenSelection) unlistenSelection();

    // 清理资源
    if (canvasManager) {
      canvasManager.clearAll();
    }
  });

  // ==================== 返回接口 ====================
  return {
    // 状态
    isReady,
    selection,
    isSelecting,
    isDragging,
    isResizing,
    mousePos,
    pixelColor,
    selectionSize,
    bounds,

    // Canvas refs
    bgCanvas,
    maskCanvas,
    magnifierCanvas,
    annotationCanvas,

    // 方法
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    resetSelection,
    confirmSelection,
    close,
  };
}
