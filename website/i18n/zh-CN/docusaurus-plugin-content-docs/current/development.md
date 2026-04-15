---
sidebar_position: 4
---

# 开发指南

如果您是开发者，想要为本项目贡献代码或自行构建，请参考以下指南。

## 技术栈

本项目采用现代化的技术栈构建，兼顾性能与开发体验：

- **核心框架**: [Tauri v2](https://v2.tauri.app/) (Rust + Webview)
- **前端框架**: [Vue 3](https://vuejs.org/) + TypeScript
- **样式方案**: [Tailwind CSS v4](https://tailwindcss.com/)
- **UI 组件库**: [Radix Vue](https://www.radix-vue.com/) + [Lucide Icons](https://lucide.dev/)
- **数据库**: SQLite (通过 `rusqlite` 驱动)

## 环境准备

在开始之前，请确保您的开发环境已安装以下工具：

1.  **Rust**: 请通过 [rustup](https://rustup.rs/) 安装最新稳定版。
2.  **Node.js**: 推荐 v20 或更高版本。
3.  **pnpm**: 包管理工具 (`npm install -g pnpm`)。
4.  **系统依赖**:
    - **macOS**: 需要安装 Xcode Command Line Tools (`xcode-select --install`)。
    - **Linux**: 需要安装 `libwebkit2gtk-4.0-dev`, `build-essential`, `curl`, `wget`, `libssl-dev`, `libgtk-3-dev`, `libayatana-appindicator3-dev` 等依赖。

## 快速开始

1.  **克隆仓库**

    ```bash
    git clone https://github.com/tipsxBase/clipboard.git
    cd clipboard
    ```

2.  **安装依赖**

    ```bash
    pnpm install
    ```

3.  **启动开发模式**

    此命令将同时启动前端开发服务器和 Tauri 后端，并启用热重载。

    ```bash
    pnpm tauri dev
    ```

## 构建发布

构建生产环境的应用程序包：

```bash
pnpm tauri build
```

构建产物将位于 `src-tauri/target/release/bundle/` 目录下。

## 目录结构

```
.
├── src/                 # 前端 Vue 源码
│   ├── components/      # UI 组件
│   ├── composables/     # 组合式函数 (Hooks)
│   ├── lib/             # 工具函数
│   └── views/           # 页面视图 (MainWindow, PopupWindow)
├── src-tauri/           # Rust 后端源码
│   ├── src/
│   │   ├── db.rs        # 数据库操作
│   │   ├── monitor.rs   # 剪贴板监听逻辑
│   │   └── ...
│   ├── tauri.conf.json  # Tauri 配置文件
│   └── Cargo.toml       # Rust 依赖配置
└── website/             # 文档网站 (Docusaurus)
```

## 贡献代码

欢迎提交 Pull Request！在提交之前，请确保：

1.  代码通过了类型检查 (`vue-tsc --noEmit`)。
2.  Rust 代码通过了编译 (`cargo check`)。
3.  保持代码风格一致。
