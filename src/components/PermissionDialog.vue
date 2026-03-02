<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const showPermissionDialog = ref(false);
const isMacOS = ref(false);

onMounted(async () => {
  // 检测平台
  const userAgent = navigator.userAgent.toLowerCase();
  isMacOS.value = userAgent.includes('mac');
  
  if (isMacOS.value) {
    checkPermission();
  }
});

const checkPermission = async () => {
  try {
    const hasPermission = await invoke<boolean>('check_screen_recording_permission');
    if (!hasPermission) {
      showPermissionDialog.value = true;
    }
  } catch (error) {
    console.error('Failed to check screen recording permission:', error);
  }
};

const openSystemSettings = () => {
  // 在 macOS 上，用户需要手动打开系统设置
  showPermissionDialog.value = false;
  alert('请按照以下步骤授予权限：\n\n1. 打开"系统设置"\n2. 进入"隐私与安全性"\n3. 选择"屏幕录制"\n4. 勾选 "Clipboard Manager"\n5. 重启应用程序');
};
</script>

<template>
  <AlertDialog v-model:open="showPermissionDialog">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>需要屏幕录制权限</AlertDialogTitle>
        <AlertDialogDescription>
          <div class="space-y-3">
            <p>
              此应用需要屏幕录制权限才能捕获截图。请按照以下步骤授予权限：
            </p>
            <ol class="list-decimal list-inside space-y-2 text-sm">
              <li>打开"系统设置" (System Settings)</li>
              <li>进入"隐私与安全性" (Privacy & Security)</li>
              <li>选择"屏幕录制" (Screen Recording)</li>
              <li>找到并勾选 "Clipboard Manager"</li>
              <li><strong>重启应用程序</strong>（重要！）</li>
            </ol>
            <p class="text-xs text-muted-foreground">
              注意：如果没有授予权限，截图功能将只能捕获桌面背景，无法捕获其他应用程序窗口。
            </p>
          </div>
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogAction @click="openSystemSettings">
          我知道了
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
