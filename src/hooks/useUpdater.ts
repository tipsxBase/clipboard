import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/useToast';

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
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateAvailablePayload | null>(null);
  const [currentVersion, setCurrentVersion] = useState('');
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [isReadyToRestart, setIsReadyToRestart] = useState(false);
  const showUpdateDialogRef = useRef(false);

  useEffect(() => {
    showUpdateDialogRef.current = showUpdateDialog;
  }, [showUpdateDialog]);

  useEffect(() => {
    let disposed = false;
    let unlisteners: UnlistenFn[] = [];

    async function setupUpdater() {
      try {
        const version = await invoke<string>('get_app_version');
        if (!disposed) setCurrentVersion(version);
      } catch (error) {
        console.error('Failed to get app version:', error);
      }

      const nextUnlisteners = await Promise.all([
        listen<UpdateAvailablePayload>('update-available', (event) => {
          setUpdateInfo(event.payload);
          setShowUpdateDialog(true);
          setIsDownloading(false);
          setIsInstalling(false);
          setDownloadProgress(0);
          setUpdateError(null);
          setIsReadyToRestart(false);
        }),
        listen<UpdateAvailablePayload>('update-detected', (event) => {
          setUpdateInfo(event.payload);
          showToast(t('updater.newVersionDetected', { version: event.payload.version }));
        }),
        listen<UpdateProgressPayload>('update-progress', (event) => {
          setDownloadProgress(event.payload.percent);
          setDownloadedBytes(event.payload.downloaded || 0);
          setTotalBytes(event.payload.total || 0);
          setIsDownloading(true);
        }),
        listen('update-installing', () => {
          setIsInstalling(true);
          setDownloadProgress(100);
          setIsDownloading(false);
        }),
        listen('update-installed', () => {
          setIsReadyToRestart(true);
          setIsInstalling(false);
          setShowUpdateDialog(true);
        }),
        listen<string>('update-not-available', (event) => {
          showToast(t('updater.noUpdateAvailable', { version: event.payload }));
        }),
        listen<string>('update-error', (event) => {
          setUpdateError(event.payload);
          setIsDownloading(false);
          setIsInstalling(false);
          if (!showUpdateDialogRef.current) {
            showToast(t('updater.checkFailed'));
          }
        }),
      ]);

      if (disposed) {
        nextUnlisteners.forEach((unlisten) => unlisten());
      } else {
        unlisteners = nextUnlisteners;
      }
    }

    void setupUpdater();

    return () => {
      disposed = true;
      unlisteners.forEach((unlisten) => unlisten());
      unlisteners = [];
    };
  }, [showToast, t]);

  const closeDialog = useCallback(() => {
    setShowUpdateDialog(false);
    setDownloadProgress(0);
    setDownloadedBytes(0);
    setTotalBytes(0);
    setIsDownloading(false);
    setIsInstalling(false);
    setUpdateError(null);
  }, []);

  const openUpdateDialog = useCallback(() => {
    if (updateInfo || isReadyToRestart) {
      setShowUpdateDialog(true);
      setIsDownloading(false);
      setIsInstalling(false);
      setUpdateError(null);
    }
  }, [isReadyToRestart, updateInfo]);

  const downloadAndInstall = useCallback(async () => {
    setShowUpdateDialog(true);
    setIsDownloading(true);
    setDownloadProgress(0);
    setDownloadedBytes(0);
    setTotalBytes(0);
    setUpdateError(null);

    try {
      await invoke('download_and_install_update');
    } catch (error) {
      setUpdateError(String(error));
      setIsDownloading(false);
    }
  }, []);

  const restartApp = useCallback(async () => {
    try {
      await invoke('restart_app');
    } catch (error) {
      setUpdateError(String(error));
    }
  }, []);

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
