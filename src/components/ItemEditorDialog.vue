<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent
      class="bg-background text-foreground h-[80vh] flex flex-col max-w-full! w-4/5!"
    >
      <DialogHeader>
        <DialogTitle>{{
          mode === "edit" ? t("actions.edit") : t("actions.addItem")
        }}</DialogTitle>
      </DialogHeader>

      <div class="flex flex-col gap-4 flex-1 overflow-hidden py-4">
        <!-- Type Selector (Only for Add mode, or if we allow changing type) -->
        <div class="flex items-center gap-2">
          <Label>{{ t("editor.type") }}</Label>
          <Select v-model="selectedType">
            <SelectTrigger class="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="text">{{ t("filters.text") }}</SelectItem>
              <SelectItem value="url">{{ t("filters.url") }}</SelectItem>
              <SelectItem value="code">{{ t("filters.code") }}</SelectItem>
              <SelectItem value="email">{{ t("filters.email") }}</SelectItem>
              <SelectItem value="phone">{{ t("filters.phone") }}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <!-- Note Input -->
        <div class="flex-1 flex flex-col gap-2 flex-grow-0">
          <Label>{{ t("editor.note") }}</Label>
          <Input v-model="note" :placeholder="t('editor.notePlaceholder')" />
        </div>

        <!-- Content Editor -->
        <div class="flex-1 flex flex-col gap-2">
          <Label>{{ t("editor.content") }}</Label>
          <textarea
            v-model="content"
            class="flex-1 w-full p-4 rounded-md border border-input bg-transparent shadow-sm resize-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-mono text-sm leading-relaxed"
            :placeholder="t('editor.placeholder')"
          ></textarea>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="$emit('update:open', false)">
          {{ t("settings.cancel") }}
        </Button>
        <Button @click="handleSave" :disabled="!content.trim()">
          {{ t("settings.save") }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import type { ClipboardItem } from "@/types";

const props = defineProps<{
  open: boolean;
  item?: ClipboardItem | null; // If null, we are in "Add" mode
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (
    e: "save",
    data: { content: string; dataType: string; note?: string; id?: number }
  ): void;
}>();

const { t } = useI18n();

const mode = ref<"add" | "edit">("add");
const content = ref("");
const note = ref("");
const selectedType = ref("text");

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      if (props.item) {
        mode.value = "edit";
        content.value = props.item.content;
        note.value = props.item.note || "";
        selectedType.value = props.item.data_type || "text";
      } else {
        mode.value = "add";
        content.value = "";
        note.value = "";
        selectedType.value = "text";
      }
    }
  }
);

function handleSave() {
  if (!content.value.trim()) return;

  emit("save", {
    content: content.value,
    dataType: selectedType.value,
    note: note.value,
    id: props.item?.id,
  });
  emit("update:open", false);
}
</script>
