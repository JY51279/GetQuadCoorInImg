# QuadTool

QuadTool 是一个仅在本地使用的标准集四边形坐标标注工具，使用 Electron、Vue 3 和 Vite 构建。目前支持 DBR、DDN、DLR 三类 JSON 数据集。

## 主要功能

- 加载并识别 DBR、DDN、DLR 数据集。
- 根据 JSON 文件位置解析相对图片路径，也支持绝对路径。
- 浏览数据集图片、查看已有四边形，并通过点击图片选择坐标点。
- 修改或删除当前高亮项，也可以在当前图片的数据末尾添加新项。
- 使用一个点修改已有四边形时，只替换距离该点最近的原坐标点。
- 放大图片后显示像素网格和取色预览；连续缩放期间暂停过程帧绘制，结束后恢复清晰画面。
- 支持 JPEG、PNG、GIF、BMP、WebP、SVG、ICO、TIFF 和 SVGZ；TIFF、SVGZ 会先通过 Sharp 转换为 PNG。
- 大图片通过带请求编号的分片传递到渲染进程，过期请求的响应不会混入当前图片。
- 使用临时文件和替换操作保存 JSON，减少写入中断导致原文件损坏的风险。

所有文件都在本机读取和保存，工具不依赖网络服务。

## 使用流程

1. 点击 `Get JsonFile` 选择数据集 JSON。
2. 工具检查数据结构，解析图片路径并打开第一张可用图片。
3. 在图片上点击以添加坐标点；再次点击已有标点可以删除该点，最多同时选择四个点。
4. 在右侧 JSON 区域选择标注项，然后使用 `Mod JsonItem`、`Del JsonItem` 或 `Add JsonItem`。
5. 成功执行数据操作后，JSON 会自动保存到原文件。

加载 JSON 时会先执行只读校验。缺失字段、数量值和连续编号等无损规范化会自动保存；删除无效图片项、把非法坐标重置为零等有损修复会先列出具体数据路径并请求确认。确认后，工具会先在应用数据目录创建临时备份，再替换原文件；备份保留 7 天，到期后会在应用运行期间或下次启动时自动删除。取消则不会修改文件，也不会加载修复后的数据集。

## 快捷键

| 快捷键         | 操作                           |
| -------------- | ------------------------------ |
| `W` / `↑`      | 上一个 JSON 标注项             |
| `S` / `↓`      | 下一个 JSON 标注项             |
| `A` / `←`      | 上一张图片                     |
| `D` / `→`      | 下一张图片                     |
| `Ctrl+S`       | 修改当前高亮项                 |
| `Ctrl+D`       | 删除当前高亮项                 |
| `Ctrl+A`       | 在当前图片的数据末尾添加标注项 |
| `C`            | 清空提示信息                   |
| `Ctrl+C`       | 清空当前选择的坐标点           |
| `R`            | 重置图片位置                   |
| `Ctrl+R`       | 重置数据中的 `No.` 值          |
| `Q`            | 切换当前高亮四边形的显示状态   |
| `Ctrl+Q`       | 隐藏全部四边形                 |
| `Ctrl+Shift+Q` | 显示全部四边形                 |
| `Tab`          | 切换普通视图和像素网格模式     |
| `1`–`9`        | 删除相应序号的当前标点         |

在输入框中输入内容时，全局快捷键不会触发。

## 安装和开发

推荐使用 Node.js 22。首次安装或依赖发生变化时执行：

```powershell
npm ci
```

启动开发模式：

```powershell
npm run dev
```

开发服务器支持渲染端热更新。若安装依赖时遇到 `EPERM` 或文件占用错误，请先关闭正在运行的 QuadTool、Electron 开发进程和相关终端。

## 检查和测试

```powershell
npm test               # 运行 Vitest 单元测试
npm run lint:check     # 检查 ESLint 错误，不修改文件
npm run format:check   # 检查受管理文件的格式，不修改文件
npm run check          # 依次运行测试、静态检查和生产构建
```

自动修复命令：

```powershell
npm run lint
npm run format
```

`format` 只处理项目源码、配置和文档；构建产物、依赖、测试数据以及图片资源已被排除。

## 构建和打包

```powershell
npm run build          # 构建到 out，不生成安装包
npm run start          # 运行已经构建好的版本
npm run build:unpack   # 生成未安装版程序目录
npm run build:win      # 生成 Windows 安装程序
```

Windows 打包结果通常位于 `dist`。项目同时保留了 `build:mac` 和 `build:linux` 命令，但需要对应的构建环境。

## 项目结构

```text
src/
├─ main/
│  ├─ index.js                 Electron 主进程入口
│  ├─ IpcHandlers.js           文件选择、图片读取和保存相关 IPC
│  ├─ FileOperations.js        路径、JSON 读取和原子保存
│  └─ ImageFileReader.js       图片读取、分片和 TIFF 转换
├─ preload/
│  └─ index.js                 向渲染端暴露 Electron API
└─ renderer/src/
   ├─ components/
   │  ├─ WindowProcess.vue     页面与数据/图片加载流程编排
   │  ├─ ImageView.vue         图片画布、缩放、标点和四边形显示
   │  ├─ JsonView.vue          当前图片 JSON 内容显示
   │  └─ Help.vue              快捷键帮助面板
   ├─ state/
   │  └─ DatasetState.js       数据集运行状态和标注增删改
   └─ utils/                   数据校验、坐标换算和绘制辅助模块
tests/                         核心逻辑回归测试
```

这个项目面向个人本地使用，当前结构以直接、容易定位为原则，不额外引入路由、全局状态框架或服务端组件。
