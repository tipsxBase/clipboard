/**
 * Fabric.js v7 Canvas Composable
 * 用于截图工具的绘图功能
 *
 * 交互设计参考微信/QQ截图工具：
 * 1. 选择工具后，在空白区域拖动绘制新图形
 * 2. 绘制完成后图形自动选中，可以移动
 * 3. 点击已有图形可以选中编辑
 * 4. 工具保持激活，可以继续绘制
 *
 * 所有图形都基于 Path 绘制，统一选择行为：
 * - 只能通过描边/填充选中
 * - 禁用缩放，只允许移动
 */
import { ref, onUnmounted, toRaw, markRaw, type Ref } from "vue";
import {
  Canvas,
  FabricImage,
  FabricObject,
  Point,
  Circle,
  type TPointerEvent,
  type TPointerEventInfo,
} from "fabric";

// 引入图形系统
import {
  ShapeRegistry,
  type ShapeType,
  type ShapePath,
  type ControlCircle,
} from "./shapes";
import "./shapes/rectHandler";
import "./shapes/ellipseHandler";
import "./shapes/arrowHandler";
import "./shapes/penHandler";
import "./shapes/textHandler";

// 可绘制对象类型
export type DrawableObject = ShapePath;

// 绘图工具类型
export type DrawingToolType = ShapeType | null;

// 绘图配置接口
export interface DrawingConfig {
  strokeColor: string;
  strokeWidth: number;
  fillColor: string;
}

// 默认绘图配置
const defaultDrawingConfig: DrawingConfig = {
  strokeColor: "#ff0000",
  strokeWidth: 3,
  fillColor: "transparent",
};

// 历史记录项
interface HistoryEntry {
  json: string;
}

