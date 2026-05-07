/**
 * React Hook for Fabric.js Canvas - Screenshot Annotation Tools
 *
 * Based on Vue composable useFabricCanvas.ts with React patterns:
 * - useRef for canvas instance and mutable state
 * - useState for reactive state
 * - useCallback for event handlers
 * - useEffect cleanup for StrictMode safety
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Canvas,
  FabricImage,
  FabricObject,
  Circle,
  type TPointerEvent,
  type TPointerEventInfo,
} from 'fabric';

import {
  ShapeRegistry,
  type ShapeType,
  type ShapePath,
  type ControlCircle,
} from '../composables/shapes';
import { setDebugState } from '../composables/shapes/debug';
import '../composables/shapes/rectHandler';
import '../composables/shapes/ellipseHandler';
import '../composables/shapes/arrowHandler';
import '../composables/shapes/penHandler';
import '../composables/shapes/textHandler';
import '../composables/shapes/blurHandler';
import '../composables/shapes/mosaicHandler';

export type DrawingToolType = ShapeType | null;

export interface DrawingConfig {
  strokeColor: string;
  strokeWidth: number;
  fillColor: string;
}

const defaultDrawingConfig: DrawingConfig = {
  strokeColor: '#ff0000',
  strokeWidth: 3,
  fillColor: 'transparent',
};

interface HistoryEntry {
  json: string;
}

export interface UseFabricCanvasOptions {
  strokeColor?: string;
  strokeWidth?: number;
  fillColor?: string;
}

export function useFabricCanvas(options: UseFabricCanvasOptions = {}) {
  // Merge options with defaults - use refs to avoid re-renders during drawing
  const drawingConfigRef = useRef<DrawingConfig>({
    ...defaultDrawingConfig,
    ...options,
  });

  // Fabric Canvas instance - use ref since it's a complex mutable object
  const fabricCanvasRef = useRef<Canvas | null>(null);

  // Reactive state for UI
  const [activeTool, setActiveToolState] = useState<DrawingToolType>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // Refs for event handlers to access latest values (avoid rebinding on state change)
  const activeToolRef = useRef<DrawingToolType>(null);
  const isDrawingRef = useRef(false);

  // Sync refs with state
  useEffect(() => {
    activeToolRef.current = activeTool;
  }, [activeTool]);

  useEffect(() => {
    isDrawingRef.current = isDrawing;
  }, [isDrawing]);

  // Drawing state - refs for performance during drawing operations
  const drawStartPointRef = useRef({ x: 0, y: 0 });
  const currentObjectRef = useRef<ShapePath | null>(null);
  const penPointsRef = useRef<Array<{ x: number; y: number }>>([]);

  // History state - refs since we don't need UI updates for each history change
  const historyRef = useRef<HistoryEntry[]>([]);
  const historyIndexRef = useRef(-1);
  const isLoadingHistoryRef = useRef(false);

  // Control points state
  const controlPointsRef = useRef<{
    shape: ShapePath | null;
    points: ControlCircle[];
  }>({ shape: null, points: [] });

  // Last object position for move calculations
  const lastObjectPositionRef = useRef<{ left: number; top: number } | null>(null);

  // Cleanup tracking
  const cleanupRef = useRef<(() => void)[]>([]);

  /**
   * Handle mouse down - start drawing
   */
  const handleMouseDown = useCallback(
    (opt: TPointerEventInfo<TPointerEvent>) => {
      const canvas = fabricCanvasRef.current;
      const tool = activeToolRef.current;
      if (!canvas || !tool) return;

      // If clicked on an object, let Fabric handle selection
      if (opt.target) return;

      // Clicked on empty area, start drawing
      setIsDrawing(true);
      const pointer = opt.scenePoint;
      drawStartPointRef.current = { x: pointer.x, y: pointer.y };
      penPointsRef.current = [{ x: pointer.x, y: pointer.y }];

      canvas.discardActiveObject();
      canvas.renderAll();
    },
    [] // No deps - uses refs
  );

  /**
   * Handle mouse move - drawing in progress
   */
  const handleMouseMove = useCallback(
    (opt: TPointerEventInfo<TPointerEvent>) => {
      const canvas = fabricCanvasRef.current;
      const tool = activeToolRef.current;
      const drawing = isDrawingRef.current;
      if (!canvas || !drawing || !tool) return;

      const pointer = opt.scenePoint;
      const start = drawStartPointRef.current;

      // Debug: set debug state for blur/mosaic
      if (tool === 'blur' || tool === 'mosaic') {
        setDebugState('lastDrawStart', start);
        setDebugState('lastDrawCurrent', { x: pointer.x, y: pointer.y });
        setDebugState('lastBlurData', {
          tool,
          canvasSize: { width: canvas.width, height: canvas.height },
        });
      }

      // Remove previous temporary object
      if (currentObjectRef.current) {
        canvas.remove(currentObjectRef.current as FabricObject);
      }

      // Clamp coordinates to canvas bounds
      const clampedX = Math.max(0, Math.min(pointer.x, canvas.width || 0));
      const clampedY = Math.max(0, Math.min(pointer.y, canvas.height || 0));
      const clampedPointer = { x: clampedX, y: clampedY };

      if (tool === 'pen') {
        penPointsRef.current.push(clampedPointer);
      }

      const handler = ShapeRegistry.getHandler(tool);
      if (!handler) return;

      const data = handler.createData(start, clampedPointer, penPointsRef.current);
      if (!data) return;

      const newObject = handler.createPath(data, drawingConfigRef.current);
      (newObject as ShapePath).shapeData = data;

      if (newObject) {
        newObject.set({
          selectable: false,
          evented: false,
        });
        canvas.add(newObject as FabricObject);
        currentObjectRef.current = newObject;
        canvas.renderAll();
      }
    },
    [] // No deps - uses refs
  );

  /**
   * Handle mouse up - finish drawing
   */
  const handleMouseUp = useCallback(() => {
    const canvas = fabricCanvasRef.current;
    const tool = activeToolRef.current;
    const drawing = isDrawingRef.current;
    if (!canvas || !drawing) return;

    setIsDrawing(false);

    // Handle text tool special case
    if (!currentObjectRef.current && tool === 'text') {
      const handler = ShapeRegistry.getHandler('text');
      if (handler) {
        const data = handler.createData(drawStartPointRef.current, drawStartPointRef.current);
        if (data) {
          const newObject = handler.createPath(data, drawingConfigRef.current);
          (newObject as ShapePath).shapeData = data;
          canvas.add(newObject as FabricObject);
          currentObjectRef.current = newObject as ShapePath;
        }
      }
    }

    if (currentObjectRef.current) {
      const isText =
        currentObjectRef.current.type === 'i-text' || currentObjectRef.current.type === 'text';

      currentObjectRef.current.set({
        selectable: true,
        evented: true,
        hasControls: isText,
        hasBorders: isText,
        lockScalingX: !isText,
        lockScalingY: !isText,
        perPixelTargetFind: !isText,
        strokeDashArray: isText ? undefined : [5, 5],
        hoverCursor: 'move',
        fill: isText ? drawingConfigRef.current.strokeColor : 'transparent',
        borderColor: isText ? '#999999' : 'transparent',
        borderDashArray: [4, 4],
        padding: 5,
        transparentCorners: false,
      });

      canvas.setActiveObject(currentObjectRef.current as FabricObject);

      if (currentObjectRef.current.type === 'i-text' || currentObjectRef.current.type === 'text') {
        (currentObjectRef.current as any).enterEditing();
      }

      canvas.renderAll();
      saveHistory();
      currentObjectRef.current = null;
    }

    penPointsRef.current = [];
  }, []); // No deps - uses refs

  /**
   * Create control points for a shape
   */
  const createControlPoints = useCallback((shape: ShapePath) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !shape.shapeData) return;

    removeControlPoints();

    const handler = ShapeRegistry.getHandler(shape.shapeData.type);
    if (!handler) return;

    const defs = handler.getControlPoints();
    const newPoints: ControlCircle[] = [];

    defs.forEach((def) => {
      const pos = def.getPosition(shape.shapeData!);

      const control = new Circle({
        left: pos.x,
        top: pos.y,
        radius: def.style?.radius || 6,
        fill: def.style?.fill || '#ffffff',
        stroke: def.style?.stroke || '#0066ff',
        strokeWidth: def.style?.strokeWidth || 2,
        originX: 'center',
        originY: 'center',
        selectable: true,
        hasControls: false,
        hasBorders: false,
        evented: true,
        hoverCursor: 'pointer',
        padding: 5,
      }) as ControlCircle;

      control.isControlPoint = true;
      control.pointId = def.id;

      control.on('moving', () => {
        updateShapeFromControl(shape, control, def);
      });

      canvas.add(control);
      newPoints.push(control);
    });

    controlPointsRef.current = {
      shape,
      points: newPoints,
    };

    newPoints.forEach((p) => canvas.bringObjectToFront(p));
    canvas.renderAll();
  }, []);

  /**
   * Update shape from control point drag
   */
  const updateShapeFromControl = useCallback(
    (shape: ShapePath, control: ControlCircle, def: any) => {
      const canvas = fabricCanvasRef.current;
      if (!canvas || !shape.shapeData) return;

      const handler = ShapeRegistry.getHandler(shape.shapeData.type);
      if (!handler) return;

      const newPos = { x: control.left!, y: control.top! };
      const newData = def.onDrag(shape.shapeData, newPos);
      shape.shapeData = newData;

      const tempPath = handler.createPath(newData, {
        strokeColor: (shape.stroke as string) || '#000000',
        strokeWidth: shape.strokeWidth || 1,
        fillColor: (shape.fill as string) || 'transparent',
      });

      if (tempPath.type === 'image') {
        shape.shapeData = newData;
        const tempImg = tempPath as FabricImage;
        const shapeImg = shape as unknown as FabricImage;
        shapeImg.setElement(tempImg.getElement());
        shapeImg.set({
          left: tempImg.left,
          top: tempImg.top,
          width: tempImg.width,
          height: tempImg.height,
        });
        updateAllControlPoints(shape);
        canvas.renderAll();
        return;
      } else if ('path' in tempPath) {
        shape.set({
          path: (tempPath as any).path,
          left: tempPath.left,
          top: tempPath.top,
          width: tempPath.width,
          height: tempPath.height,
          pathOffset: (tempPath as any).pathOffset,
        });
      } else if (shape.type === 'i-text' || shape.type === 'text') {
        shape.set({
          left: tempPath.left,
          top: tempPath.top,
          fontSize: (tempPath as any).fontSize,
        });
        if (shape.shapeData && shape.shapeData.type === 'text') {
          const t = shape as any;
          t.setCoords();
          (shape.shapeData as any).width = t.getScaledWidth();
          (shape.shapeData as any).height = t.getScaledHeight();
        }
      } else {
        shape.set({
          left: tempPath.left,
          top: tempPath.top,
          width: tempPath.width,
          height: tempPath.height,
        });
      }

      updateAllControlPoints(shape);
      canvas.renderAll();
    },
    []
  );

  /**
   * Update all control points positions
   */
  const updateAllControlPoints = useCallback((shape: ShapePath) => {
    if (
      !controlPointsRef.current.shape ||
      controlPointsRef.current.shape !== shape ||
      !shape.shapeData
    ) {
      return;
    }

    const handler = ShapeRegistry.getHandler(shape.shapeData.type);
    if (!handler) return;

    const defs = handler.getControlPoints();

    controlPointsRef.current.points.forEach((pt) => {
      const def = defs.find((d) => d.id === pt.pointId);
      if (def) {
        const newPos = def.getPosition(shape.shapeData!);
        pt.set({
          left: newPos.x,
          top: newPos.y,
        });
        pt.setCoords();
      }
    });
  }, []);

  /**
   * Remove control points
   */
  const removeControlPoints = useCallback(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    controlPointsRef.current.points.forEach((pt) => {
      canvas.remove(pt);
    });

    if (controlPointsRef.current.shape) {
      controlPointsRef.current.shape.set({ strokeDashArray: undefined });
    }

    controlPointsRef.current = { shape: null, points: [] };
  }, []);

  /**
   * Save history state
   */
  const saveHistory = useCallback(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
    }

    const state = canvas.toObject(['shapeData', 'isControlPoint']);
    state.objects = state.objects.filter((obj: any) => !obj.isControlPoint);

    const json = JSON.stringify(state);
    historyRef.current.push({ json });
    historyIndexRef.current = historyRef.current.length - 1;
  }, []);

  /**
   * Undo
   */
  const undo = useCallback(async () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || historyIndexRef.current <= 0) return;

    isLoadingHistoryRef.current = true;
    historyIndexRef.current--;

    const entry = historyRef.current[historyIndexRef.current];
    await canvas.loadFromJSON(entry.json);
    canvas.renderAll();

    isLoadingHistoryRef.current = false;
  }, []);

  /**
   * Redo
   */
  const redo = useCallback(async () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || historyIndexRef.current >= historyRef.current.length - 1) return;

    isLoadingHistoryRef.current = true;
    historyIndexRef.current++;

    const entry = historyRef.current[historyIndexRef.current];
    await canvas.loadFromJSON(entry.json);
    canvas.renderAll();

    isLoadingHistoryRef.current = false;
  }, []);

  /**
   * Reset history
   */
  const resetHistory = useCallback(() => {
    historyRef.current = [];
    historyIndexRef.current = -1;
  }, []);

  /**
   * Can undo check
   */
  const canUndo = useCallback(() => {
    return historyIndexRef.current > 0;
  }, []);

  /**
   * Can redo check
   */
  const canRedo = useCallback(() => {
    return historyIndexRef.current < historyRef.current.length - 1;
  }, []);

  /**
   * Initialize Fabric Canvas
   */
  const initCanvas = useCallback(
    (
      canvasEl: HTMLCanvasElement,
      width: number,
      height: number,
      cssWidth?: number,
      cssHeight?: number
    ): Canvas => {
      // Dispose existing canvas
      if (fabricCanvasRef.current) {
        fabricCanvasRef.current.dispose();
      }

      const canvas = new Canvas(canvasEl, {
        width,
        height,
        selection: false,
        preserveObjectStacking: true,
        renderOnAddRemove: true,
        stopContextMenu: true,
        fireRightClick: true,
        perPixelTargetFind: true,
        targetFindTolerance: 20,
      });

      if (cssWidth !== undefined && cssHeight !== undefined) {
        canvas.setDimensions({ width: cssWidth, height: cssHeight }, { cssOnly: true });
      }

      fabricCanvasRef.current = canvas;

      // Bind drawing events
      canvas.on('mouse:down', handleMouseDown);
      canvas.on('mouse:move', handleMouseMove);
      canvas.on('mouse:up', handleMouseUp);

      // Track object position for move calculations
      canvas.on('mouse:down', (e) => {
        const target = e.target;
        if (
          target &&
          !target.isType('activeSelection') &&
          !(target as ControlCircle).isControlPoint
        ) {
          target.setCoords();
          lastObjectPositionRef.current = { left: target.left, top: target.top };

          const shape = target as ShapePath;
          if (shape.shapeData && controlPointsRef.current.shape !== shape) {
            createControlPoints(shape);
          }
        }
      });

      // Handle object moving
      canvas.on('object:moving', (e) => {
        const obj = e.target as ShapePath;
        if (!obj || !obj.shapeData) return;

        if (!lastObjectPositionRef.current) {
          lastObjectPositionRef.current = { left: obj.left, top: obj.top };
          return;
        }

        const dx = obj.left - lastObjectPositionRef.current.left;
        const dy = obj.top - lastObjectPositionRef.current.top;

        if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
          const handler = ShapeRegistry.getHandler(obj.shapeData.type);
          if (handler) {
            obj.shapeData = handler.move(obj.shapeData, dx, dy);
            updateAllControlPoints(obj);
            lastObjectPositionRef.current = { left: obj.left, top: obj.top };
            canvas.renderAll();
          }
        }
      });

      // Handle text changes
      canvas.on('text:changed', (e) => {
        const target = e.target as ShapePath;
        if (target && target.shapeData && target.shapeData.type === 'text') {
          (target.shapeData as any).text = (target as any).text;
          (target.shapeData as any).width = (target as any).getScaledWidth();
          (target.shapeData as any).height = (target as any).getScaledHeight();
          updateAllControlPoints(target);
        }
      });

      // Handle object modified
      canvas.on('object:modified', (e) => {
        if (e.target && (e.target.type === 'i-text' || e.target.type === 'text')) {
          const target = e.target as ShapePath;
          if (target.shapeData && target.shapeData.type === 'text') {
            (target.shapeData as any).text = (target as any).text;
            target.shapeData.x = target.left;
            target.shapeData.y = target.top;
            (target.shapeData as any).width = (target as any).getScaledWidth();
            (target.shapeData as any).height = (target as any).getScaledHeight();
            updateAllControlPoints(target);
          }
        }

        if (!isLoadingHistoryRef.current) {
          saveHistory();
        }
      });

      // Selection handlers
      const handleSelected = (objects: FabricObject[]) => {
        objects.forEach((obj) => {
          if ((obj as ControlCircle).isControlPoint) return;

          if (obj.type === 'i-text' || obj.type === 'text') {
            obj.set({
              hasBorders: true,
              borderColor: '#999999',
              borderDashArray: [4, 4],
              cornerColor: '#ffffff',
              cornerStrokeColor: '#999999',
              transparentCorners: false,
              hasControls: true,
              padding: 5,
              borderScaleFactor: 1,
              lockScalingX: false,
              lockScalingY: false,
            });
          } else if (obj.type === 'image') {
            obj.set({
              hasBorders: true,
              borderColor: '#999999',
              borderDashArray: [4, 4],
              padding: 2,
              borderScaleFactor: 1,
            });
          } else {
            obj.set({ strokeDashArray: [5, 5] });
          }

          if (obj.type === 'i-text' || obj.type === 'text') {
            const target = obj as ShapePath;
            if (target.shapeData && target.shapeData.type === 'text') {
              (target.shapeData as any).width = (target as any).getScaledWidth();
              (target.shapeData as any).height = (target as any).getScaledHeight();
            }
          }

          if ((obj as ShapePath).shapeData) {
            createControlPoints(obj as ShapePath);
          }
        });
      };

      const handleDeselected = (objects: FabricObject[]) => {
        objects.forEach((obj) => {
          if ((obj as ControlCircle).isControlPoint) return;

          obj.set({ strokeDashArray: undefined });

          if (obj.type === 'image') {
            obj.set({ hasBorders: false, borderDashArray: undefined });
          }

          if (obj.type === 'i-text' || obj.type === 'text') {
            const textObj = obj as any;
            if (!textObj.text || textObj.text.trim() === '') {
              canvas.remove(obj);
            }
          }
        });
        removeControlPoints();
      };

      canvas.on('selection:created', (e) => {
        handleSelected(e.selected || []);
        canvas.renderAll();
      });

      canvas.on('selection:updated', (e) => {
        const selectedObject = e.selected?.[0];
        if (selectedObject && (selectedObject as ControlCircle).isControlPoint) {
          return;
        }

        handleDeselected(e.deselected || []);
        handleSelected(e.selected || []);
        canvas.renderAll();
      });

      canvas.on('selection:cleared', (e) => {
        handleDeselected(e.deselected || []);
        canvas.renderAll();
      });

      return canvas;
    },
    [
      handleMouseDown,
      handleMouseMove,
      handleMouseUp,
      createControlPoints,
      updateAllControlPoints,
      removeControlPoints,
      saveHistory,
    ]
  );

  /**
   * Set active drawing tool
   */
  const setActiveTool = useCallback((tool: DrawingToolType) => {
    setActiveToolState(tool);

    if (fabricCanvasRef.current) {
      fabricCanvasRef.current.defaultCursor = tool ? 'crosshair' : 'default';

      if (tool) {
        fabricCanvasRef.current.discardActiveObject();
        fabricCanvasRef.current.renderAll();
      }
    }
  }, []);

  /**
   * Set background image
   */
  const setBackgroundImage = useCallback(
    async (imageDataUrl: string): Promise<FabricImage | null> => {
      const canvas = fabricCanvasRef.current;
      if (!canvas) return null;

      try {
        const img = await FabricImage.fromURL(imageDataUrl);
        img.set({
          left: 0,
          top: 0,
          originX: 'left',
          originY: 'top',
        });

        canvas.backgroundImage = img;
        canvas.renderAll();
        return img;
      } catch (e) {
        console.error('Failed to set background image:', e);
        return null;
      }
    },
    []
  );

  /**
   * Set stroke color
   */
  const setStrokeColor = useCallback(
    (color: string) => {
      drawingConfigRef.current.strokeColor = color;

      const activeObject = fabricCanvasRef.current?.getActiveObject();
      if (activeObject) {
        if (activeObject.type === 'i-text' || activeObject.type === 'text') {
          activeObject.set('fill', color);
        } else {
          activeObject.set('stroke', color);
        }
        fabricCanvasRef.current?.renderAll();
        saveHistory();
      }
    },
    [saveHistory]
  );

  /**
   * Set stroke width
   */
  const setStrokeWidth = useCallback(
    (width: number) => {
      drawingConfigRef.current.strokeWidth = width;

      const activeObject = fabricCanvasRef.current?.getActiveObject();
      if (activeObject) {
        if (activeObject.type === 'i-text' || activeObject.type === 'text') {
          const baseSize = 16;
          activeObject.set('fontSize', baseSize + (width - 1) * 4);
        } else {
          activeObject.set('strokeWidth', width);
        }
        fabricCanvasRef.current?.renderAll();
        saveHistory();
      }
    },
    [saveHistory]
  );

  /**
   * Export as DataURL
   */
  const toDataURL = useCallback((format: 'png' | 'jpeg' = 'png', quality = 1): string => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return '';

    const controls = controlPointsRef.current.points;
    controls.forEach((c) => (c.visible = false));
    canvas.renderAll();

    const dataUrl = canvas.toDataURL({
      format,
      quality,
      multiplier: 1,
    });

    controls.forEach((c) => (c.visible = true));
    canvas.renderAll();

    return dataUrl;
  }, []);

  /**
   * Dispose canvas
   */
  const dispose = useCallback(() => {
    if (fabricCanvasRef.current) {
      fabricCanvasRef.current.dispose();
      fabricCanvasRef.current = null;
    }
    setActiveToolState(null);
    setIsDrawing(false);
    currentObjectRef.current = null;
    penPointsRef.current = [];
    controlPointsRef.current = { shape: null, points: [] };
    resetHistory();
  }, [resetHistory]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      dispose();
      cleanupRef.current.forEach((fn) => fn());
    };
  }, [dispose]);

  return useMemo(
    () => ({
      // State
      fabricCanvas: fabricCanvasRef,
      activeTool,
      isDrawing,

      // Initialization
      initCanvas,
      setBackgroundImage,
      dispose,

      // Drawing tools
      setActiveTool,

      // History
      saveHistory,
      undo,
      redo,
      resetHistory,
      canUndo,
      canRedo,

      // Style settings
      setStrokeColor,
      setStrokeWidth,
      drawingConfig: drawingConfigRef.current,

      // Export
      toDataURL,
    }),
    [
      activeTool,
      isDrawing,
      initCanvas,
      setBackgroundImage,
      dispose,
      setActiveTool,
      saveHistory,
      undo,
      redo,
      resetHistory,
      canUndo,
      canRedo,
      setStrokeColor,
      setStrokeWidth,
      toDataURL,
    ]
  );
}

export type UseFabricCanvasReturn = ReturnType<typeof useFabricCanvas>;
