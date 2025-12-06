<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, nextTick } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

interface ClipboardItem {
  content: string;
  kind: string;
  timestamp: string;
}

const history = ref<ClipboardItem[]>([]);
const searchQuery = ref("");
const selectedIndex = ref(0);
const searchInput = ref<HTMLInputElement | null>(null);
const isPopup = ref(false);
const showSettings = ref(false);

interface AppConfig {
  shortcut: string;
  max_history_size: number;
}

const config = ref<AppConfig>({
  shortcut: "CommandOrControl+Shift+V",
  max_history_size: 20,
});

const tempShortcut = ref("");
const tempMaxSize = ref(20);
const isRecording = ref(false);

function startRecording(e: MouseEvent) {
  isRecording.value = true;
  tempShortcut.value = "Recording...";
  (e.target as HTMLInputElement).focus();
}

function handleShortcutKeydown(e: KeyboardEvent) {
  if (!isRecording.value) return;
  e.preventDefault();
  e.stopPropagation();

  const modifiers = [];
  if (e.metaKey) modifiers.push("CommandOrControl");
  if (e.ctrlKey) modifiers.push("Control");
  if (e.altKey) modifiers.push("Alt");
  if (e.shiftKey) modifiers.push("Shift");

  let key = e.key.toUpperCase();

  // Map special keys
  const keyMap: Record<string, string> = {
    " ": "Space",
    ARROWUP: "Up",
    ARROWDOWN: "Down",
    ARROWLEFT: "Left",
    ARROWRIGHT: "Right",
    ENTER: "Return",
    ESCAPE: "Escape",
    BACKSPACE: "Backspace",
    TAB: "Tab",
  };

  if (keyMap[key]) {
    key = keyMap[key];
  }

  // Don't record if only modifiers are pressed
  if (["META", "CONTROL", "ALT", "SHIFT"].includes(key)) {
    return;
  }

  // Construct shortcut string
  const shortcut = [...modifiers, key].join("+");
  tempShortcut.value = shortcut;
  isRecording.value = false;
}

const filteredHistory = computed(() => {
  if (!searchQuery.value) return history.value;
  const query = searchQuery.value.toLowerCase();
  return history.value.filter((item) => {
    if (item.kind === "text") {
      return item.content.toLowerCase().includes(query);
    }
    return false; // Don't search inside base64 images
  });
});

async function loadHistory() {
  try {
    history.value = await invoke("get_history");
    selectedIndex.value = 0;
  } catch (e) {
    console.error("Failed to load history:", e);
  }
}

async function pasteItem(item: ClipboardItem) {
  try {
    // Hide window first for better UX
    await getCurrentWindow().hide();

    await invoke("set_clipboard_item", {
      content: item.content,
      kind: item.kind,
    });
    await loadHistory();
    // Reset search
    searchQuery.value = "";
  } catch (e) {
    console.error("Failed to set clipboard item:", e);
  }
}

async function deleteItem(index: number) {
  // Note: index here is index in filtered list if we want to support deleting from search
  // But backend delete_item takes index in full history.
  // For simplicity, let's find the item in the full history.
  const item = filteredHistory.value[index];
  const realIndex = history.value.indexOf(item);

  if (realIndex !== -1) {
    try {
      await invoke("delete_item", { index: realIndex });
      await loadHistory();
    } catch (e) {
      console.error("Failed to delete item:", e);
    }
  }
}

async function clearHistory() {
  try {
    await invoke("clear_history");
    await loadHistory();
  } catch (e) {
    console.error("Failed to clear history:", e);
  }
}

async function loadConfig() {
  try {
    config.value = await invoke("get_config");
    tempShortcut.value = config.value.shortcut;
    tempMaxSize.value = config.value.max_history_size;
  } catch (e) {
    console.error("Failed to load config:", e);
  }
}

async function saveConfig() {
  try {
    await invoke("save_config", {
      shortcut: tempShortcut.value,
      maxHistorySize: tempMaxSize.value,
    });
    await loadConfig();
    showSettings.value = false;
    alert(
      "Settings saved! Please restart the app for shortcut changes to take effect."
    );
  } catch (e) {
    console.error("Failed to save config:", e);
    alert("Failed to save settings: " + e);
  }
}

function openSettings() {
  showSettings.value = true;
  tempShortcut.value = config.value.shortcut;
  tempMaxSize.value = config.value.max_history_size;
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === "ArrowDown") {
    e.preventDefault();
    selectedIndex.value =
      (selectedIndex.value + 1) % filteredHistory.value.length;
    scrollToSelected();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    selectedIndex.value =
      (selectedIndex.value - 1 + filteredHistory.value.length) %
      filteredHistory.value.length;
    scrollToSelected();
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (filteredHistory.value.length > 0) {
      pasteItem(filteredHistory.value[selectedIndex.value]);
    }
  } else if (e.key === "Escape") {
    // Hide window logic could go here if we had access to window handle easily
    // For now, just clear search
    if (searchQuery.value) {
      searchQuery.value = "";
    } else {
      getCurrentWindow().hide();
    }
  } else if (e.metaKey && !isNaN(parseInt(e.key)) && parseInt(e.key) > 0) {
    // Cmd+1..9
    const idx = parseInt(e.key) - 1;
    if (idx < filteredHistory.value.length) {
      pasteItem(filteredHistory.value[idx]);
    }
  }
}

function scrollToSelected() {
  nextTick(() => {
    const el = document.getElementById(`item-${selectedIndex.value}`);
    el?.scrollIntoView({ block: "nearest" });
  });
}

