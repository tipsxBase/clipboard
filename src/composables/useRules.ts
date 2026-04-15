import { ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { useI18n } from 'vue-i18n';
import { useToast } from './useToast';
import type { Rule, RuleCondition } from '../types';

export function useRules() {
  const { t } = useI18n();
  const { showToast } = useToast();

  const rules = ref<Rule[]>([]);
  const isLoading = ref(false);

  async function loadRules() {
    isLoading.value = true;
    try {
      rules.value = await invoke<Rule[]>('get_rules');
    } catch (e) {
      console.error('Failed to load rules:', e);
    } finally {
      isLoading.value = false;
    }
  }

  async function addRule(rule: Rule) {
    try {
      await invoke('add_rule', { rule });
      await loadRules();
      showToast(t('rules.ruleAdded'));
    } catch (e) {
      console.error('Failed to add rule:', e);
      showToast(t('rules.ruleFailed'));
    }
  }

  async function updateRule(rule: Rule) {
    try {
      await invoke('update_rule', { rule });
      await loadRules();
      showToast(t('rules.ruleUpdated'));
    } catch (e) {
      console.error('Failed to update rule:', e);
      showToast(t('rules.ruleFailed'));
    }
  }

  async function deleteRule(id: string) {
    try {
      await invoke('delete_rule', { id });
      await loadRules();
      showToast(t('rules.ruleDeleted'));
    } catch (e) {
      console.error('Failed to delete rule:', e);
      showToast(t('rules.ruleFailed'));
    }
  }

  async function toggleRuleEnabled(rule: Rule) {
    await updateRule({ ...rule, enabled: !rule.enabled });
  }

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
