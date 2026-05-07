/**
 * PermissionDialog Component - React version
 *
 * macOS screen recording permission reminder dialog.
 */
import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const PERMISSION_ACKNOWLEDGED_KEY = 'screen_recording_permission_acknowledged';

export function PermissionDialog() {
  const { t } = useTranslation();
  const [showDialog, setShowDialog] = useState(false);
  const [isMacOS, setIsMacOS] = useState(false);

  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    setIsMacOS(userAgent.includes('mac'));

    if (isMacOS) {
      checkPermission();
    }
  }, [isMacOS]);

  const checkPermission = async () => {
    // Check if user has already acknowledged the permission dialog
    const acknowledged = localStorage.getItem(PERMISSION_ACKNOWLEDGED_KEY);
    if (acknowledged === 'true') {
      return; // User already acknowledged, don't show again
    }

    try {
      const hasPermission = await invoke<boolean>('check_screen_recording_permission');
      if (!hasPermission) {
        setShowDialog(true);
      }
    } catch (error) {
      console.error('Failed to check screen recording permission:', error);
    }
  };

  const dismiss = () => {
    setShowDialog(false);
    // Remember that user has acknowledged the dialog
    localStorage.setItem(PERMISSION_ACKNOWLEDGED_KEY, 'true');
  };

  if (!isMacOS) return null;

  return (
    <AlertDialog open={showDialog} onOpenChange={(v) => !v && dismiss()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('permission.screenRecordingTitle')}</AlertDialogTitle>
          <AlertDialogDescription>
            <div className="space-y-3">
              <p>{t('permission.screenRecordingDescription')}</p>
              <ol className="list-decimal list-inside space-y-2 text-sm">
                <li>{t('permission.step1')}</li>
                <li>{t('permission.step2')}</li>
                <li>{t('permission.step3')}</li>
                <li>{t('permission.step4')}</li>
                <li>
                  <strong>{t('permission.step5')}</strong>
                </li>
              </ol>
              <p className="text-xs text-muted-foreground">{t('permission.note')}</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={dismiss}>
            {t('permission.acknowledge')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default PermissionDialog;