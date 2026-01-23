<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent
      class="bg-background text-foreground flex flex-col max-w-full!"
      :class="noteOnly ? 'h-auto w-[400px]!' : 'h-[80vh] w-4/5!'"
    >
      <DialogHeader>
        <DialogTitle>{{
          noteOnly
            ? t("actions.editNote")
            : mode === "edit"
              ? t("actions.edit")
              : t("actions.addItem")
        }}</DialogTitle>
      </DialogHeader>

      <div
        class="flex flex-col gap-4 flex-1 overflow-hidden py-4 min-h-0"
        :class="{ 'justify-center': noteOnly }"
      >
        <!-- Type Selector (Only for Add mode, or if we allow changing type) -->
        <div class="flex items-center gap-2" v-if="!noteOnly">
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
        <div class="flex flex-col gap-2 flex-grow-0">
          <Label>{{ t("editor.note") }}</Label>
          <Input v-model="note" :placeholder="t('editor.notePlaceholder')" />
        </div>

        <!-- Content Editor -->
        <div class="flex-1 flex flex-col gap-2 min-h-0" v-if="!noteOnly">
          <Label>{{ t("editor.content") }}</Label>
          <!-- Rich Text Editor -->
          <div
            v-if="isRichTextMode"
            ref="richTextEditorRef"
            contenteditable="true"
            class="flex-1 w-full p-4 rounded-md border border-input bg-transparent shadow-sm overflow-auto focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-sm leading-relaxed"
            @input="handleRichTextInput"
          ></div>

          <!-- Plain Text Editor -->
          <textarea
            v-else
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
        <Button @click="handleSave" :disabled="!noteOnly && !content.trim()">
          {{ t("settings.save") }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from "vue";
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
  noteOnly?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (
    e: "save",
    data: {
      content: string;
      dataType: string;
      note?: string;
      id?: number;
      html_content?: string;
    },
  ): void;
}>();

const { t } = useI18n();

const mode = ref<"add" | "edit">("add");
const content = ref("");
const note = ref("");
const selectedType = ref("text");
const isRichTextMode = ref(false);
const richTextEditorRef = ref<HTMLDivElement | null>(null);

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      if (props.item) {
        mode.value = "edit";
        content.value = props.item.content;
        note.value = props.item.note || "";
        selectedType.value = props.item.data_type || "text";

        if (props.item.html_content) {
          isRichTextMode.value = true;
          // Wait for DOM to render the div
          nextTick(() => {
            if (richTextEditorRef.value) {
              richTextEditorRef.value.innerHTML = props.item!.html_content!;
            }
          });
        } else {
          isRichTextMode.value = false;
        }
      } else {
        mode.value = "add";
        content.value = "";
        note.value = "";
        selectedType.value = "text";
        isRichTextMode.value = false;
      }
    }
  },
);

function handleRichTextInput(e: Event) {
  const target = e.target as HTMLDivElement;
  content.value = target.innerText;
}

function handleSave() {
  let finalContent = content.value;
  let finalHtml: string | undefined = undefined;

  // If noteOnly mode, we don't save content, just pass original content back to satisfy types,
  // or MainWindow should handle it. Actually the emit expects content.
  // In noteOnly mode, content.value should be original content.
  if (props.noteOnly) {
    if (props.item) {
      finalContent = props.item.content;
      finalHtml = props.item.html_content;
    }
  } else if (isRichTextMode.value && richTextEditorRef.value) {
    finalHtml = richTextEditorRef.value.innerHTML;
    // Ensure content matches the visual text in the editor
    finalContent = richTextEditorRef.value.innerText;
  }

  // validate logic is handled by button disabled state mostly, but good to check.
  if (!props.noteOnly && !finalContent.trim()) return;

  emit("save", {
    content: finalContent,
    dataType: selectedType.value,
    note: note.value,
    id: props.item?.id,
    html_content: finalHtml,
  });
  emit("update:open", false);
}
</script>
