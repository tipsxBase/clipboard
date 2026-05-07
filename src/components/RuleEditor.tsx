/**
 * RuleEditor Component - React version
 *
 * Editor for automation rules with conditions and actions.
 */
import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Folder, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Rule, RuleCondition, RuleAction, Collection } from '@/types';

export interface RuleEditorProps {
  rule?: Rule;
  collections: Collection[];
  onSave: (rule: Rule) => void;
  onCancel: () => void;
  onDelete: (id: string) => void;
}

function createDefault(): Rule {
  return {
    id: crypto.randomUUID(),
    name: '',
    enabled: true,
    conditions: [{ field: 'source_app', operator: 'contains', value: '' }],
    action: { action_type: 'ignore' },
  };
}

export function RuleEditor({
  rule,
  collections,
  onSave,
  onCancel,
  onDelete,
}: RuleEditorProps) {
  const { t } = useTranslation();
  const [editingRule, setEditingRule] = useState<Rule>(createDefault());

  const selectedCollection = useMemo(() => {
    if (
      editingRule.action.action_type === 'add_to_collection' &&
      editingRule.action.collection_id
    ) {
      return (
        collections.find((c) => c.id === editingRule.action.collection_id) ||
        null
      );
    }
    return null;
  }, [editingRule.action, collections]);

  useEffect(() => {
    setEditingRule(rule ? JSON.parse(JSON.stringify(rule)) : createDefault());
  }, [rule]);

  const addCondition = () => {
    setEditingRule((prev) => ({
      ...prev,
      conditions: [
        ...prev.conditions,
        { field: 'source_app', operator: 'contains', value: '' },
      ],
    }));
  };

  const removeCondition = (index: number) => {
    if (editingRule.conditions.length > 1) {
      setEditingRule((prev) => ({
        ...prev,
        conditions: prev.conditions.filter((_, i) => i !== index),
      }));
    }
  };

  const updateCondition = (
    index: number,
    key: keyof RuleCondition,
    value: string
  ) => {
    setEditingRule((prev) => {
      const conditions = [...prev.conditions];
      conditions[index] = {
        ...conditions[index],
        [key]: value as RuleCondition[keyof RuleCondition],
      };
      return { ...prev, conditions };
    });
  };

  const updateActionType = (type: string) => {
    setEditingRule((prev) => {
      const action: RuleAction = {
        action_type: type as RuleAction['action_type'],
      };
      if (type === 'add_to_collection') {
        action.collection_id = prev.action.collection_id;
      }
      return { ...prev, action };
    });
  };

  const updateCollectionId = (id: string) => {
    setEditingRule((prev) => ({
      ...prev,
      action: {
        ...prev.action,
        collection_id: Number(id),
      },
    }));
  };

  const handleSave = () => {
    if (
      editingRule.action.action_type === 'add_to_collection' &&
      !editingRule.action.collection_id
    ) {
      return;
    }
    if (!editingRule.name.trim()) return;
    onSave(editingRule);
  };

  const fields: RuleCondition['field'][] = [
    'source_app',
    'content_type',
    'content',
  ];
  const operators: RuleCondition['operator'][] = [
    'equals',
    'contains',
    'matches',
  ];
  const actionTypes: RuleAction['action_type'][] = [
    'ignore',
    'mark_sensitive',
    'pin',
    'snippet',
    'add_to_collection',
  ];

  return (
    <div className="space-y-4">
      {/* Rule Name */}
      <div>
        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1 block">
          {t('rules.ruleName')}
        </label>
        <Input
          value={editingRule.name}
          onChange={(e) =>
            setEditingRule((prev) => ({ ...prev, name: e.target.value }))
          }
          placeholder={t('rules.ruleNamePlaceholder')}
        />
      </div>

      {/* Enabled */}
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">{t('rules.enabled')}</label>
        <Switch
          checked={editingRule.enabled}
          onCheckedChange={(checked) =>
            setEditingRule((prev) => ({ ...prev, enabled: checked }))
          }
        />
      </div>

      {/* Conditions */}
      <div>
        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">
          {t('rules.conditions')}
        </label>
        <div className="space-y-2">
          {editingRule.conditions.map((condition, i) => (
            <div key={i} className="flex items-center gap-2">
              <Select
                value={condition.field}
                onValueChange={(v) => updateCondition(i, 'field', v)}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {fields.map((f) => (
                    <SelectItem key={f} value={f}>
                      {t(`rules.field.${f}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={condition.operator}
                onValueChange={(v) => updateCondition(i, 'operator', v)}
              >
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {operators.map((op) => (
                    <SelectItem key={op} value={op}>
                      {t(`rules.operator.${op}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Input
                value={condition.value}
                onChange={(e) => updateCondition(i, 'value', e.target.value)}
                className="flex-1"
                placeholder="..."
              />

              {editingRule.conditions.length > 1 && (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="shrink-0 h-8 w-8"
                  onClick={() => removeCondition(i)}
                >
                  <X className="w-3 h-3" />
                </Button>
              )}
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={addCondition}
          >
            <Plus className="w-3 h-3 mr-1" /> {t('rules.addCondition')}
          </Button>
        </div>
      </div>

      {/* Action */}
      <div>
        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">
          {t('rules.action')}
        </label>
        <Select
          value={editingRule.action.action_type}
          onValueChange={updateActionType}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {actionTypes.map((at) => (
              <SelectItem key={at} value={at}>
                {t(`rules.actionType.${at}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Collection Selector */}
        {editingRule.action.action_type === 'add_to_collection' && (
          <div className="mt-2">
            <Select
              value={String(editingRule.action.collection_id || '')}
              onValueChange={updateCollectionId}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t('rules.selectCollection')} />
              </SelectTrigger>
              <SelectContent>
                {collections.map((col) => (
                  <SelectItem key={col.id} value={String(col.id)}>
                    {col.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedCollection && (
              <div
                className="mt-2 flex items-center justify-between rounded-lg border border-border/80 bg-muted/40 px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <Folder
                    className="h-3.5 w-3.5 shrink-0"
                    style={{ color: selectedCollection.color || '' }}
                  />
                  <div className="min-w-0">
                    <div className="text-[11px] font-medium text-muted-foreground">
                      {t('rules.targetCollection')}
                    </div>
                    <div className="truncate text-sm font-medium text-foreground">
                      {selectedCollection.name}
                    </div>
                  </div>
                </div>
                <div className="shrink-0 text-[11px] text-muted-foreground">
                  {selectedCollection.item_count || 0}
                </div>
              </div>
            )}
            {!selectedCollection && editingRule.action.collection_id && (
              <p className="mt-2 text-xs text-destructive">
                {t('rules.collectionMissing')}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <Button
          type="button"
          size="sm"
          className="flex-1"
          disabled={
            editingRule.action.action_type === 'add_to_collection' &&
            !editingRule.action.collection_id
          }
          onClick={handleSave}
        >
          {t('rules.save')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="flex-1"
          onClick={onCancel}
        >
          {t('rules.cancel')}
        </Button>
        {rule && (
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={() => onDelete(rule.id)}
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        )}
      </div>
    </div>
  );
}

export default RuleEditor;