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
}

export function useUpdater() {
  const { t } = useI18n();
  const { showToast } = useToast();

  // State
  const showUpdateDialog = ref(false);
  const updateInfo = ref<UpdateAvailablePayload | null>(null);
  const downloadProgress = ref(0);
  const isDownloading = ref(false);
  const isInstalling = ref(false);
  const updateError = ref<string | null>(null);

  // Unlisteners
  let unlisteners: UnlistenFn[] = [];

  onMounted(async () => {
    // Listen for update available (user clicked check update)
    const unlistenAvailable = await listen<UpdateAvailablePayload>(
      'update-available',
      (event) => {
        updateInfo.value = event.payload;
        showUpdateDialog.value = true;
        isDownloading.value = false;
        isInstalling.value = false;
        downloadProgress.value = 0;
        updateError.value = null;
      }
    );

    // Listen for update detected (startup/scheduled check)
    const unlistenDetected = await listen<UpdateAvailablePayload>(
      'update-detected',
      (event) => {
        updateInfo.value = event.payload;
        // 显示 toast 通知用户有更新可用
        showToast(
          t('updater.newVersionDetected', {
            version: event.payload.version,
          })
        );
      }
    );

    // Listen for download progress
    const unlistenProgress = await listen<UpdateProgressPayload>(
      'update-progress',
      (event) => {
        downloadProgress.value = event.payload.percent;
        isDownloading.value = true;
      }
    );

    // Listen for installing
    const unlistenInstalling = await listen('update-installing', () => {
      isInstalling.value = true;
      downloadProgress.value = 100;
    });

    // Listen for no update available
    const unlistenNotAvailable = await listen<string>(
      'update-not-available',
      (event) => {
        showToast(t('updater.noUpdateAvailable', { version: event.payload }));
      }
    );

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
      unlistenNotAvailable,
      unlistenError,
    ];
  });

  onUnmounted(() => {
    unlisteners.forEach((unlisten) => unlisten());
  });

  const closeDialog = () => {
    showUpdateDialog.value = false;
    updateInfo.value = null;
    downloadProgress.value = 0;
    isDownloading.value = false;
    isInstalling.value = false;
    updateError.value = null;
  };

  // 用户确认下载更新
  const downloadAndInstall = async () => {
    isDownloading.value = true;
    downloadProgress.value = 0;
    updateError.value = null;

    try {
      await invoke('download_and_install_update');
    } catch (e) {
      updateError.value = String(e);
      isDownloading.value = false;
    }
  };

  return {
    showUpdateDialog,
    updateInfo,
    downloadProgress,
    isDownloading,
    isInstalling,
    updateError,
    closeDialog,
    downloadAndInstall,
  };
}