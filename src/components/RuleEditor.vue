<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Plus, Trash2, X } from 'lucide-vue-next';
import Button from '@/components/ui/button/Button.vue';
import Input from '@/components/ui/input/Input.vue';
import { Switch } from '@/components/ui/switch';
import Select from '@/components/ui/select/Select.vue';
import SelectTrigger from '@/components/ui/select/SelectTrigger.vue';
import SelectValue from '@/components/ui/select/SelectValue.vue';
import SelectContent from '@/components/ui/select/SelectContent.vue';
import SelectItem from '@/components/ui/select/SelectItem.vue';
import type { Rule, RuleCondition, RuleAction, Collection } from '@/types';

const props = defineProps<{
  rule?: Rule;
  collections: Collection[];
}>();

const emit = defineEmits<{
  save: [rule: Rule];
  cancel: [];
  delete: [id: string];
}>();

const { t } = useI18n();

const editingRule = ref<Rule>(createDefault());

function createDefault(): Rule {
  return {
    id: crypto.randomUUID(),
    name: '',
    enabled: true,
    conditions: [{ field: 'source_app', operator: 'contains', value: '' }],
    action: { action_type: 'ignore' },
  };
}

watch(
  () => props.rule,
  (r) => {
    editingRule.value = r ? JSON.parse(JSON.stringify(r)) : createDefault();
  },
  { immediate: true }
);

function addCondition() {
  editingRule.value.conditions.push({ field: 'source_app', operator: 'contains', value: '' });
}

function removeCondition(index: number) {
  if (editingRule.value.conditions.length > 1) {
    editingRule.value.conditions.splice(index, 1);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function updateConditionField(index: number, field: any) {
  editingRule.value.conditions[index].field = String(field) as RuleCondition['field'];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function updateConditionOperator(index: number, op: any) {
  editingRule.value.conditions[index].operator = String(op) as RuleCondition['operator'];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function updateActionType(type: any) {
  editingRule.value.action.action_type = String(type) as RuleAction['action_type'];
  if (String(type) !== 'add_to_collection') {
    delete editingRule.value.action.collection_id;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function updateCollectionId(id: any) {
  editingRule.value.action.collection_id = Number(id);
}

function handleSave() {
  if (!editingRule.value.name.trim()) return;
  emit('save', editingRule.value);
}

const fields: RuleCondition['field'][] = ['source_app', 'content_type', 'content'];
const operators: RuleCondition['operator'][] = ['equals', 'contains', 'matches'];
const actionTypes: RuleAction['action_type'][] = [
  'ignore',
  'mark_sensitive',
  'pin',
  'snippet',
  'add_to_collection',
];
</script>

<template>
  <div class="space-y-4">
    <!-- Rule Name -->
    <div>
      <label class="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1 block">
        {{ t('rules.ruleName') }}
      </label>
      <Input v-model="editingRule.name" :placeholder="t('rules.ruleNamePlaceholder')" />
    </div>

    <!-- Enabled -->
    <div class="flex items-center justify-between">
      <label class="text-sm font-medium">{{ t('rules.enabled') }}</label>
      <Switch v-model:checked="editingRule.enabled" />
    </div>

    <!-- Conditions -->
    <div>
      <label class="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">
        {{ t('rules.conditions') }}
      </label>
      <div class="space-y-2">
        <div
          v-for="(condition, i) in editingRule.conditions"
          :key="i"
          class="flex items-center gap-2"
        >
          <Select
            :model-value="condition.field"
            @update:model-value="updateConditionField(i, $event)"
          >
            <SelectTrigger class="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="f in fields" :key="f" :value="f">
                {{ t(`rules.field.${f}`) }}
              </SelectItem>
            </SelectContent>
          </Select>

          <Select
            :model-value="condition.operator"
            @update:model-value="updateConditionOperator(i, $event)"
          >
            <SelectTrigger class="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="op in operators" :key="op" :value="op">
                {{ t(`rules.operator.${op}`) }}
              </SelectItem>
            </SelectContent>
          </Select>

          <Input v-model="condition.value" class="flex-1" placeholder="..." />

          <Button
            v-if="editingRule.conditions.length > 1"
            type="button"
            size="icon"
            variant="ghost"
            class="shrink-0 h-8 w-8"
            @click="removeCondition(i)"
          >
            <X class="w-3 h-3" />
          </Button>
        </div>
        <Button type="button" variant="outline" size="sm" class="w-full" @click="addCondition">
          <Plus class="w-3 h-3 mr-1" /> {{ t('rules.addCondition') }}
        </Button>
      </div>
    </div>

    <!-- Action -->
    <div>
      <label class="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">
        {{ t('rules.action') }}
      </label>
      <Select
        :model-value="editingRule.action.action_type"
        @update:model-value="updateActionType($event)"
      >
        <SelectTrigger class="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="at in actionTypes" :key="at" :value="at">
            {{ t(`rules.actionType.${at}`) }}
          </SelectItem>
        </SelectContent>
      </Select>

      <!-- Collection Selector (only for add_to_collection) -->
      <div v-if="editingRule.action.action_type === 'add_to_collection'" class="mt-2">
        <Select
          :model-value="String(editingRule.action.collection_id || '')"
          @update:model-value="updateCollectionId($event)"
        >
          <SelectTrigger class="w-full">
            <SelectValue :placeholder="t('actions.addToCollection')" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="col in collections" :key="col.id" :value="String(col.id)">
              {{ col.name }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>

    <!-- Actions -->
    <div class="flex gap-2 pt-2">
      <Button type="button" size="sm" class="flex-1" @click="handleSave">
        {{ t('rules.save') }}
      </Button>
      <Button type="button" size="sm" variant="secondary" class="flex-1" @click="emit('cancel')">
        {{ t('rules.cancel') }}
      </Button>
      <Button
        v-if="rule"
        type="button"
        size="sm"
        variant="destructive"
        @click="emit('delete', rule.id)"
      >
        <Trash2 class="w-3 h-3" />
      </Button>
    </div>
  </div>
</template>
