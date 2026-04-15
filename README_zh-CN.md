# 剪贴板管理器 (Clipboard Manager)

一个基于 **Rust (Tauri v2)** 和 **Vue 3** 构建的轻量、安全且现代化的剪贴板管理工具。

![License](https://img.shields.io/badge/license-GPL--3.0-blue.svg)
![Tauri](https://img.shields.io/badge/Tauri-v2-orange.svg)
![Vue](https://img.shields.io/badge/Vue-3-green.svg)

[🌐 官网与文档](https://tipsxBase.github.io/clipboard/)

## ✨ 功能特性

- **📋 历史记录管理**: 自动记录复制到剪贴板的文本和图片。
- **🔍 智能搜索**: 通过全文搜索快速查找剪贴板历史。
- **🖼️ 图片支持**: 直接查看并粘贴历史记录中的图片。
- **📸 截图工具**: 内置截图工具，支持标注（矩形、椭圆、箭头、画笔、文字）。
- **🔒 隐私优先**:
  - **敏感数据检测**: 手动标记敏感项目或配置敏感应用。
  - **应用过滤**: 忽略特定应用（如密码管理器）的剪贴板变更。
  - **仅内存存储**: 敏感项目可以标记为不持久化到磁盘。
- **📌 置顶功能**: 将重要项目置顶，防止被自动清理。
- **⚡ 高性能**: 针对大文本内容进行了懒加载优化。
- **📚 粘贴队列**: 按顺序复制多项内容，然后依次粘贴（非常适合填表）。
- **📝 OCR 文字识别**: 直接从历史记录的图片中提取文字 (支持 macOS 和 Windows)。
- **📏 紧凑模式**: 更高密度的列表视图，展示更多内容。
- **⌨️ 键盘驱动**: 支持 Vim 风格导航 (`j`/`k`) 和全局快捷键。
- **🌍 国际化**: 支持英文和简体中文。
- **🚀 开机自启**: 支持系统登录时自动启动。

## 🎮 使用指南

### 全局快捷键

- **打开剪贴板历史**: `Cmd+Shift+V` (macOS) 或 `Ctrl+Shift+V` (Windows/Linux) - _默认设置，可在设置中修改。_
- **截图**: 触发截图模式，捕获并标注屏幕内容。

### 截图工具

内置的截图工具允许您捕获、标注和保存截图：

1. **触发截图**: 使用配置的快捷键或菜单选项。
2. **选择区域**: 点击并拖动以选择要捕获的区域。
3. **标注**: 使用工具栏添加标注：
   - **矩形** / **椭圆** / **箭头**: 绘制形状
   - **画笔**: 自由绘制
   - **文字**: 添加文字标注
4. **保存**: 按 `Enter` 或点击勾选按钮将截图保存到剪贴板。
5. **取消**: 按 `Esc` 或点击 X 按钮取消。

> **macOS 用户注意**: 首次使用时，macOS 会请求**屏幕录制**权限。请在"系统设置 > 隐私与安全性 > 屏幕录制"中授予权限，然后重启应用。

### 导航操作 (弹窗界面)

- **选择项目**: `↑` / `↓` 或 `Ctrl+n` / `Ctrl+p` 或 `Ctrl+j` / `Ctrl+k` (Vim 风格)
- **粘贴项目**: `Enter`
- **多选 (粘贴队列)**: 按 `x` 键或 `Cmd+点击` 选择多项。按 `Enter` 启动队列，然后使用全局快捷键依次粘贴。
- **预览详情**: `Space` (空格键，再次按下关闭)
- **OCR (图片预览)**: 在预览模式下，点击“提取文字”按钮即可识别并复制文字。
- **关闭/返回**: `Esc`

### 数据存储

您的剪贴板历史和设置存储在本地：

- **macOS**: `~/.clipboard-manager/`
- **Windows/Linux**: `~/.clipboard-manager/`

```
~/.clipboard-manager/
├── config.json      # 用户设置
├── history.db       # 加密的剪贴板历史 (AES-GCM)
├── secret.key       # 加密密钥
├── images/          # 剪贴板图片历史
└── captures/        # 保存的截图
```

> **注意**: 数据库使用 AES-GCM 加密存储，保障数据安全。

## 🛠️ 技术栈

- **后端**: Rust, Tauri v2, SQLite
- **前端**: Vue 3, TypeScript, Tailwind CSS v4
- **UI 组件**: Radix Vue, Lucide Icons

## 🚀 快速开始

### 前置要求

- [Node.js](https://nodejs.org/) (v18+)
- [pnpm](https://pnpm.io/)
- [Rust](https://www.rust-lang.org/) (最新稳定版)

### 安装步骤

1. 克隆仓库:

   ```bash
   git clone https://github.com/yourusername/clipboard.git
   cd clipboard
   ```

2. 安装前端依赖:

   ```bash
   pnpm install
   ```

3. 运行开发服务器:

   ```bash
   pnpm tauri dev
   ```

### 构建发布

构建生产环境应用程序:

```bash
pnpm tauri build
```

可执行文件将位于 `src-tauri/target/release/bundle/` 目录下。

## 📝 许可证

本项目采用 **GNU General Public License v3.0** 许可证。详情请参阅 [LICENSE](LICENSE) 文件。

## 🤝 贡献

欢迎提交 Pull Request 来贡献代码！
