/**
 * Titlebar - React Component
 *
 * Window titlebar with macOS traffic lights or non-macOS controls,
 * Segment Control tab switcher, context-aware actions, and Settings.
 */
import { useEffect, useState, useCallback, type ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { LogicalSize } from '@tauri-apps/api/dpi';
import { Settings, Minus, Square, X, Clipboard, BookOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function Titlebar({
  actions,
  onOpenSettings,
}: {
  actions?: ReactNode;
  onOpenSettings: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const activeTab = location.pathname === '/knowledge' ? 'knowledge' : 'clipboard';
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
    if (isMac) {
      // macOS Zoom semantics: toggle between comfortable size and restored
      const maximized = await getCurrentWindow().isMaximized();
      if (maximized) {
        await getCurrentWindow().unmaximize();
      } else {
        await getCurrentWindow().setSize(new LogicalSize(1000, 720));
      }
    } else {
      await getCurrentWindow().toggleMaximize();
    }
  }, [isMac]);

  const startWindowDrag = useCallback(async (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    await getCurrentWindow().startDragging();
  }, []);

  const handleTitlebarDoubleClick = useCallback(async () => {
    // macOS HIG: double-click on titlebar does nothing (Zoom is via green dot)
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

      {/* Segment Control: Tab switcher */}
      <div
        className="flex items-center bg-muted/60 rounded-md p-0.5 gap-0.5 shrink-0"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className={cn(
            'flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors',
            activeTab === 'clipboard'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
          onClick={() => navigate('/clipboard')}
        >
          <Clipboard className="w-3 h-3" />
          {t('knowledge.tabClipboard')}
        </button>
        <button
          type="button"
          className={cn(
            'flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors',
            activeTab === 'knowledge'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
          onClick={() => navigate('/knowledge')}
        >
          <BookOpen className="w-3 h-3" />
          {t('knowledge.tabKnowledge')}
        </button>
      </div>

      <div className="app-titlebar-drag" />

      {/* Context-aware actions (injected by MainWindow) */}
      {actions && (
        <div className="flex items-center gap-1 shrink-0" onMouseDown={(e) => e.stopPropagation()}>
          {actions}
        </div>
      )}

      {/* Settings button (always visible) */}
      <Button
        onClick={onOpenSettings}
        size="icon"
        variant="ghost"
        className="app-titlebar-action shrink-0"
        title={t('actions.settings')}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <Settings className="w-3.5 h-3.5" />
      </Button>

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
