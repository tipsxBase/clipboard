import type { ShortcutConfig, ScreenshotConfig } from '../types';

/**
 * 配置管理器类
 * 负责管理用户配置和快捷键
 */
export class ConfigManager {
  private config: ScreenshotConfig | null = null;
  private configCallbacks: Array<(config: ScreenshotConfig) => void> = [];

  /**
   * 默认配置
   */
  private defaultConfig: ScreenshotConfig = {
    shortcuts: {
      startCapture: 'Ctrl+Shift+A',
      confirmCapture: 'Enter',
      cancelCapture: 'Escape',
      toolRect: 'R',
      toolEllipse: 'O',
      toolArrow: 'A',
      toolPen: 'P',
      toolText: 'T',
      toolMosaic: 'M',
      toolBlur: 'B',
      undo: 'Ctrl+Z',
      redo: 'Ctrl+Shift+Z',
    },
    saveOptions: {
      defaultFormat: 'png',
      defaultQuality: 90,
      defaultPath: '',
      autoSave: false,
      copyToClipboard: true,
    },
    maxHistorySize: 50,
    maxScreenshotHistory: 20,
  };

  /**
   * 加载配置
   */
  async loadConfig(): Promise<ScreenshotConfig> {
    try {
      // 从本地存储加载
      const stored = localStorage.getItem('screenshot_config');
      if (stored) {
        this.config = JSON.parse(stored);
        console.log('Config loaded from localStorage');
      } else {
        this.config = { ...this.defaultConfig };
        await this.saveConfig(this.config);
      }
    } catch (error) {
      console.error('Failed to load config:', error);
      this.config = { ...this.defaultConfig };
    }

    return this.config;
  }

  /**
   * 保存配置
   * @param config 配置对象
   */
  async saveConfig(config: ScreenshotConfig): Promise<void> {
    try {
      // 验证配置
      const validatedConfig = this.validateConfig(config);

      // 保存到本地存储
      localStorage.setItem('screenshot_config', JSON.stringify(validatedConfig));

      this.config = validatedConfig;

      // 触发回调
      this.configCallbacks.forEach((callback) => {
        try {
          callback(validatedConfig);
        } catch (error) {
          console.error('Error in config callback:', error);
        }
      });

      console.log('Config saved successfully');
    } catch (error) {
      console.error('Failed to save config:', error);
      throw error;
    }
  }

  /**
   * 更新部分配置
   * @param updates 配置更新
   */
  async updateConfig(updates: Partial<ScreenshotConfig>): Promise<void> {
    if (!this.config) {
      await this.loadConfig();
    }

    const newConfig = {
      ...this.config!,
      ...updates,
      shortcuts: {
        ...this.config!.shortcuts,
        ...(updates.shortcuts || {}),
      },
      saveOptions: {
        ...this.config!.saveOptions,
        ...(updates.saveOptions || {}),
      },
    };

    await this.saveConfig(newConfig);
  }

  /**
   * 重置为默认配置
   */
  async resetToDefaults(): Promise<void> {
    await this.saveConfig({ ...this.defaultConfig });
    console.log('Config reset to defaults');
  }

  /**
   * 获取当前配置
   * @returns 配置对象
   */
  getConfig(): ScreenshotConfig {
    return this.config ? { ...this.config } : { ...this.defaultConfig };
  }

  /**
   * 获取默认配置
   * @returns 默认配置对象
   */
  getDefaults(): ScreenshotConfig {
    return { ...this.defaultConfig };
  }

  /**
   * 验证快捷键
   * @param shortcut 快捷键字符串
   * @returns 是否有效
   */
  validateShortcut(shortcut: string): boolean {
    // 快捷键格式：Ctrl+Shift+A, Cmd+Shift+A, Alt+A, 单个字母等
    const pattern = /^(Ctrl|Cmd|Alt|Shift|\w)(\+(Ctrl|Cmd|Alt|Shift|\w))*$/;
    return pattern.test(shortcut);
  }

  /**
   * 检测快捷键冲突
   * @param shortcuts 快捷键配置
   * @returns 冲突的快捷键数组
   */
  detectShortcutConflicts(shortcuts: ShortcutConfig): string[] {
    const conflicts: string[] = [];
    const seen = new Map<string, string>();

    Object.entries(shortcuts).forEach(([key, value]) => {
      if (seen.has(value)) {
        conflicts.push(`${key} 和 ${seen.get(value)} 使用了相同的快捷键: ${value}`);
      } else {
        seen.set(value, key);
      }
    });

    return conflicts;
  }

  /**
   * 验证配置
   * @param config 配置对象
   * @returns 验证后的配置
   */
  private validateConfig(config: ScreenshotConfig): ScreenshotConfig {
    // 验证快捷键
    Object.entries(config.shortcuts).forEach(([key, value]) => {
      if (!this.validateShortcut(value)) {
        console.warn(`Invalid shortcut for ${key}: ${value}, using default`);
        config.shortcuts[key as keyof ShortcutConfig] =
          this.defaultConfig.shortcuts[key as keyof ShortcutConfig];
      }
    });

    // 检测冲突
    const conflicts = this.detectShortcutConflicts(config.shortcuts);
    if (conflicts.length > 0) {
      console.warn('Shortcut conflicts detected:', conflicts);
    }

    // 验证保存选项
    if (config.saveOptions.defaultQuality < 0 || config.saveOptions.defaultQuality > 100) {
      config.saveOptions.defaultQuality = 90;
    }

    if (!['png', 'jpg', 'webp'].includes(config.saveOptions.defaultFormat)) {
      config.saveOptions.defaultFormat = 'png';
    }

    // 验证历史记录大小
    if (config.maxHistorySize < 1 || config.maxHistorySize > 100) {
      config.maxHistorySize = 50;
    }

    if (config.maxScreenshotHistory < 1 || config.maxScreenshotHistory > 50) {
      config.maxScreenshotHistory = 20;
    }

    return config;
  }

  /**
   * 注册配置变更回调
   * @param callback 回调函数
   * @returns 取消注册函数
   */
  onConfigChange(callback: (config: ScreenshotConfig) => void): () => void {
    this.configCallbacks.push(callback);
    return () => {
      const index = this.configCallbacks.indexOf(callback);
      if (index !== -1) {
        this.configCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * 导出配置
   * @returns 配置 JSON 字符串
   */
  exportConfig(): string {
    return JSON.stringify(this.config || this.defaultConfig, null, 2);
  }

  /**
   * 导入配置
   * @param configJson 配置 JSON 字符串
   */
  async importConfig(configJson: string): Promise<void> {
    try {
      const config = JSON.parse(configJson);
      await this.saveConfig(config);
      console.log('Config imported successfully');
    } catch (error) {
      console.error('Failed to import config:', error);
      throw new Error('Invalid config format');
    }
  }

  /**
   * 获取快捷键描述
   * @param shortcut 快捷键字符串
   * @returns 描述字符串
   */
  getShortcutDescription(shortcut: string): string {
    // 将快捷键转换为更友好的描述
    return shortcut
      .replace('Ctrl', '⌃')
      .replace('Cmd', '⌘')
      .replace('Alt', '⌥')
      .replace('Shift', '⇧')
      .replace('+', ' + ');
  }
}

// 导出单例实例
export const configManager = new ConfigManager();
