# SideTale

SideTale 是一款面向桌面端的本地小说阅读器，支持 TXT / Markdown / EPUB 导入、章节化阅读、独立悬浮小窗、全局快捷键与防截屏。应用基于 Tauri 2 + React 构建，主要面向 Windows。

小窗可以在工作时置顶显示，主窗口关闭后隐藏到系统托盘，阅读进度在主窗口和小窗之间实时同步。

## 功能特性

### 书库

- 支持导入 `.txt`、`.md`、`.markdown`、`.epub`，可一次选择多个文件
- TXT 自动识别 UTF-8 / UTF-8 BOM / UTF-16LE / UTF-16BE，无法按 UTF-8 解码时回退到 GB18030（兼容 GBK / GB2312）
- 根据「第 X 章 / 回 / 节 / 卷」「序章」「楔子」「番外」「Chapter N」等标题自动分章；Markdown 额外识别 `#` 标题
- 未识别到章节时整本书作为「全文」导入；首个标题之前的较长内容会单独成为「前言」
- 从正文前 4000 字中尝试提取「作者：xxx」
- 自动生成封面配色、展示章节数、文件大小、阅读进度与导入日期
- 支持从书库删除书籍

### 阅读

- 主窗口阅读页支持章节目录弹层、上一章 / 下一章、返回书库
- 正文字号、行间距可在设置中调整
- 底部显示当前章节序号与本章阅读进度百分比
- 阅读位置按「书 + 章节」保存，切换章节或重新打开后回到原来的滚动位置，滚动时防抖落盘

### 悬浮小窗

- 独立 400×340 透明无边框窗口，默认置顶、不显示在任务栏，首次打开时定位到屏幕右下角
- 可在小窗内切换书籍和章节、拖动顶部区域移动窗口
- 小窗拥有独立的外观设置：背景透明度、文字透明度、文字颜色（预设色 + 自定义取色）
- 顶部按钮和下拉菜单会根据自定义文字颜色自动调整对比度
- 小窗与主窗口共享当前书籍 / 章节，滚动进度双向同步
- 打开 / 隐藏使用系统的无过渡动画切换（Windows 上关闭了 DWM 过渡效果）

### 全局快捷键

| 功能 | 默认快捷键 | 生效范围 |
| --- | --- | --- |
| 上一章 | `1` | 主窗口阅读页、小窗 |
| 下一章 | `2` | 主窗口阅读页、小窗 |
| 显示小窗 | `Ctrl + Shift + 3` | 系统全局 |
| 隐藏小窗 | `Ctrl + Shift + 4` | 系统全局 |

- 显示 / 隐藏小窗通过 `tauri-plugin-global-shortcut` 注册为系统级热键，小窗或主窗口失焦后依然可用
- 快捷键可在设置页重新录制，支持单键与组合键
- 全局热键注册失败时会自动回滚到上一组有效热键，并在界面提示
- 旧版本保存的单键 `3` / `4` 会自动迁移为新的组合键，避免全局热键拦截其它软件的数字输入

### 隐私保护

- 开启后对主窗口和小窗调用 Windows `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)`，使其它软件的截屏 / 录屏无法捕获窗口内容
- 需要 Windows 10 2004 及以上版本

### 系统托盘

- 关闭主窗口不会退出进程，而是隐藏到系统托盘
- 托盘菜单提供「显示主窗口」「打开小窗」「退出 SideTale」
- 左键点击托盘图标恢复主窗口
- 在 Windows 11 上会尝试把托盘图标标记为常驻显示，避免被折叠进「隐藏的图标」

## 技术栈

- **桌面框架**：Tauri 2（Rust）
- **前端**：React 19、TypeScript、Vite 7
- **UI**：HeroUI、Tailwind CSS 4、lucide-react
- **EPUB 解析**：JSZip + DOMParser（前端解析后交给 Rust 保存）
- **Rust 依赖**：serde / serde_json、encoding_rs、regex、uuid、base64、tauri-plugin-dialog、tauri-plugin-global-shortcut、winreg
- **包管理器**：pnpm

