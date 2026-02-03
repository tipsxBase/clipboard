<script setup lang="ts">
import { onMounted, onUnmounted, ref, nextTick, computed } from "vue";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen, emit, type UnlistenFn } from "@tauri-apps/api/event";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import {
  Check,
  X,
  RotateCcw,
  Download,
  Square,
  Circle,
  ArrowRight,
  Pencil,
  Type,
  Undo2,
  Redo2,
} from "lucide-vue-next";
import { useToast } from "@/composables/useToast";
import {
  useFabricCanvas,
  type DrawingToolType,
} from "@/composables/useFabricCanvas";
import type { CaptureResult } from "@/types";

const { showToast } = useToast();

// Canvas refs
const bgCanvas = ref<HTMLCanvasElement | null>(null);
const maskCanvas = ref<HTMLCanvasElement | null>(null);
const magnifierCanvas = ref<HTMLCanvasElement | null>(null);
const selectionCanvasEl = ref<HTMLCanvasElement | null>(null);

import { type TPointerEvent } from "fabric";

// Fabric.js Canvas
const {
  fabricCanvas,
  activeTool: fabricActiveTool,
  initCanvas: initFabricCanvas,
  setBackgroundImage,
  setActiveTool,
  saveHistory,
  undo,
  redo,
  canUndo,
  canRedo,
  resetHistory,
  setStrokeColor,
  setStrokeWidth,
  drawingConfig,
  toDataURL,
  dispose: disposeFabricCanvas,
} = useFabricCanvas({
  strokeColor: "#ff0000",
  strokeWidth: 3,
  fillColor: "transparent",
});

// State
const captures = ref<CaptureResult[]>([]);
const isReady = ref(false);
const isSelecting = ref(false);
const isDragging = ref(false);
const isResizing = ref(false);
const resizeHandle = ref<string | null>(null);

// Mouse position (logical pixels)
const mousePos = ref({ x: 0, y: 0 });
// Mouse position (physical/canvas pixels)
const canvasMousePos = ref({ x: 0, y: 0 });

// Selection state (physical pixels)
const selection = ref<{ x: number; y: number; w: number; h: number } | null>(
  null,
);
const startPos = ref({ x: 0, y: 0 });
const dragStartPos = ref({ x: 0, y: 0 });
const dragStartSelection = ref<{
  x: number;
  y: number;
  w: number;
  h: number;
} | null>(null);

// Scale factor for coordinate conversion
const scaleFactor = ref({ x: 1, y: 1 });

// Pixel color under cursor
const pixelColor = ref({ r: 0, g: 0, b: 0, hex: "#000000" });

// Computed bounds of all screens (physical pixels)
// With Per-Monitor Window strategy, bounds is simply the window dimensions
const bounds = computed(() => {
  if (captures.value.length > 0) {
    const c = captures.value[0];
    return { x: 0, y: 0, w: c.width, h: c.height };
  }
  return {
    x: 0,
    y: 0,
    w: window.innerWidth * window.devicePixelRatio,
    h: window.innerHeight * window.devicePixelRatio,
  };
});

const currentScreenId = ref<number | null>(null);
let unlistenCapture: UnlistenFn | null = null;
let unlistenSelection: UnlistenFn | null = null;
// let unlistenCloseAll: UnlistenFn | null = null; // Removed: Backend handles closing now

onMounted(async () => {
  document.addEventListener("keydown", handleKeyDown);
  document.addEventListener("mousemove", handleGlobalMouseMove);

  // Parse screen_id from URL query params
  const urlParams = new URLSearchParams(window.location.search);
  const screenIdParam = urlParams.get("screen_id");
  const screenId = screenIdParam ? parseInt(screenIdParam, 10) : null;
  currentScreenId.value = screenId;

  // Listen for selection start in other windows
  unlistenSelection = await listen("selection-started", (event: any) => {
    if (event.payload.id !== currentScreenId.value) {
      resetSelection();
    }
  });

  // Removed close-all-screens listener as we now rely on backend close_capture for reliable multi-window closing

  console.log("Screenshot Window Mounted. Screen ID:", screenId);

  const processCaptures = async (allCaptures: CaptureResult[]) => {
    console.log("Processing captures:", allCaptures);

    let targetCapture: CaptureResult | undefined;
    const sId = currentScreenId.value;

    if (sId !== null) {
      targetCapture = allCaptures.find((c) => c.id === sId);
    } else {
      console.warn("No screen_id provided, defaulting to first capture.");
      targetCapture = allCaptures[0];
    }

    if (targetCapture) {
      captures.value = [targetCapture];
      await nextTick();
      await renderBackground();
      resetSelection();
      isReady.value = true;
      getCurrentWindow().setFocus();
    } else {
      console.error("Could not find capture for ID:", sId);
    }
  };

  unlistenCapture = await listen<CaptureResult[]>(
    "screenshot-captured",
    async (event) => {
      await processCaptures(event.payload);
    },
  );

  // Try to fetch data immediately (in case event was missed)
  try {
    const data = await invoke<CaptureResult[]>("get_capture_data");
    await processCaptures(data);
  } catch (e) {
    console.log("No initial capture data found, waiting for event.", e);
  }
});

