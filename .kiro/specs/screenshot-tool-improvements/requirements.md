# 需求文档 - 截图工具改进

## 简介

本文档定义了对现有截图工具的全面改进需求。该截图工具基于 Tauri v2 + Vue 3 + Fabric.js 构建，已实现基础的多屏幕截图和标注功能。本次改进旨在解决现有的严重问题、中等问题和小问题，使其成为一个功能完整、稳定可靠的截图工具。

## 术语表

- **Screenshot_System**: 整个截图工具系统，包括前端和后端组件
- **Window_Manager**: 负责管理截图窗口生命周期的子系统
- **File_Manager**: 负责管理截图临时文件和持久化文件的子系统
- **Coordinate_System**: 负责处理屏幕坐标转换的子系统
- **Canvas_Renderer**: 负责渲染截图和标注的画布系统
- **Annotation_Tool**: 用户用于标注截图的工具（矩形、椭圆、箭头、画笔、文字等）
- **Capture_Window**: 每个屏幕对应的截图窗口实例
- **Logical_Pixel**: 逻辑像素，与 DPI 无关的坐标单位
- **Physical_Pixel**: 物理像素，实际屏幕像素坐标
- **DPI_Scale_Factor**: 显示器的 DPI 缩放因子
- **Selection_Region**: 用户选择的截图区域
- **Temporary_File**: 截图过程中生成的临时图片文件
- **History_Stack**: 标注操作的撤销/重做历史记录栈

## 需求

### 需求 1: 多屏幕窗口生命周期管理

**用户故事:** 作为用户，我希望截图窗口能够正确管理，以便在多屏幕环境下可以独立关闭单个屏幕的截图窗口或一次性关闭所有窗口。

#### 验收标准

1. WHEN 用户启动截图功能，THE Window_Manager SHALL 为每个屏幕创建一个独立的 Capture_Window
2. WHEN 用户按下 ESC 键，THE Window_Manager SHALL 关闭所有 Capture_Window 并清理相关资源
3. WHEN 用户在某个 Capture_Window 中完成截图，THE Window_Manager SHALL 关闭所有 Capture_Window
4. WHEN 用户点击某个 Capture_Window 的关闭按钮，THE Window_Manager SHALL 仅关闭该 Capture_Window
5. WHEN 所有 Capture_Window 被关闭，THE Window_Manager SHALL 通知后端清理临时文件
6. THE Window_Manager SHALL 维护所有活动 Capture_Window 的引用列表
7. WHEN 窗口关闭失败，THE Window_Manager SHALL 记录错误日志并继续尝试关闭其他窗口

### 需求 2: 临时文件生命周期管理

**用户故事:** 作为用户，我希望截图工具能够自动清理临时文件，以便不会因长期使用而占用大量磁盘空间。

#### 验收标准

1. WHEN Screenshot_System 创建临时截图文件，THE File_Manager SHALL 将文件路径记录到临时文件列表
2. WHEN 用户完成或取消截图操作，THE File_Manager SHALL 删除所有临时截图文件
3. WHEN Screenshot_System 启动，THE File_Manager SHALL 检查并清理超过 24 小时的临时文件
4. THE File_Manager SHALL 使用专用的临时目录存储截图文件
5. WHEN 临时文件删除失败，THE File_Manager SHALL 记录错误日志但不阻塞用户操作
6. THE File_Manager SHALL 在应用退出时清理所有未删除的临时文件
7. WHEN 用户保存截图到剪贴板或文件，THE File_Manager SHALL 在保存完成后立即删除对应的临时文件

### 需求 3: 统一坐标系统

**用户故事:** 作为开发者，我希望系统使用统一的坐标系统，以便在多显示器不同 DPI 环境下准确计算位置和尺寸。

#### 验收标准

1. THE Coordinate_System SHALL 明确区分 Logical_Pixel 和 Physical_Pixel 坐标
2. THE Coordinate_System SHALL 为每个屏幕存储其 DPI_Scale_Factor
3. WHEN 处理鼠标事件，THE Coordinate_System SHALL 将 Logical_Pixel 坐标转换为 Physical_Pixel 坐标
4. WHEN 渲染画布内容，THE Coordinate_System SHALL 使用 Physical_Pixel 坐标
5. WHEN 计算 Selection_Region 边界，THE Coordinate_System SHALL 使用 Physical_Pixel 坐标
6. THE Coordinate_System SHALL 提供坐标转换辅助函数
7. WHEN 在不同 DPI 屏幕间移动窗口，THE Coordinate_System SHALL 正确处理坐标转换

### 需求 4: 简化画布渲染架构

**用户故事:** 作为开发者，我希望简化画布渲染实现，以便降低维护成本并提高性能。

#### 验收标准

