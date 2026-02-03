<script setup lang="ts">
import { onMounted, onUnmounted, ref, nextTick, computed } from "vue";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
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
} from "lucide-vue-next";
import { useToast } from "@/composables/useToast";
import { CaptureResult } from "@/types";

const { showToast } = useToast();

// Drawing shape types
type ShapeType = "rect" | "ellipse" | "arrow" | "pen";

interface BaseShape {
  type: ShapeType;
  id: string;
}

interface RectShape extends BaseShape {
  type: "rect";
  x: number;
  y: number;
  w: number;
  h: number;
}

interface EllipseShape extends BaseShape {
  type: "ellipse";
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ArrowShape extends BaseShape {
  type: "arrow";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface PenPoint {
  x: number;
  y: number;
}

interface PenShape extends BaseShape {
  type: "pen";
  points: PenPoint[];
}

type DrawingShape = RectShape | EllipseShape | ArrowShape | PenShape;

// Canvas refs
const bgCanvas = ref<HTMLCanvasElement | null>(null);
const maskCanvas = ref<HTMLCanvasElement | null>(null);
const magnifierCanvas = ref<HTMLCanvasElement | null>(null);
const selectionCanvas = ref<HTMLCanvasElement | null>(null);

// State
const captures = ref<CaptureResult[]>([]);
const isReady = ref(false);
const isSelecting = ref(false);
const isDragging = ref(false);
const isResizing = ref(false);
const isDrawing = ref(false);
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

// Active tool
const activeTool = ref<string | null>(null);

// Drawing shapes
const shapes = ref<DrawingShape[]>([]);
const selectedShape = ref<DrawingShape | null>(null);
const isMovingShape = ref(false);
const isResizingShape = ref(false);
const shapeResizeHandle = ref<string | null>(null);

// Drawing state
const drawingStartPos = ref({ x: 0, y: 0 });
const currentShape = ref<DrawingShape | null>(null);
const drawingHistory = ref<DrawingShape[][]>([]);
const historyIndex = ref(-1);

// Drawing config
const drawingConfig = {
  strokeColor: "#ff0000",
  strokeWidth: 3,
  fillColor: "transparent",
};

// Pixel color under cursor
const pixelColor = ref({ r: 0, g: 0, b: 0, hex: "#000000" });

// Computed bounds of all screens (physical pixels)
const bounds = computed(() => {
  if (captures.value.length === 0) {
    return { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
  }
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  captures.value.forEach((c) => {
    minX = Math.min(minX, c.x);
    minY = Math.min(minY, c.y);
    maxX = Math.max(maxX, c.x + c.width);
    maxY = Math.max(maxY, c.y + c.height);
  });
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
});

let unlistenCapture: UnlistenFn | null = null;

onMounted(async () => {
  document.addEventListener("keydown", handleKeyDown);
  document.addEventListener("mousemove", handleGlobalMouseMove);

  unlistenCapture = await listen<CaptureResult[]>(
    "screenshot-captured",
    async (event) => {
      captures.value = event.payload;
      await nextTick();
      await renderBackground();
      resetSelection();
      isReady.value = true;
    },
  );
});

onUnmounted(() => {
  document.removeEventListener("keydown", handleKeyDown);
  document.removeEventListener("mousemove", handleGlobalMouseMove);
  if (unlistenCapture) {
    unlistenCapture();
  }
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
      ctx.drawImage(
        result.img,
        result.cap.x - bounds.value.x,
        result.cap.y - bounds.value.y,
        result.cap.width,
        result.cap.height,
      );
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

// Convert global coordinates to selection-relative coordinates
const toSelectionCoords = (x: number, y: number) => {
  if (!selection.value) return { x: 0, y: 0 };
  return {
    x: x - selection.value.x,
    y: y - selection.value.y,
  };
};

// Render selection canvas with content from bgCanvas
const renderSelectionCanvas = () => {
  const selCanvas = selectionCanvas.value;
  const bgCvs = bgCanvas.value;
  if (!selCanvas || !bgCvs || !selection.value) return;

  const { x, y, w, h } = selection.value;
  selCanvas.width = w;
  selCanvas.height = h;

  const ctx = selCanvas.getContext("2d");
  const bgCtx = bgCvs.getContext("2d");
  if (!ctx || !bgCtx) return;

  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(bgCvs, x, y, w, h, 0, 0, w, h);

  drawingHistory.value = [];
  historyIndex.value = -1;
  saveDrawingState();
};

// Update selection canvas content when moving or resizing
const updateSelectionCanvasContent = () => {
  const selCanvas = selectionCanvas.value;
  const bgCvs = bgCanvas.value;
  if (!selCanvas || !bgCvs || !selection.value) return;

  const { x, y, w, h } = selection.value;

  const ctx = selCanvas.getContext("2d");
  const bgCtx = bgCvs.getContext("2d");
  if (!ctx || !bgCtx) return;

  selCanvas.width = w;
  selCanvas.height = h;

  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(bgCvs, x, y, w, h, 0, 0, w, h);

  drawingHistory.value = [];
  historyIndex.value = -1;
  saveDrawingState();
};

// Save current drawing state to history
const saveDrawingState = () => {
  if (historyIndex.value < drawingHistory.value.length - 1) {
    drawingHistory.value = drawingHistory.value.slice(
      0,
      historyIndex.value + 1,
    );
  }

  drawingHistory.value.push([...shapes.value]);
  historyIndex.value = drawingHistory.value.length - 1;
};

// Check if point is inside a shape
const getShapeAtPoint = (x: number, y: number): DrawingShape | null => {
  for (let i = shapes.value.length - 1; i >= 0; i--) {
    const shape = shapes.value[i];
    if (isPointInShape(x, y, shape)) {
      return shape;
    }
  }
  return null;
};

// Check if point is inside a shape
const isPointInShape = (x: number, y: number, shape: DrawingShape): boolean => {
  const threshold = 10;

  switch (shape.type) {
    case "rect":
      return (
        x >= shape.x - threshold &&
        x <= shape.x + shape.w + threshold &&
        y >= shape.y - threshold &&
        y <= shape.y + shape.h + threshold
      );
    case "ellipse":
      const cx = shape.x + shape.w / 2;
      const cy = shape.y + shape.h / 2;
      const rx = Math.abs(shape.w / 2);
      const ry = Math.abs(shape.h / 2);
      const dx = x - cx;
      const dy = y - cy;
      return (
        (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <=
        1 + threshold / Math.min(rx, ry)
      );
    case "arrow":
      const dist1 = pointToLineDistance(
        x,
        y,
        shape.x1,
        shape.y1,
        shape.x2,
        shape.y2,
      );
      return dist1 < threshold;
    case "pen":
      for (let i = 0; i < shape.points.length - 1; i++) {
        const dist = pointToLineDistance(
          x,
          y,
          shape.points[i].x,
          shape.points[i].y,
          shape.points[i + 1].x,
          shape.points[i + 1].y,
        );
        if (dist < threshold) return true;
      }
      return false;
  }
};

// Calculate distance from point to line segment
const pointToLineDistance = (
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number => {
  const A = px - x1;
  const B = py - y1;
  const C = x2 - x1;
  const D = y2 - y1;

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = -1;

  if (lenSq !== 0) param = dot / lenSq;

  let xx, yy;

  if (param < 0) {
    xx = x1;
    yy = y1;
  } else if (param > 1) {
    xx = x2;
    yy = y2;
  } else {
    xx = x1 + param * C;
    yy = y1 + param * D;
  }

  const dx = px - xx;
  const dy = py - yy;
  return Math.sqrt(dx * dx + dy * dy);
};

// Get resize handle for a shape
const getShapeResizeHandle = (
  x: number,
  y: number,
  shape: DrawingShape,
): string | null => {
  const threshold = 10;

  switch (shape.type) {
    case "rect":
    case "ellipse":
      const corners = [
        { x: shape.x, y: shape.y, handle: "nw" },
        { x: shape.x + shape.w, y: shape.y, handle: "ne" },
        { x: shape.x, y: shape.y + shape.h, handle: "sw" },
        { x: shape.x + shape.w, y: shape.y + shape.h, handle: "se" },
      ];
      for (const corner of corners) {
        if (
          Math.abs(x - corner.x) < threshold &&
          Math.abs(y - corner.y) < threshold
        ) {
          return corner.handle;
        }
      }
      return null;
    case "arrow":
      if (
        Math.abs(x - shape.x1) < threshold &&
        Math.abs(y - shape.y1) < threshold
      ) {
        return "start";
      }
      if (
        Math.abs(x - shape.x2) < threshold &&
        Math.abs(y - shape.y2) < threshold
      ) {
        return "end";
      }
      return null;
    case "pen":
      return null;
  }
};

// Undo last drawing action
const undoDrawing = () => {
  if (historyIndex.value <= 0) return;

  historyIndex.value--;
  shapes.value = [...drawingHistory.value[historyIndex.value]];
  renderShapes();
};

// Render all shapes to canvas
const renderShapes = (extraShapes: DrawingShape[] = []) => {
  const selCanvas = selectionCanvas.value;
  if (!selCanvas) return;

  const ctx = selCanvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, selCanvas.width, selCanvas.height);

  [...shapes.value, ...extraShapes].forEach((shape) => {
    ctx.strokeStyle = drawingConfig.strokeColor;
    ctx.lineWidth = drawingConfig.strokeWidth;
    ctx.fillStyle = drawingConfig.fillColor;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    switch (shape.type) {
      case "rect":
        ctx.strokeRect(shape.x, shape.y, shape.w, shape.h);
        break;
      case "ellipse":
        ctx.beginPath();
        ctx.ellipse(
          shape.x + shape.w / 2,
          shape.y + shape.h / 2,
          Math.abs(shape.w / 2),
          Math.abs(shape.h / 2),
          0,
          0,
          2 * Math.PI,
        );
        ctx.stroke();
        break;
      case "arrow":
        drawArrow(ctx, shape.x1, shape.y1, shape.x2, shape.y2);
        break;
      case "pen":
        if (shape.points.length > 1) {
          ctx.beginPath();
          ctx.moveTo(shape.points[0].x, shape.points[0].y);
          for (let i = 1; i < shape.points.length; i++) {
            ctx.lineTo(shape.points[i].x, shape.points[i].y);
          }
          ctx.stroke();
        }
        break;
    }
  });
};

// Draw arrow helper
const drawArrow = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) => {
  const headLength = 15;
  const angle = Math.atan2(y2 - y1, x2 - x1);

  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(
    x2 - headLength * Math.cos(angle - Math.PI / 6),
    y2 - headLength * Math.sin(angle - Math.PI / 6),
  );
  ctx.moveTo(x2, y2);
  ctx.lineTo(
    x2 - headLength * Math.cos(angle + Math.PI / 6),
    y2 - headLength * Math.sin(angle + Math.PI / 6),
  );
  ctx.stroke();
};

// Mouse handlers
const handleMouseDown = (e: MouseEvent) => {
  const target = e.target as HTMLElement;
  if (target.closest(".toolbar") || target.closest("button")) return;

  const pos = toCanvasCoords(e.clientX, e.clientY);

  if (selection.value) {
    const selPos = toSelectionCoords(pos.x, pos.y);

    if (shapes.value.length > 0) {
      const shape = getShapeAtPoint(selPos.x, selPos.y);
      if (shape) {
        const handle = getShapeResizeHandle(selPos.x, selPos.y, shape);
        if (handle) {
          isResizingShape.value = true;
          shapeResizeHandle.value = handle;
          selectedShape.value = shape;
          dragStartPos.value = selPos;
          return;
        }

        isMovingShape.value = true;
        selectedShape.value = shape;
        dragStartPos.value = selPos;
        return;
      }

      selectedShape.value = null;
    }

    if (shapes.value.length === 0) {
      const handle = getResizeHandle(pos.x, pos.y);
      if (handle) {
        isResizing.value = true;
        resizeHandle.value = handle;
        dragStartPos.value = pos;
        dragStartSelection.value = { ...selection.value };
        return;
      }

      if (isInsideSelection(pos.x, pos.y)) {
        if (activeTool.value) {
          isDrawing.value = true;
          drawingStartPos.value = toSelectionCoords(pos.x, pos.y);
          return;
        }

        isDragging.value = true;
        dragStartPos.value = pos;
        dragStartSelection.value = { ...selection.value };
        return;
      }
    }

    if (activeTool.value) {
      return;
    }
  }

  isSelecting.value = true;
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
    updateSelectionCanvasContent();
    return;
  }

  if (isDragging.value && dragStartSelection.value) {
    if (shapes.value.length > 0) return;

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
    if (shapes.value.length > 0) return;

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

  if (isDrawing.value && activeTool.value) {
    handleDrawing(pos.x, pos.y);
  }

  if (isMovingShape.value && selectedShape.value) {
    const selPos = toSelectionCoords(pos.x, pos.y);
    const dx = selPos.x - dragStartPos.value.x;
    const dy = selPos.y - dragStartPos.value.y;

    switch (selectedShape.value.type) {
      case "rect":
      case "ellipse":
        selectedShape.value.x += dx;
        selectedShape.value.y += dy;
        break;
      case "arrow":
        selectedShape.value.x1 += dx;
        selectedShape.value.y1 += dy;
        selectedShape.value.x2 += dx;
        selectedShape.value.y2 += dy;
        break;
      case "pen":
        selectedShape.value.points.forEach((point) => {
          point.x += dx;
          point.y += dy;
        });
        break;
    }

    dragStartPos.value = selPos;
    renderShapes();
    return;
  }

  if (isResizingShape.value && selectedShape.value && shapeResizeHandle.value) {
    const selPos = toSelectionCoords(pos.x, pos.y);
    const dx = selPos.x - dragStartPos.value.x;
    const dy = selPos.y - dragStartPos.value.y;

    switch (selectedShape.value.type) {
      case "rect":
      case "ellipse":
        switch (shapeResizeHandle.value) {
          case "nw":
            selectedShape.value.x += dx;
            selectedShape.value.y += dy;
            selectedShape.value.w -= dx;
            selectedShape.value.h -= dy;
            break;
          case "ne":
            selectedShape.value.y += dy;
            selectedShape.value.w += dx;
            selectedShape.value.h -= dy;
            break;
          case "sw":
            selectedShape.value.x += dx;
            selectedShape.value.w -= dx;
            selectedShape.value.h += dy;
            break;
          case "se":
            selectedShape.value.w += dx;
            selectedShape.value.h += dy;
            break;
        }
        break;
      case "arrow":
        if (shapeResizeHandle.value === "start") {
          selectedShape.value.x1 = selPos.x;
          selectedShape.value.y1 = selPos.y;
        } else if (shapeResizeHandle.value === "end") {
          selectedShape.value.x2 = selPos.x;
          selectedShape.value.y2 = selPos.y;
        }
        break;
    }

    dragStartPos.value = selPos;
    renderShapes();
    return;
  }
};

const handleDrawing = (x: number, y: number) => {
  if (!selection.value) return;

  const currentPos = toSelectionCoords(x, y);
  const start = drawingStartPos.value;

  switch (activeTool.value) {
    case "rect":
      currentShape.value = {
        type: "rect",
        id: Date.now().toString(),
        x: start.x,
        y: start.y,
        w: currentPos.x - start.x,
        h: currentPos.y - start.y,
      };
      break;
    case "ellipse":
      currentShape.value = {
        type: "ellipse",
        id: Date.now().toString(),
        x: start.x,
        y: start.y,
        w: currentPos.x - start.x,
        h: currentPos.y - start.y,
      };
      break;
    case "arrow":
      currentShape.value = {
        type: "arrow",
        id: Date.now().toString(),
        x1: start.x,
        y1: start.y,
        x2: currentPos.x,
        y2: currentPos.y,
      };
      break;
    case "pen":
      if (!currentShape.value) {
        currentShape.value = {
          type: "pen",
          id: Date.now().toString(),
          points: [{ x: start.x, y: start.y }],
        };
      }
      if (currentShape.value.type === "pen") {
        currentShape.value.points.push({ x: currentPos.x, y: currentPos.y });
      }
      break;
  }

  const tempShapes = [...shapes.value];
  if (currentShape.value) {
    tempShapes.push(currentShape.value);
  }
  renderShapes(tempShapes);
};

const handleMouseUp = () => {
  if (isSelecting.value) {
    isSelecting.value = false;
    if (selection.value && (selection.value.w < 10 || selection.value.h < 10)) {
      selection.value = null;
      renderMask();
    } else if (selection.value) {
      renderSelectionCanvas();
    }
  }

  if (isDrawing.value && activeTool.value && currentShape.value) {
    shapes.value.push(currentShape.value);
    currentShape.value = null;
    saveDrawingState();
  }

  if (isMovingShape.value) {
    isMovingShape.value = false;
    selectedShape.value = null;
    saveDrawingState();
  }

  if (isResizingShape.value) {
    isResizingShape.value = false;
    shapeResizeHandle.value = null;
    selectedShape.value = null;
    saveDrawingState();
  }

  isDragging.value = false;
  isResizing.value = false;
  isDrawing.value = false;
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

  const selPos = toSelectionCoords(x, y);

  if (shapes.value.length > 0) {
    const shape = getShapeAtPoint(selPos.x, selPos.y);
    if (shape) {
      const handle = getShapeResizeHandle(selPos.x, selPos.y, shape);
      if (handle) {
        cursorStyle.value = "crosshair";
        return;
      }
      cursorStyle.value = "move";
      return;
    }
  }

  if (activeTool.value) {
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
    cursorStyle.value = "move";
    return;
  }

  cursorStyle.value = "crosshair";
};

// Double click to select full screen
const handleDoubleClick = () => {
  selection.value = { x: 0, y: 0, w: bounds.value.w, h: bounds.value.h };
  renderMask();
};

const resetSelection = () => {
  selection.value = null;
  isSelecting.value = false;
  isDragging.value = false;
  isResizing.value = false;
  isDrawing.value = false;
  isMovingShape.value = false;
  isResizingShape.value = false;
  activeTool.value = null;
  shapes.value = [];
  selectedShape.value = null;
  currentShape.value = null;
  drawingHistory.value = [];
  historyIndex.value = -1;
  renderMask();
};

// Confirm and save screenshot
const confirmSelection = async () => {
  if (!selection.value || !selectionCanvas.value) return;

  const selCanvas = selectionCanvas.value;
  const blob = await new Promise<Blob | null>((resolve) =>
    selCanvas.toBlob(resolve, "image/png"),
  );
  if (!blob) return;

  try {
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onloadend = async () => {
      const base64data = reader.result as string;
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
  } catch (e) {
    console.error(e);
    showToast("处理失败: " + String(e));
  }
};

// Download screenshot
const downloadScreenshot = async () => {
  if (!selection.value || !selectionCanvas.value) return;

  const link = document.createElement("a");
  link.download = `screenshot_${Date.now()}.png`;
  link.href = selectionCanvas.value.toDataURL("image/png");
  link.click();
  showToast("截图已下载");
};

const close = () => {
  isReady.value = false;
  selection.value = null;
  captures.value = [];
  getCurrentWindow().hide();
};

// Toolbar position
const toolbarStyle = computed(() => {
  if (!selection.value) return { display: "none" };

  const logicalX = selection.value.x / scaleFactor.value.x;
  const logicalY = selection.value.y / scaleFactor.value.y;
  const logicalW = selection.value.w / scaleFactor.value.x;
  const logicalH = selection.value.h / scaleFactor.value.y;

  const toolbarWidth = 340;
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

// Selection canvas style
const selectionCanvasStyle = computed(() => {
  if (!selection.value) return {};
  return {
    left: `${selection.value.x / scaleFactor.value.x}px`,
    top: `${selection.value.y / scaleFactor.value.y}px`,
    width: `${selection.value.w / scaleFactor.value.x}px`,
    height: `${selection.value.h / scaleFactor.value.y}px`,
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

    <!-- Selection Canvas (for editing) -->
    <canvas
      v-if="selection"
      ref="selectionCanvas"
      class="absolute pointer-events-none"
      :style="selectionCanvasStyle"
    />

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
      <div
        class="flex items-center bg-[#2b2b2b] rounded-lg shadow-2xl overflow-hidden"
      >
        <!-- Drawing Tools -->
        <div class="flex items-center border-r border-gray-600 px-1">
          <button
            class="p-2 hover:bg-white/10 transition-colors rounded"
            :class="{ 'bg-white/20': activeTool === 'rect' }"
            @click.stop="activeTool = activeTool === 'rect' ? null : 'rect'"
            title="矩形"
          >
            <Square class="w-4 h-4 text-white" />
          </button>
          <button
            class="p-2 hover:bg-white/10 transition-colors rounded"
            :class="{ 'bg-white/20': activeTool === 'ellipse' }"
            @click.stop="
              activeTool = activeTool === 'ellipse' ? null : 'ellipse'
            "
            title="椭圆"
          >
            <Circle class="w-4 h-4 text-white" />
          </button>
          <button
            class="p-2 hover:bg-white/10 transition-colors rounded"
            :class="{ 'bg-white/20': activeTool === 'arrow' }"
            @click.stop="activeTool = activeTool === 'arrow' ? null : 'arrow'"
            title="箭头"
          >
            <ArrowRight class="w-4 h-4 text-white" />
          </button>
          <button
            class="p-2 hover:bg-white/10 transition-colors rounded"
            :class="{ 'bg-white/20': activeTool === 'pen' }"
            @click.stop="activeTool = activeTool === 'pen' ? null : 'pen'"
            title="画笔"
          >
            <Pencil class="w-4 h-4 text-white" />
          </button>
          <button
            class="p-2 hover:bg-white/10 transition-colors rounded"
            :class="{ 'bg-white/20': activeTool === 'text' }"
            @click.stop="activeTool = activeTool === 'text' ? null : 'text'"
            title="文字"
          >
            <Type class="w-4 h-4 text-white" />
          </button>
        </div>

        <!-- Undo -->
        <div class="flex items-center border-r border-gray-600 px-1">
          <button
            class="p-2 hover:bg-white/10 transition-colors rounded"
            :class="{ 'opacity-50 cursor-not-allowed': historyIndex <= 0 }"
            :disabled="historyIndex <= 0"
            @click.stop="undoDrawing"
            title="撤销"
          >
            <Undo2 class="w-4 h-4 text-white" />
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