onUnmounted(() => {
  document.removeEventListener("keydown", handleKeyDown);
  document.removeEventListener("mousemove", handleGlobalMouseMove);
  if (unlistenCapture) {
    unlistenCapture();
  }
  if (unlistenSelection) {
    unlistenSelection();
  }
  // Removed unlistenCloseAll
});

const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === "Escape") {
    e.preventDefault();
    if (selection.value) {
      resetSelection();
    } else {
      close();
    }
  } else if (e.key === "Enter" && selection.value) {
    e.preventDefault();
    confirmSelection();
  }
};

// Track mouse globally for coordinate display
const handleGlobalMouseMove = (e: MouseEvent) => {
  mousePos.value = { x: e.clientX, y: e.clientY };
  const pos = toCanvasCoords(e.clientX, e.clientY);
  canvasMousePos.value = pos;
  updatePixelColor(pos.x, pos.y);
  updateMagnifier(pos.x, pos.y);
};

// Load image with crossOrigin
const loadImage = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
};

// Render background canvas
const renderBackground = async () => {
  const canvas = bgCanvas.value;
  if (!canvas) return;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;

  const w = bounds.value.w;
  const h = bounds.value.h;

  canvas.width = w;
  canvas.height = h;

  await nextTick();
  const rect = canvas.getBoundingClientRect();
  scaleFactor.value = {
    x: w / rect.width,
    y: h / rect.height,
  };

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const loadPromises = captures.value.map(async (cap) => {
    try {
      const img = await loadImage(convertFileSrc(cap.path));
      return { img, cap };
    } catch (e) {
      console.error("Error loading screenshot:", cap.path, e);
      return null;
    }
  });

  const results = await Promise.all(loadPromises);
  for (const result of results) {
    if (result) {
      // Draw image at (0, 0) because the window is now aligned with the screen
      // and we only have one capture per window
      ctx.drawImage(result.img, 0, 0, result.cap.width, result.cap.height);
    }
  }

  if (maskCanvas.value) {
    maskCanvas.value.width = w;
    maskCanvas.value.height = h;
    renderMask();
  }
};

// Render mask overlay
const renderMask = () => {
  const cvs = maskCanvas.value;
  if (!cvs) return;
  const ctx = cvs.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, cvs.width, cvs.height);
  ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
  ctx.fillRect(0, 0, cvs.width, cvs.height);

  if (selection.value && selection.value.w > 0 && selection.value.h > 0) {
    const { x, y, w, h } = selection.value;

    // Clear selection area
    ctx.clearRect(x, y, w, h);
    // Draw border
    ctx.strokeStyle = "#00e676";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);

    // Draw resize handles
    const handleSize = 8;
    ctx.fillStyle = "#00e676";

    // 8 handles: corners + edge midpoints
    const handles = [
      { x: x - handleSize / 2, y: y - handleSize / 2 },
      { x: x + w / 2 - handleSize / 2, y: y - handleSize / 2 },
      { x: x + w - handleSize / 2, y: y - handleSize / 2 },
      { x: x - handleSize / 2, y: y + h / 2 - handleSize / 2 },
      { x: x + w - handleSize / 2, y: y + h / 2 - handleSize / 2 },
      { x: x - handleSize / 2, y: y + h - handleSize / 2 },
      { x: x + w / 2 - handleSize / 2, y: y + h - handleSize / 2 },
      { x: x + w - handleSize / 2, y: y + h - handleSize / 2 },
    ];

    handles.forEach((handle) => {
      ctx.fillRect(handle.x, handle.y, handleSize, handleSize);
    });

    // Draw dashed lines (rule of thirds)
    ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    ctx.beginPath();
    ctx.moveTo(x + w / 3, y);
    ctx.lineTo(x + w / 3, y + h);
    ctx.moveTo(x + (w * 2) / 3, y);
    ctx.lineTo(x + (w * 2) / 3, y + h);
    ctx.moveTo(x, y + h / 3);
    ctx.lineTo(x + w, y + h / 3);
    ctx.moveTo(x, y + (h * 2) / 3);
    ctx.lineTo(x + w, y + (h * 2) / 3);
    ctx.stroke();
    ctx.setLineDash([]);
  }
};

