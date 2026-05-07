import React from 'react';
import {
  Square,
  Circle,
  ArrowRight,
  Pencil,
  Type,
  Droplets,
  Grid3x3,
  Undo2,
  Redo2,
  Check,
  X,
  Download,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ToolType } from '../../../lib/screenshot/types';

const COLOR_PALETTE = [
  '#ff0000',
  '#ffc800',
  '#00b300',
  '#0066ff',
  '#ffffff',
  '#808080',
  '#000000',
  '#800080',
];

const STROKE_WIDTHS = [3, 5, 9];

interface ToolbarProps {
  activeTool: ToolType | null;
  strokeColor: string;
  strokeWidth: number;
  canUndo: boolean;
  canRedo: boolean;
  onSelectTool: (tool: ToolType | null) => void;
  onColorChange: (color: string) => void;
  onStrokeWidthChange: (width: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onConfirm: () => void;
  onDownload: () => void;
  onCancel: () => void;
  style?: React.CSSProperties;
}

export function Toolbar({
  activeTool,
  strokeColor,
  strokeWidth,
  canUndo,
  canRedo,
  onSelectTool,
  onColorChange,
  onStrokeWidthChange,
  onUndo,
  onRedo,
  onConfirm,
  onDownload,
  onCancel,
  style,
}: ToolbarProps) {
  const { t } = useTranslation();

  const showColorSize = activeTool && activeTool !== 'blur' && activeTool !== 'mosaic';
  const showStrokeWidth = activeTool && activeTool !== 'text';

  const tools: { type: ToolType; icon: React.ReactNode; title: string }[] = [
    { type: 'rect', icon: <Square className="w-4 h-4" />, title: t('screenshot.toolRect') },
    { type: 'ellipse', icon: <Circle className="w-4 h-4" />, title: t('screenshot.toolEllipse') },
    { type: 'arrow', icon: <ArrowRight className="w-4 h-4" />, title: t('screenshot.toolArrow') },
    { type: 'pen', icon: <Pencil className="w-4 h-4" />, title: t('screenshot.toolPen') },
    { type: 'text', icon: <Type className="w-4 h-4" />, title: t('screenshot.toolText') },
    { type: 'blur', icon: <Droplets className="w-4 h-4" />, title: t('screenshot.toolBlur') },
    { type: 'mosaic', icon: <Grid3x3 className="w-4 h-4" />, title: t('screenshot.toolMosaic') },
  ];

  return (
    <div
      className="absolute z-50 pointer-events-auto select-none"
      style={style}
      data-no-interaction
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1 bg-[#2b2b2b] rounded-lg shadow-2xl px-1 py-1">
        {/* 工具按钮 */}
        <div className="flex items-center border-r border-gray-600 pr-1">
          {tools.map(({ type, icon, title }) => (
            <button
              key={type}
              className={`p-2 rounded transition-colors hover:bg-white/10 ${
                activeTool === type ? 'bg-white/20 text-white' : 'text-gray-300'
              }`}
              onClick={() => onSelectTool(activeTool === type ? null : type)}
              title={title}
            >
              {icon}
            </button>
          ))}
        </div>

        {/* 颜色和粗细（非 blur/mosaic 工具时显示） */}
        {showColorSize && (
          <div className="flex items-center gap-1 border-r border-gray-600 pr-1">
            {/* 颜色面板 */}
            <div className="flex items-center gap-1 px-1">
              {COLOR_PALETTE.map((color) => (
                <button
                  key={color}
                  className={`w-4 h-4 rounded-full transition-transform hover:scale-110 ${
                    strokeColor === color
                      ? 'ring-2 ring-white ring-offset-1 ring-offset-[#2b2b2b]'
                      : ''
                  }`}
                  style={{ backgroundColor: color }}
                  onClick={() => onColorChange(color)}
                />
              ))}
            </div>

            {/* 粗细选择（非 text） */}
            {showStrokeWidth && (
              <div className="flex items-center gap-1 px-1">
                {STROKE_WIDTHS.map((w) => (
                  <button
                    key={w}
                    className={`flex items-center justify-center w-6 h-6 rounded transition-colors hover:bg-white/10 ${
                      strokeWidth === w ? 'bg-white/20' : ''
                    }`}
                    onClick={() => onStrokeWidthChange(w)}
                    title={`${w}px`}
                  >
                    <div
                      className="rounded-full bg-white"
                      style={{ width: Math.min(w + 4, 14), height: Math.min(w + 4, 14) }}
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 撤销 / 重做 */}
        <div className="flex items-center border-r border-gray-600 pr-1">
          <button
            className={`p-2 rounded transition-colors ${
              canUndo ? 'hover:bg-white/10 text-gray-300' : 'text-gray-600 cursor-not-allowed'
            }`}
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo (Cmd+Z)"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            className={`p-2 rounded transition-colors ${
              canRedo ? 'hover:bg-white/10 text-gray-300' : 'text-gray-600 cursor-not-allowed'
            }`}
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo (Cmd+Shift+Z)"
          >
            <Redo2 className="w-4 h-4" />
          </button>
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center gap-1">
          <button
            className="p-2 rounded text-gray-300 hover:bg-white/10 transition-colors"
            onClick={onDownload}
            title="Download"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            className="p-2 rounded text-gray-300 hover:bg-white/10 transition-colors"
            onClick={onCancel}
            title={t('screenshot.cancel')}
          >
            <X className="w-4 h-4" />
          </button>
          <button
            className="p-2 rounded bg-blue-500 text-white hover:bg-blue-600 transition-colors"
            onClick={onConfirm}
            title={t('screenshot.confirm')}
          >
            <Check className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