## 目录结构

```
SideTale/
├── index.html                  # 主窗口入口
├── mini.html                   # 小窗入口
├── vite.config.ts              # Vite 配置（开发端口 1431，HMR 1432）
├── src/
│   ├── main.tsx                # 主窗口渲染入口
│   ├── mini.tsx                # 小窗渲染入口
│   ├── App.tsx                 # 主窗口布局、页面路由、快捷键与全局热键同步
│   ├── styles.css              # 全局样式、滚动区域与窗口根节点约束
│   ├── components/
│   │   └── Sidebar.tsx         # 侧边导航、隐私状态、打开小窗入口
│   ├── pages/
│   │   ├── LibraryPage.tsx     # 书库列表、导入、删除
│   │   ├── ReaderPage.tsx      # 阅读页、目录、章节切换、进度展示
│   │   └── SettingsPage.tsx    # 隐私、小窗外观、排版、快捷键设置
│   ├── mini/
│   │   └── MiniReader.tsx      # 小窗阅读界面与独立外观设置
│   └── lib/
│       ├── api.ts              # 所有 Tauri 命令的类型化封装
│       ├── epub.ts             # EPUB 解析
│       ├── format.ts           # 封面配色、文件大小、日期、段落拆分
│       ├── progress.ts         # 按章节的阅读位置存储与跨窗口同步
│       ├── reader.ts           # 当前书籍 / 章节状态与跨窗口同步
│       └── settings.ts         # 设置存储、快捷键解析与跨窗口同步
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs              # Tauri 启动、命令注册、托盘、全局热键、窗口控制
│   │   ├── books.rs            # 书库存储、TXT/Markdown 导入与分章、进度落盘
│   │   └── privacy.rs          # Windows 防截屏
│   ├── capabilities/default.json
│   ├── tauri.conf.json
│   └── Cargo.toml
├── samples/                    # 测试用小说文本
├── release/                    # 手动打包产物归档（不提交 Git）
└── dist/                       # 前端构建输出（不提交 Git）
```

## 环境要求

- Windows 10 2004 及以上（防截屏功能所需；其余功能在更低版本也可用）
- Node.js 20+
- pnpm
- Rust stable（包含 `x86_64-pc-windows-msvc` 工具链）
- Windows WebView2 Runtime（Windows 10/11 通常已内置）

## 开发

```bash
pnpm install
pnpm dev
```

`pnpm dev` 会先启动 Vite 前端开发服务器，再启动 Tauri 窗口。

- 前端端口固定为 `1431`，HMR 端口为 `1432`，配置位于 `vite.config.ts` 与 `src-tauri/tauri.conf.json` 的 `devUrl`
- 仅调试前端时可运行 `pnpm dev:web`，然后访问 `http://localhost:1431`
- 项目统一使用 pnpm，不使用 npm / yarn

### 常用命令

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 启动完整桌面应用开发环境 |
| `pnpm dev:web` | 只启动 Vite 前端开发服务器 |
| `pnpm build:web` | TypeScript 类型检查 + 构建前端资源到 `dist/` |
| `pnpm build` | 构建并打包桌面应用 |
| `pnpm preview` | 预览前端构建结果 |
| `cargo test`（在 `src-tauri/` 下） | 运行 Rust 单元测试（分章、GBK 导入等） |

## 构建与产物

```bash
pnpm build
```

Tauri 会将产物输出到 `src-tauri/target/release`：

| 产物 | 路径 |
| --- | --- |
| 免安装可执行文件 | `src-tauri/target/release/sidetale.exe` |
| NSIS 安装程序 | `src-tauri/target/release/bundle/nsis/SideTale_<version>_x64-setup.exe` |
| MSI 安装包 | `src-tauri/target/release/bundle/msi/SideTale_<version>_x64_en-US.msi` |

### 产物归档约定

每次手动打包完成后，必须把本次构建的产物复制一份到项目根目录的 `release/`，便于直接检查和分发，至少包括：