// Update pixel color under cursor
const updatePixelColor = (x: number, y: number) => {
  const canvas = bgCanvas.value;
  if (!canvas) return;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;

  try {
    const pixel = ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
    const r = pixel[0];
    const g = pixel[1];
    const b = pixel[2];
    const hex =
      `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`.toUpperCase();
    pixelColor.value = { r, g, b, hex };
  } catch {
    // Ignore errors
  }
};

// Update magnifier
const updateMagnifier = (x: number, y: number) => {
  const magCanvas = magnifierCanvas.value;
  const bgCvs = bgCanvas.value;
  if (!magCanvas || !bgCvs || selection.value) return;

  const ctx = magCanvas.getContext("2d");
  const bgCtx = bgCvs.getContext("2d", { willReadFrequently: true });
  if (!ctx || !bgCtx) return;

  const magSize = 120;
  const zoomLevel = 4;
  const sourceSize = magSize / zoomLevel;

  magCanvas.width = magSize;
  magCanvas.height = magSize;

  ctx.imageSmoothingEnabled = false;

  // Draw zoomed area
  ctx.drawImage(
    bgCvs,
    x - sourceSize / 2,
    y - sourceSize / 2,
    sourceSize,
    sourceSize,
    0,
    0,
    magSize,
    magSize,
  );

  // Draw crosshair
  ctx.strokeStyle = "#00e676";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(magSize / 2, 0);
  ctx.lineTo(magSize / 2, magSize);
  ctx.moveTo(0, magSize / 2);
  ctx.lineTo(magSize, magSize / 2);
  ctx.stroke();

  // Draw border
  ctx.strokeStyle = "#00e676";
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, magSize, magSize);
};

// Convert client to canvas coordinates
const toCanvasCoords = (clientX: number, clientY: number) => ({
  x: clientX * scaleFactor.value.x,
  y: clientY * scaleFactor.value.y,
});

// Check if point is on resize handle
const getResizeHandle = (x: number, y: number): string | null => {
  if (!selection.value) return null;
  const { x: sx, y: sy, w, h } = selection.value;
  const threshold = 12;

  // Corners
  if (Math.abs(x - sx) < threshold && Math.abs(y - sy) < threshold) return "nw";
  if (Math.abs(x - (sx + w)) < threshold && Math.abs(y - sy) < threshold)
    return "ne";
  if (Math.abs(x - sx) < threshold && Math.abs(y - (sy + h)) < threshold)
    return "sw";
  if (Math.abs(x - (sx + w)) < threshold && Math.abs(y - (sy + h)) < threshold)
    return "se";

  // Edges
  if (Math.abs(x - sx) < threshold && y > sy && y < sy + h) return "w";
  if (Math.abs(x - (sx + w)) < threshold && y > sy && y < sy + h) return "e";
  if (Math.abs(y - sy) < threshold && x > sx && x < sx + w) return "n";
  if (Math.abs(y - (sy + h)) < threshold && x > sx && x < sx + w) return "s";

  return null;
};

// Check if point is inside selection
const isInsideSelection = (x: number, y: number): boolean => {
  if (!selection.value) return false;
  const { x: sx, y: sy, w, h } = selection.value;
  return x > sx && x < sx + w && y > sy && y < sy + h;
};

// Render selection canvas with Fabric.js
const renderSelectionCanvas = async () => {
  const bgCvs = bgCanvas.value;
  if (!bgCvs || !selection.value) return;

  const { x, y, w, h } = selection.value;

  // 等待 DOM 更新
  await nextTick();

  const canvasEl = selectionCanvasEl.value;
  if (!canvasEl) return;

  // 创建临时 canvas 获取选区图像
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = w;
  tempCanvas.height = h;
  const tempCtx = tempCanvas.getContext("2d");
  if (!tempCtx) return;

  tempCtx.drawImage(bgCvs, x, y, w, h, 0, 0, w, h);

  // 计算 CSS 尺寸（逻辑像素）
  const cssWidth = w / scaleFactor.value.x;
  const cssHeight = h / scaleFactor.value.y;

  // 初始化 Fabric Canvas（使用物理像素尺寸，CSS 尺寸用于高 DPI 支持）
  initFabricCanvas(canvasEl, w, h, cssWidth, cssHeight);

  // 设置背景图像
  await setBackgroundImage(tempCanvas.toDataURL());

  // 重置历史
  resetHistory();
  saveHistory();
};

