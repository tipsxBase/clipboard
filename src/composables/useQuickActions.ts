import { useI18n } from 'vue-i18n';
import { invoke } from '@tauri-apps/api/core';
import { openUrl, openPath, revealItemInDir } from '@tauri-apps/plugin-opener';
import { useToast } from './useToast';
import type { ClipboardItem } from '../types';

/**
 * Execution semantics for a quick action.
 * - 'copy': writes a derived value to the clipboard (creates new history entry)
 * - 'update': modifies the item in-place
 * - 'open': opens an external target (browser, Finder, mail client)
 */
export type ActionKind = 'copy' | 'update' | 'open';

export interface QuickAction {
  /** Unique key, e.g. "text.trimWhitespace" */
  id: string;
  /** i18n key for the display label */
  labelKey: string;
  /** lucide icon name (used by consumer) */
  icon: string;
  /** Execution kind */
  kind: ActionKind;
  /** Execute the action, returns true on success */
  execute: (item: ClipboardItem) => Promise<boolean>;
}

export function useQuickActions() {
  const { t } = useI18n();
  const { showToast } = useToast();

  // ── helpers ──────────────────────────────────────────────

  async function copyDerived(text: string): Promise<boolean> {
    await invoke('set_clipboard_item', { content: text, kind: 'text', id: null });
    return true;
  }

  async function updateItem(item: ClipboardItem, content: string): Promise<boolean> {
    if (!item.id) return false;
    await invoke('update_clipboard_item_content', {
      id: item.id,
      content,
      dataType: item.data_type ?? 'text',
      note: item.note ?? null,
      htmlContent: item.html_content ?? null,
    });
    return true;
  }

  // ── action definitions ───────────────────────────────────

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
        if (text) {
          // Link OCR text to source image
          await invoke('set_clipboard_item', {
            content: text,
            kind: 'text',
            id: null,
            screenshotId: item.id ?? null,
          });
          return true;
        }
        return false;
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
        if (paths.length > 0) {
          const filename = paths[0].split('/').pop() ?? paths[0];
          await copyDerived(filename);
          return true;
        }
        return false;
      },
    },
  ];

  /**
   * Returns the list of quick actions available for the given item,
   * based on its kind and data_type.
   */
  function getActionsForItem(item: ClipboardItem): QuickAction[] {
    if (item.kind === 'image') return imageActions;
    if (item.kind === 'file') return fileActions;

    // text items — specialize by data_type
    switch (item.data_type) {
      case 'url':
        return [...urlActions, ...textActions];
      case 'email':
        return [...emailActions, ...textActions];
      case 'phone':
        return [...phoneActions, ...textActions];
      case 'code':
        return [...codeActions];
      default:
        return textActions;
    }
  }

  /**
   * Execute an action with standard feedback.
   */
  async function executeAction(action: QuickAction, item: ClipboardItem): Promise<boolean> {
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
    } catch (e) {
      console.error(`Quick action ${action.id} failed:`, e);
      showToast(t('quickActions.failed'));
      return false;
    }
  }

  return {
    getActionsForItem,
    executeAction,
  };
}