1. THE Canvas_Renderer SHALL 使用单一画布层进行标注渲染
2. THE Canvas_Renderer SHALL 使用原生 Canvas API 替代 Fabric.js 进行基础图形绘制
3. WHERE 需要复杂图形编辑功能，THE Canvas_Renderer SHALL 保留 Fabric.js 集成
4. THE Canvas_Renderer SHALL 实现自定义的控制点渲染系统
5. WHEN 用户调整图形大小，THE Canvas_Renderer SHALL 实时更新控制点位置
6. THE Canvas_Renderer SHALL 减少不必要的画布重绘操作
7. THE Canvas_Renderer SHALL 使用离屏画布优化渲染性能

### 需求 5: 性能优化

**用户故事:** 作为用户，我希望截图工具响应迅速，以便流畅地进行标注操作。

#### 验收标准

1. WHEN 用户移动鼠标，THE Screenshot_System SHALL 使用节流机制限制取色操作频率为每 16ms 一次
2. WHEN 用户绘制标注，THE Screenshot_System SHALL 使用防抖机制减少历史记录保存频率
3. THE Screenshot_System SHALL 限制 History_Stack 最大条目数为 50 条
4. WHEN History_Stack 超过限制，THE Screenshot_System SHALL 删除最旧的历史记录
5. THE Screenshot_System SHALL 使用 requestAnimationFrame 优化画布渲染
6. WHEN 加载大尺寸截图，THE Screenshot_System SHALL 使用渐进式加载策略
7. THE Screenshot_System SHALL 避免在鼠标移动事件中调用 getImageData

### 需求 6: 用户体验改进

**用户故事:** 作为用户，我希望截图工具操作直观便捷，以便快速完成截图任务。

#### 验收标准

1. WHEN 用户双击 Selection_Region，THE Screenshot_System SHALL 确认并保存截图
2. WHEN 用户在空白区域双击，THE Screenshot_System SHALL 取消截图操作
3. THE Screenshot_System SHALL 允许用户从任意方向拖动创建 Selection_Region
4. WHEN 用户创建 Selection_Region，THE Screenshot_System SHALL 自动显示标注工具栏
5. THE Screenshot_System SHALL 将工具栏定位在 Selection_Region 下方居中位置
6. WHEN 工具栏超出屏幕边界，THE Screenshot_System SHALL 自动调整工具栏位置
7. THE Screenshot_System SHALL 显示 Selection_Region 的尺寸信息
8. WHEN 用户按住 Shift 键拖动，THE Screenshot_System SHALL 创建正方形 Selection_Region

### 需求 7: 代码质量提升

**用户故事:** 作为开发者，我希望代码库保持高质量，以便于维护和扩展。

#### 验收标准

1. THE Screenshot_System SHALL 使用明确的 TypeScript 类型定义，避免使用 as any 类型断言
2. THE Screenshot_System SHALL 使用统一的语言编写代码注释（中文或英文）
3. THE Screenshot_System SHALL 删除所有未使用的代码和注释
4. THE Screenshot_System SHALL 为所有公共函数提供 JSDoc 注释
5. THE Screenshot_System SHALL 遵循一致的命名约定
6. THE Screenshot_System SHALL 将复杂函数拆分为更小的可测试单元
7. THE Screenshot_System SHALL 使用 ESLint 和 Prettier 保持代码风格一致

### 需求 8: 错误处理和用户反馈

**用户故事:** 作为用户，我希望在操作失败时能够看到清晰的错误提示，以便了解问题并采取相应措施。

#### 验收标准

1. WHEN 截图操作失败，THE Screenshot_System SHALL 显示用户友好的错误提示
2. WHEN 文件保存失败，THE Screenshot_System SHALL 提示用户检查磁盘空间和权限
3. WHEN 屏幕捕获失败，THE Screenshot_System SHALL 记录详细错误日志并提示用户重试
4. THE Screenshot_System SHALL 为所有异步操作添加 try-catch 错误处理
5. WHEN 发生意外错误，THE Screenshot_System SHALL 提供错误报告机制
6. THE Screenshot_System SHALL 在控制台输出详细的调试信息
7. WHEN 操作成功，THE Screenshot_System SHALL 显示简短的成功提示

### 需求 9: 跨平台兼容性

**用户故事:** 作为用户，我希望截图工具在 Windows、macOS 和 Linux 上都能正常工作，以便在不同操作系统上获得一致的体验。

#### 验收标准

1. THE Screenshot_System SHALL 在 macOS 上将窗口层级设置为屏幕保护程序级别
2. THE Screenshot_System SHALL 在 Windows 上将窗口设置为置顶窗口
3. THE Screenshot_System SHALL 在 Linux 上将窗口设置为置顶窗口
4. THE Screenshot_System SHALL 在所有平台上支持窗口透明度
5. WHEN 平台不支持某些窗口特性，THE Screenshot_System SHALL 降级到可用的替代方案
6. THE Screenshot_System SHALL 在所有平台上测试快捷键功能
7. THE Screenshot_System SHALL 处理不同平台的文件路径差异