// Update selection canvas content when moving or resizing
const updateSelectionCanvasContent = async () => {
  const bgCvs = bgCanvas.value;
  if (!bgCvs || !selection.value || !fabricCanvas.value) return;

  const { x, y, w, h } = selection.value;

  // 如果尺寸变化，需要重新初始化
  const canvasEl = selectionCanvasEl.value;
  if (!canvasEl) return;

  // 创建临时 canvas 获取选区图像
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = w;
  tempCanvas.height = h;
  const tempCtx = tempCanvas.getContext("2d");
  if (!tempCtx) return;

  tempCtx.drawImage(bgCvs, x, y, w, h, 0, 0, w, h);

  // 计算 CSS 尺寸（逻辑像素）
  const cssWidth = w / scaleFactor.value.x;
  const cssHeight = h / scaleFactor.value.y;

  // 重新初始化 Fabric Canvas
  initFabricCanvas(canvasEl, w, h, cssWidth, cssHeight);

  // 设置背景图像
  await setBackgroundImage(tempCanvas.toDataURL());

  // 重置历史
  resetHistory();
  saveHistory();
};

// Check if Fabric canvas has objects
const hasFabricObjects = (): boolean => {
  return (fabricCanvas.value?.getObjects().length ?? 0) > 0;
};

// Undo last drawing action
const undoDrawing = async () => {
  await undo();
};

// 切换绘图工具（使用 composable 中的逻辑）
const selectTool = (tool: DrawingToolType) => {
  if (fabricActiveTool.value === tool) {
    // 取消选择工具
    setActiveTool(null);
  } else {
    // 选择新工具
    setActiveTool(tool);
    fabricCanvas.value?.discardActiveObject();
    fabricCanvas.value?.renderAll();
  }
};

// Mouse handlers - 只处理选区相关操作，绘图由 Fabric.js 处理
const handleMouseDown = (e: MouseEvent) => {
  const target = e.target as HTMLElement;

  // 如果点击在工具栏或按钮上，忽略
  if (target.closest(".toolbar") || target.closest("button")) return;

  // 如果点击在 Fabric canvas 上，让 Fabric 处理
  // Fabric canvas 的 upper-canvas 会接收事件
  if (target.classList.contains("upper-canvas")) {
    return;
  }

  const pos = toCanvasCoords(e.clientX, e.clientY);

  if (selection.value) {
    // 已有选区时，不允许创建新选区（仿照 QQ/微信截图）
    // 点击在选区内 - 由 Fabric canvas 处理
    if (isInsideSelection(pos.x, pos.y)) {
      return;
    }

    // 点击在选区外部
    // 检查是否在调整手柄上（只有没有绘图对象时才允许调整选区）
    if (!hasFabricObjects()) {
      const handle = getResizeHandle(pos.x, pos.y);
      if (handle) {
        isResizing.value = true;
        resizeHandle.value = handle;
        dragStartPos.value = pos;
        dragStartSelection.value = { ...selection.value };
        return;
      }
    }

    // 点击在选区外部但已有选区 - 忽略（不允许重新画选区）
    return;
  }

  // 没有选区时，开始新的选区
  isSelecting.value = true;
  // Notify other windows to clear their selection
  emit("selection-started", { id: currentScreenId.value });
  startPos.value = pos;
  selection.value = { x: pos.x, y: pos.y, w: 0, h: 0 };
  renderMask();
};

const handleMouseMove = (e: MouseEvent) => {
  const pos = toCanvasCoords(e.clientX, e.clientY);

  updateCursor(pos.x, pos.y);

  if (isSelecting.value) {
    const x = Math.min(startPos.value.x, pos.x);
    const y = Math.min(startPos.value.y, pos.y);
    const w = Math.abs(pos.x - startPos.value.x);
    const h = Math.abs(pos.y - startPos.value.y);
    selection.value = { x, y, w, h };
    renderMask();
    return;
  }

  if (isDragging.value && dragStartSelection.value) {
    if (hasFabricObjects()) return;

    const dx = pos.x - dragStartPos.value.x;
    const dy = pos.y - dragStartPos.value.y;
    let newX = dragStartSelection.value.x + dx;
    let newY = dragStartSelection.value.y + dy;

    newX = Math.max(
      0,
      Math.min(bounds.value.w - dragStartSelection.value.w, newX),
    );
    newY = Math.max(
      0,
      Math.min(bounds.value.h - dragStartSelection.value.h, newY),
    );

    selection.value = {
      x: newX,
      y: newY,
      w: dragStartSelection.value.w,
      h: dragStartSelection.value.h,
    };
    renderMask();
    updateSelectionCanvasContent();
    return;
  }

  if (isResizing.value && dragStartSelection.value && resizeHandle.value) {
    if (hasFabricObjects()) return;

    const { x: sx, y: sy, w: sw, h: sh } = dragStartSelection.value;
    const dx = pos.x - dragStartPos.value.x;
    const dy = pos.y - dragStartPos.value.y;

    let newX = sx,
      newY = sy,
      newW = sw,
      newH = sh;

    switch (resizeHandle.value) {
      case "nw":
        newX = sx + dx;
        newY = sy + dy;
        newW = sw - dx;
        newH = sh - dy;
        break;
      case "ne":
        newY = sy + dy;
        newW = sw + dx;
        newH = sh - dy;
        break;
      case "sw":
        newX = sx + dx;
        newW = sw - dx;
        newH = sh + dy;
        break;
      case "se":
        newW = sw + dx;
        newH = sh + dy;
        break;
      case "n":
        newY = sy + dy;
        newH = sh - dy;
        break;
      case "s":
        newH = sh + dy;
        break;
      case "w":
        newX = sx + dx;
        newW = sw - dx;
        break;
      case "e":
        newW = sw + dx;
        break;
    }

    if (newW < 0) {
      newX = newX + newW;
      newW = -newW;
    }
    if (newH < 0) {
      newY = newY + newH;
      newH = -newH;
    }

    newX = Math.max(0, newX);
    newY = Math.max(0, newY);
    newW = Math.min(bounds.value.w - newX, newW);
    newH = Math.min(bounds.value.h - newY, newH);

    selection.value = { x: newX, y: newY, w: newW, h: newH };
    renderMask();
    updateSelectionCanvasContent();
    return;
  }
};

