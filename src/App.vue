<script setup lang="ts">
import { ref, onMounted } from "vue";
import { getCurrentWindow } from "@tauri-apps/api/window";
import MainWindow from "@/views/MainWindow.vue";
import PopupWindow from "@/views/PopupWindow.vue";
import ScreenshotWindow from "@/views/ScreenshotWindow.vue";
import ConfirmProvider from "./components/ui/alert-dialog/ConfirmProvider.vue";

const currentWindowLabel = ref("main");

onMounted(() => {
  const appWindow = getCurrentWindow();
  currentWindowLabel.value = appWindow.label;
});
</script>

<template>
  <PopupWindow v-if="currentWindowLabel === 'popup'" />
  <ScreenshotWindow v-else-if="currentWindowLabel.startsWith('screenshot')" />
  <MainWindow v-else />
  <ConfirmProvider />
</template>
