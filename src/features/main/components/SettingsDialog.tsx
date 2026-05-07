/**
 * SettingsDialog - React Component
 *
 * Settings dialog with shortcut recording, screenshot preferences,
 * history settings, language, theme, compact mode, and automation rules.
 */
import { useEffect, useState, useCallback } from 'react';
import { enable, disable } from '@tauri-apps/plugin-autostart';
import {
  Settings,
  Keyboard,
  History,
  Palette,
  Zap,
  Plus,
  Edit2,
  Trash2,
  Power,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ShortcutRecorder } from '@/components/ShortcutRecorder';
import { RuleEditor } from '@/components/RuleEditor';
import { useRules } from '@/hooks/useRules';
import type { AppConfig, Rule } from '@/types';

// Language options
const LANGUAGES = [
  { value: 'auto', label: 'Auto' },
  { value: 'en', label: 'English' },
  { value: 'zh', label: '中文' },
];

// Theme options
const THEMES = [
  { value: 'auto', label: 'Auto' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export function SettingsDialog({
  open,
  onOpenChange,
  config: _config,
  tempShortcut,
  tempScreenshotShortcut: _tempScreenshotShortcut,
  tempMaxSize,
  tempLanguage,
  tempTheme,
  tempCompactMode,
  tempClearPinnedOnClear,
  tempClearCollectedOnClear,
  tempScreenshotFormat: _tempScreenshotFormat,
  tempScreenshotQuality: _tempScreenshotQuality,
  tempScreenshotSaveAction: _tempScreenshotSaveAction,
  isRecording: _isRecording,
  isRecordingScreenshotShortcut: _isRecordingScreenshotShortcut,
  isAutoStart,
  onSetTempShortcut,
  onSetTempScreenshotShortcut: _onSetTempScreenshotShortcut,
  onSetTempMaxSize,
  onSetTempLanguage,
  onSetTempTheme,
  onSetTempCompactMode,
  onSetTempClearPinnedOnClear,
  onSetTempClearCollectedOnClear,
  onSetTempScreenshotFormat: _onSetTempScreenshotFormat,
  onSetTempScreenshotQuality: _onSetTempScreenshotQuality,
  onSetTempScreenshotSaveAction: _onSetTempScreenshotSaveAction,
  onStartRecordingShortcut: _onStartRecordingShortcut,
  onStartRecordingScreenshotShortcut: _onStartRecordingScreenshotShortcut,
  onStopRecordingShortcut,
  onStopRecordingScreenshotShortcut: _onStopRecordingScreenshotShortcut,
  onToggleAutoStart,
  onSaveConfig,
  onLoadConfig,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: AppConfig;
  tempShortcut: string;
  tempScreenshotShortcut: string;
  tempMaxSize: number;
  tempLanguage: string;
  tempTheme: string;
  tempCompactMode: boolean;
  tempClearPinnedOnClear: boolean;
  tempClearCollectedOnClear: boolean;
  tempScreenshotFormat: 'png' | 'jpeg' | 'webp';
  tempScreenshotQuality: number;
  tempScreenshotSaveAction: 'clipboard' | 'file' | 'both';
  isRecording: boolean;
  isRecordingScreenshotShortcut: boolean;
  isAutoStart: boolean;
  onSetTempShortcut: (v: string) => void;
  onSetTempScreenshotShortcut: (v: string) => void;
  onSetTempMaxSize: (v: number) => void;
  onSetTempLanguage: (v: string) => void;
  onSetTempTheme: (v: string) => void;
  onSetTempCompactMode: (v: boolean) => void;
  onSetTempClearPinnedOnClear: (v: boolean) => void;
  onSetTempClearCollectedOnClear: (v: boolean) => void;
  onSetTempScreenshotFormat: (v: 'png' | 'jpeg' | 'webp') => void;
  onSetTempScreenshotQuality: (v: number) => void;
  onSetTempScreenshotSaveAction: (v: 'clipboard' | 'file' | 'both') => void;
  onStartRecordingShortcut: () => void;
  onStartRecordingScreenshotShortcut: () => void;
  onStopRecordingShortcut: () => void;
  onStopRecordingScreenshotShortcut: () => void;
  onToggleAutoStart: () => void;
  onSaveConfig: () => void;
  onLoadConfig: () => void;
}) {
  const { t } = useTranslation();
  const { rules, loadRules, addRule, updateRule, deleteRule, toggleRuleEnabled } = useRules();

  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [showRuleEditor, setShowRuleEditor] = useState(false);

  // Load rules and config on open
  useEffect(() => {
    if (open) {
      loadRules();
      onLoadConfig();
    }
  }, [open, loadRules, onLoadConfig]);

  // Handle autostart toggle
  const handleAutostartToggle = useCallback(
    async (enabled: boolean) => {
      try {
        if (enabled) {
          await enable();
        } else {
          await disable();
        }
        onToggleAutoStart();
      } catch (error) {
        console.error('Failed to toggle autostart:', error);
      }
    },
    [onToggleAutoStart]
  );

  // Handle save
  const handleSave = useCallback(() => {
    onSaveConfig();
    onOpenChange(false);
  }, [onSaveConfig, onOpenChange]);

  // Handle rule edit
  const handleEditRule = useCallback((rule: Rule) => {
    setEditingRule(rule);
    setShowRuleEditor(true);
  }, []);

  // Handle rule delete
  const handleDeleteRule = useCallback(
    async (rule: Rule) => {
      await deleteRule(rule.id);
      await loadRules();
    },
    [deleteRule, loadRules]
  );

  // Handle rule add
  const handleAddRule = useCallback(() => {
    setEditingRule(null);
    setShowRuleEditor(true);
  }, []);

  // Handle rule save
  const handleSaveRule = useCallback(
    async (rule: Rule) => {
      if (editingRule) {
        await updateRule(rule);
      } else {
        await addRule(rule);
      }
      setShowRuleEditor(false);
      setEditingRule(null);
      await loadRules();
    },
    [editingRule, updateRule, addRule, loadRules]
  );

  // Handle rule toggle
  const handleToggleRule = useCallback(
    async (rule: Rule) => {
      await toggleRuleEnabled(rule);
      await loadRules();
    },
    [toggleRuleEnabled, loadRules]
  );

  // Cancel recording on close
  useEffect(() => {
    if (!open) {
      onStopRecordingShortcut();
    }
  }, [open, onStopRecordingShortcut]);

  // Handle number input change
  const handleMaxSizeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = parseInt(e.target.value);
      if (!isNaN(value) && value >= 10 && value <= 500) {
        onSetTempMaxSize(value);
      }
    },
    [onSetTempMaxSize]
  );

  // Handle max size change

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="w-[80vw] max-w-[800px] h-[80vh] overflow-hidden"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="overflow-y-auto h-full pr-2">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5" />
                {t('settings.title')}
              </DialogTitle>
              <DialogDescription>{t('settings.description')}</DialogDescription>
            </DialogHeader>

            <div className="space-y-6 py-4">
              {/* Shortcuts */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Keyboard className="w-4 h-4 text-muted-foreground" />
                  {t('settings.shortcuts')}
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">{t('settings.globalShortcut')}</Label>
                  <ShortcutRecorder value={tempShortcut} onChange={onSetTempShortcut} />
                </div>

                {/* TODO: 截屏功能暂时隐藏 */}
                {/* <div className="space-y-2">
                  <Label className="text-xs">{t('settings.screenshotShortcut')}</Label>
                  <ShortcutRecorder
                    value={tempScreenshotShortcut}
                    onChange={onSetTempScreenshotShortcut}
                  />
                </div> */}
              </div>

              {/* TODO: 截屏功能暂时隐藏 */}
              {/* Screenshot Settings */}
              {/* <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <ImageIcon className="w-4 h-4 text-muted-foreground" />
                  {t('settings.screenshot')}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs">{t('settings.format')}</Label>
                    <Select
                      value={tempScreenshotFormat}
                      onValueChange={(v) => onSetTempScreenshotFormat(v as 'png' | 'jpeg' | 'webp')}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SCREENSHOT_FORMATS.map((format) => (
                          <SelectItem key={format.value} value={format.value}>
                            {format.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">{t('settings.saveAction')}</Label>
                    <Select
                      value={tempScreenshotSaveAction}
                      onValueChange={(v) =>
                        onSetTempScreenshotSaveAction(v as 'clipboard' | 'file' | 'both')
                      }
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SCREENSHOT_SAVE_ACTIONS.map((action) => (
                          <SelectItem key={action.value} value={action.value}>
                            {action.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {tempScreenshotFormat !== 'png' && (
                  <div className="space-y-2">
                    <Label className="text-xs">{t('settings.quality')}</Label>
                    <div className="flex items-center gap-4">
                      <Progress value={tempScreenshotQuality} className="flex-1 h-2" />
                      <span className="text-sm font-mono">{tempScreenshotQuality}%</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="100"
                      value={tempScreenshotQuality}
                      onChange={handleQualityChange}
                      className="w-full"
                    />
                  </div>
                )}
              </div> */}

              {/* History Settings */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <History className="w-4 h-4 text-muted-foreground" />
                  {t('settings.history')}
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">{t('settings.historySize')}</Label>
                  <Input
                    type="number"
                    value={tempMaxSize}
                    onChange={handleMaxSizeChange}
                    className="h-9"
                    min={10}
                    max={500}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label className="text-xs">{t('settings.clearPinned')}</Label>
                  <Switch
                    checked={tempClearPinnedOnClear}
                    onCheckedChange={onSetTempClearPinnedOnClear}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label className="text-xs">{t('settings.clearCollected')}</Label>
                  <Switch
                    checked={tempClearCollectedOnClear}
                    onCheckedChange={onSetTempClearCollectedOnClear}
                  />
                </div>
              </div>

              {/* Appearance */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Palette className="w-4 h-4 text-muted-foreground" />
                  {t('settings.appearance')}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs">{t('settings.language')}</Label>
                    <Select value={tempLanguage} onValueChange={onSetTempLanguage}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LANGUAGES.map((lang) => (
                          <SelectItem key={lang.value} value={lang.value}>
                            {lang.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">{t('settings.theme')}</Label>
                    <Select value={tempTheme} onValueChange={onSetTempTheme}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {THEMES.map((theme) => (
                          <SelectItem key={theme.value} value={theme.value}>
                            {theme.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <Label className="text-xs">{t('settings.compactMode')}</Label>
                  <Switch checked={tempCompactMode} onCheckedChange={onSetTempCompactMode} />
                </div>
              </div>

              {/* Autostart */}
              <div className="flex items-center justify-between">
                <Label className="text-xs">{t('settings.startAtLogin')}</Label>
                <Switch checked={isAutoStart} onCheckedChange={handleAutostartToggle} />
              </div>

              {/* Automation Rules */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Zap className="w-4 h-4 text-muted-foreground" />
                    {t('settings.automationRules')}
                  </div>
                  <Button type="button" size="sm" variant="outline" onClick={handleAddRule}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>

                <div className="space-y-2">
                  {rules.map((rule) => (
                    <div
                      key={rule.id}
                      className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2"
                    >
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className={`h-6 w-6 ${rule.enabled ? 'text-green-500' : 'text-muted-foreground'}`}
                            onClick={() => handleToggleRule(rule)}
                          >
                            <Power className="w-3 h-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {rule.enabled ? t('settings.ruleEnabled') : t('settings.ruleDisabled')}
                        </TooltipContent>
                      </Tooltip>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">
                          {rule.name || 'Unnamed Rule'}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {rule.conditions[0]?.field}: {rule.conditions[0]?.value}
                        </div>
                      </div>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => handleEditRule(rule)}
                          >
                            <Edit2 className="w-3 h-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t('settings.editRule')}</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 hover:text-destructive"
                            onClick={() => handleDeleteRule(rule)}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t('settings.deleteRule')}</TooltipContent>
                      </Tooltip>
                    </div>
                  ))}
                  {rules.length === 0 && (
                    <div className="text-sm text-muted-foreground text-center py-4">
                      {t('settings.noRules')}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t('settings.cancel')}
              </Button>
              <Button type="button" onClick={handleSave}>
                {t('settings.save')}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Rule Editor Dialog - rendered outside main dialog */}
      <Dialog open={showRuleEditor} onOpenChange={setShowRuleEditor}>
        <DialogContent className="w-[480px]">
          <RuleEditor
            rule={editingRule}
            collections={[]}
            onSave={handleSaveRule}
            onCancel={() => setShowRuleEditor(false)}
            onDelete={() => setShowRuleEditor(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

export default SettingsDialog;