const handleMouseUp = () => {
  if (isSelecting.value) {
    isSelecting.value = false;
    // 如果选区太小（相当于单击），选中全屏（仿照 QQ/微信截图）
    if (selection.value && (selection.value.w < 10 || selection.value.h < 10)) {
      selection.value = { x: 0, y: 0, w: bounds.value.w, h: bounds.value.h };
      renderMask();
      renderSelectionCanvas();
    } else if (selection.value) {
      renderSelectionCanvas();
    }
  }

  isDragging.value = false;
  isResizing.value = false;
  resizeHandle.value = null;
  dragStartSelection.value = null;
};

// Update cursor style
const cursorStyle = ref("crosshair");

const cursorClass = computed(() => {
  if (!isReady.value) return "cursor-wait";
  return `cursor-${cursorStyle.value}`;
});

const updateCursor = (x: number, y: number) => {
  if (!selection.value) {
    cursorStyle.value = "crosshair";
    return;
  }

  if (fabricActiveTool.value) {
    cursorStyle.value = "crosshair";
    return;
  }

  const handle = getResizeHandle(x, y);
  if (handle) {
    const cursors: Record<string, string> = {
      nw: "nw-resize",
      ne: "ne-resize",
      sw: "sw-resize",
      se: "se-resize",
      n: "n-resize",
      s: "s-resize",
      w: "w-resize",
      e: "e-resize",
    };
    cursorStyle.value = cursors[handle] || "crosshair";
    return;
  }

  const inside = isInsideSelection(x, y);
  if (inside) {
    cursorStyle.value = hasFabricObjects() ? "crosshair" : "move";
    return;
  }

  cursorStyle.value = "crosshair";
};

// Double click handler（仿照 QQ/微信截图）
// 双击在任意位置都可以确认截图（选区内或选区外）
const handleDoubleClick = (e: MouseEvent) => {
  const target = e.target as HTMLElement;

  // 如果点击在工具栏或按钮上，忽略
  if (target.closest(".toolbar") || target.closest("button")) return;

  // 如果 Fabric 画布上有活动对象或者点击到了某个对象，优先让 Fabric 处理（例如双击编辑文字）
  if (fabricCanvas.value) {
    // 使用 Fabric 的点击检测
    // Fabric 6/7 中 getPointer 做了修改，或者我们直接通过事件获取坐标检测
    // 这里简单判断：如果有选中的对象，或者点击位置有对象，则不触发全屏截图
    if (fabricCanvas.value.getActiveObject()) return;

    // findTarget 需要 pointerEvent
    // 如果 e 是 MouseEvent，在 Fabric 中通常可以直接用
    // 但为了类型安全，先检查
    const targetObj = fabricCanvas.value.findTarget(
      e as unknown as TPointerEvent,
    );
    if (targetObj) return;
  }

  // 如果已有选区，双击直接确认截屏（不管在选区内还是选区外）
  if (selection.value && selection.value.w > 0 && selection.value.h > 0) {
    confirmSelection();
    return;
  }

  // 如果没有选区，双击选中全屏
  selection.value = { x: 0, y: 0, w: bounds.value.w, h: bounds.value.h };
  renderMask();
  renderSelectionCanvas();
};

const resetSelection = () => {
  selection.value = null;
  isSelecting.value = false;
  isDragging.value = false;
  isResizing.value = false;
  setActiveTool(null);
  disposeFabricCanvas();
  renderMask();
};

