本轮体验优化：地图改为小幅慢转，支持减少动态效果；Explore a forest进入，Another area换区域。新增可见专题切换、场景观察引导、步行边界提示，并改善近景树干UV与光照。

# MLBorneo 本地展览网站

2026-10-29更新：自然树木、照片材质、地面与静态树影，以及三张可走近阅读的森林便签已实现。Explore a forest / Another area进入后向前走近纸签，点击或按E阅读；Field notes仅在林地内显示。阅读时停止移动，Esc先关闭正文，再返回地图。当前资产、来源与操作详见NATURAL_FOREST.zh-CN.md。

当前版本保留旋转地图，点击Explore a forest / Another area即可直接进入一个真实研究网格对应的林地示意，不需要知道或输入网格编号。在林地里再次点击Explore a forest / Another area可换一个位置。林地疏密以2018森林风险面积作美术映射，树的位置和形态仍是示意；这不是已保护面积、实测树木数量或实景重建。A/B选择与两次揭示没有恢复。原始研究文件保持只读。

## 启动

安装Node.js 22.12或更新版本后，双击Start-Exhibition.cmd，在浏览器打开 http://127.0.0.1:4173/ 。启动器服务dist生产构建，保持窗口运行即可离线展示，可按F11全屏。不要直接双击index.html。

也可以在本项目目录运行：

```powershell
npm start
```

另一台电脑需要复制dist、scripts/serve.mjs和Start-Exhibition.cmd并保留目录结构，安装Node.js即可；展示不需要node_modules、Parquet或下载缓存。端口占用时运行node scripts/serve.mjs --port 4174。默认仅接受本机访问，需要受控局域网访问时显式加入--lan。

## 进入、移动与返回

打开http://127.0.0.1:4173/，点击Explore a forest / Another area直接进入。也可以手动点击地图上的真实研究网格，再点击Enter forest illustration直接进入。网格近景已移除。地图不显示Field notes；林地内仍可走近便签或从Field notes阅读。

示意密度按FOREST_AT_RISK_HA／100映射，标准版最多160棵树、64株灌木；不由优先百分位、冻结监测分配或后来观察转化决定。Explore a forest / Another area在有数据且符合资格的四个面积区间中选择，并尽量换一个区间，因此不是代表性随机抽样。没有森林面积记录的网格可查看地图和缺失状态，但不生成关联林地。

桌面可按WASD／方向键行走，也可用鼠标按住画面下方的方向按钮；按住画面拖动环顾。触屏按住方向按钮移动，拖动其余画面环顾。步行速度为3米／秒，是原来的两倍。Reset position按钮和林地R重置快捷键已移除，无跳跃、冲刺或自动前进。失焦、切后台、触摸取消或松开方向按钮都会停止移动。示意范围为中心50×50米，树干有简单碰撞约束。

Back to map直接恢复之前的总览相机、图层、所选网格与旋转状态。Escape先关闭便签，再直接返回地图。Cell data中保留真实的研究年份、森林风险面积、优先百分位、冻结分配、观察转化及数据状态；缺记录不会补为零。森林场景持续标明tree positions are schematic。

地图获得焦点时，Space控制旋转，R恢复当前视角，T俯视，+／−缩放，P／C切换排序／观察转化，F森林，M平面，L低配。林地不提供手动位置重置，地图快捷键不生效；每次重新进入或使用Explore a forest / Another area时从起点开始。输入框和按钮保留正常键盘操作。刷新恢复初始地图。

WebGL不可用时平面地图仍能选择网格和缩放，林地入口禁用并解释原因。模型缺失或损坏时直接返回地图，保留所选网格并提供Retry forest illustration；不会用随机模型替代。所有访客资源位于dist，本地运行不请求外部模型或瓦片。

## 开发与准备资源

依赖锁文件为package-lock.json。首次安装需联网：

```powershell
npm ci
npm run dev
```

开发服务器不用于最终展示。修改后运行npm run build，再运行npm start。npm run check检查TypeScript、全量研究值与坐标关系、来源文件哈希及林地模型许可证／哈希／固定布局。

npm run data:prepare重新准备研究与地理资源；已有完整缓存时可加-- --offline。npm run data:prepare -- --study-only复用地理背景并重建研究资源。npm run assets:forest仅从data/raw/kenney_nature-kit.zip提取五个模型并生成固定布局；本地缺少压缩包时脚本尝试下载官方来源。完成后必须重新构建。此过程不修改原始研究文件。

npm run test:browser运行当前Explore a forest / Another area、源面积关联、四种视口、键盘、模型失败及平面回退检查，要求展示服务已启动，并在Windows安装Microsoft Edge。npm run test:soak默认运行完整60分钟，记录走动、环顾与地图／林地直接往返；不要关闭服务或进程。旧的编号查询、A/B及纯地图脚本仍保留作历史记录，不能用作当前入口验收。

npm run package:exhibition将当前dist、启动器、许可证、说明和验证报告打成release/MLBorneo-Exhibition.zip，并解压校验每个文件的SHA-256。该命令不重新构建；代码或资源修改后须先构建。包内build-manifest.json的longRunPassed仅在当前完整60分钟记录无错误且资源哈希未改变时为true。

## 数据与署名

真实地理数据与示意环境的边界见DATA_NOTES.zh-CN.md。当前自然树为项目制作的轻量几何，照片纹理来自Poly Haven，CC0；详见NATURAL_FOREST.zh-CN.md及dist/forest-natural/LICENSE.txt。Kenney文件保留为历史资产记录。森林背景是JRC TMF v1_2025对2018的历史重建，独立于冻结研究；优先百分位不是损失概率，观察转化也不证明已经避免损失。

已执行与未执行的检查分别记录在VALIDATION.zh-CN.md。报告与截图位于reports和.impeccable/review/forest。实际展示电脑尚未确定，开发机器上的帧率和稳定性结果不能直接当作现场硬件保证。
