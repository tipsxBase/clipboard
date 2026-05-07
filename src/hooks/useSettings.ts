import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart';
import { useTranslation } from 'react-i18next';
import i18next from '@/i18n/react';
import { useToast } from '@/hooks/useToast';
import type { AppConfig } from '@/types';

const defaultConfig: AppConfig = {
  shortcut: 'CommandOrControl+Shift+V',
  max_history_size: 20,
  language: 'auto',
  theme: 'auto',
  compact_mode: false,
  clear_pinned_on_clear: false,
  clear_collected_on_clear: false,
  screenshot_shortcut: 'CommandOrControl+Shift+S',
};

const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

function applyTheme(theme: string) {
  const isDark = theme === 'dark' || (theme === 'auto' && mediaQuery.matches);
  document.documentElement.classList.toggle('dark', isDark);
}

function getEffectiveLanguage(language: string) {
  return language === 'auto' ? (navigator.language.startsWith('zh') ? 'zh' : 'en') : language;
}

export function useSettings() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [config, setConfig] = useState<AppConfig>(defaultConfig);
  const [showSettings, setShowSettings] = useState(false);
  const [tempShortcut, setTempShortcut] = useState('');
  const [tempScreenshotShortcut, setTempScreenshotShortcut] = useState('');
  const [tempMaxSize, setTempMaxSize] = useState(20);
  const [tempLanguage, setTempLanguage] = useState('auto');
  const [tempTheme, setTempTheme] = useState('auto');
  const [tempCompactMode, setTempCompactMode] = useState(false);
  const [tempClearPinnedOnClear, setTempClearPinnedOnClear] = useState(false);
  const [tempClearCollectedOnClear, setTempClearCollectedOnClear] = useState(false);
  const [tempScreenshotFormat, setTempScreenshotFormat] = useState<'png' | 'jpeg' | 'webp'>('png');
  const [tempScreenshotQuality, setTempScreenshotQuality] = useState(90);
  const [tempScreenshotSaveAction, setTempScreenshotSaveAction] = useState<
    'clipboard' | 'file' | 'both'
  >('clipboard');
  const [isRecording, setIsRecording] = useState(false);
  const [isRecordingScreenshotShortcut, setIsRecordingScreenshotShortcut] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isAutoStart, setIsAutoStart] = useState(false);
  const configRef = useRef(config);
  const isRecordingRef = useRef(isRecording);
  const isRecordingScreenshotShortcutRef = useRef(isRecordingScreenshotShortcut);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  useEffect(() => {
    isRecordingScreenshotShortcutRef.current = isRecordingScreenshotShortcut;
  }, [isRecordingScreenshotShortcut]);

  useEffect(() => {
    const handleSystemThemeChange = () => {
      if (configRef.current.theme === 'auto') {
        applyTheme('auto');
      }
    };

    mediaQuery.addEventListener('change', handleSystemThemeChange);
    return () => mediaQuery.removeEventListener('change', handleSystemThemeChange);
  }, []);

  useEffect(() => {
    return () => {
      if (isRecordingRef.current) {
        invoke('set_recording_shortcut', { isRecording: false }).catch(console.error);
      }
      if (isRecordingScreenshotShortcutRef.current) {
        invoke('set_recording_screenshot_shortcut', { isRecording: false }).catch(console.error);
      }
    };
  }, []);

  const syncTempConfig = useCallback((nextConfig: AppConfig) => {
    setTempShortcut(nextConfig.shortcut);
    setTempScreenshotShortcut(nextConfig.screenshot_shortcut || 'CommandOrControl+Shift+S');
    setTempMaxSize(nextConfig.max_history_size);
    setTempLanguage(nextConfig.language || 'auto');
    setTempTheme(nextConfig.theme || 'auto');
    setTempCompactMode(nextConfig.compact_mode || false);
    setTempClearPinnedOnClear(nextConfig.clear_pinned_on_clear || false);
    setTempClearCollectedOnClear(nextConfig.clear_collected_on_clear || false);
    setTempScreenshotFormat((nextConfig.screenshot_format as 'png' | 'jpeg' | 'webp') || 'png');
    setTempScreenshotQuality(nextConfig.screenshot_quality ?? 90);
    setTempScreenshotSaveAction(
      (nextConfig.screenshot_save_action as 'clipboard' | 'file' | 'both') || 'clipboard'
    );
  }, []);

  const loadConfig = useCallback(async () => {
    try {
      const nextConfig = await invoke<AppConfig>('get_config');
      setConfig(nextConfig);
      syncTempConfig(nextConfig);
      await i18next.changeLanguage(getEffectiveLanguage(nextConfig.language || 'auto'));
      applyTheme(nextConfig.theme || 'auto');
      setIsPaused(await invoke<boolean>('get_paused'));
    } catch (error) {
      console.error('Failed to load config:', error);
    }
  }, [syncTempConfig]);

  const saveConfig = useCallback(async () => {
    try {
      await invoke('save_config', {
        shortcut: tempShortcut,
        max_history_size: tempMaxSize,
        language: tempLanguage,
        theme: tempTheme,
        compact_mode: tempCompactMode,
        clear_pinned_on_clear: tempClearPinnedOnClear,
        clear_collected_on_clear: tempClearCollectedOnClear,
        screenshot_shortcut: tempScreenshotShortcut,
        screenshot_format: tempScreenshotFormat,
        screenshot_quality: tempScreenshotQuality,
        screenshot_save_action: tempScreenshotSaveAction,
      });
      await loadConfig();
      setShowSettings(false);
      showToast(t('toast.settingsSaved'));
    } catch (error) {
      console.error('Failed to save config:', error);
      alert(t('toast.settingsSaveError') + error);
    }
  }, [
    loadConfig,
    showToast,
    t,
    tempClearCollectedOnClear,
    tempClearPinnedOnClear,
    tempCompactMode,
    tempLanguage,
    tempMaxSize,
    tempScreenshotFormat,
    tempScreenshotQuality,
    tempScreenshotSaveAction,
    tempScreenshotShortcut,
    tempShortcut,
    tempTheme,
  ]);

  const openSettings = useCallback(() => {
    setShowSettings(true);
    syncTempConfig(configRef.current);
    isEnabled().then(setIsAutoStart).catch(console.error);
  }, [syncTempConfig]);

  const toggleAutoStart = useCallback(async () => {
    try {
      if (isAutoStart) {
        await disable();
        setIsAutoStart(false);
        showToast(t('toast.autoStartDisabled'));
      } else {
        await enable();
        setIsAutoStart(true);
        showToast(t('toast.autoStartEnabled'));
      }
    } catch (error) {
      console.error('Failed to toggle autostart:', error);
    }
  }, [isAutoStart, showToast, t]);

  const togglePause = useCallback(async () => {
    try {
      const newState = !isPaused;
      await invoke('set_paused', { paused: newState });
      setIsPaused(newState);
      showToast(newState ? t('toast.recordingPaused') : t('toast.recordingResumed'));
    } catch (error) {
      console.error('Failed to toggle pause:', error);
    }
  }, [isPaused, showToast, t]);

  const startRecordingShortcut = useCallback(async () => {
    setIsRecording(true);
    setTempShortcut(t('settings.recording'));
    await invoke('set_recording_shortcut', { isRecording: true });
  }, [t]);

  const startRecordingScreenshotShortcut = useCallback(async () => {
    setIsRecordingScreenshotShortcut(true);
    setTempScreenshotShortcut(t('settings.recording'));
    await invoke('set_recording_screenshot_shortcut', { isRecording: true });
  }, [t]);

  const stopRecordingShortcut = useCallback(() => {
    setIsRecording(false);
    invoke('set_recording_shortcut', { isRecording: false }).catch(console.error);
  }, []);

  const stopRecordingScreenshotShortcut = useCallback(() => {
    setIsRecordingScreenshotShortcut(false);
    invoke('set_recording_screenshot_shortcut', { isRecording: false }).catch(console.error);
  }, []);

  const setupConfigListeners = useCallback(async () => {
    const unlisteners: UnlistenFn[] = await Promise.all([
      listen('config-updated', () => {
        void loadConfig();
      }),
      listen('open-settings', () => {
        openSettings();
      }),
      listen('pause-state-changed', (event) => {
        setIsPaused(event.payload as boolean);
      }),
    ]);

    return () => {
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [loadConfig, openSettings]);

  return {
    config,
    showSettings,
    setShowSettings,
    tempShortcut,
    setTempShortcut,
    tempScreenshotShortcut,
    setTempScreenshotShortcut,
    tempMaxSize,
    setTempMaxSize,
    tempLanguage,
    setTempLanguage,
    tempTheme,
    setTempTheme,
    tempCompactMode,
    setTempCompactMode,
    isRecording,
    isRecordingScreenshotShortcut,
    isPaused,
    isAutoStart,
    tempClearPinnedOnClear,
    setTempClearPinnedOnClear,
    tempClearCollectedOnClear,
    setTempClearCollectedOnClear,
    tempScreenshotFormat,
    setTempScreenshotFormat,
    tempScreenshotQuality,
    setTempScreenshotQuality,
    tempScreenshotSaveAction,
    setTempScreenshotSaveAction,
    loadConfig,
    saveConfig,
    openSettings,
    toggleAutoStart,
    togglePause,
    startRecordingShortcut,
    startRecordingScreenshotShortcut,
    stopRecordingShortcut,
    stopRecordingScreenshotShortcut,
    setupConfigListeners,
  };
}
