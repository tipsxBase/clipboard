export interface ClipboardItem {
  id?: number;
  content: string;
  kind: string;
  timestamp: string;
  is_sensitive?: boolean;
  is_pinned?: boolean;
  source_app?: string;
  data_type?: string;
  collection_id?: number;
  note?: string;
  html_content?: string;
  is_snippet?: boolean;
  /** Links OCR text items to their source screenshot image (history id) */
  screenshot_id?: number;
}

export interface Collection {
  id: number;
  name: string;
  created_at: string;
  icon?: string;
  color?: string;
}

export interface RuleCondition {
  field: 'source_app' | 'content_type' | 'content';
  operator: 'equals' | 'contains' | 'matches';
  value: string;
}

export interface RuleAction {
  action_type: 'ignore' | 'mark_sensitive' | 'pin' | 'snippet' | 'add_to_collection';
  collection_id?: number;
}

export interface Rule {
  id: string;
  name: string;
  enabled: boolean;
  conditions: RuleCondition[];
  action: RuleAction;
}

export interface AppConfig {
  shortcut: string;
  max_history_size: number;
  language: string;
  theme: string;
  compact_mode?: boolean;
  clear_pinned_on_clear?: boolean;
  clear_collected_on_clear?: boolean;
  screenshot_shortcut?: string;
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

// ==================== 截图工作流状态 ====================

/**
 * 截图工作流状态
 *
 * 状态转换:
 *   idle → capturing → selecting → editing → confirming → idle
 *                   ↘                ↘          ↘
 *                  error           cancelled   error
 *                    ↘               ↘          ↘
 *                   idle            idle       idle
 */
export type ScreenshotWorkflowState =
  | 'idle' // 无截图活动
  | 'capturing' // 正在捕获屏幕
  | 'selecting' // 用户正在绘制选区
  | 'editing' // 选区已确定，工具可用
  | 'confirming' // 正在保存/复制到剪贴板
  | 'cancelled' // 用户按 Escape 取消
  | 'error'; // 截图或保存失败

// ==================== 截图工具类型定义 ====================

// 屏幕信息
export interface ScreenInfo {
  index: number;
  x: number; // 逻辑坐标
  y: number; // 逻辑坐标
  width: number; // 逻辑尺寸
  height: number; // 逻辑尺寸
  scaleFactor: number; // DPI 缩放因子
}

// 点坐标
export interface Point {
  x: number;
  y: number;
}

// 矩形区域
export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

// 截图窗口
export interface CaptureWindow {
  id: string;
  label: string;
  screenIndex: number;
  handle: any; // WebviewWindow 类型
}

// 临时文件
export interface TempFile {
  path: string;
  createdAt: number;
  screenIndex: number;
}

// 图片格式
export type ImageFormat = 'png' | 'jpg' | 'webp';

// 选区区域
export interface SelectionRegion {
  x: number; // 物理像素
  y: number; // 物理像素
  width: number; // 物理像素
  height: number; // 物理像素
}

// 标注工具类型
export type AnnotationTool =
  | 'rect'
  | 'ellipse'
  | 'arrow'
  | 'pen'
  | 'text'
  | 'mosaic'
  | 'blur'
  | null;

// 标注样式
export interface AnnotationStyle {
  strokeColor: string;
  strokeWidth: number;
  fillColor: string;
  fontSize?: number;
  fontStyle?: 'normal' | 'bold' | 'italic';
  arrowStyle?: 'single' | 'double';
  mosaicSize?: number;
  blurStrength?: number;
}

// 标注对象
export interface Annotation {
  id: string;
  type: AnnotationTool;
  data: any; // 具体数据结构取决于工具类型
  style: AnnotationStyle;
  createdAt: number;
}

// 历史记录条目
export interface HistoryEntry {
  timestamp: number;
  state: string; // JSON 序列化的画布状态
}

// 截图历史项
export interface ScreenshotHistoryItem {
  id: string;
  thumbnail: string; // Base64 缩略图
  fullImage: string; // 完整图片路径
  width: number;
  height: number;
  createdAt: number;
  annotations: Annotation[];
}

// 截图会话
export interface CaptureSession {
  id: string;
  screenIndex: number;
  startTime: number;
  selection: SelectionRegion | null;
  annotations: Annotation[];
  activeTool: AnnotationTool;
  style: AnnotationStyle;
}

// 颜色信息
export interface ColorInfo {
  r: number;
  g: number;
  b: number;
  hex: string;
}

// 工具栏位置
export interface ToolbarPosition {
  left: string;
  top: string;
}

// 放大镜配置
export interface MagnifierConfig {
  size: number; // 放大镜尺寸
  zoomLevel: number; // 放大倍数
  visible: boolean;
}

// 快捷键配置
export interface ShortcutConfig {
  startCapture: string; // 启动截图
  confirmCapture: string; // 确认截图
  cancelCapture: string; // 取消截图
  toolRect: string; // 矩形工具
  toolEllipse: string; // 椭圆工具
  toolArrow: string; // 箭头工具
  toolPen: string; // 画笔工具
  toolText: string; // 文字工具
  toolMosaic: string; // 马赛克工具
  toolBlur: string; // 模糊工具
  undo: string; // 撤销
  redo: string; // 重做
}

// 保存选项
export interface SaveOptions {
  defaultFormat: ImageFormat;
  defaultQuality: number; // 0-100
  defaultPath: string;
  autoSave: boolean;
  copyToClipboard: boolean;
}

// 截图配置（扩展 AppConfig）
export interface ScreenshotConfig {
  shortcuts: ShortcutConfig;
  saveOptions: SaveOptions;
  maxHistorySize: number;
  maxScreenshotHistory: number;
}

// 性能指标
export interface PerformanceMetrics {
  captureTime: number; // 截图捕获耗时 (ms)
  encodeTime: number; // 图片编码耗时 (ms)
  renderFPS: number; // 画布渲染帧率
  memoryUsage: number; // 内存使用 (MB)
  annotationCount: number; // 标注对象数量
  historySize: number; // 历史记录大小
}

// 应用状态
export interface AppState {
  currentSession: CaptureSession | null;
  activeWindows: CaptureWindow[];
  tempFiles: TempFile[];
  config: AppConfig;
  performanceMetrics: PerformanceMetrics;
}

// 事件类型
export type EventType =
  | 'window:closed'
  | 'window:all-closed'
  | 'selection:created'
  | 'selection:updated'
  | 'selection:confirmed'
  | 'selection:cancelled'
  | 'annotation:created'
  | 'annotation:updated'
  | 'annotation:deleted'
  | 'tool:changed'
  | 'capture:started'
  | 'capture:completed'
  | 'capture:failed'
  | 'file:cleanup-requested';

// 事件负载
export interface EventPayload {
  [key: string]: any;
}

// 画布层类型
export type CanvasLayerType = 'background' | 'mask' | 'annotation' | 'magnifier';

// 画布层
export interface CanvasLayer {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  type: CanvasLayerType;
}

// 错误类型
export enum ErrorType {
  CAPTURE_FAILED = 'CAPTURE_FAILED',
  WINDOW_CREATE_FAILED = 'WINDOW_CREATE_FAILED',
  FILE_OPERATION_FAILED = 'FILE_OPERATION_FAILED',
  CANVAS_RENDER_FAILED = 'CANVAS_RENDER_FAILED',
  ANNOTATION_FAILED = 'ANNOTATION_FAILED',
  CLIPBOARD_FAILED = 'CLIPBOARD_FAILED',
  CONFIG_LOAD_FAILED = 'CONFIG_LOAD_FAILED',
}

// 应用错误
export interface AppError {
  type: ErrorType;
  message: string;
  details?: any;
  timestamp: number;
  recoverable: boolean;
}
