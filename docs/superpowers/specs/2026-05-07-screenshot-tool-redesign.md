# 截屏工具重新设计文档

**日期**: 2026-05-07  
**项目**: clipboard (Tauri + React)  
**状态**: 设计完成，待实现  
**决策**: 从0新开发，使用原生Canvas替代Fabric.js

---

## 目录

1. [问题分析](#问题分析)
2. [技术选型决策](#技术选型决策)
3. [整体架构设计](#整体架构设计)
4. [核心流程设计](#核心流程设计)
5. [工具架构设计](#工具架构设计)
6. [状态管理设计](#状态管理设计)
7. [Canvas渲染策略](#canvas渲染策略)
8. [设置项整合](#设置项整合)
9. [性能优化策略](#性能优化策略)
10. [实现计划](#实现计划)

---

## 问题分析

### 现状评估

当前截屏工具代码量约 **3600+行**（前端核心），存在以下问题：

#### 1. 功能Bug多，行为不正确
- 选区操作异常（拖拽/调整边界）
- 模糊/马赛克像素操作错误
- 工具切换状态不一致

#### 2. 性能问题，操作卡顿
- 模糊/马赛克需要像素级操作，Fabric.js性能瓶颈
- 频繁重绘导致帧率下降
- 大尺寸截图内存占用高

#### 3. 代码架构混乱，难以维护
- `useScreenshotWindow.ts` 单文件1060行，职责混杂
- 7种shapes各自实现，没有统一抽象层
- Fabric.js配置分散，难以统一管理
- React hooks + Fabric.js + shapes 耦合严重

#### 4. 缺少测试，回归困难
- 完全没有单元测试
- 每次改动需手动测试所有功能
- Bug修复经常引入新问题

### 现有代码结构

```
src/
├── hooks/
│   ├── useScreenshotWindow.ts (1060行)
│   └── useFabricCanvas.ts (25199字节)
├── composables/
│   └── shapes/
│       ├── rectHandler.ts
│       ├── ellipseHandler.ts
│       ├── arrowHandler.ts
│       ├── penHandler.ts
│       ├── textHandler.ts
│       ├── blurHandler.ts
│       └── mosaicHandler.ts
│       └── index.ts
├── features/
│   └── screenshot/
│       └── pages/
│           └── ScreenshotWindow.tsx
```

---

## 技术选型决策

### 方案对比

| 方案 | 描述 | 优点 | 缺点 | 工作量 |
|------|------|------|------|--------|
| **A: 渐进重构** | 保留React + Fabric.js，重构架构 | 改动小，风险低 | Fabric.js性能瓶颈仍存在，调试困难 | 1-2周 |
| **B: 原生Canvas** | 从0开发，React + 原生Canvas API | 完全掌控，性能可控，调试容易，长期收益好 | 需实现撤销/重做、图层管理等功能 | 2-3周 |
| **C: Rust/WebGPU** | Rust + WebGPU原生方案 | 性能最佳 | 开发难度极高，时间不足，兼容性问题 | 4-6周 |

### 决策：方案B - 从0新开发，使用原生Canvas

#### 核心理由

1. **截屏工具需求简单**：
   - 7种标注工具，交互逻辑清晰
   - Fabric.js提供的功能，80%用不上
   - 不需要复杂对象模型、序列化、动画

2. **性能关键路径**：
   - 模糊/马赛克是像素级操作，原生Canvas最快
   - Fabric.js中间层会降低性能

3. **调试体验**：
   - 原生Canvas一切都在掌控中
   - Fabric.js的Bug经常在内部渲染流程中，难以追踪

4. **长期维护**：
   - 原生Canvas API稳定，浏览器长期支持
   - Fabric.js升级可能引入breaking changes

#### Fabric.js vs 原生Canvas对比

```typescript
// Fabric.js - 模糊工具实现
// 需要创建Image对象，applyFilter，renderAll() - 性能损失
const blurFilter = new fabric.Image.filters.Blur({ blur: 0.5 });
fabricImage.applyFilter(blurFilter);
canvas.renderAll(); // 内部有很多隐藏逻辑

// 原生Canvas - 模糊工具实现
// 直接操作像素数组 - 性能最优
const imageData = ctx.getImageData(x, y, w, h);
applyBlur(imageData.data); // CPU密集但只执行一次
ctx.putImageData(imageData, x, y);
```

---

## 整体架构设计

### 架构图

```
┌─────────────────────────────────────────────────────────┐
│                    UI Layer                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Toolbar      │  │ Magnifier    │  │ StatusBar    │  │
│  │ (工具栏)     │  │ (放大镜)     │  │ (状态栏)     │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                 Interaction Layer                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ EventHandler │  │ CommandQueue │  │ ToolManager  │  │
│  │ (事件处理)   │  │ (撤销/重做)  │  │ (工具管理)   │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                  Canvas Layer                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Background   │  │ Mask         │  │ Annotation   │  │
│  │ Canvas       │  │ Canvas       │  │ Canvas       │  │
│  │ (背景图层)   │  │ (遮罩图层)   │  │ (标注图层)   │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │          CanvasRenderer (统一渲染)                │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                  Tool Layer                              │
│  ┌──────────────────────────────────────────────────┐  │
│  │          Tool Interface (工具抽象接口)            │  │
│  │  - onActivate()  - onDeactivate()                 │  │
│  │  - onMouseDown() - onMouseMove() - onMouseUp()   │  │
│  │  - render()      - getCursor()                    │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐       │
│  │ Rect    │ │Ellipse  │ │ Arrow   │ │ Pen     │       │
│  │ Tool    │ │ Tool    │ │ Tool    │ │ Tool    │       │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘       │
│                                                          │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐                   │
│  │ Text    │ │ Blur    │ │ Mosaic  │                   │
│  │ Tool    │ │ Tool    │ │ Tool    │                   │
│  └─────────┘ └─────────┘ └─────────┘                   │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                  Core Layer                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Screenshot   │  │ Selection    │  │ Export       │  │
│  │ Manager      │  │ Manager      │  │ Manager      │  │
│  │ (截屏管理)   │  │ (选区管理)   │  │ (导出管理)   │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │        State Manager (Zustand 状态管理)           │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                Platform Layer (Rust)                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Screen       │  │ Window       │  │ Clipboard    │  │
│  │ Capture      │  │ Manager      │  │ Manager      │  │
│  │ (屏幕捕获)   │  │ (窗口管理)   │  │ (剪贴板)     │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### 模块职责

#### UI Layer - 用户界面层
- **Toolbar**: 工具栏，选择工具、调整颜色/粗细、撤销/重做、确认/取消
- **Magnifier**: 放大镜，显示鼠标位置像素细节（仅在无选区时显示）
- **StatusBar**: 状态栏，显示坐标、像素颜色、选区尺寸

#### Interaction Layer - 交互管理层
- **EventHandler**: 统一处理鼠标/键盘事件，分发到各模块
- **CommandQueue**: 命令队列，实现撤销/重做功能（记录每个操作）
- **ToolManager**: 工具管理器，切换工具、维护当前工具状态

#### Canvas Layer - Canvas渲染层
- **Background Canvas**: 显示截图内容（只读，初始化时绘制一次）
- **Mask Canvas**: 显示选区遮罩和半透明覆盖（选区变化时重绘）
- **Annotation Canvas**: 显示标注内容（标注时重绘，使用脏矩形优化）
- **CanvasRenderer**: 统一渲染调度，合并三层Canvas输出

#### Tool Layer - 标注工具层
- **Tool Interface**: 统一工具接口，定义工具生命周期和操作
- **具体工具实现**: 每种工具独立实现，遵循统一接口

#### Core Layer - 核心业务层
- **Screenshot Manager**: 协调截屏流程，调用Rust后端
- **Selection Manager**: 管理选区状态、坐标转换、边界检测
- **Export Manager**: 处理导出逻辑（剪贴板/文件/下载）
- **State Manager**: 全局状态管理（使用Zustand）

#### Platform Layer - 平台适配层（保留现有Rust代码）
- **Screen Capture**: Rust实现的屏幕捕获
- **Window Manager**: Rust实现的窗口管理（透明、层级）
- **Clipboard Manager**: Rust实现的剪贴板操作

### 关键设计原则

1. **职责单一**: 每个模块只负责一件事
2. **接口统一**: 工具通过统一接口交互，便于扩展
3. **状态集中**: 所有状态通过Zustand管理，避免分散
4. **分层清晰**: UI → Interaction → Canvas → Tool → Core → Platform
5. **性能优化**: 分层Canvas渲染，避免频繁重绘

---

## 核心流程设计

### 用户操作流程图

```
┌──────────────────────────────────────────────────────────┐
│                    截屏触发                                │
│  用户按下快捷键 (Cmd+Shift+S)                              │
└──────────────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────┐
│                  Step 1: 屏幕捕获                          │
│  - capture_all_screens() (Rust并行捕获)                   │
│  - 检查权限 (macOS Screen Recording)                      │
│  - 保存为临时PNG文件                                       │
│  - 状态: captures[] , isCapturing: true → false           │
└──────────────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────┐
│                  Step 2: 窗口初始化                        │
│  - 创建透明窗口 (Tauri)                                   │
│  - set_window_level_above_menubar()                       │
│  - 加载配置 (format/quality/save_action)                  │
│  - 初始化三层Canvas                                       │
│  - 显示放大镜和状态栏                                      │
└──────────────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────┐
│                  Step 3: 选区操作                          │
│                                                           │
│  用户操作:                                                │
│  - 鼠标拖拽 → 创建选区                                    │
│  - 双击 → 全屏选区                                        │
│  - ESC → 取消并关闭                                       │
│                                                           │
│  选区创建流程:                                            │
│  1. mousedown → isSelecting = true                       │
│  2. mousemove → 计算边界，更新Mask Canvas                 │
│  3. mouseup → 小选区(<10px)自动全屏，显示工具栏            │
│                                                           │
│  选区调整:                                                │
│  - 拖拽边框/角点 → 调整大小                               │
│  - 拖拽内部 → 移动位置                                    │
└──────────────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────┐
│                  Step 4: 标注操作                          │
│                                                           │
│  工具选择:                                                │
│  - 用户点击工具栏按钮                                     │
│  - ToolManager.setActiveTool(toolType)                   │
│  - 更新cursor样式                                         │
│                                                           │
│  标注绘制流程:                                            │
│  1. mousedown → 工具激活，创建临时Shape                   │
│  2. mousemove → 实时更新，重绘Annotation Canvas           │
│  3. mouseup → 完成绘制，创建Command，添加到历史队列        │
│                                                           │
│  特殊工具处理:                                            │
│  - 文字工具: 点击显示TextInput，输入完成创建TextShape      │
│  - 模糊/马赛克: 拖拽绘制区域，完成时执行像素操作            │
└──────────────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────┐
│                  Step 5: 撤销/重做                         │
│                                                           │
│  Command Queue:                                           │
│  - undoStack: Command[]                                  │
│  - redoStack: Command[]                                  │
│  - maxHistory: 50                                        │
│                                                           │
│  撤销: undoStack.pop().undo() → redoStack.push()          │
│  重做: redoStack.pop().execute() → undoStack.push()       │
│                                                           │
│  快捷键: Cmd+Z (撤销), Cmd+Shift+Z (重做)                 │
└──────────────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────┐
│                  Step 6: 确认/导出                         │
│                                                           │
│  确认流程:                                                │
│  1. 合并三层Canvas (selection区域)                       │
│  2. 导出为DataURL (format + quality)                     │
│  3. 根据save_action执行:                                  │
│     - clipboard: set_clipboard_item()                    │
│     - file: add_to_history()                             │
│     - both: 两者都执行                                   │
│  4. 关闭窗口 close_capture()                             │
│                                                           │
│  下载: 直接通过<a>标签下载                                │
└──────────────────────────────────────────────────────────┘
```

### 关键数据流转

```typescript
interface ScreenshotState {
  // Step 1-2: 初始化阶段
  isCapturing: boolean;
  captures: CaptureResult[];
  currentScreenId: number | null;
  isReady: boolean;
  
  // Step 3: 选区阶段
  selection: SelectionRect | null;
  isSelecting: boolean;
  isDraggingSelection: boolean;
  isResizingSelection: boolean;
  
  // Step 4: 标注阶段
  activeTool: ToolType | null;
  shapes: Shape[];
  isDrawing: boolean;
  
  // Step 5: 历史管理
  undoStack: Command[];
  redoStack: Command[];
  
  // Step 6: 导出配置
  screenshotFormat: 'png' | 'jpeg' | 'webp';
  screenshotQuality: number;
  screenshotSaveAction: 'clipboard' | 'file' | 'both';
}
```

---

## 工具架构设计

### 工具接口抽象

```typescript
interface BaseTool {
  // 基本信息
  type: ToolType;
  name: string;
  icon: string;
  
  // 生命周期
  onActivate(): void;
  onDeactivate(): void;
  
  // 绘制事件
  onMouseDown(pos: Point, selection: SelectionRect, state: ToolState): void;
  onMouseMove(pos: Point, selection: SelectionRect, state: ToolState): void;
  onMouseUp(pos: Point, selection: SelectionRect, state: ToolState): Shape | null;
  
  // 渲染
  render(ctx: CanvasRenderingContext2D, shape: Shape): void;
  
  // 辅助方法
  getCursor(): string;
  getTempShape(): Shape | null;
}

enum ToolType {
  RECT = 'rect',
  ELLIPSE = 'ellipse',
  ARROW = 'arrow',
  PEN = 'pen',
  TEXT = 'text',
  BLUR = 'blur',
  MOSAIC = 'mosaic',
}
```

### 7种工具实现要点

#### 1. 矩形工具 (RectTool)
- 拖拽绘制矩形
- 支持填充和描边
- 小矩形(<5px)视为无效

#### 2. 椭圆工具 (EllipseTool)
- 中心点为起点和当前点的中点
- radius = abs(终点 - 起点) / 2
- 小椭圆(<5px)视为无效

#### 3. 箭头工具 (ArrowTool)
- 从起点到终点绘制箭杆
- 箭头头部: 两条斜线，角度 ±π/6
- headLength = strokeWidth * 4

#### 4. 画笔工具 (PenTool)
- 记录鼠标轨迹点数组
- 使用采样优化(dx>2 || dy>2才记录新点)
- 使用贝塞尔曲线平滑路径
- points.length < 2视为无效

#### 5. 文字工具 (TextTool)
- 点击位置显示TextInput UI
- 输入完成创建TextShape
- 通过onTextInputComplete回调创建Shape
- 不通过mouseUp返回Shape（特殊处理）

#### 6. 模糊工具 (BlurTool)
- 拖拽绘制矩形区域（绘制时只显示轮廓）
- 完成时一次性执行模糊算法
- 读取bgCanvas像素 → applyBlur() → 写入annotationCanvas
- Box Blur算法: 横向模糊 + 纵向模糊
- 小区域(<10px)视为无效

#### 7. 马赛克工具 (MosaicTool)
- 拖拽绘制矩形区域（绘制时只显示轮廓）
- 完成时一次性执行马赛克算法
- blockSize = 10 (固定或可配置)
- 计算每个块的平均颜色并填充
- 小区域(<10px)视为无效

### 命令模式（撤销/重做）

```typescript
interface Command {
  execute(): void;
  undo(): void;
  getType(): string;
}

class DrawCommand implements Command {
  private shapes: Shape[];
  private newShape: Shape;
  private toolManager: ToolManager;
  private annotationCtx: CanvasRenderingContext2D;
  private bgCanvas: HTMLCanvasElement;
  
  execute() {
    this.shapes.push(this.newShape);
    this.toolManager.renderShapes(this.annotationCtx, this.shapes, this.bgCanvas);
  }
  
  undo() {
    const index = this.shapes.indexOf(this.newShape);
    if (index !== -1) {
      this.shapes.splice(index, 1);
    }
    this.toolManager.renderShapes(this.annotationCtx, this.shapes, this.bgCanvas);
  }
}

class CommandQueue {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private maxHistory: number = 50;
  
  execute(command: Command) {
    command.execute();
    this.undoStack.push(command);
    this.redoStack = []; // 新操作清空redo历史
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
  }
  
  undo() {
    const command = this.undoStack.pop();
    if (command) {
      command.undo();
      this.redoStack.push(command);
    }
  }
  
  redo() {
    const command = this.redoStack.pop();
    if (command) {
      command.execute();
      this.undoStack.push(command);
    }
  }
}
```

### 工具管理器

```typescript
class ToolManager {
  private tools: Map<ToolType, BaseTool> = new Map();
  private activeTool: BaseTool | null = null;
  
  constructor() {
    this.registerTool(new RectTool());
    this.registerTool(new EllipseTool());
    this.registerTool(new ArrowTool());
    this.registerTool(new PenTool());
    this.registerTool(new TextTool());
    this.registerTool(new BlurTool());
    this.registerTool(new MosaicTool());
  }
  
  setActiveTool(type: ToolType | null) {
    if (this.activeTool) {
      this.activeTool.onDeactivate();
    }
    
    if (type) {
      this.activeTool = this.tools.get(type) || null;
      if (this.activeTool) {
        this.activeTool.onActivate();
      }
    } else {
      this.activeTool = null;
    }
    
    document.body.style.cursor = this.activeTool?.getCursor() || 'crosshair';
  }
  
  renderShapes(ctx: CanvasRenderingContext2D, shapes: Shape[], bgCanvas: HTMLCanvasElement) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    
    shapes.forEach(shape => {
      const tool = this.tools.get(shape.type);
      if (!tool) return;
      
      if (shape.type === 'blur' || shape.type === 'mosaic') {
        (tool as BlurTool | MosaicTool).render(ctx, shape as BlurShape | MosaicShape, bgCanvas);
      } else {
        tool.render(ctx, shape);
      }
    });
  }
  
  renderTempShape(ctx: CanvasRenderingContext2D) {
    if (!this.activeTool) return;
    
    const tempShape = this.activeTool.getTempShape();
    if (!tempShape) return;
    
    // 模糊/马赛克绘制轮廓，不执行像素操作
    if (tempShape.type === 'blur' || tempShape.type === 'mosaic') {
      ctx.strokeStyle = '#00e676';
      ctx.lineWidth = 2;
      ctx.strokeRect(tempShape.x, tempShape.y, tempShape.w, tempShape.h);
    } else {
      this.activeTool.render(ctx, tempShape);
    }
  }
}
```

---

## 状态管理设计

### Zustand Store结构

```typescript
interface ScreenshotStore {
  // ==================== 初始化阶段 ====================
  isCapturing: boolean;
  captures: CaptureResult[];
  currentScreenId: number | null;
  isReady: boolean;
  
  // ==================== 选区阶段 ====================
  selection: SelectionRect | null;
  isSelecting: boolean;
  isDraggingSelection: boolean;
  isResizingSelection: boolean;
  resizeHandle: string | null;
  
  // ==================== 标注阶段 ====================
  activeTool: ToolType | null;
  shapes: Shape[];
  isDrawing: boolean;
  
  // ==================== 绘图配置 ====================
  drawingConfig: {
    strokeColor: string;      // 默认#ff0000
    strokeWidth: number;      // 默认3px
    fillColor: string;        // 默认transparent
    fontSize: number;         // 默认16px
    fontFamily: string;       // 默认sans-serif
  };
  
  // ==================== 历史管理 ====================
  undoStack: Command[];
  redoStack: Command[];
  
  // ==================== 导出配置 ====================
  screenshotFormat: 'png' | 'jpeg' | 'webp';
  screenshotQuality: number;  // 0-100
  screenshotSaveAction: 'clipboard' | 'file' | 'both';
  
  // ==================== 鼠标状态 ====================
  mousePos: Point;            // 逻辑像素
  canvasMousePos: Point;      // 物理像素
  pixelColor: PixelColor;     // 当前像素颜色
  
  // ==================== Canvas引用 ====================
  bgCanvas: HTMLCanvasElement | null;
  maskCanvas: HTMLCanvasElement | null;
  annotationCanvas: HTMLCanvasElement | null;
  magnifierCanvas: HTMLCanvasElement | null;
  
  // ==================== Scale Factor ====================
  scaleFactor: ScaleFactor;   // 物理/逻辑像素比例
  
  // ==================== 工具管理器 ====================
  toolManager: ToolManager | null;
  
  // ==================== Actions ====================
  // 初始化
  setCaptures: (captures: CaptureResult[]) => void;
  setCurrentScreenId: (id: number | null) => void;
  setIsReady: (ready: boolean) => void;
  
  // 选区
  setSelection: (selection: SelectionRect | null) => void;
  startSelecting: (pos: Point) => void;
  updateSelection: (pos: Point) => void;
  endSelection: () => void;
  
  // 标注
  setActiveTool: (tool: ToolType | null) => void;
  addShape: (shape: Shape) => void;
  executeCommand: (command: Command) => void;
  
  // 历史
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  
  // 配置
  setScreenshotFormat: (format: 'png' | 'jpeg' | 'webp') => void;
  setScreenshotQuality: (quality: number) => void;
  setScreenshotSaveAction: (action: 'clipboard' | 'file' | 'both') => void;
  
  // 鼠标
  setMousePos: (pos: Point) => void;
  updatePixelColor: (x: number, y: number) => void;
  
  // Canvas
  setBgCanvas: (canvas: HTMLCanvasElement | null) => void;
  setMaskCanvas: (canvas: HTMLCanvasElement | null) => void;
  setAnnotationCanvas: (canvas: HTMLCanvasElement | null) => void;
  
  // 重置
  reset: () => void;
  resetSelection: () => void;
  resetShapes: () => void;
}
```

### 状态订阅优化

```typescript
// 精确订阅 - 避免不必要的重渲染
const useSelection = () => useStore(useScreenshotStore, state => state.selection);
const useShapes = () => useStore(useScreenshotStore, state => state.shapes);
const useActiveTool = () => useStore(useScreenshotStore, state => state.activeTool);
const useIsReady = () => useStore(useScreenshotStore, state => state.isReady);
const useDrawingConfig = () => useStore(useScreenshotStore, state => state.drawingConfig);

// 派生状态
const useSelectionSize = () => {
  const selection = useSelection();
  if (!selection) return '';
  return `${Math.round(selection.w)} × ${Math.round(selection.h)}`;
};

const useCanUndo = () => useStore(useScreenshotStore, state => state.undoStack.length > 0);
const useCanRedo = () => useStore(useScreenshotStore, state => state.redoStack.length > 0);
```

---

## Canvas渲染策略

### 三层Canvas架构

```
Background Canvas (底层)
- 显示截图内容
- 只读，初始化时绘制一次
- 不参与交互
- 物理像素尺寸: capture.width × capture.height

Mask Canvas (中层)
- 显示选区遮罩和半透明覆盖
- 选区变化时重绘
- 显示resize handles (8个控制点)
- 显示rule-of-thirds网格
- 最快60fps (16ms间隔)

Annotation Canvas (顶层)
- 显示所有标注形状
- 标注时重绘，使用脏矩形优化
- 模糊/马赛克像素操作
- 参与鼠标交互
- 最快60fps (16ms间隔)
```

### Canvas尺寸和坐标系统

```typescript
class CanvasSizeManager {
  initialize(capture: CaptureResult) {
    const physicalWidth = capture.width;
    const physicalHeight = capture.height;
    const logicalWidth = window.innerWidth;
    const logicalHeight = window.innerHeight;
    
    // 设置Canvas物理尺寸
    canvas.width = physicalWidth;
    canvas.height = physicalHeight;
    
    // 设置CSS逻辑尺寸
    canvas.style.width = `${logicalWidth}px`;
    canvas.style.height = `${logicalHeight}px`;
    
    // 计算scaleFactor
    const scaleFactor = {
      x: physicalWidth / logicalWidth,
      y: physicalHeight / logicalHeight,
    };
    
    useScreenshotStore.getState().setScaleFactor(scaleFactor);
  }
  
  toPhysicalCoords(clientX: number, clientY: number): Point {
    const { scaleFactor } = useScreenshotStore.getState();
    return {
      x: clientX * scaleFactor.x,
      y: clientY * scaleFactor.y,
    };
  }
}
```

### 渲染时机优化

```typescript
class CanvasRenderScheduler {
  private bgRenderMinInterval: number = 0;     // Background只渲染一次
  private maskRenderMinInterval: number = 16;  // Mask最快60fps
  private annotationRenderMinInterval: number = 16; // Annotation最快60fps
  
  renderBackground(capture: CaptureResult) {
    // 只在初始化时渲染一次
    this.bgRenderer.render(capture);
  }
  
  renderMask(selection: SelectionRect | null) {
    // 使用requestAnimationFrame优化
    requestAnimationFrame(() => {
      this.maskRenderer.render(selection);
    });
  }
  
  renderAnnotation(shapes: Shape[], tempShape: Shape | null) {
    // 使用脏矩形优化
    requestAnimationFrame(() => {
      if (tempShape) {
        this.annotationRenderer.renderDirtyRect(shapes, tempShape);
      } else {
        this.annotationRenderer.renderAll(shapes);
      }
    });
  }
}
```

### 脏矩形优化

```typescript
class AnnotationRenderer {
  renderDirtyRect(shapes: Shape[], tempShape: Shape) {
    const dirtyRect = this.calculateDirtyRect(tempShape);
    
    if (!dirtyRect) return;
    
    // 只清除脏矩形区域
    this.annotationCtx.clearRect(dirtyRect.x, dirtyRect.y, dirtyRect.w, dirtyRect.h);
    
    // 重绘脏矩形区域内的所有形状
    shapes.forEach(shape => {
      if (this.isShapeInDirtyRect(shape, dirtyRect)) {
        this.renderShape(shape);
      }
    });
    
    // 渲染临时形状
    this.renderShape(tempShape);
  }
  
  private isShapeInDirtyRect(shape: Shape, dirtyRect: DirtyRect): boolean {
    const bounds = this.getShapeBounds(shape);
    if (!bounds) return false;
    
    // AABB碰撞检测
    return !(bounds.x + bounds.w < dirtyRect.x ||
             bounds.x > dirtyRect.x + dirtyRect.w ||
             bounds.y + bounds.h < dirtyRect.y ||
             bounds.y > dirtyRect.y + dirtyRect.h);
  }
}
```

---

## 设置项整合

### 截屏设置项

| 设置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `screenshot_format` | `'png' | 'jpeg' | 'webp'` | `'png'` | 图片格式 |
| `screenshot_quality` | `number (0-100)` | `90` | 图片质量（JPEG/WebP有效） |
| `screenshot_save_action` | `'clipboard' | 'file' | 'both'` | `'clipboard'` | 保存方式 |

### 保存方式说明

- **clipboard**: 只复制到剪贴板
- **file**: 只保存到文件（添加到历史记录）
- **both**: 同时复制到剪贴板和保存到文件

### 配置加载流程

```typescript
// 截屏窗口初始化时加载配置
async initialize() {
  const config = await invoke<AppConfig>('get_config');
  
  const { setScreenshotFormat, setScreenshotQuality, setScreenshotSaveAction } = useScreenshotStore.getState();
  
  setScreenshotFormat((config.screenshot_format as 'png' | 'jpeg' | 'webp') || 'png');
  setScreenshotQuality(config.screenshot_quality ?? 90);
  setScreenshotSaveAction((config.screenshot_save_action as 'clipboard' | 'file' | 'both') || 'clipboard');
}
```

### 导出格式处理

```typescript
class ExportRenderer {
  async export(): Promise<string> {
    const { screenshotFormat, screenshotQuality } = useScreenshotStore.getState();
    
    // 根据格式导出
    let mimeType: string;
    let quality: number;
    
    switch (screenshotFormat) {
      case 'png':
        mimeType = 'image/png';
        quality = 1; // PNG不支持质量参数
        break;
      case 'jpeg':
        mimeType = 'image/jpeg';
        quality = screenshotQuality / 100; // 0-1
        break;
      case 'webp':
        mimeType = 'image/webp';
        quality = screenshotQuality / 100; // WebP支持质量参数
        break;
      default:
        mimeType = 'image/png';
        quality = 1;
    }
    
    return tempCanvas.toDataURL(mimeType, quality);
  }
  
  async save(): Promise<void> {
    const { screenshotSaveAction } = useScreenshotStore.getState();
    
    switch (screenshotSaveAction) {
      case 'clipboard':
        await this.exportToClipboard();
        break;
      case 'file':
        await this.exportToFile();
        break;
      case 'both':
        await this.exportToClipboard();
        await this.exportToFile();
        break;
    }
    
    await invoke('close_capture');
  }
}
```

### WebP兼容性检测

```typescript
function isWebPSupported(): boolean {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  return canvas.toDataURL('image/webp').startsWith('data:image/webp');
}

// 使用时检测兼容性
const format = screenshotFormat === 'webp' && !isWebPSupported() ? 'png' : screenshotFormat;
```

### 注意事项

**设置项不影响标注操作**：
- 这些设置项只在最终导出时生效
- 不影响选区操作、标注绘制、撤销/重做、工具切换
- 用户可以自由标注，最终确认时才应用配置导出

---

## 性能优化策略

### 1. Canvas分层渲染
- Background只渲染一次
- Mask选区变化时重绘
- Annotation标注时重绘（脏矩形）

### 2. requestAnimationFrame调度
- 限制最快60fps（16ms间隔）
- 避免频繁重绘

### 3. 脏矩形优化
- 只重绘变化的区域
- 不每次都清空整个Canvas

### 4. 模糊/马赛克性能
- 只在绘制完成时执行像素操作
- 不在拖拽时执行（性能关键）
- 一次性读取、处理、写入ImageData

### 5. 坐标转换缓存
- 预计算scaleFactor
- 避免每次mousemove都计算

### 6. 状态订阅优化
- 精确订阅需要的状态
- 避免订阅整个store导致重渲染
- 派生状态计算缓存

### 7. 性能监控
```typescript
class PerformanceMonitor {
  private frameCount: number = 0;
  private lastFpsTime: number = performance.now();
  
  recordFrame() {
    this.frameCount++;
    
    const now = performance.now();
    if (now - this.lastFpsTime >= 1000) {
      const fps = this.frameCount;
      console.log(`FPS: ${fps}`);
      
      if (fps < 30) {
        console.warn('性能警告:帧率低于30fps');
      }
      
      this.frameCount = 0;
      this.lastFpsTime = now;
    }
  }
}
```

---

## 实现计划

### 开发时间估算：2-3周

#### Week 1: 核心架构（5天）

**Day 1-2: 状态管理和Canvas基础**
- 创建Zustand store结构
- 实现CanvasSizeManager（坐标转换）
- 实现BackgroundRenderer（加载截图）
- 测试：截图加载、坐标转换正确

**Day 3-4: 选区功能**
- 实现MaskRenderer（遮罩渲染）
- 实现选区创建、拖拽、调整逻辑
- 实现resize handles检测
- 测试：选区创建、调整、边界检测

**Day 5: 工具接口和管理器**
- 创建BaseTool接口
- 实现ToolManager基础框架
- 测试：工具切换、cursor更新

#### Week 2: 工具实现（5天）

**Day 1: 基础形状工具**
- 实现RectTool
- 实现EllipseTool
- 实现ArrowTool
- 测试：形状绘制、边界计算

**Day 2: 画笔和文字工具**
- 实现PenTool（贝塞尔曲线平滑）
- 实现TextTool（TextInput UI）
- 测试：画笔轨迹、文字输入

**Day 3-4: 模糊和马赛克工具**
- 实现BlurTool（Box Blur算法）
- 实现MosaicTool（马赛克算法）
- 性能优化：只在完成时执行像素操作
- 测试：模糊效果、马赛克效果

**Day 5: 命令模式和撤销/重做**
- 实现CommandQueue
- 实现DrawCommand
- 测试：撤销/重做、历史队列

#### Week 3: 整合和优化（5天）

**Day 1-2: UI组件整合**
- 实现ScreenshotWindow组件
- 实现Toolbar组件
- 实现Magnifier组件
- 实现StatusBar组件
- 测试：UI交互、状态更新

**Day 3: 导出功能**
- 实现ExportRenderer
- 整合设置项配置
- 测试：导出格式、保存方式

**Day 4: 性能优化**
- 实现脏矩形优化
- 实现requestAnimationFrame调度
- 性能监控和调优
- 测试：性能指标、帧率

**Day 5: 测试和修复**
- 全面功能测试
- 边缘情况测试
- Bug修复
- 代码审查

### 文件结构规划

```
src/
├── features/
│   └── screenshot/
│       ├── components/
│       │   ├── ScreenshotWindow.tsx
│       │   ├── Toolbar.tsx
│       │   ├── Magnifier.tsx
│       │   └── StatusBar.tsx
│       └── pages/
│           └── index.tsx
├── hooks/
│   └── useScreenshotStore.ts (Zustand)
├── lib/
│   └── screenshot/
│       ├── tools/
│       │   ├── BaseTool.ts
│       │   ├── RectTool.ts
│       │   ├── EllipseTool.ts
│       │   ├── ArrowTool.ts
│       │   ├── PenTool.ts
│       │   ├── TextTool.ts
│       │   ├── BlurTool.ts
│       │   ├── MosaicTool.ts
│       │   └── ToolManager.ts
│       ├── renderers/
│       │   ├── BackgroundRenderer.ts
│       │   ├── MaskRenderer.ts
│       │   ├── AnnotationRenderer.ts
│       │   ├── MagnifierRenderer.ts
│       │   └── ExportRenderer.ts
│       ├── commands/
│       │   ├── Command.ts
│       │   ├── DrawCommand.ts
│       │   └── CommandQueue.ts
│       ├── managers/
│       │   ├── CanvasSizeManager.ts
│       │   ├── CanvasRenderScheduler.ts
│       │   └── PerformanceMonitor.ts
│       └── types/
│           ├── shapes.ts
│           ├── tools.ts
│           └── config.ts
└── types/
    └── screenshot.ts (全局类型)
```

### 测试策略

#### 单元测试
- 工具逻辑测试（绘制、边界计算）
- 命令模式测试（撤销/重做）
- 坐标转换测试
- 模糊/马赛克算法测试

#### 集成测试
- 截屏流程测试（捕获→选区→标注→导出）
- 工具切换测试
- 设置项配置测试

#### 性能测试
- 帧率监控（目标：稳定60fps）
- 内存占用监控
- 大尺寸截图测试

#### 手动测试清单
- [ ] 截屏触发
- [ ] 选区创建/调整
- [ ] 7种工具绘制
- [ ] 撤销/重做
- [ ] 导出PNG/JPEG/WebP
- [ ] 三种保存方式
- [ ] 放大镜显示
- [ ] 状态栏信息
- [ ] 键盘快捷键
- [ ] ESC取消

---

## 附录

### 保留的Rust代码

以下Rust代码无需修改，继续使用：

```rust
// src-tauri/src/screenshot.rs
pub fn capture_all_screens() -> Result<Vec<CaptureResult>, String>;
pub fn check_screen_recording_permission() -> bool;
pub fn set_window_level_above_menubar<R: Runtime>(window: &WebviewWindow<R>);
pub fn make_window_transparent<R: Runtime>(window: &WebviewWindow<R>);

// src-tauri/src/commands.rs
#[tauri::command]
pub async fn save_captured_image(base64_data: String, format: String, quality: u8) -> Result<String, String>;

#[tauri::command]
pub async fn set_clipboard_item(content: String, kind: String) -> Result<(), String>;

#[tauri::command]
pub async fn add_to_history(content: String, kind: String) -> Result<(), String>;

#[tauri::command]
pub async fn close_capture() -> Result<(), String>;

#[tauri::command]
pub async fn get_config() -> Result<AppConfig, String>;
```

### 现有设置界面代码

无需修改，继续使用：

```typescript
// src/features/main/components/SettingsDialog.tsx
// src/hooks/useSettings.ts

// 设置项已存在：
// - screenshot_format: 'png' | 'jpeg' | 'webp'
// - screenshot_quality: 0-100
// - screenshot_save_action: 'clipboard' | 'file' | 'both'
```

### 现有类型定义

继续使用，无需修改：

```typescript
// src/types.ts
export interface AppConfig {
  screenshot_format?: 'png' | 'jpeg' | 'webp';
  screenshot_quality?: number;
  screenshot_save_action?: 'clipboard' | 'file' | 'both';
}

export interface CaptureResult {
  id: number;
  path: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scale_factor: number;
}
```

---

## 自我审查检查清单

- [x] **Placeholder扫描**: 无TBD、TODO、未完成部分
- [x] **内部一致性**: 架构图与各层描述一致
- [x] **范围检查**: 专注于截屏工具重新设计，无无关内容
- [x] **歧义检查**: 所有术语和流程有明确说明
- [x] **技术选型**: 有清晰的对比分析和决策理由
- [x] **性能优化**: 包含具体的优化策略和实现方法
- [x] **测试策略**: 包含单元、集成、性能测试计划
- [x] **实现计划**: 有详细的时间估算和文件结构

---

**文档状态**: 完成  
**下一步**: 用户审查文档，批准后开始实现