/**
 * UpdateDialog Component - React version
 *
 * Dialog for displaying update status and download progress.
 */
import { useTranslation } from 'react-i18next';
import {
  Download,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Power,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import type { UpdateAvailablePayload } from '@/hooks/useUpdater';

export interface UpdateDialogProps {
  open: boolean;
  updateInfo: UpdateAvailablePayload | null;
  downloadProgress: number;
  downloadedBytes: number;
  totalBytes: number;
  isDownloading: boolean;
  isInstalling: boolean;
  updateError: string | null;
  isReadyToRestart: boolean;
  onClose: () => void;
  onDownload: () => void;
  onRestart: () => void;
}

export function UpdateDialog({
  open,
  updateInfo,
  downloadProgress,
  downloadedBytes,
  isDownloading,
  isInstalling,
  updateError,
  isReadyToRestart,
  onClose,
  onDownload,
  onRestart,
}: UpdateDialogProps) {
  const { t } = useTranslation();

  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5" />
            {t('updater.title')}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {/* Ready to restart */}
            {isReadyToRestart && (
              <div className="space-y-3">
                <p className="flex items-center gap-2 text-green-600">
                  <CheckCircle2 className="w-4 h-4" />
                  {t('updater.readyToRestart')}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t('updater.restartNowOrLater')}
                </p>
              </div>
            )}

            {/* Update Available */}
            {updateInfo && !isDownloading && !isInstalling && !updateError && !isReadyToRestart && (
              <div className="space-y-3">
                <p>{t('updater.newVersionAvailable')}</p>
                <div className="flex items-center justify-center gap-4 py-2">
                  <span className="text-muted-foreground">
                    {t('updater.currentVersion')}:
                  </span>
                  <span className="font-medium">v{updateInfo.current_version}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="font-medium text-green-600">
                    v{updateInfo.version}
                  </span>
                </div>
              </div>
            )}

            {/* Downloading */}
            {isDownloading && !isInstalling && (
              <div className="space-y-3">
                <p className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t('updater.downloading')}
                </p>
                <Progress value={downloadProgress} className="w-full" />
                <p className="text-sm text-muted-foreground text-center">
                  {downloadProgress > 0
                    ? `${downloadProgress}%`
                    : `${(downloadedBytes / 1024 / 1024).toFixed(1)} MB`}
                </p>
              </div>
            )}

            {/* Installing */}
            {isInstalling && (
              <div className="space-y-3">
                <p className="flex items-center gap-2 text-green-600">
                  <CheckCircle2 className="w-4 h-4" />
                  {t('updater.downloadComplete')}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t('updater.installing')}
                </p>
              </div>
            )}

            {/* Error */}
            {updateError && (
              <div className="space-y-3">
                <p className="flex items-center gap-2 text-red-600">
                  <AlertCircle className="w-4 h-4" />
                  {t('updater.updateFailed')}
                </p>
                <p className="text-sm text-muted-foreground">{updateError}</p>
              </div>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex gap-2">
          {/* Ready to restart */}
          {isReadyToRestart && (
            <>
              <Button variant="outline" onClick={onClose}>
                {t('updater.later')}
              </Button>
              <AlertDialogAction onClick={onRestart}>
                <Power className="w-4 h-4 mr-2" />
                {t('updater.restartNow')}
              </AlertDialogAction>
            </>
          )}

          {/* Update available */}
          {updateInfo && !isDownloading && !isInstalling && !updateError && !isReadyToRestart && (
            <>
              <Button variant="outline" onClick={onClose}>
                {t('updater.later')}
              </Button>
              <AlertDialogAction onClick={onDownload}>
                <Download className="w-4 h-4 mr-2" />
                {t('updater.downloadNow')}
              </AlertDialogAction>
            </>
          )}

          {/* Downloading */}
          {isDownloading && !isInstalling && (
            <Button variant="outline" disabled>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {t('updater.downloading')}...
            </Button>
          )}

          {/* Installing */}
          {isInstalling && (
            <Button variant="outline" disabled>
              {t('updater.installing')}...
            </Button>
          )}

          {/* Error */}
          {updateError && (
            <>
              <Button variant="outline" onClick={onClose}>
                {t('updater.close')}
              </Button>
              <AlertDialogAction onClick={onDownload}>
                {t('updater.retry')}
              </AlertDialogAction>
            </>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default UpdateDialog;