// Confirm and save screenshot
const confirmSelection = async () => {
  if (!selection.value || !fabricCanvas.value) return;

  // 使用 Fabric.js 导出图像
  const base64data = toDataURL("png");
  if (!base64data) return;

  try {
    const savedPath = await invoke("save_captured_image", {
      base64Data: base64data,
    });
    await invoke("set_clipboard_item", {
      content: savedPath as string,
      kind: "image",
      id: null,
      htmlContent: null,
    });
    showToast("截图已保存到剪贴板");
    close();
  } catch (e) {
    console.error(e);
    showToast("保存失败: " + String(e));
  }
};

// Download screenshot
const downloadScreenshot = () => {
  if (!selection.value || !fabricCanvas.value) return;

  const link = document.createElement("a");
  link.download = `screenshot_${Date.now()}.png`;
  link.href = toDataURL("png");
  link.click();
  showToast("截图已下载");
};

const close = async () => {
  isReady.value = false;
  selection.value = null;
  captures.value = [];
  setActiveTool(null);
  // 清理 Fabric Canvas
  disposeFabricCanvas();

  // Call Rust to ensure backend knows and cleans up
  await invoke("close_capture");
};

// Toolbar position
const toolbarStyle = computed(() => {
  if (!selection.value) return { display: "none" };

  const logicalX = selection.value.x / scaleFactor.value.x;
  const logicalY = selection.value.y / scaleFactor.value.y;
  const logicalW = selection.value.w / scaleFactor.value.x;
  const logicalH = selection.value.h / scaleFactor.value.y;

  // 增加工具栏宽度预估以容纳颜色和尺寸选择器
  const toolbarWidth = 520;
  const toolbarHeight = 40;
  const margin = 8;

  let left = logicalX + logicalW - toolbarWidth;
  if (left < margin) left = logicalX;
  if (left < margin) left = margin;
  if (left + toolbarWidth > window.innerWidth - margin) {
    left = window.innerWidth - toolbarWidth - margin;
  }

  let top: number;
  const spaceBelow = window.innerHeight - (logicalY + logicalH);
  const spaceAbove = logicalY;

  if (spaceBelow >= toolbarHeight + margin * 2) {
    top = logicalY + logicalH + margin;
  } else if (spaceAbove >= toolbarHeight + margin * 2) {
    top = logicalY - toolbarHeight - margin;
  } else {
    top = logicalY + logicalH - toolbarHeight - margin;
  }

  top = Math.max(
    margin,
    Math.min(window.innerHeight - toolbarHeight - margin, top),
  );

  return { left: `${left}px`, top: `${top}px` };
});

// Size info position
const sizeInfoStyle = computed(() => {
  if (!selection.value) return { display: "none" };

  const logicalX = selection.value.x / scaleFactor.value.x;
  const logicalY = selection.value.y / scaleFactor.value.y;

  let top = logicalY - 28;
  if (top < 8) top = logicalY + 8;

  return { left: `${logicalX}px`, top: `${top}px` };
});

// Magnifier position
const magnifierStyle = computed(() => {
  if (selection.value) return { display: "none" };

  const x = mousePos.value.x;
  const y = mousePos.value.y;
  const magSize = 140;
  const offset = 20;

  let left = x + offset;
  let top = y + offset;

  if (left + magSize > window.innerWidth) left = x - magSize - offset;
  if (top + magSize > window.innerHeight) top = y - magSize - offset;

  return { left: `${left}px`, top: `${top}px` };
});

// Selection size text
const selectionSize = computed(() => {
  if (!selection.value) return "";
  return `${Math.round(selection.value.w)} × ${Math.round(selection.value.h)}`;
});

// Selection canvas wrapper style (for positioning the Fabric canvas container)
const selectionCanvasWrapperStyle = computed(() => {
  if (!selection.value) return {};
  const cssWidth = selection.value.w / scaleFactor.value.x;
  const cssHeight = selection.value.h / scaleFactor.value.y;
  return {
    left: `${selection.value.x / scaleFactor.value.x}px`,
    top: `${selection.value.y / scaleFactor.value.y}px`,
    width: `${cssWidth}px`,
    height: `${cssHeight}px`,
  };
});

// Coordinate display
const coordDisplay = computed(() => {
  return `(${Math.round(canvasMousePos.value.x)}, ${Math.round(canvasMousePos.value.y)})`;
});
</script>

