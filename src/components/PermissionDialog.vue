<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { useI18n } from 'vue-i18n';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const { t } = useI18n();
const showPermissionDialog = ref(false);
const isMacOS = ref(false);

const PERMISSION_ACKNOWLEDGED_KEY = 'screen_recording_permission_acknowledged';

onMounted(async () => {
  const userAgent = navigator.userAgent.toLowerCase();
  isMacOS.value = userAgent.includes('mac');

  if (isMacOS.value) {
    checkPermission();
  }
});

const checkPermission = async () => {
  // Check if user has already acknowledged the permission dialog
  const acknowledged = localStorage.getItem(PERMISSION_ACKNOWLEDGED_KEY);
  if (acknowledged === 'true') {
    return; // User already acknowledged, don't show again
  }

  try {
    const hasPermission = await invoke<boolean>('check_screen_recording_permission');
    if (!hasPermission) {
      showPermissionDialog.value = true;
    }
  } catch (error) {
    console.error('Failed to check screen recording permission:', error);
  }
};

const dismiss = () => {
  showPermissionDialog.value = false;
  // Remember that user has acknowledged the dialog
  localStorage.setItem(PERMISSION_ACKNOWLEDGED_KEY, 'true');
};
</script>

<template>
  <AlertDialog v-model:open="showPermissionDialog">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ t('permission.screenRecordingTitle') }}</AlertDialogTitle>
        <AlertDialogDescription>
          <div class="space-y-3">
            <p>{{ t('permission.screenRecordingDescription') }}</p>
            <ol class="list-decimal list-inside space-y-2 text-sm">
              <li>{{ t('permission.step1') }}</li>
              <li>{{ t('permission.step2') }}</li>
              <li>{{ t('permission.step3') }}</li>
              <li>{{ t('permission.step4') }}</li>
              <li>
                <strong>{{ t('permission.step5') }}</strong>
              </li>
            </ol>
            <p class="text-xs text-muted-foreground">{{ t('permission.note') }}</p>
          </div>
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogAction @click="dismiss">{{ t('permission.acknowledge') }}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
