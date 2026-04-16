<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { getCurrentWindow } from '@tauri-apps/api/window';
import MainWindow from '@/views/MainWindow.vue';
import PopupWindow from '@/views/PopupWindow.vue';
import ScreenshotWindow from '@/views/ScreenshotWindow.vue';
import ConfirmProvider from './components/ui/alert-dialog/ConfirmProvider.vue';
import PermissionDialog from './components/PermissionDialog.vue';
import UpdateDialog from './components/UpdateDialog.vue';
import { useUpdater } from './composables/useUpdater';

const currentWindowLabel = ref('main');

const {
  showUpdateDialog,
  updateInfo,
  downloadProgress,
  downloadedBytes,
  totalBytes,
  isDownloading,
  isInstalling,
  updateError,
  closeDialog,
  downloadAndInstall,
  openUpdateDialog,
} = useUpdater();

onMounted(() => {
  const appWindow = getCurrentWindow();
  currentWindowLabel.value = appWindow.label;
});
</script>

<template>
  <PopupWindow v-if="currentWindowLabel === 'popup'" />
  <ScreenshotWindow v-else-if="currentWindowLabel.startsWith('screenshot')" />
  <MainWindow
    v-else
    :update-info="updateInfo"
    @open-update-dialog="openUpdateDialog"
  />
  <ConfirmProvider />
  <PermissionDialog v-if="currentWindowLabel === 'main'" />
  <UpdateDialog
    v-if="currentWindowLabel === 'main'"
    :open="showUpdateDialog"
    :update-info="updateInfo"
    :download-progress="downloadProgress"
    :downloaded-bytes="downloadedBytes"
    :total-bytes="totalBytes"
    :is-downloading="isDownloading"
    :is-installing="isInstalling"
    :update-error="updateError"
    @close="closeDialog"
    @download="downloadAndInstall"
  />
</template>
