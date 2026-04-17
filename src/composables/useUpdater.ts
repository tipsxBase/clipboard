import { ref, onMounted, onUnmounted } from 'vue';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { useI18n } from 'vue-i18n';
import { useToast } from './useToast';

export interface UpdateAvailablePayload {
  version: string;
  current_version: string;
}

export interface UpdateProgressPayload {
  percent: number;
  downloaded?: number;
  total?: number;
}

export function useUpdater() {
  const { t } = useI18n();
  const { showToast } = useToast();

  // State
  const showUpdateDialog = ref(false);
  const updateInfo = ref<UpdateAvailablePayload | null>(null);
  const currentVersion = ref<string>('');
  const downloadProgress = ref(0);
  const downloadedBytes = ref(0);
  const totalBytes = ref(0);
  const isDownloading = ref(false);
  const isInstalling = ref(false);
  const updateError = ref<string | null>(null);
  const isReadyToRestart = ref(false);

  // Unlisteners
  let unlisteners: UnlistenFn[] = [];

  onMounted(async () => {
    // Get current app version
    try {
      currentVersion.value = await invoke<string>('get_app_version');
    } catch (e) {
      console.error('Failed to get app version:', e);
    }

    // Listen for update available (user clicked check update)
    const unlistenAvailable = await listen<UpdateAvailablePayload>('update-available', (event) => {
      updateInfo.value = event.payload;
      showUpdateDialog.value = true;
      isDownloading.value = false;
      isInstalling.value = false;
      downloadProgress.value = 0;
      updateError.value = null;
      isReadyToRestart.value = false;
    });

    // Listen for update detected (startup/scheduled check)
    const unlistenDetected = await listen<UpdateAvailablePayload>('update-detected', (event) => {
      updateInfo.value = event.payload;
      // 显示 toast 通知用户有更新可用
      showToast(
        t('updater.newVersionDetected', {
          version: event.payload.version,
        })
      );
    });

    // Listen for download progress
    const unlistenProgress = await listen<UpdateProgressPayload>('update-progress', (event) => {
      downloadProgress.value = event.payload.percent;
      downloadedBytes.value = event.payload.downloaded || 0;
      totalBytes.value = event.payload.total || 0;
      isDownloading.value = true;
    });

    // Listen for installing
    const unlistenInstalling = await listen('update-installing', () => {
      isInstalling.value = true;
      downloadProgress.value = 100;
      isDownloading.value = false;
    });

    // Listen for update installed (ready to restart)
    const unlistenInstalled = await listen('update-installed', () => {
      isReadyToRestart.value = true;
      isInstalling.value = false;
      showUpdateDialog.value = true;
    });

    // Listen for no update available
    const unlistenNotAvailable = await listen<string>('update-not-available', (event) => {
      showToast(t('updater.noUpdateAvailable', { version: event.payload }));
    });

    // Listen for update error
    const unlistenError = await listen<string>('update-error', (event) => {
      updateError.value = event.payload;
      isDownloading.value = false;
      isInstalling.value = false;
      if (!showUpdateDialog.value) {
        showToast(t('updater.checkFailed'));
      }
    });

    unlisteners = [
      unlistenAvailable,
      unlistenDetected,
      unlistenProgress,
      unlistenInstalling,
      unlistenInstalled,
      unlistenNotAvailable,
      unlistenError,
    ];
  });

  onUnmounted(() => {
    unlisteners.forEach((unlisten) => unlisten());
  });

  const closeDialog = () => {
    showUpdateDialog.value = false;
    // 不清除 updateInfo，保持状态提示用户有更新可用
    downloadProgress.value = 0;
    downloadedBytes.value = 0;
    totalBytes.value = 0;
    isDownloading.value = false;
    isInstalling.value = false;
    updateError.value = null;
    // 如果已准备好重启，不清除 isReadyToRestart
  };

  // 用户点击更新指示器打开对话框
  const openUpdateDialog = () => {
    if (updateInfo.value || isReadyToRestart.value) {
      showUpdateDialog.value = true;
      isDownloading.value = false;
      isInstalling.value = false;
      updateError.value = null;
    }
  };

  // 用户确认下载更新
  const downloadAndInstall = async () => {
    // 确保对话框显示下载状态
    showUpdateDialog.value = true;
    isDownloading.value = true;
    downloadProgress.value = 0;
    downloadedBytes.value = 0;
    totalBytes.value = 0;
    updateError.value = null;

    try {
      await invoke('download_and_install_update');
    } catch (e) {
      updateError.value = String(e);
      isDownloading.value = false;
    }
  };

  // 用户确认重启应用
  const restartApp = async () => {
    try {
      await invoke('restart_app');
    } catch (e) {
      updateError.value = String(e);
    }
  };

  return {
    showUpdateDialog,
    updateInfo,
    currentVersion,
    downloadProgress,
    downloadedBytes,
    totalBytes,
    isDownloading,
    isInstalling,
    updateError,
    isReadyToRestart,
    closeDialog,
    downloadAndInstall,
    openUpdateDialog,
    restartApp,
  };
}
