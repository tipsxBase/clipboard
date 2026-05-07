import { useCallback, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/useToast';
import type { Rule, RuleCondition } from '@/types';

export function useRules() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [rules, setRules] = useState<Rule[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadRules = useCallback(async () => {
    setIsLoading(true);
    try {
      setRules(await invoke<Rule[]>('get_rules'));
    } catch (error) {
      console.error('Failed to load rules:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const addRule = useCallback(
    async (rule: Rule) => {
      try {
        await invoke('add_rule', { rule });
        await loadRules();
        showToast(t('rules.ruleAdded'));
      } catch (error) {
        console.error('Failed to add rule:', error);
        showToast(t('rules.ruleFailed'));
      }
    },
    [loadRules, showToast, t]
  );

  const updateRule = useCallback(
    async (rule: Rule) => {
      try {
        await invoke('update_rule', { rule });
        await loadRules();
        showToast(t('rules.ruleUpdated'));
      } catch (error) {
        console.error('Failed to update rule:', error);
        showToast(t('rules.ruleFailed'));
      }
    },
    [loadRules, showToast, t]
  );

  const deleteRule = useCallback(
    async (id: string) => {
      try {
        await invoke('delete_rule', { id });
        await loadRules();
        showToast(t('rules.ruleDeleted'));
      } catch (error) {
        console.error('Failed to delete rule:', error);
        showToast(t('rules.ruleFailed'));
      }
    },
    [loadRules, showToast, t]
  );

  const toggleRuleEnabled = useCallback(
    async (rule: Rule) => {
      await updateRule({ ...rule, enabled: !rule.enabled });
    },
    [updateRule]
  );

  function createEmptyRule(): Rule {
    return {
      id: crypto.randomUUID(),
      name: '',
      enabled: true,
      conditions: [{ field: 'source_app', operator: 'contains', value: '' }],
      action: { action_type: 'ignore' },
    };
  }

  function createCondition(): RuleCondition {
    return { field: 'source_app', operator: 'contains', value: '' };
  }

  return {
    rules,
    isLoading,
    loadRules,
    addRule,
    updateRule,
    deleteRule,
    toggleRuleEnabled,
    createEmptyRule,
    createCondition,
  };
}