- NSIS 安装程序 `SideTale_<version>_x64-setup.exe`
- MSI 安装包 `SideTale_<version>_x64_en-US.msi`
- 免安装可执行文件 `sidetale.exe`

复制时保持原文件名并覆盖 `release/` 中的旧版本。`release/` 已在 `.gitignore` 中忽略，不随仓库提交。

## 数据存储

### 书库数据（Rust 后端）

目录位于 Tauri 的应用数据目录（Windows 下通常是 `%APPDATA%\com.sidetale.app`）：

```
%APPDATA%\com.sidetale.app\
├── library\<bookId>.json   # 书籍元信息：标题、作者、章节数、进度、来源路径等
└── books\<bookId>.json     # 书籍正文：按章节保存的标题与内容
```

- 元信息与正文分开存储，书库列表只读取体积较小的元信息
- 写入使用临时文件 + 重命名的原子替换方式
- Rust 端最多缓存 2 本书的正文，减少重复读取
- TXT / Markdown 单文件限制 256MB；EPUB 读取限制 128MB

### 前端状态（localStorage）

| Key | 内容 |
| --- | --- |
| `sidetale:settings` | 隐私、小窗外观、排版、快捷键设置 |
| `sidetale:reader` | 当前打开的书籍与章节索引 |
| `sidetale:positions:<bookId>` | 每本书按章节保存的阅读位置比例 |

主窗口与小窗之间通过 Tauri 事件同步：

- `sidetale://settings`：设置变更
- `sidetale://reader`：当前书籍 / 章节变更
- `sidetale://position`：滚动位置变更

## 书籍格式与解析规则

### TXT / Markdown

1. 按 BOM 判断 UTF-8 / UTF-16，否则先尝试 UTF-8，失败后按 GB18030 解码
2. 统一换行符并去除 BOM
3. 按章节标题正则切分，标题长度限制 60 字以内，且不以句号、逗号等行文标点结尾
4. Markdown 额外把 `#` 开头的行视为标题
5. 没有任何标题时整本作为「全文」

### EPUB

1. 前端用 JSZip 解压，读取 `META-INF/container.xml` 找到 OPF 清单
2. 读取书名、作者与 spine 中的章节顺序
3. 逐个解析 XHTML 页面，提取 `h1`~`h6` 等标题和 `p` / `li` / `blockquote` 等文本块
4. 解析结果通过 `save_parsed_book` 命令交给 Rust 保存

## Windows 平台相关实现

- 防截屏：`SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)`
- 关闭窗口过渡动画：`DwmSetWindowAttribute(DWMWA_TRANSITIONS_FORCEDISABLED)`
- 托盘图标常驻：读写 `HKCU\Control Panel\NotifyIconSettings` 的 `IsPromoted`
- 全局热键：`tauri-plugin-global-shortcut`（Windows 下基于 `RegisterHotKey`）

## 常见问题

### `pnpm dev` 提示端口 1431 被占用

通常是上一次异常退出留下了 Vite 进程，可清理后重试：

```powershell
Get-NetTCPConnection -LocalPort 1431 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

### 小窗失焦后快捷键失效

显示 / 隐藏小窗必须注册为系统全局热键，而不是只在窗口内监听。相关逻辑在 `src-tauri/src/lib.rs` 的 `set_mini_hotkeys`。

### 主窗口可以整页向下滚动

根节点（`html` / `body` / `#root`）必须禁止文档级滚动，只允许书库、阅读区、设置内容等内部容器滚动，见 `src/styles.css`。

## 开发约定

- 依赖管理与脚本统一使用 pnpm
- 不创建备份文件（如 `.bak`、时间戳副本），直接修改目标文件
- 面向用户的文案避免使用「摸鱼」等字样
- 主窗口关闭只隐藏到托盘，不退出进程
- 小窗显示 / 隐藏必须瞬时完成，无过渡动画
- 每次手动打包后按上文约定归档产物到 `release/`

## 许可证

[MIT](LICENSE)
