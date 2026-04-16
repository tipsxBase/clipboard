<script setup lang="ts">
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
import { Progress } from '@/components/ui/progress';
import Button from '@/components/ui/button/Button.vue';
import {
  Download,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from 'lucide-vue-next';
import type { UpdateAvailablePayload } from '@/composables/useUpdater';

defineProps<{
  open: boolean;
  updateInfo: UpdateAvailablePayload | null;
  downloadProgress: number;
  isDownloading: boolean;
  isInstalling: boolean;
  updateError: string | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'download'): void;
}>();

const { t } = useI18n();

const handleClose = () => {
  emit('close');
};

const handleDownload = () => {
  emit('download');
};
</script>

<template>
  <AlertDialog :open="open" @update:open="handleClose">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle class="flex items-center gap-2">
          <RefreshCw class="w-5 h-5" />
          {{ t('updater.title') }}
        </AlertDialogTitle>
        <AlertDialogDescription>
          <!-- Update Available (waiting for user action) -->
          <div
            v-if="updateInfo && !isDownloading && !isInstalling && !updateError"
            class="space-y-3"
          >
            <p>
              {{ t('updater.newVersionAvailable') }}
            </p>
            <div class="flex items-center justify-center gap-4 py-2">
              <span class="text-muted-foreground">
                {{ t('updater.currentVersion') }}:
              </span>
              <span class="font-medium">v{{ updateInfo.current_version }}</span>
              <span class="text-muted-foreground">→</span>
              <span class="font-medium text-green-600">
                v{{ updateInfo.version }}
              </span>
            </div>
          </div>

          <!-- Downloading -->
          <div v-if="isDownloading && !isInstalling" class="space-y-3">
            <p class="flex items-center gap-2">
              <Loader2 class="w-4 h-4 animate-spin" />
              {{ t('updater.downloading') }}
            </p>
            <Progress :value="downloadProgress" class="w-full" />
            <p class="text-sm text-muted-foreground text-center">
              {{ downloadProgress }}%
            </p>
          </div>

          <!-- Installing -->
          <div v-if="isInstalling" class="space-y-3">
            <p class="flex items-center gap-2 text-green-600">
              <CheckCircle2 class="w-4 h-4" />
              {{ t('updater.downloadComplete') }}
            </p>
            <p class="text-sm text-muted-foreground">
              {{ t('updater.installing') }}
            </p>
          </div>

          <!-- Error -->
          <div v-if="updateError" class="space-y-3">
            <p class="flex items-center gap-2 text-red-600">
              <AlertCircle class="w-4 h-4" />
              {{ t('updater.updateFailed') }}
            </p>
            <p class="text-sm text-muted-foreground">
              {{ updateError }}
            </p>
          </div>
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter class="flex gap-2">
        <!-- Update available - show download and cancel buttons -->
        <template
          v-if="updateInfo && !isDownloading && !isInstalling && !updateError"
        >
          <Button variant="outline" @click="handleClose">
            {{ t('updater.later') }}
          </Button>
          <AlertDialogAction @click="handleDownload">
            <Download class="w-4 h-4 mr-2" />
            {{ t('updater.downloadNow') }}
          </AlertDialogAction>
        </template>

        <!-- Downloading - show disabled close button -->
        <template v-if="isDownloading && !isInstalling">
          <Button variant="outline" disabled>
            <Loader2 class="w-4 h-4 mr-2 animate-spin" />
            {{ t('updater.downloading') }}...
          </Button>
        </template>

        <!-- Installing - show disabled button -->
        <template v-if="isInstalling">
          <Button variant="outline" disabled>
            {{ t('updater.installing') }}...
          </Button>
        </template>

        <!-- Error - show retry and close buttons -->
        <template v-if="updateError">
          <Button variant="outline" @click="handleClose">
            {{ t('updater.close') }}
          </Button>
          <AlertDialogAction @click="handleDownload">
            {{ t('updater.retry') }}
          </AlertDialogAction>
        </template>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>