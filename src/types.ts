export interface ClipboardItem {
  id?: number;
  content: string;
  kind: string;
  timestamp: string;
  is_sensitive?: boolean;
  is_pinned?: boolean;
  source_app?: string;
  data_type?: string;
  collection_id?: number;
  note?: string;
  html_content?: string;
}

export interface Collection {
  id: number;
  name: string;
  created_at: string;
}

export interface AppConfig {
  shortcut: string;
  max_history_size: number;
  language: string;
  theme: string;
  sensitive_apps: string[];
  compact_mode?: boolean;
  clear_pinned_on_clear?: boolean;
  clear_collected_on_clear?: boolean;
}