<template>
  <div
    :class="[
      'w-screen',
      'h-screen',
      'overflow-hidden',
      'relative',
      'select-none',
      cursorClass,
    ]"
    @mousedown="handleMouseDown"
    @mousemove="handleMouseMove"
    @mouseup="handleMouseUp"
    @dblclick="handleDoubleClick"
  >
    <!-- Background -->
    <canvas
      ref="bgCanvas"
      :class="[
        'absolute',
        'top-0',
        'left-0',
        'w-full',
        'h-full',
        'pointer-events-none',
        cursorClass,
      ]"
    />

    <!-- Mask -->
    <canvas
      ref="maskCanvas"
      :class="[
        'absolute',
        'top-0',
        'left-0',
        'w-full',
        'h-full',
        'pointer-events-none',
        cursorClass,
      ]"
    />

    <!-- Selection Canvas Wrapper (for positioning the Fabric.js canvas) -->
    <div v-if="selection" class="absolute" :style="selectionCanvasWrapperStyle">
      <canvas ref="selectionCanvasEl" />
    </div>

    <!-- Selection Size Info -->
    <div
      v-if="selection && selection.w > 0 && selection.h > 0"
      class="absolute px-2 py-1 bg-black/80 text-white text-xs font-mono rounded pointer-events-none z-40"
      :style="sizeInfoStyle"
    >
      {{ selectionSize }}
    </div>

    <!-- Magnifier (when no selection) -->
    <div
      v-if="isReady && !selection"
      class="absolute pointer-events-none z-40 rounded overflow-hidden shadow-lg"
      :style="magnifierStyle"
    >
      <canvas ref="magnifierCanvas" class="block" />
      <div class="bg-black/90 text-white text-xs px-2 py-1 font-mono">
        <div>{{ coordDisplay }}</div>
        <div class="flex items-center gap-2">
          <div
            class="w-3 h-3 rounded border border-white/50"
            :style="{ backgroundColor: pixelColor.hex }"
          />
          <span>{{ pixelColor.hex }}</span>
        </div>
      </div>
    </div>

    <!-- Toolbar -->
    <div
      v-if="
        selection &&
        !isSelecting &&
        !isDragging &&
        !isResizing &&
        selection.w > 10 &&
        selection.h > 10
      "
      class="toolbar absolute z-50 pointer-events-auto"
      :style="toolbarStyle"
    >
      <div class="flex items-center bg-[#2b2b2b] rounded-lg shadow-2xl">
        <!-- Drawing Tools -->
        <div class="flex items-center border-r border-gray-600 px-1">
          <button
            class="p-2 hover:bg-white/10 transition-colors rounded"
            :class="{ 'bg-white/20': fabricActiveTool === 'rect' }"
            @click.stop="selectTool('rect')"
            title="矩形"
          >
            <Square class="w-4 h-4 text-white" />
          </button>
          <button
            class="p-2 hover:bg-white/10 transition-colors rounded"
            :class="{ 'bg-white/20': fabricActiveTool === 'ellipse' }"
            @click.stop="selectTool('ellipse')"
            title="椭圆"
          >
            <Circle class="w-4 h-4 text-white" />
          </button>
          <button
            class="p-2 hover:bg-white/10 transition-colors rounded"
            :class="{ 'bg-white/20': fabricActiveTool === 'arrow' }"
            @click.stop="selectTool('arrow')"
            title="箭头"
          >
            <ArrowRight class="w-4 h-4 text-white" />
          </button>
          <button
            class="p-2 hover:bg-white/10 transition-colors rounded"
            :class="{ 'bg-white/20': fabricActiveTool === 'pen' }"
            @click.stop="selectTool('pen')"
            title="画笔"
          >
            <Pencil class="w-4 h-4 text-white" />
          </button>
          <button
            class="p-2 hover:bg-white/10 transition-colors rounded"
            :class="{ 'bg-white/20': fabricActiveTool === 'text' }"
            @click.stop="selectTool('text')"
            title="文字"
          >
            <Type class="w-4 h-4 text-white" />
          </button>
        </div>

        <!-- Color & Size Settings (Only show when tool is selected) -->
        <div
          v-if="fabricActiveTool"
          class="flex items-center border-r border-gray-600 px-2 gap-2"
        >
          <!-- Color Dropdown -->
          <div class="relative group">
            <button
              class="w-6 h-6 rounded-sm border border-white/50 overflow-hidden flex items-center justify-center"
            >
              <div
                class="w-full h-full"
                :style="{ backgroundColor: drawingConfig.strokeColor }"
              ></div>
            </button>

            <!-- Popup -->
            <div
              class="absolute top-full left-0 mt-2 p-2 bg-[#2b2b2b] rounded-lg shadow-xl border border-gray-600 hidden group-hover:grid grid-cols-4 gap-1 w-32 z-50 before:absolute before:-top-2 before:left-0 before:w-full before:h-2"
            >
              <button
                v-for="color in [
                  '#ff0000',
                  '#ffc800',
                  '#00b300',
                  '#0066ff',
                  '#ffffff',
                  '#808080',
                  '#000000',
                  '#800080',
                ]"
                :key="color"
                class="w-6 h-6 rounded hover:scale-110 transition-transform border border-white/20"
                :style="{ backgroundColor: color }"
                @click.stop="setStrokeColor(color)"
                @mousedown.prevent
              />
            </div>
          </div>

          <div
            v-if="fabricActiveTool !== 'text'"
            class="w-px h-4 bg-gray-600 mx-1"
          ></div>

          <!-- Size Dropdown -->
          <!-- Hide size for Text tool -->
          <div v-if="fabricActiveTool !== 'text'" class="relative group">
            <button
              class="w-6 h-6 rounded-sm hover:bg-white/10 flex items-center justify-center"
            >
              <div
                class="bg-white rounded-full"
                :style="{
                  width: Math.min(12, drawingConfig.strokeWidth + 2) + 'px',
                  height: Math.min(12, drawingConfig.strokeWidth + 2) + 'px',
                }"
              ></div>
            </button>

            <!-- Popup -->
            <div
              class="absolute top-full left-0 mt-2 p-2 bg-[#2b2b2b] rounded-lg shadow-xl border border-gray-600 hidden group-hover:flex flex-col gap-2 z-50 before:absolute before:-top-2 before:left-0 before:w-full before:h-2"
            >
              <button
                v-for="size in [3, 5, 9]"
                :key="size"
                class="p-1 hover:bg-white/10 rounded flex items-center justify-center w-8 h-8"
                :class="{ 'bg-white/20': drawingConfig.strokeWidth === size }"
                @click.stop="setStrokeWidth(size)"
              >
                <div
                  class="rounded-full bg-white"
                  :style="{ width: size + 'px', height: size + 'px' }"
                ></div>
              </button>
            </div>
          </div>
        </div>

        <!-- Undo/Redo -->
        <div class="flex items-center border-r border-gray-600 px-1">
          <button
            class="p-2 hover:bg-white/10 transition-colors rounded"
            :class="{ 'opacity-50 cursor-not-allowed': !canUndo() }"
            :disabled="!canUndo()"
            @click.stop="undoDrawing"
            title="撤销"
          >
            <Undo2 class="w-4 h-4 text-white" />
          </button>
          <button
            class="p-2 hover:bg-white/10 transition-colors rounded"
            :class="{ 'opacity-50 cursor-not-allowed': !canRedo() }"
            :disabled="!canRedo()"
            @click.stop="redo"
            title="重做"
          >
            <Redo2 class="w-4 h-4 text-white" />
          </button>
        </div>

        <!-- Actions -->
        <div class="flex items-center px-1">
          <button
            class="p-2 hover:bg-white/10 transition-colors rounded"
            @click.stop="downloadScreenshot"
            title="下载"
          >
            <Download class="w-4 h-4 text-white" />
          </button>
          <button
            class="p-2 hover:bg-white/10 transition-colors rounded"
            @click.stop="resetSelection"
            title="重新选择"
          >
            <RotateCcw class="w-4 h-4 text-white" />
          </button>
          <button
            class="p-2 hover:bg-white/10 transition-colors rounded"
            @click.stop="close"
            title="取消 (ESC)"
          >
            <X class="w-4 h-4 text-red-400" />
          </button>
          <button
            class="p-2 hover:bg-white/10 transition-colors rounded"
            @click.stop="confirmSelection"
            title="完成 (Enter)"
          >
            <Check class="w-4 h-4 text-green-400" />
          </button>
        </div>
      </div>
    </div>

    <!-- Keyboard Hints -->
    <div
      v-if="isReady"
      class="absolute top-3 right-3 flex gap-2 pointer-events-none z-30"
    >
      <div class="px-2 py-1 bg-black/60 text-white text-xs rounded">
        ESC 退出
      </div>
      <div
        v-if="selection"
        class="px-2 py-1 bg-black/60 text-white text-xs rounded"
      >
        Enter 确认
      </div>
    </div>

    <!-- Bottom Coordinates (when no selection) -->
    <div
      v-if="isReady && !selection"
      class="absolute bottom-3 left-3 px-3 py-1.5 bg-black/70 text-white text-xs font-mono rounded pointer-events-none z-30"
    >
      {{ coordDisplay }} | RGB({{ pixelColor.r }}, {{ pixelColor.g }},
      {{ pixelColor.b }}) | {{ pixelColor.hex }}
    </div>
  </div>
</template>

<style scoped>
.cursor-wait {
  cursor: wait !important;
}

.cursor-crosshair {
  cursor: crosshair !important;
}

.cursor-move {
  cursor: move !important;
}

.cursor-nw-resize {
  cursor: nw-resize !important;
}

.cursor-ne-resize {
  cursor: ne-resize !important;
}

.cursor-sw-resize {
  cursor: sw-resize !important;
}

.cursor-se-resize {
  cursor: se-resize !important;
}

.cursor-n-resize {
  cursor: n-resize !important;
}

.cursor-s-resize {
  cursor: s-resize !important;
}

.cursor-w-resize {
  cursor: w-resize !important;
}

.cursor-e-resize {
  cursor: e-resize !important;
}
</style>
