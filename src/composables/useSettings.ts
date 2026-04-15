import { ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { enable, disable, isEnabled } from '@tauri-apps/plugin-autostart';
import { useI18n } from 'vue-i18n';
import { useToast } from './useToast';
import type { AppConfig } from '../types';

export function useSettings() {
  const { t, locale } = useI18n();
  const { showToast } = useToast();

  const config = ref<AppConfig>({
    shortcut: 'CommandOrControl+Shift+V',
    max_history_size: 20,
    language: 'auto',
    theme: 'auto',
    sensitive_apps: [],
    compact_mode: false,
    clear_pinned_on_clear: false,
    clear_collected_on_clear: false,
    screenshot_shortcut: 'CommandOrControl+Shift+S',
  });

  const showSettings = ref(false);
  const tempShortcut = ref('');
  const tempScreenshotShortcut = ref('');
  const tempMaxSize = ref(20);
  const tempLanguage = ref('auto');
  const tempTheme = ref('auto');
  const tempSensitiveApps = ref<string[]>([]);
  const tempCompactMode = ref(false);
  const tempClearPinnedOnClear = ref(false);
  const tempClearCollectedOnClear = ref(false);
  const tempScreenshotFormat = ref<'png' | 'jpeg' | 'webp'>('png');
  const tempScreenshotQuality = ref(90);
  const tempScreenshotSaveAction = ref<'clipboard' | 'file' | 'both'>('clipboard');
  const isRecording = ref(false);
  const isRecordingScreenshotShortcut = ref(false);
  const isPaused = ref(false);
  const isAutoStart = ref(false);

  // Theme handling
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

  function applyTheme(theme: string) {
    const isDark = theme === 'dark' || (theme === 'auto' && mediaQuery.matches);

    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }

  // Listen for system theme changes
  mediaQuery.addEventListener('change', () => {
    if (config.value.theme === 'auto') {
      applyTheme('auto');
    }
  });

  async function loadConfig() {
    try {
      config.value = await invoke<AppConfig>('get_config');
      tempShortcut.value = config.value.shortcut;
      tempScreenshotShortcut.value = config.value.screenshot_shortcut || 'CommandOrControl+Shift+S';
      tempMaxSize.value = config.value.max_history_size;
      tempLanguage.value = config.value.language || 'auto';
      tempTheme.value = config.value.theme || 'auto';
      tempSensitiveApps.value = [...(config.value.sensitive_apps || [])];
      tempCompactMode.value = config.value.compact_mode || false;
      tempClearPinnedOnClear.value = config.value.clear_pinned_on_clear || false;
      tempClearCollectedOnClear.value = config.value.clear_collected_on_clear || false;
      tempScreenshotFormat.value =
        (config.value.screenshot_format as 'png' | 'jpeg' | 'webp') || 'png';
      tempScreenshotQuality.value = config.value.screenshot_quality ?? 90;
      tempScreenshotSaveAction.value =
        (config.value.screenshot_save_action as 'clipboard' | 'file' | 'both') || 'clipboard';

      // Apply language
      if (config.value.language === 'auto') {
        locale.value = navigator.language.startsWith('zh') ? 'zh' : 'en';
      } else {
        locale.value = config.value.language;
      }

      // Apply theme
      applyTheme(config.value.theme || 'auto');

      // Load paused state
      isPaused.value = await invoke<boolean>('get_paused');
    } catch (e) {
      console.error('Failed to load config:', e);
    }
  }

  async function saveConfig() {
    try {
      await invoke('save_config', {
        shortcut: tempShortcut.value,
        maxHistorySize: tempMaxSize.value,
        language: tempLanguage.value,
        theme: tempTheme.value,
        sensitiveApps: tempSensitiveApps.value,
        compactMode: tempCompactMode.value,
        clearPinnedOnClear: tempClearPinnedOnClear.value,
        clearCollectedOnClear: tempClearCollectedOnClear.value,
        screenshotShortcut: tempScreenshotShortcut.value,
        screenshotFormat: tempScreenshotFormat.value,
        screenshotQuality: tempScreenshotQuality.value,
        screenshotSaveAction: tempScreenshotSaveAction.value,
      });
      await loadConfig();
      showSettings.value = false;
      showToast(t('toast.settingsSaved'));
    } catch (e) {
      console.error('Failed to save config:', e);
      alert(t('toast.settingsSaveError') + e);
    }
  }

  function openSettings() {
    showSettings.value = true;
    tempShortcut.value = config.value.shortcut;
    tempScreenshotShortcut.value = config.value.screenshot_shortcut || 'CommandOrControl+Shift+S';
    tempMaxSize.value = config.value.max_history_size;
    tempLanguage.value = config.value.language || 'auto';
    tempTheme.value = config.value.theme || 'auto';
    tempSensitiveApps.value = [...(config.value.sensitive_apps || [])];
    tempCompactMode.value = config.value.compact_mode || false;
    tempClearPinnedOnClear.value = config.value.clear_pinned_on_clear || false;
    tempClearCollectedOnClear.value = config.value.clear_collected_on_clear || false;
    tempScreenshotFormat.value =
      (config.value.screenshot_format as 'png' | 'jpeg' | 'webp') || 'png';
    tempScreenshotQuality.value = config.value.screenshot_quality ?? 90;
    tempScreenshotSaveAction.value =
      (config.value.screenshot_save_action as 'clipboard' | 'file' | 'both') || 'clipboard';
    isEnabled().then((enabled) => {
      isAutoStart.value = enabled;
    });
  }

  async function toggleAutoStart() {
    try {
      if (isAutoStart.value) {
        await disable();
        isAutoStart.value = false;
        showToast(t('toast.autoStartDisabled'));
      } else {
        await enable();
        isAutoStart.value = true;
        showToast(t('toast.autoStartEnabled'));
      }
    } catch (e) {
      console.error('Failed to toggle autostart:', e);
    }
  }

  async function togglePause() {
    try {
      const newState = !isPaused.value;
      await invoke('set_paused', { paused: newState });
      isPaused.value = newState;
      showToast(newState ? t('toast.recordingPaused') : t('toast.recordingResumed'));
    } catch (e) {
      console.error('Failed to toggle pause:', e);
    }
  }

  function startRecording(e: MouseEvent) {
    isRecording.value = true;
    tempShortcut.value = t('settings.recordShortcut');
    (e.target as HTMLInputElement).focus();
  }

  function startRecordingScreenshotShortcut(e: MouseEvent) {
    isRecordingScreenshotShortcut.value = true;
    tempScreenshotShortcut.value = t('settings.recordShortcut');
    (e.target as HTMLInputElement).focus();
  }

  function handleShortcutKeydown(e: KeyboardEvent) {
    if (!isRecording.value && !isRecordingScreenshotShortcut.value) return;
    e.preventDefault();
    e.stopPropagation();

    const modifiers = [];
    if (e.metaKey) modifiers.push('CommandOrControl');
    if (e.ctrlKey) modifiers.push('Control');
    if (e.altKey) modifiers.push('Alt');
    if (e.shiftKey) modifiers.push('Shift');

    let key = e.key.toUpperCase();

    const keyMap: Record<string, string> = {
      ' ': 'Space',
      ARROWUP: 'Up',
      ARROWDOWN: 'Down',
      ARROWLEFT: 'Left',
      ARROWRIGHT: 'Right',
      ENTER: 'Return',
      ESCAPE: 'Escape',
      BACKSPACE: 'Backspace',
      TAB: 'Tab',
    };

    if (keyMap[key]) {
      key = keyMap[key];
    }

    if (['META', 'CONTROL', 'ALT', 'SHIFT'].includes(key)) {
      return;
    }

    const shortcut = [...modifiers, key].join('+');
    if (isRecording.value) {
      tempShortcut.value = shortcut;
      isRecording.value = false;
    } else if (isRecordingScreenshotShortcut.value) {
      tempScreenshotShortcut.value = shortcut;
      isRecordingScreenshotShortcut.value = false;
    }
  }

  async function setupConfigListeners() {
    await listen('config-updated', () => {
      loadConfig();
    });
    await listen('open-settings', () => {
      openSettings();
    });
    await listen('pause-state-changed', (event) => {
      isPaused.value = event.payload as boolean;
    });
  }

  return {
    config,
    showSettings,
    tempShortcut,
    tempScreenshotShortcut,
    tempMaxSize,
    tempLanguage,
    tempTheme,
    tempSensitiveApps,
    tempCompactMode,
    isRecording,
    isRecordingScreenshotShortcut,
    isPaused,
    isAutoStart,
    tempClearPinnedOnClear,
    tempClearCollectedOnClear,
    tempScreenshotFormat,
    tempScreenshotQuality,
    tempScreenshotSaveAction,
    loadConfig,
    saveConfig,
    openSettings,
    toggleAutoStart,
    togglePause,
    startRecording,
    startRecordingScreenshotShortcut,
    handleShortcutKeydown,
    setupConfigListeners,
  };
}