let unlisten: (() => void) | undefined;

onMounted(async () => {
  const win = getCurrentWindow();
  isPopup.value = win.label === "popup";

  await loadConfig();
  await loadHistory();
  unlisten = await listen("clipboard-update", () => {
    loadHistory();
  });
  window.addEventListener("keydown", handleKeydown);
  // Ensure focus on mount
  await nextTick();
  searchInput.value?.focus();
});

onUnmounted(() => {
  if (unlisten) {
    unlisten();
  }
  window.removeEventListener("keydown", handleKeydown);
});
</script>

<template>
  <div
    class="h-screen w-screen bg-gray-900 text-white flex flex-col overflow-hidden font-sans"
  >
    <!-- Search Header -->
    <div class="p-3 bg-gray-800 border-b border-gray-700 flex gap-2">
      <input
        ref="searchInput"
        v-model="searchQuery"
        type="text"
        placeholder="Type to search..."
        class="flex-1 bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
        autofocus
      />
      <button
        v-if="!isPopup"
        @click="openSettings"
        class="px-3 py-1 text-xs bg-gray-700 hover:bg-blue-600 rounded transition-colors cursor-pointer text-gray-300"
        title="Settings"
      >
        ⚙️
      </button>
      <button
        v-if="!isPopup"
        @click="clearHistory"
        class="px-3 py-1 text-xs bg-gray-700 hover:bg-red-600 rounded transition-colors cursor-pointer text-gray-300"
        title="Clear All History"
      >
        Clear
      </button>
    </div>

    <!-- List -->
    <div class="flex-1 overflow-y-auto p-2 space-y-1">
      <div
        v-for="(item, index) in filteredHistory"
        :key="index"
        :id="`item-${index}`"
        class="group relative rounded p-2 border border-transparent cursor-pointer flex items-start gap-3"
        :class="{
          'bg-blue-900 border-blue-700': index === selectedIndex,
          'hover:bg-gray-800': index !== selectedIndex,
        }"
        @click="pasteItem(item)"
        @mouseenter="selectedIndex = index"
      >
        <!-- Shortcut Hint -->
        <div
          class="text-gray-500 text-xs font-mono w-4 pt-1 text-right flex-shrink-0"
        >
          <span v-if="index < 9">⌘{{ index + 1 }}</span>
        </div>

        <!-- Content -->
        <div class="flex-1 min-w-0">
          <div v-if="item.kind === 'text'">
            <pre
              class="font-mono text-sm whitespace-pre-wrap break-all line-clamp-2 text-gray-300"
              :class="{ 'text-white': index === selectedIndex }"
              >{{ item.content }}</pre
            >
          </div>
          <div v-else-if="item.kind === 'image'">
            <img
              :src="`data:image/png;base64,${item.content}`"
              class="max-h-24 rounded border border-gray-600"
            />
          </div>

          <div class="mt-1 text-[10px] text-gray-500 flex justify-between">
            <span>{{ item.kind }}</span>
            <span>{{ item.timestamp }}</span>
          </div>
        </div>

        <!-- Delete Button -->
        <button
          @click.stop="deleteItem(index)"
          class="opacity-0 group-hover:opacity-100 p-1 text-gray-500 hover:text-red-400 transition-opacity"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <div
        v-if="filteredHistory.length === 0"
        class="text-center text-gray-500 mt-10 text-sm"
      >
        No items found
      </div>
    </div>

    <!-- Footer Hint -->
    <div
      class="px-3 py-1 text-center text-[10px] text-gray-600 border-t border-gray-800 flex justify-between"
    >
      <span>{{ config.shortcut }} to toggle</span>
      <span>Select with ↑↓, Enter to paste</span>
    </div>

    <!-- Settings Modal -->
    <div
      v-if="showSettings"
      class="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50"
      @click.self="showSettings = false"
    >
      <div class="bg-gray-800 rounded-lg p-6 w-96 border border-gray-700">
        <h2 class="text-xl font-bold mb-4">Settings</h2>

        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium mb-2"
              >Global Shortcut</label
            >
            <div class="relative">
              <input
                v-model="tempShortcut"
                type="text"
                readonly
                placeholder="Click to record shortcut"
                class="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500 cursor-pointer"
                @click="startRecording"
                @keydown="handleShortcutKeydown"
              />
              <button
                v-if="isRecording"
                class="absolute right-2 top-1/2 transform -translate-y-1/2 text-xs text-red-400"
              >
                Recording...
              </button>
            </div>
            <p class="text-xs text-gray-500 mt-1">
              Click the input and press your desired key combination
            </p>
          </div>

          <div>
            <label class="block text-sm font-medium mb-2"
              >Max History Size</label
            >
            <input
              v-model.number="tempMaxSize"
              type="number"
              min="5"
              max="1000"
              class="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            />
            <p class="text-xs text-gray-500 mt-1">
              Maximum number of clipboard items to keep (5-1000)
            </p>
          </div>
        </div>

        <div class="flex gap-2 mt-6">
          <button
            @click="saveConfig"
            class="flex-1 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded transition-colors"
          >
            Save
          </button>
          <button
            @click="showSettings = false"
            class="flex-1 bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
/* Global scrollbar styling */
::-webkit-scrollbar {
  width: 8px;
}
::-webkit-scrollbar-track {
  background: #1f2937;
}
::-webkit-scrollbar-thumb {
  background: #4b5563;
  border-radius: 4px;
}
::-webkit-scrollbar-thumb:hover {
  background: #6b7280;
}
</style>
