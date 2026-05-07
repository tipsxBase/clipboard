/**
 * Titlebar - React Component
 *
 * Window titlebar with macOS traffic lights or non-macOS controls,
 * brand label, and action buttons.
 */
import { useEffect, useState, useCallback } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  Folder,
  Plus,
  Camera,
  Pause,
  Play,
  Settings,
  Trash2,
  Minus,
  Square,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

export function Titlebar({
  onOpenCollections,
  onOpenEditor,
  onScreenshot,
  onOpenSettings,
  onClearHistory,
  isPaused,
  onTogglePause,
}: {
  onOpenCollections: () => void;
  onOpenEditor: () => void;
  onScreenshot: () => void;
  onOpenSettings: () => void;
  onClearHistory: () => void;
  isPaused: boolean;
  onTogglePause: () => void;
}) {
  const { t } = useTranslation();
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    const platform = navigator.platform.toLowerCase();
    setIsMac(platform.includes('mac'));
  }, []);

  // Window actions
  const closeWindow = useCallback(async () => {
    await getCurrentWindow().close();
  }, []);

  const minimizeWindow = useCallback(async () => {
    await getCurrentWindow().minimize();
  }, []);

  const toggleMaximize = useCallback(async () => {
    await getCurrentWindow().toggleMaximize();
  }, []);

  const startWindowDrag = useCallback(async (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    await getCurrentWindow().startDragging();
  }, []);

  const handleTitlebarDoubleClick = useCallback(async () => {
    if (!isMac) {
      await toggleMaximize();
    }
  }, [isMac, toggleMaximize]);

  return (
    <div
      className="app-titlebar"
      onMouseDown={startWindowDrag}
      onDoubleClick={handleTitlebarDoubleClick}
    >
      {/* macOS traffic lights */}
      {isMac && (
        <div className="app-titlebar-mac-controls">
          <button
            type="button"
            className="app-titlebar-dot app-titlebar-dot-close"
            title={t('actions.close')}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={closeWindow}
          />
          <button
            type="button"
            className="app-titlebar-dot app-titlebar-dot-minimize"
            title={t('actions.minimize')}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={minimizeWindow}
          />
          <button
            type="button"
            className="app-titlebar-dot app-titlebar-dot-maximize"
            title={t('actions.maximize')}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={toggleMaximize}
          />
        </div>
      )}

      <div className="app-titlebar-brand">Clipboard</div>
      <div className="app-titlebar-drag" />

      {/* Action buttons */}
      <div className="flex items-center gap-1 shrink-0">
        <Button
          onClick={onOpenCollections}
          size="icon"
          variant="ghost"
          className="app-titlebar-action"
          title={t('actions.collections')}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <Folder className="w-3.5 h-3.5" />
        </Button>
        <Button
          onClick={onOpenEditor}
          size="icon"
          variant="ghost"
          className="app-titlebar-action"
          title={t('actions.addItem')}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <Plus className="w-3.5 h-3.5" />
        </Button>
        {/* TODO: 截屏功能暂时隐藏 */}
        {/* <Button
          onClick={onScreenshot}
          size="icon"
          variant="ghost"
          className="app-titlebar-action"
          title="Screenshot"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <Camera className="w-3.5 h-3.5" />
        </Button> */}
        <Button
          onClick={onTogglePause}
          size="icon"
          variant="ghost"
          className="app-titlebar-action"
          title={isPaused ? t('actions.resumeRecording') : t('actions.pauseRecording')}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {isPaused ? (
            <Play className="w-3.5 h-3.5 text-yellow-600" />
          ) : (
            <Pause className="w-3.5 h-3.5" />
          )}
        </Button>
        <Button
          onClick={onOpenSettings}
          size="icon"
          variant="ghost"
          className="app-titlebar-action"
          title={t('actions.settings')}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <Settings className="w-3.5 h-3.5" />
        </Button>
        <Button
          onClick={onClearHistory}
          size="icon"
          variant="ghost"
          className="app-titlebar-action hover:text-destructive"
          title={t('actions.clearHistory')}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Non-macOS window controls */}
      {!isMac && (
        <div className="app-titlebar-window-controls">
          <button
            type="button"
            className="app-window-control"
            title={t('actions.minimize')}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={minimizeWindow}
          >
            <Minus className="h-3 w-3" />
          </button>
          <button
            type="button"
            className="app-window-control"
            title={t('actions.maximize')}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={toggleMaximize}
          >
            <Square className="h-3 w-3" />
          </button>
          <button
            type="button"
            className="app-window-control app-window-control-close"
            title={t('actions.close')}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={closeWindow}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}

export default Titlebar;