### 需求 10: 马赛克和模糊工具

**用户故事:** 作为用户，我希望能够对截图中的敏感信息进行马赛克或模糊处理，以便保护隐私。

#### 验收标准

1. THE Screenshot_System SHALL 提供马赛克 Annotation_Tool
2. THE Screenshot_System SHALL 提供模糊 Annotation_Tool
3. WHEN 用户选择马赛克工具并拖动，THE Screenshot_System SHALL 在选定区域应用像素化效果
4. WHEN 用户选择模糊工具并拖动，THE Screenshot_System SHALL 在选定区域应用高斯模糊效果
5. THE Screenshot_System SHALL 允许用户调整马赛克块大小
6. THE Screenshot_System SHALL 允许用户调整模糊强度
7. THE Screenshot_System SHALL 支持对马赛克和模糊区域进行撤销操作

### 需求 11: 截图历史管理

**用户故事:** 作为用户，我希望能够查看和管理最近的截图历史，以便快速访问之前的截图。

#### 验收标准

1. THE Screenshot_System SHALL 保存最近 20 张截图的缩略图和元数据
2. THE Screenshot_System SHALL 提供截图历史查看界面
3. WHEN 用户打开历史界面，THE Screenshot_System SHALL 显示截图缩略图、时间戳和尺寸信息
4. WHEN 用户点击历史记录，THE Screenshot_System SHALL 允许重新编辑或复制到剪贴板
5. THE Screenshot_System SHALL 允许用户删除单个历史记录
6. THE Screenshot_System SHALL 允许用户清空所有历史记录
7. THE Screenshot_System SHALL 在磁盘上持久化截图历史数据

### 需求 12: 快捷键自定义

**用户故事:** 作为用户，我希望能够自定义截图工具的快捷键，以便适应个人使用习惯。

#### 验收标准

1. THE Screenshot_System SHALL 提供快捷键配置界面
2. THE Screenshot_System SHALL 允许用户自定义启动截图的全局快捷键
3. THE Screenshot_System SHALL 允许用户自定义工具切换快捷键
4. THE Screenshot_System SHALL 允许用户自定义确认和取消快捷键
5. WHEN 用户设置的快捷键冲突，THE Screenshot_System SHALL 显示警告提示
6. THE Screenshot_System SHALL 提供恢复默认快捷键的选项
7. THE Screenshot_System SHALL 在配置文件中持久化快捷键设置

### 需求 13: 标注工具增强

**用户故事:** 作为用户，我希望标注工具功能更加丰富，以便更好地表达我的意图。

#### 验收标准

1. THE Screenshot_System SHALL 支持调整标注线条粗细
2. THE Screenshot_System SHALL 支持选择标注颜色
3. THE Screenshot_System SHALL 提供颜色预设选项
4. THE Screenshot_System SHALL 支持文字标注的字体大小调整
5. THE Screenshot_System SHALL 支持文字标注的字体样式选择（粗体、斜体）
6. THE Screenshot_System SHALL 支持箭头样式选择（单向、双向）
7. THE Screenshot_System SHALL 支持图形填充颜色设置

### 需求 14: 截图保存选项

**用户故事:** 作为用户，我希望能够灵活地保存截图，以便满足不同的使用场景。

#### 验收标准

1. WHEN 用户确认截图，THE Screenshot_System SHALL 默认将截图复制到剪贴板
2. THE Screenshot_System SHALL 提供保存到文件的选项
3. THE Screenshot_System SHALL 允许用户选择保存格式（PNG、JPG、WebP）
4. THE Screenshot_System SHALL 允许用户选择保存质量（仅适用于 JPG 和 WebP）
5. THE Screenshot_System SHALL 允许用户选择默认保存路径
6. THE Screenshot_System SHALL 支持自动保存功能
7. WHEN 自动保存启用，THE Screenshot_System SHALL 使用时间戳生成文件名

### 需求 15: 性能监控和诊断

**用户故事:** 作为开发者，我希望能够监控截图工具的性能，以便识别和解决性能瓶颈。

#### 验收标准

1. THE Screenshot_System SHALL 记录截图捕获耗时
2. THE Screenshot_System SHALL 记录图片编码耗时
3. THE Screenshot_System SHALL 记录画布渲染帧率
4. THE Screenshot_System SHALL 记录内存使用情况
5. WHERE 开发模式启用，THE Screenshot_System SHALL 在控制台显示性能指标
6. THE Screenshot_System SHALL 在性能指标异常时记录警告日志
7. THE Screenshot_System SHALL 提供性能诊断报告导出功能

