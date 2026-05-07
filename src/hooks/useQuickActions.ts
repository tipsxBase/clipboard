import { useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { openPath, openUrl, revealItemInDir } from '@tauri-apps/plugin-opener';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/useToast';
import type { ClipboardItem } from '@/types';

export type ActionKind = 'copy' | 'update' | 'open';

export interface QuickAction {
  id: string;
  labelKey: string;
  icon: string;
  kind: ActionKind;
  execute: (item: ClipboardItem) => Promise<boolean>;
}

export function useQuickActions() {
  const { t } = useTranslation();
  const { showToast } = useToast();

  const copyDerived = useCallback(async (text: string): Promise<boolean> => {
    await invoke('set_clipboard_item', { content: text, kind: 'text', id: null });
    return true;
  }, []);

  const updateItem = useCallback(async (item: ClipboardItem, content: string): Promise<boolean> => {
    if (!item.id) return false;
    await invoke('update_clipboard_item_content', {
      id: item.id,
      content,
      dataType: item.data_type ?? 'text',
      note: item.note ?? null,
      htmlContent: item.html_content ?? null,
    });
    return true;
  }, []);

  const actions = useMemo(() => {
    const textActions: QuickAction[] = [
      {
        id: 'text.trimWhitespace',
        labelKey: 'quickActions.trimWhitespace',
        icon: 'RemoveFormatting',
        kind: 'update',
        execute: async (item) => updateItem(item, item.content.trim()),
      },
      {
        id: 'text.copyUpper',
        labelKey: 'quickActions.copyUppercase',
        icon: 'ArrowBigUp',
        kind: 'copy',
        execute: async (item) => copyDerived(item.content.toUpperCase()),
      },
      {
        id: 'text.copyLower',
        labelKey: 'quickActions.copyLowercase',
        icon: 'ArrowBigDown',
        kind: 'copy',
        execute: async (item) => copyDerived(item.content.toLowerCase()),
      },
      {
        id: 'text.wrapCodeBlock',
        labelKey: 'quickActions.wrapCodeBlock',
        icon: 'Code',
        kind: 'copy',
        execute: async (item) => copyDerived('```\n' + item.content + '\n```'),
      },
    ];

    const urlActions: QuickAction[] = [
      {
        id: 'url.openBrowser',
        labelKey: 'quickActions.openInBrowser',
        icon: 'ExternalLink',
        kind: 'open',
        execute: async (item) => {
          await openUrl(item.content);
          return true;
        },
      },
      {
        id: 'url.copyMarkdownLink',
        labelKey: 'quickActions.copyAsMarkdownLink',
        icon: 'Link',
        kind: 'copy',
        execute: async (item) => copyDerived(`[${item.content}](${item.content})`),
      },
    ];

    const emailActions: QuickAction[] = [
      {
        id: 'email.compose',
        labelKey: 'quickActions.composeEmail',
        icon: 'Mail',
        kind: 'open',
        execute: async (item) => {
          await openUrl(`mailto:${item.content}`);
          return true;
        },
      },
    ];

    const phoneActions: QuickAction[] = [
      {
        id: 'phone.call',
        labelKey: 'quickActions.call',
        icon: 'Phone',
        kind: 'open',
        execute: async (item) => {
          await openUrl(`tel:${item.content}`);
          return true;
        },
      },
    ];

    const codeActions: QuickAction[] = [
      {
        id: 'code.wrapCodeBlock',
        labelKey: 'quickActions.wrapCodeBlock',
        icon: 'Code',
        kind: 'copy',
        execute: async (item) => copyDerived('```\n' + item.content + '\n```'),
      },
      {
        id: 'code.trimWhitespace',
        labelKey: 'quickActions.trimWhitespace',
        icon: 'RemoveFormatting',
        kind: 'update',
        execute: async (item) => updateItem(item, item.content.trim()),
      },
    ];

    const imageActions: QuickAction[] = [
      {
        id: 'image.copy',
        labelKey: 'quickActions.copyImage',
        icon: 'Copy',
        kind: 'copy',
        execute: async (item) => {
          await invoke('set_clipboard_item', {
            content: item.content,
            kind: 'image',
            id: item.id,
          });
          return true;
        },
      },
      {
        id: 'image.ocr',
        labelKey: 'quickActions.extractText',
        icon: 'ScanText',
        kind: 'copy',
        execute: async (item) => {
          const text = await invoke<string>('ocr_image', { imagePath: item.content });
          if (!text) return false;
          await invoke('set_clipboard_item', {
            content: text,
            kind: 'text',
            id: null,
            screenshotId: item.id ?? null,
          });
          return true;
        },
      },
      {
        id: 'image.openDefault',
        labelKey: 'quickActions.openInApp',
        icon: 'ExternalLink',
        kind: 'open',
        execute: async (item) => {
          await openPath(item.content);
          return true;
        },
      },
      {
        id: 'image.revealInFolder',
        labelKey: 'quickActions.revealInFolder',
        icon: 'FolderOpen',
        kind: 'open',
        execute: async (item) => {
          await revealItemInDir(item.content);
          return true;
        },
      },
    ];

    const fileActions: QuickAction[] = [
      {
        id: 'file.openFile',
        labelKey: 'quickActions.openFile',
        icon: 'ExternalLink',
        kind: 'open',
        execute: async (item) => {
          const paths = JSON.parse(item.content) as string[];
          if (paths.length > 0) {
            await openPath(paths[0]);
          }
          return true;
        },
      },
      {
        id: 'file.revealInFolder',
        labelKey: 'quickActions.revealInFolder',
        icon: 'FolderOpen',
        kind: 'open',
        execute: async (item) => {
          const paths = JSON.parse(item.content) as string[];
          if (paths.length > 0) {
            await revealItemInDir(paths[0]);
          }
          return true;
        },
      },
      {
        id: 'file.copyFilename',
        labelKey: 'quickActions.copyFilename',
        icon: 'FileText',
        kind: 'copy',
        execute: async (item) => {
          const paths = JSON.parse(item.content) as string[];
          if (paths.length === 0) return false;
          const filename = paths[0].split('/').pop() ?? paths[0];
          await copyDerived(filename);
          return true;
        },
      },
    ];

    return {
      textActions,
      urlActions,
      emailActions,
      phoneActions,
      codeActions,
      imageActions,
      fileActions,
    };
  }, [copyDerived, updateItem]);

  const getActionsForItem = useCallback(
    (item: ClipboardItem): QuickAction[] => {
      if (item.kind === 'image') return actions.imageActions;
      if (item.kind === 'file') return actions.fileActions;

      switch (item.data_type) {
        case 'url':
          return [...actions.urlActions, ...actions.textActions];
        case 'email':
          return [...actions.emailActions, ...actions.textActions];
        case 'phone':
          return [...actions.phoneActions, ...actions.textActions];
        case 'code':
          return actions.codeActions;
        default:
          return actions.textActions;
      }
    },
    [actions]
  );

  const executeAction = useCallback(
    async (action: QuickAction, item: ClipboardItem): Promise<boolean> => {
      try {
        const ok = await action.execute(item);
        if (ok) {
          const feedbackKey =
            action.kind === 'open'
              ? 'quickActions.opened'
              : action.kind === 'update'
                ? 'quickActions.updated'
                : 'quickActions.copiedResult';
          showToast(t(feedbackKey));
        } else {
          showToast(t('quickActions.noResult'));
        }
        return ok;
      } catch (error) {
        console.error(`Quick action ${action.id} failed:`, error);
        showToast(t('quickActions.failed'));
        return false;
      }
    },
    [showToast, t]
  );

  return {
    getActionsForItem,
    executeAction,
  };
}
