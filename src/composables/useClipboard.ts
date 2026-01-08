import { ref, computed, nextTick, watch } from "vue";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useI18n } from "vue-i18n";
import { useToast } from "./useToast";
import type { ClipboardItem, Collection } from "../types";
import { confirm } from "@/composables/useConfirm";

export function useClipboard() {
  const { t } = useI18n();
  const { showToast } = useToast();

  const history = ref<ClipboardItem[]>([]);
  const collections = ref<Collection[]>([]);
  const totalCount = ref(0);
  const searchQuery = ref("");
  const selectedIndex = ref(0);
  const activeFilter = ref<
    "all" | "text" | "image" | "sensitive" | "url" | "email" | "code" | "phone"
  >("all");
  const activeCollectionId = ref<number | null>(null);
  const previewItem = ref<ClipboardItem | null>(null);
  const previewContent = ref("");
  const selectedIds = ref<number[]>([]);

  function toggleSelection(item: ClipboardItem) {
    if (!item.id) return;
    const index = selectedIds.value.indexOf(item.id);
    if (index !== -1) {
      selectedIds.value.splice(index, 1);
    } else {
      selectedIds.value.push(item.id);
    }
  }

  function clearSelection() {
    selectedIds.value = [];
  }

  async function pasteStack() {
    if (selectedIds.value.length === 0) return;

    const itemsToPaste = selectedIds.value
      .map((id) => history.value.find((i) => i.id === id))
      .filter((i): i is ClipboardItem => !!i);

    if (itemsToPaste.length === 0) return;

    const first = itemsToPaste[0];
    const rest = itemsToPaste.slice(1);

    try {
      await invoke("set_paste_stack", { items: rest });
      await pasteItem(first);
      clearSelection();
      if (rest.length > 0) {
        showToast(t("toast.pasteStackStarted", { count: rest.length }));
      }
    } catch (e) {
      console.error("Failed to start paste stack:", e);
    }
  }

  watch(previewItem, async (newItem) => {
    if (!newItem) {
      previewContent.value = "";
      return;
    }

    if (newItem.kind === "text" && newItem.id) {
      try {
        // Initially set to truncated content to show something immediately
        previewContent.value = newItem.content;
        // Fetch full content
        const fullContent = await invoke<string>("get_item_content", {
          id: newItem.id,
        });
        // Only update if the preview item hasn't changed in the meantime
        if (previewItem.value?.id === newItem.id) {
          previewContent.value = fullContent;
        }
      } catch (e) {
        console.error("Failed to fetch full content for preview:", e);
      }
    } else {
      previewContent.value = "";
    }
  });

  const currentPage = ref(1);
  const hasMore = ref(true);
  const isLoading = ref(false);
  const PAGE_SIZE = 50;

  // Watchers for filters to reload history
  watch([searchQuery, activeCollectionId, activeFilter], () => {
    currentPage.value = 1;
    loadHistory(true);
  });

  const filteredHistory = computed(() => {
    // Client-side filtering is now minimal or removed in favor of server-side
    // But we keep type filtering client-side for now if backend doesn't support it fully yet
    // Actually, let's rely on the backend results mostly.
    // However, for "Type" filtering (Text/Image/Sensitive/etc), we didn't implement backend support yet.
    // So we will keep client-side filtering for Type, but Search and Collection are now server-side.

    let items = history.value;

    // Filter by Type (Client-side for now)
    if (activeFilter.value === "text") {
      items = items.filter((i) => i.kind === "text");
    } else if (activeFilter.value === "image") {
      items = items.filter((i) => i.kind === "image");
    } else if (activeFilter.value === "sensitive") {
      items = items.filter((i) => i.is_sensitive);
    } else if (["url", "email", "code", "phone"].includes(activeFilter.value)) {
      items = items.filter((i) => i.data_type === activeFilter.value);
    }

    return items;
  });

  async function loadHistory(reset = false) {
    if (isLoading.value) return;
    isLoading.value = true;

    try {
      if (reset) {
        currentPage.value = 1;
        history.value = [];
        hasMore.value = true;
      }
      const newItems = await invoke<ClipboardItem[]>("get_history", {
        page: currentPage.value,
        pageSize: PAGE_SIZE,
        query: searchQuery.value || null,
        collectionId: activeCollectionId.value,
      });

      if (newItems.length < PAGE_SIZE) {
        hasMore.value = false;
      }

      if (reset) {
        history.value = newItems;
      } else {
        history.value = [...history.value, ...newItems];
      }

      totalCount.value = await invoke<number>("get_history_count");

      // Ensure selection is valid
      if (selectedIndex.value >= filteredHistory.value.length) {
        selectedIndex.value = 0;
      }
    } catch (e) {
      console.error("Failed to load history:", e);
    } finally {
      isLoading.value = false;
    }
  }

  async function loadMore() {
    if (hasMore.value && !isLoading.value) {
      currentPage.value++;
      await loadHistory(false);
    }
  }

  async function pasteItem(item: ClipboardItem, hideWindow = true) {
    try {
      // Close preview if open
      previewItem.value = null;

      if (hideWindow) {
        await getCurrentWindow().hide();
      }

      // Fetch full content if it's text and might be truncated
      let content = item.content;
      if (item.kind === "text" && item.id) {
        try {
          content = await invoke<string>("get_item_content", { id: item.id });
        } catch (e) {
          console.error("Failed to fetch full content, using preview:", e);
        }
      }

      await invoke("set_clipboard_item", {
        content,
        kind: item.kind,
        id: item.id,
      });
      await loadHistory(true);
      searchQuery.value = "";
      showToast(t("toast.copied"));
    } catch (e) {
      console.error("Failed to set clipboard item:", e);
    }
  }

  async function deleteItem(index: number) {
    const confirmed = await confirm({
      title: t("deleteDialog.title"),
      description: t("deleteDialog.description"),
      actionText: t("deleteDialog.actionText"),
      variant: "destructive",
    });
    if (!confirmed) return;

    const item = filteredHistory.value[index];
    const realIndex = history.value.indexOf(item);

    if (realIndex !== -1) {
      try {
        await invoke("delete_item", { index: realIndex });
        await loadHistory(true);
        showToast(t("toast.deleted"));
      } catch (e) {
        console.error("Failed to delete item:", e);
      }
    }
  }

  async function updateItemContent(
    id: number,
    content: string,
    dataType: string,
    note?: string
  ) {
    try {
      await invoke("update_clipboard_item_content", {
        id,
        content,
        dataType,
        note,
      });
      await loadHistory(true);
      showToast(t("collections.itemUpdated"));
    } catch (e) {
      console.error("Failed to update item content:", e);
      showToast(t("collections.updateFailed"));
    }
  }

  async function addItem(content: string) {
    try {
      await invoke("set_clipboard_item", {
        content,
        kind: "text",
        id: null,
      });
      await loadHistory(true);
      showToast(t("toast.copied"));
    } catch (e) {
      console.error("Failed to add item:", e);
    }
  }

  async function toggleSensitive(index: number) {
    const item = filteredHistory.value[index];
    const realIndex = history.value.indexOf(item);

    if (realIndex !== -1) {
      try {
        const newState = await invoke<boolean>("toggle_sensitive", {
          index: realIndex,
        });
        history.value[realIndex].is_sensitive = newState as boolean;
        showToast(
          newState ? t("toast.markedSensitive") : t("toast.unmarkedSensitive")
        );
      } catch (e) {
        console.error("Failed to toggle sensitive:", e);
      }
    }
  }

  async function togglePin(index: number) {
    const item = filteredHistory.value[index];
    const realIndex = history.value.indexOf(item);

    if (realIndex !== -1) {
      try {
        const newState = await invoke<boolean>("toggle_pin", {
          index: realIndex,
        });
        history.value[realIndex].is_pinned = newState as boolean;
        // Reload history to reflect sorting changes
        await loadHistory(true);
        showToast(newState ? t("toast.pinned") : t("toast.unpinned"));
      } catch (e) {
        console.error("Failed to toggle pin:", e);
      }
    }
  }

  async function clearHistory() {
    try {
      await invoke("clear_history");
      await loadHistory(true);
      showToast(t("toast.historyCleared"));
    } catch (e) {
      console.error("Failed to clear history:", e);
    }
  }

  function getImageSrc(content: string) {
    if (content.startsWith("/") || content.match(/^[a-zA-Z]:\\/)) {
      return convertFileSrc(content);
    }
    return `data:image/png;base64,${content}`;
  }

  function scrollToSelected() {
    nextTick(() => {
      const el = document.querySelector(".selected-item");
      if (el) {
        el.scrollIntoView({ block: "nearest" });
      }
    });
  }

  // Setup listeners
  async function setupClipboardListeners() {
    await listen("clipboard-update", () => {
      loadHistory(true);
    });
  }

  async function loadCollections() {
    try {
      collections.value = await invoke<Collection[]>("get_collections");
    } catch (e) {
      console.error("Failed to load collections:", e);
    }
  }

  async function createCollection(name: string) {
    try {
      await invoke("create_collection", { name });
      await loadCollections();
      showToast(t("collections.created"));
    } catch (e) {
      console.error("Failed to create collection:", e);
      showToast(t("collections.createFailed"));
    }
  }

  async function deleteCollection(id: number) {
    try {
      await invoke("delete_collection", { id });
      if (activeCollectionId.value === id) {
        activeCollectionId.value = null;
      }
      await loadCollections();
      await loadHistory(true); // Refresh items as their collection_id is now null
      showToast(t("collections.deleted"));
    } catch (e) {
      console.error("Failed to delete collection:", e);
      showToast(t("collections.deleteFailed"));
    }
  }

  async function setItemCollection(
    itemId: number,
    collectionId: number | null
  ) {
    try {
      await invoke("set_item_collection", { itemId, collectionId });
      await loadHistory(true);
      showToast(t("collections.itemUpdated"));
    } catch (e) {
      console.error("Failed to set item collection:", e);
      showToast(`${t("collections.updateFailed")}: ${e}`);
    }
  }

  async function ocrImage(item: ClipboardItem) {
    if (item.kind !== "image") return;
    try {
      const text = await invoke<string>("ocr_image", {
        imagePath: item.content,
      });
      debugger;
      if (text) {
        // Create a new text item from OCR result
        await invoke("set_clipboard_item", {
          content: text,
          kind: "text",
          id: null,
        });

        await loadHistory(true);
        showToast(t("toast.ocrSuccess"));

        // Show result in preview
        previewItem.value = {
          content: text,
          kind: "text",
          timestamp: new Date().toISOString(),
          is_sensitive: item.is_sensitive,
          data_type: "text",
        };
      } else {
        showToast(t("toast.ocrEmpty"));
      }
    } catch (e) {
      console.error("OCR failed:", e);
      showToast(t("toast.ocrFailed"));
    }
  }

  return {
    history,
    collections,
    totalCount,
    searchQuery,
    selectedIndex,
    activeFilter,
    activeCollectionId,
    previewItem,
    previewContent,
    filteredHistory,
    loadHistory,
    loadCollections,
    createCollection,
    deleteCollection,
    setItemCollection,
    pasteItem,
    deleteItem,
    toggleSensitive,
    togglePin,
    clearHistory,
    getImageSrc,
    scrollToSelected,
    setupClipboardListeners,
    loadMore,
    isLoading,
    hasMore,
    selectedIds,
    toggleSelection,
    clearSelection,
    pasteStack,
    ocrImage,
    updateItemContent,
    addItem,
  };
}