export function useFabricCanvas(config: Partial<DrawingConfig> = {}) {
  const drawingConfig: DrawingConfig = { ...defaultDrawingConfig, ...config };

  // Fabric Canvas 实例
  const fabricCanvas: Ref<Canvas | null> = ref(null);

  // 当前激活的绘图工具
  const activeTool: Ref<DrawingToolType> = ref(null);

  // 绘图状态
  const isDrawing = ref(false);
  const drawStartPoint = ref({ x: 0, y: 0 });
  const currentObject: Ref<DrawableObject | null> = ref(null);
  const penPoints: Ref<Array<{ x: number; y: number }>> = ref([]);

  // 历史记录（用于撤销）
  const history: Ref<HistoryEntry[]> = ref([]);
  const historyIndex: Ref<number> = ref(-1);

  // 是否正在加载历史状态（避免重复保存）
  let isLoadingHistory = false;

  /**
   * 处理鼠标按下 - 开始绘制
   */
  const handleMouseDown = (opt: TPointerEventInfo<TPointerEvent>) => {
    const canvas = fabricCanvas.value;
    if (!canvas || !activeTool.value) return;

    // 1. 如果点击了对象（无论是选区内还是选区外），优先选择该对象
    // 通过检测 target 是否存在
    if (opt.target) {
      // 特殊情况：如果当前工具是 'text'，且点击的是文本对象，允许 Fabric 处理（选择/进入编辑）
      // 如果点击的是其他对象，也允许选中
      return;
    }

    // 2. 如果当前是 'text' 工具，且没有点击到任何对象 -> 创建新文本
    if (activeTool.value === "text") {
      // 继续下方的绘制逻辑
    } else {
      // 如果是其他工具，且 opt.target 已经过滤了，说明点击了空白处 -> 开始绘制
    }

    // 点击空白区域，开始绘制
    isDrawing.value = true;
    const pointer = opt.scenePoint;
    drawStartPoint.value = { x: pointer.x, y: pointer.y };
    penPoints.value = [{ x: pointer.x, y: pointer.y }];

    // 取消当前选中的对象
    canvas.discardActiveObject();
    canvas.renderAll();
  };

  /**
   * 处理鼠标移动 - 绘制中
   */
  const handleMouseMove = (opt: TPointerEventInfo<TPointerEvent>) => {
    const canvas = fabricCanvas.value;
    if (!canvas || !isDrawing.value || !activeTool.value) return;

    const pointer = opt.scenePoint;
    const start = drawStartPoint.value;

    // 移除之前的临时对象
    if (currentObject.value) {
      canvas.remove(currentObject.value as FabricObject);
    }

    // 收集点数据（针对笔）
    // 限制坐标在画布范围内（防止画出界）
    const clampedX = Math.max(0, Math.min(pointer.x, canvas.width || 0));
    const clampedY = Math.max(0, Math.min(pointer.y, canvas.height || 0));
    const clampedPointer = { x: clampedX, y: clampedY };

    if (activeTool.value === "pen") {
      penPoints.value.push(clampedPointer);
    }

    const handler = ShapeRegistry.getHandler(activeTool.value);
    if (!handler) return;

    // 使用 Handler 创建数据和 Path
    const data = handler.createData(start, clampedPointer, penPoints.value);
    if (!data) return;

    const newObject = handler.createPath(data, drawingConfig);
    // 存储数据到对象上，以便后续编辑
    (newObject as ShapePath).shapeData = data;

    if (newObject) {
      // 绘制中禁用交互
      newObject.set({
        selectable: false,
        evented: false,
      });
      canvas.add(newObject as FabricObject);
      currentObject.value = newObject;
      canvas.renderAll();
    }
  };

  /**
   * 处理鼠标抬起 - 完成绘制
   */
  const handleMouseUp = () => {
    const canvas = fabricCanvas.value;
    if (!canvas || !isDrawing.value) return;

    isDrawing.value = false;

    // 如果还没有创建对象（例如只有点击没有拖动），且是文本工具，则在这里创建
    if (!currentObject.value && activeTool.value === "text") {
      const handler = ShapeRegistry.getHandler("text");
      if (handler) {
        const data = handler.createData(
          drawStartPoint.value,
          drawStartPoint.value,
        );
        if (data) {
          const newObject = handler.createPath(data, drawingConfig);
          (newObject as ShapePath).shapeData = data;

          // 对于文本，我们希望创建后直接进入编辑模式（如果支持）
          // 但 Fabric IText 需要双击进入编辑。我们可以手动触发 active

          canvas.add(newObject as FabricObject);
          currentObject.value = newObject as ShapePath; // 赋值给 currentObject 以便下面通用逻辑处理
        }
      }
    }

    if (currentObject.value) {
      // 启用交互，允许选择和移动，但禁用缩放和边框
      const isText =
        currentObject.value.type === "i-text" ||
        currentObject.value.type === "text";

      currentObject.value.set({
        selectable: true,
        evented: true,
        hasControls: isText, // 文本启用原生控制点
        hasBorders: isText, // 文本显示边框
        lockScalingX: !isText, // 文本允许缩放
        lockScalingY: !isText,
        perPixelTargetFind: !isText, // 文本关闭像素级检测，便于点击
        strokeDashArray: isText ? undefined : [5, 5], // 文本使用 border，其他使用 strokeDashArray
        hoverCursor: "move", // 设置悬停光标为移动
        // 修正：确保文本颜色正确应用
        fill: isText ? drawingConfig.strokeColor : "transparent",
        // 文本边框样式 (仿微信虚线框)
        borderColor: isText ? "#999999" : "transparent",
        borderDashArray: [4, 4],
        padding: 5,
        transparentCorners: false, // 填充控制点
      });

      // 自动选中刚绘制的对象
      canvas.setActiveObject(currentObject.value as FabricObject);

      // 特殊处理：如果是文本，创建后自动进入编辑状态
      if (
        currentObject.value.type === "i-text" ||
        currentObject.value.type === "text"
      ) {
        (currentObject.value as any).enterEditing();
      }

      canvas.renderAll();

      // 保存历史
      saveHistory();

      currentObject.value = null;
    }

    penPoints.value = [];
  };

  // 存储移动前的位置
  const lastObjectPosition = ref<{ left: number; top: number } | null>(null);

  /**
   * 初始化 Fabric Canvas
   */
  const initCanvas = (
    canvasEl: HTMLCanvasElement,
    width: number,
    height: number,
    cssWidth?: number,
    cssHeight?: number,
  ): Canvas => {
    // 如果已存在，先销毁
    if (fabricCanvas.value) {
      fabricCanvas.value.dispose();
    }

    const canvas = new Canvas(canvasEl, {
      width,
      height,
      selection: false, // 禁用框选
      preserveObjectStacking: true,
      renderOnAddRemove: true,
      stopContextMenu: true,
      fireRightClick: true,
      perPixelTargetFind: true,
      targetFindTolerance: 20, // 进一步增加点击容错范围
    });

    if (cssWidth !== undefined && cssHeight !== undefined) {
      canvas.setDimensions(
        { width: cssWidth, height: cssHeight },
        { cssOnly: true },
      );
    }

    fabricCanvas.value = canvas;

    // 绑定绘图事件
    canvas.on("mouse:down", handleMouseDown);
    canvas.on("mouse:move", handleMouseMove);
    canvas.on("mouse:up", handleMouseUp);

    // 监听 Mouse down 以记录对象初始位置（用于移动计算）
    canvas.on("mouse:down", (e) => {
      const target = e.target;
      if (
        target &&
        !target.isType("activeSelection") &&
        !(target as ControlCircle).isControlPoint
      ) {
        // 确保使用最新的坐标
        target.setCoords();
        lastObjectPosition.value = { left: target.left, top: target.top };

        // 确保控制点已创建（如果是直接拖动而不是先点击选中再拖动的情况）
        const shape = target as ShapePath;
        // 使用 toRaw 比较
        if (
          shape.shapeData &&
          toRaw(controlPoints.value.shape) !== toRaw(shape)
        ) {
          createControlPoints(shape);
        }
      }
    });

    // 监听对象移动事件，更新 shapeData 和控制点
    canvas.on("object:moving", (e) => {
      const obj = e.target as ShapePath;
      // 如果没有 lastObjectPosition，可能是因为 mouse:down 没捕获到，或者这是一个新选中的对象被拖动
      if (!obj || !obj.shapeData) return;

      // 如果 lastObjectPosition 为空，尝试初始化它
      if (!lastObjectPosition.value) {
        lastObjectPosition.value = { left: obj.left, top: obj.top };
        return; // 这一次移动无法计算 delta，跳过
      }

      const dx = obj.left - lastObjectPosition.value.left;
      const dy = obj.top - lastObjectPosition.value.top;

      if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
        const handler = ShapeRegistry.getHandler(obj.shapeData.type);
        if (handler) {
          // 更新 shapeData
          obj.shapeData = handler.move(obj.shapeData, dx, dy);

          // 更新控制点位置
          updateAllControlPoints(obj);

          // 更新上一位置
          lastObjectPosition.value = { left: obj.left, top: obj.top };

          // 强制渲染控制点更新
          canvas.renderAll();
        }
      }
    });

    // 监听对象修改事件，用于保存历史

    // 监听文本修改，同步回 shapeData，并且更新尺寸以便控制点跟随
    canvas.on("text:changed", (e) => {
      const target = e.target as ShapePath;
      if (target && target.shapeData && target.shapeData.type === "text") {
        (target.shapeData as any).text = (target as any).text;

        // 更新尺寸到 shapeData，以便 control points 能够获取真实尺寸
        (target.shapeData as any).width = (target as any).getScaledWidth();
        (target.shapeData as any).height = (target as any).getScaledHeight();

        updateAllControlPoints(target);
      }
    });

    // 监听对象修改（缩放、移动等）
    canvas.on("object:modified", (e) => {
      if (
        e.target &&
        (e.target.type === "i-text" || e.target.type === "text")
      ) {
        const target = e.target as ShapePath;
        if (target.shapeData && target.shapeData.type === "text") {
          (target.shapeData as any).text = (target as any).text;

          // 确保位置和尺寸同步
          target.shapeData.x = target.left;
          target.shapeData.y = target.top;
          (target.shapeData as any).width = (target as any).getScaledWidth();
          (target.shapeData as any).height = (target as any).getScaledHeight();

          updateAllControlPoints(target);
        }
      }

      if (!isLoadingHistory) {
        saveHistory();
      }
    });

    // 选中处理：显示虚线和控制点
    const handleSelected = (objects: FabricObject[]) => {
      objects.forEach((obj) => {
        // 忽略控制点
        if ((obj as ControlCircle).isControlPoint) return;

        if (obj.type === "i-text" || obj.type === "text") {
          // 文本对象显示边框
          obj.set({
            hasBorders: true,
            borderColor: "#999999", // Gray - matching WeChat
            borderDashArray: [4, 4],
            cornerColor: "#ffffff", // Show native handles
            cornerStrokeColor: "#999999",
            transparentCorners: false,
            hasControls: true, // Enable native controls
            padding: 5,
            borderScaleFactor: 1,
            lockScalingX: false, // Allow scaling
            lockScalingY: false,
          });
        } else {
          // 其他图形（如矩形、箭头）使用自身线条虚线化
          obj.set({ strokeDashArray: [5, 5] });
        }

        // 对于文本，我们在这里也更新一下 shapeData 里的尺寸，以防万一
        if (obj.type === "i-text" || obj.type === "text") {
          const target = obj as ShapePath;
          if (target.shapeData && target.shapeData.type === "text") {
            (target.shapeData as any).width = (target as any).getScaledWidth();
            (target.shapeData as any).height = (
              target as any
            ).getScaledHeight();
          }
        }

        // 为图形创建通用控制点
        if ((obj as ShapePath).shapeData) {
          createControlPoints(obj as ShapePath);
        }
      });
    };

    // 取消选中处理：移除虚线和控制点
    const handleDeselected = (objects: FabricObject[]) => {
      objects.forEach((obj) => {
        if ((obj as ControlCircle).isControlPoint) return;

        obj.set({ strokeDashArray: undefined });

        // 检查是否是空文本，如果是则移除
        if (obj.type === "i-text" || obj.type === "text") {
          const textObj = obj as any;
          if (!textObj.text || textObj.text.trim() === "") {
            canvas.remove(obj);
          }
        }
      });
      // 移除当前活动的所有控制点
      removeControlPoints();
    };

    canvas.on("selection:created", (e) => {
      handleSelected(e.selected || []);
      canvas.renderAll();
    });

    canvas.on("selection:updated", (e) => {
      const selectedObject = e.selected?.[0];
      // 如果新选中的是控制点，说明用户正在操作控制点
      // 此时不应该清除图形的选中状态（虚线）和控制点本身
      if (selectedObject && (selectedObject as ControlCircle).isControlPoint) {
        return;
      }

      handleDeselected(e.deselected || []);
      handleSelected(e.selected || []);
      canvas.renderAll();
    });

    canvas.on("selection:cleared", (e) => {
      handleDeselected(e.deselected || []);
      canvas.renderAll();
    });

    return canvas;
  };

  /**
   * 设置当前绘图工具
   */
  const setActiveTool = (tool: DrawingToolType) => {
    activeTool.value = tool;

    // 设置画布光标
    if (fabricCanvas.value) {
      // 如果有选中的工具，光标设为十字；否则设为默认
      fabricCanvas.value.defaultCursor = tool ? "crosshair" : "default";

      // 切换工具时取消选中
      if (tool) {
        fabricCanvas.value.discardActiveObject();
        fabricCanvas.value.renderAll();
      }
    }
  };

  /**
   * 设置背景图像
   */
  const setBackgroundImage = async (
    imageDataUrl: string,
  ): Promise<FabricImage | null> => {
    const canvas = fabricCanvas.value;
    if (!canvas) return null;

    try {
      const img = await FabricImage.fromURL(imageDataUrl);

      // 设置图像位置
      img.set({
        left: 0,
        top: 0,
        originX: "left",
        originY: "top",
      });

      canvas.backgroundImage = img;
      canvas.renderAll();
      return img;
    } catch (e) {
      console.error("Failed to set background image:", e);
      return null;
    }
  };

  // 通用控制点状态
  const controlPoints: Ref<{
    shape: ShapePath | null;
    points: ControlCircle[];
  }> = ref({ shape: null, points: [] });

  /**
   * 创建通用控制点
   */
  const createControlPoints = (shape: ShapePath) => {
    const canvas = fabricCanvas.value;
    if (!canvas || !shape.shapeData) return;

    // 清除现有控制点
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
        fill: def.style?.fill || "#ffffff",
        stroke: def.style?.stroke || "#0066ff",
        strokeWidth: def.style?.strokeWidth || 2,
        originX: "center",
        originY: "center",
        selectable: true,
        hasControls: false,
        hasBorders: false,
        evented: true,
        hoverCursor: "pointer", // 鼠标悬停时显示手型
        padding: 5, // 增加点击热区，防止太难点击
      }) as ControlCircle;

      control.isControlPoint = true;
      control.pointId = def.id;

      // 绑定移动事件
      control.on("moving", () => {
        updateShapeFromControl(shape, control, def);
      });

      canvas.add(control);
      newPoints.push(control);
    });

    controlPoints.value = {
      shape: markRaw(shape),
      points: newPoints.map((p) => markRaw(p)),
    };

    // 确保控制点在最上层
    newPoints.forEach((p) => canvas.bringObjectToFront(p));
    canvas.renderAll();
  };

  /**
   * 根据控制点更新图形
   */
  const updateShapeFromControl = (
    shape: ShapePath,
    control: ControlCircle,
    def: any, // ControlPointDef
  ) => {
    const canvas = fabricCanvas.value;
    if (!canvas || !shape.shapeData) return;

    const handler = ShapeRegistry.getHandler(shape.shapeData.type);
    if (!handler) return;

    // 更新数据
    const newPos = { x: control.left!, y: control.top! };
    const newData = def.onDrag(shape.shapeData, newPos);

    // 更新图形数据
    shape.shapeData = newData;

    // 重新生成 Path 用于获取新的路径数据
    const tempPath = handler.createPath(newData, {
      strokeColor: (shape.stroke as string) || "#000000",
      strokeWidth: shape.strokeWidth || 1,
      fillColor: (shape.fill as string) || "transparent",
    });

    // 更新现有对象的路径属性
    // Fabric.js 的 set 方法会自动通知更新，但 Path 的 path 数据需要特别处理
    // 注意：只要是 Paths 类型的图形，才会有 path 属性。Text没有。
    if ("path" in tempPath) {
      shape.set({
        path: (tempPath as any).path,
        left: tempPath.left,
        top: tempPath.top,
        width: tempPath.width,
        height: tempPath.height,
        pathOffset: (tempPath as any).pathOffset,
      });
    } else if (shape.type === "i-text" || shape.type === "text") {
      // 文本特殊处理：同步字号和位置，但保留文本内容
      // 如果我们仅仅使用 newData 创建 tempPath，它包含的是初始 "Text"
      // 我们不应该覆盖用户已输入的 text
      shape.set({
        left: tempPath.left,
        top: tempPath.top,
        fontSize: (tempPath as any).fontSize,
        // 文本不需要设置 width/height，由 fontSize 和内容决定
      });
      // 必须立刻更新 shapeData 的 width/height，否则 updateAllControlPoints 会使用过期的尺寸
      // 导致控制点闪烁或无法拖动
      if (shape.shapeData && shape.shapeData.type === "text") {
        const t = shape as any;
        // IText 更新属性后可能需要 updateCoords 才能获取正确尺寸，set 内部应该调用了
        // 但为了保险，强制 updateCoords (Fabric V5/V6)
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

    // 某些图形可能还需要更新 fill/stroke 等属性（如果 createPath 改变了它们）
    // 这里我们假设样式不变，只变形状

    // 更新其他受影响的控制点位置
    updateAllControlPoints(shape);

    canvas.renderAll();
  };

  /**
   * 更新所有控制点位置（当图形数据变化时）
   */
  const updateAllControlPoints = (shape: ShapePath) => {
    // 检查当前控制点是否属于该形状
    // 使用 toRaw 比较，避免 Vue 代理导致的引用不相等
    if (
      !controlPoints.value.shape ||
      toRaw(controlPoints.value.shape) !== toRaw(shape) ||
      !shape.shapeData
    ) {
      // 这里的 mismatch 通常是因为 Vue 的 reactivity system 包装了对象
      // 如果使用了 toRaw 还是不匹配，那才是真的不匹配
      if (
        controlPoints.value.shape &&
        toRaw(controlPoints.value.shape) !== toRaw(shape)
      ) {
        console.warn(
          "Shape mismatch in updateAllControlPoints",
          toRaw(shape),
          toRaw(controlPoints.value.shape),
        );
      }
      return;
    }

    const handler = ShapeRegistry.getHandler(shape.shapeData.type);
    if (!handler) return;

    const defs = handler.getControlPoints();

    controlPoints.value.points.forEach((pt) => {
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
  };

  /**
   * 移除控制点
   */
  const removeControlPoints = () => {
    const canvas = fabricCanvas.value;
    if (!canvas) return;

    controlPoints.value.points.forEach((pt) => {
      canvas.remove(pt);
    });

    // 确保关联图形的选中状态被清除
    // (修复 bug: 从控制点直接点击空白处取消选中时，图形仍然保持虚线的问题)
    if (controlPoints.value.shape) {
      controlPoints.value.shape.set({ strokeDashArray: undefined });
    }

    controlPoints.value = { shape: null, points: [] };
  };

  /**
   * 添加对象到画布
   */
  const addObject = (obj: DrawableObject): void => {
    const canvas = fabricCanvas.value;
    if (!canvas) return;

    canvas.add(obj as FabricObject);
    canvas.renderAll();
  };

  /**
   * 移除对象
   */
  const removeObject = (obj: DrawableObject): void => {
    const canvas = fabricCanvas.value;
    if (!canvas) return;

    canvas.remove(obj as FabricObject);
    canvas.renderAll();
  };

  /**
   * 清除所有对象（保留背景）
   */
  const clearObjects = (): void => {
    const canvas = fabricCanvas.value;
    if (!canvas) return;

    canvas.getObjects().forEach((obj) => {
      canvas.remove(obj);
    });
    canvas.renderAll();
  };

  /**
   * 保存历史状态
   */
  const saveHistory = (): void => {
    const canvas = fabricCanvas.value;
    if (!canvas) return;

    // 截断历史（如果有撤销过的操作）
    if (historyIndex.value < history.value.length - 1) {
      history.value = history.value.slice(0, historyIndex.value + 1);
    }

    // 导出画布状态
    // Include 'shapeData' to persist editability
    // Include 'isControlPoint' to identify and remove UI controls
    const state = canvas.toObject(["shapeData", "isControlPoint"]);

    // 过滤掉控制点，不要保存到历史记录中
    state.objects = state.objects.filter((obj: any) => !obj.isControlPoint);

    const json = JSON.stringify(state);
    history.value.push({ json });
    historyIndex.value = history.value.length - 1;
  };

  /**
   * 撤销
   */
  const undo = async (): Promise<void> => {
    const canvas = fabricCanvas.value;
    if (!canvas || historyIndex.value <= 0) return;

    isLoadingHistory = true;
    historyIndex.value--;

    const entry = history.value[historyIndex.value];
    await canvas.loadFromJSON(entry.json);
    canvas.renderAll();

    isLoadingHistory = false;
  };

  /**
   * 重做
   */
  const redo = async (): Promise<void> => {
    const canvas = fabricCanvas.value;
    if (!canvas || historyIndex.value >= history.value.length - 1) return;

    isLoadingHistory = true;
    historyIndex.value++;

    const entry = history.value[historyIndex.value];
    await canvas.loadFromJSON(entry.json);
    canvas.renderAll();

    isLoadingHistory = false;
  };

  /**
   * 重置历史
   */
  const resetHistory = (): void => {
    history.value = [];
    historyIndex.value = -1;
  };

  /**
   * 是否可以撤销
   */
  const canUndo = (): boolean => {
    return historyIndex.value > 0;
  };

  /**
   * 是否可以重做
   */
  const canRedo = (): boolean => {
    return historyIndex.value < history.value.length - 1;
  };

  /**
   * 导出为 DataURL
   */
  const toDataURL = (format: "png" | "jpeg" = "png", quality = 1): string => {
    const canvas = fabricCanvas.value;
    if (!canvas) return "";

    // 临时隐藏控制点，防止导出时包含它们
    // 虽然控制点一般不应该在截图里，但以防万一
    const controls = controlPoints.value.points;
    controls.forEach((c) => (c.visible = false));
    canvas.renderAll(); // flush

    const dataUrl = canvas.toDataURL({
      format,
      quality,
      multiplier: 1,
    });

    // 恢复控制点显示
    controls.forEach((c) => (c.visible = true));
    canvas.renderAll();

    return dataUrl;
  };

  /**
   * 设置描边颜色
   */
  const setStrokeColor = (color: string) => {
    drawingConfig.strokeColor = color;

    const activeObject = fabricCanvas.value?.getActiveObject();
    if (activeObject) {
      // 文本使用 fill，其他使用 stroke
      if (activeObject.type === "i-text" || activeObject.type === "text") {
        const isEditing = (activeObject as any).isEditing;
        activeObject.set("fill", color);
        // 如果正在编辑，保持编辑状态（解决点击颜色按钮导致失去焦点的问题）
        if (isEditing) {
          // Fabric 更新样式后可能会重置光标位置，这是正常行为，但我们需要保持 focus
          // 重新进入编辑模式
          // 注意：enterEditing 可能会全选文本，具体取决于 hiddenTextarea 的行为
          // 更好的体验可能是保持 selectionStart/End
          /*
             注意：直接改变属性不会退出编辑模式，但是点击按钮导致的 blur 会。
             Vue 事件 @click.stop 阻止了冒泡，但按钮获得焦点可能导致 canvas 失去焦点。
             我们需要在下一次 tick 强行把焦点拉回来。
           */
        }
      } else {
        activeObject.set("stroke", color);
      }
      fabricCanvas.value?.renderAll();

      // 强制刷新 activeObject 状态
      // 如果是文本且之前在编辑，尝试恢复焦点
      if (activeObject.type === "i-text" && (activeObject as any).isEditing) {
        // (activeObject as any).hiddenTextarea?.focus(); // 这通常由 Fabric 内部管理
      }
      saveHistory();
    }
  };

  /**
   * 设置描边粗细
   */
  const setStrokeWidth = (width: number) => {
    drawingConfig.strokeWidth = width;

    const activeObject = fabricCanvas.value?.getActiveObject();
    if (activeObject) {
      if (activeObject.type === "i-text" || activeObject.type === "text") {
        // 粗细同时也影响字号，模拟微信截图体验
        // 假设 width 是 1, 3, 5 等级
        const baseSize = 16;
        activeObject.set("fontSize", baseSize + (width - 1) * 4);
      } else {
        activeObject.set("strokeWidth", width);
      }
      fabricCanvas.value?.renderAll();
      saveHistory();
    }
  };

  /**
   * 获取当前活动对象
   */
  const getActiveObject = (): DrawableObject | null => {
    return fabricCanvas.value?.getActiveObject() as DrawableObject | null;
  };

  /**
   * 取消选择
   */
  const discardActiveObject = (): void => {
    fabricCanvas.value?.discardActiveObject();
    fabricCanvas.value?.renderAll();
  };

  /**
   * 检查点击位置是否在某个对象上
   */
  const getObjectAtPoint = (x: number, y: number): FabricObject | null => {
    if (!fabricCanvas.value) return null;

    const point = new Point(x, y);

    // 获取所有对象并逆序查找（后添加的在上面）
    const objects = fabricCanvas.value.getObjects();
    for (let i = objects.length - 1; i >= 0; i--) {
      const obj = objects[i];
      if (obj.containsPoint(point)) {
        return obj;
      }
    }
    return null;
  };

  /**
   * 销毁画布
   */
  const dispose = (): void => {
    if (fabricCanvas.value) {
      fabricCanvas.value.dispose();
      fabricCanvas.value = null;
    }
    activeTool.value = null;
    isDrawing.value = false;
    currentObject.value = null;
    penPoints.value = [];
    // 清除控制点状态
    controlPoints.value = { shape: null, points: [] };
    resetHistory();
  };

  // 组件卸载时自动销毁
  onUnmounted(dispose);

  return {
    // 状态
    fabricCanvas,
    activeTool,
    isDrawing,
    historyIndex,
    historyLength: () => history.value.length,

    // 初始化
    initCanvas,
    setBackgroundImage,
    dispose,

    // 绘图工具
    setActiveTool,

    // 对象操作
    addObject,
    removeObject,
    clearObjects,
    getActiveObject,
    discardActiveObject,
    getObjectAtPoint,

    // 历史记录
    saveHistory,
    undo,
    redo,
    resetHistory,
    canUndo,
    canRedo,

    // 样式设置
    setStrokeColor,
    setStrokeWidth,
    drawingConfig,

    // 导出
    toDataURL,
  };
}

// 导出类型
export type UseFabricCanvasReturn = ReturnType<typeof useFabricCanvas>;
