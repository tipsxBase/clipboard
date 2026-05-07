/**
 * QuickActionMenu Component - React version
 *
 * Dropdown menu for quick actions on clipboard items.
 */
import { useState, useMemo } from 'react';
import { Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { useQuickActions } from '@/hooks/useQuickActions';
import type { ClipboardItem } from '@/types';

export interface QuickActionMenuProps {
  item: ClipboardItem;
  onActionDone?: () => void;
  onMenuOpen?: (isOpen: boolean) => void;
}

export function QuickActionMenu({ item, onActionDone, onMenuOpen }: QuickActionMenuProps) {
  const { t } = useTranslation();
  const { getActionsForItem, executeAction } = useQuickActions();
  const [isOpen, setIsOpen] = useState(false);

  const actions = useMemo(() => getActionsForItem(item), [getActionsForItem, item]);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    onMenuOpen?.(open);
  };

  const handleAction = async (action: ReturnType<typeof getActionsForItem>[0]) => {
    const ok = await executeAction(action, item);
    if (ok && onActionDone) {
      onActionDone();
    }
  };

  if (actions.length === 0) return null;

  return (
    <DropdownMenu open={isOpen} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6 text-muted-foreground hover:text-primary"
          title={t('quickActions.title')}
          onClick={(e) => e.stopPropagation()}
        >
          <Zap className="w-3.5 h-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="z-50 min-w-[160px]"
        sideOffset={4}
        align="end"
      >
        {actions.map((action) => (
          <DropdownMenuItem
            key={action.id}
            className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-xs outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
            onClick={(e) => {
              e.stopPropagation();
              handleAction(action);
            }}
          >
            <span
              className="mr-2 text-[9px] uppercase font-bold tracking-wider px-1 py-0.5 rounded"
              style={{
                backgroundColor: action.kind === 'copy' ? 'rgba(59, 130, 246, 0.1)' : action.kind === 'open' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                color: action.kind === 'copy' ? '#3b82f6' : action.kind === 'open' ? '#22c55e' : '#f59e0b',
              }}
            >
              {action.kind === 'copy' ? '⊕' : action.kind === 'open' ? '↗' : '✎'}
            </span>
            {t(action.labelKey)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default QuickActionMenu;