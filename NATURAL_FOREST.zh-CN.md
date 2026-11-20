# 自然林地与森林便签

当前实现仅有地图／林地两种视图，保留Explore a forest / Another area、面积关联和行走，替换了森林的显示资产，并提供三个树上发现点及Field notes文字入口。它是网页级示意林地，不是所选网格的实景、树种调查或保护结果。

## 使用

启动生产展示服务后，打开http://127.0.0.1:4173/，点击Explore a forest / Another area。向前走近第一棵树上的纸签，提示从Walk closer变成Read note后，可点击或按E阅读。WASD／方向键或屏幕方向按钮移动，拖动环顾。Field notes仅在林地内提供，可直接阅读全部主题。地图上没有Field notes入口，网格近景已移除。步行速度由1.5提高到3米／秒；Reset position按钮及林地R重置快捷键已移除。

阅读时停止行走和环顾。Escape先关闭阅读卡，继续按即直接返回地图；Back to map也直接返回。返回时恢复原地图视角、图层、选择及旋转状态。关闭后不恢复旧的长按输入，重新按键才能继续移动。换地点时关闭正文，保留本次已打开便签的Read again提示；刷新复位。

## 资产来源与处理

树木枝干和叶片几何由scripts/prepare-natural-forest.mjs确定性生成，是为展示制作的通用阔叶艺术模型，没有测量树高、物种或真实树数。使用两种树型、三种固定空间细节等级：近景每棵5,440个三角形，中景1,144个，远景468个。学习树始终处于近景范围；首版未实现跟随行走距离变化的动态LOD。

照片纹理来自Poly Haven的Island Tree 01及Brown Mud Leaves 01，均为CC0-1.0。仅采用树皮、叶片及地表纹理，没有将约160万三角形的来源glTF树直接放入网站。来源、下载日期和SHA-256见data/raw/natural-forest/acquisition.json及public/forest-natural/manifest.json。纹理作者为Poly Haven所署名的Rob Tuytel、Rico Cilliers等；处理时保留来源记录，不将资产称为婆罗洲本地树种。

Node脚本裁剪同一UV区域的树皮颜色／法线／粗糙度纹理，生成512像素树皮纹理；将四个照片叶片及对应透明蒙版组成512像素图集；地表颜色1024像素，法线／粗糙度512像素。保留UV，颜色纹理使用sRGB，法线和粗糙度使用非颜色空间。模型和纹理合计5,474,767字节，manifest、许可证和教育正文另计，合计仍低于8MB。

阴影采用一盏固定太阳，环境补光与纹理表达遮蔽，布局或密度改变时重新生成阴影，静止不循环重算。林地使用独立平地；地图总览高程显示为12倍。没有修改研究数据或原DEM。

基础布局版本2为160个确定性树位，前3棵是可达学习树。准备时分别检查8／80／160棵树场景从出生点到阅读区域的通路。显示数量仍按2018 FOREST_AT_RISK_HA／100作美术映射；不是实测林冠比例、树数或已经保护的面积。

## 内容与科学边界

public/field-notes.json包含49、52、55词的三个英文主题：Who lives here?、Where is the carbon?、Why monitor a forest?。每条保存SDG议题、官方来源及审核日期。SDG 15.5、13.3、15.2分别用于栖息地、气候教育及森林管理议题，不称为本项目测得的SDG指标。

来源为https://sdgs.un.org/goals/goal15、https://sdgs.un.org/goals/goal13及https://www.fao.org/forestry/sfm/forests-and-climate-change/。正文离线保存，外链仅供进一步阅读。知识条目不是该CELL_ID的物种发现、碳估算或保护成效。主面积文案为2018 forest area assessed；原始字段仍是冻结研究的FOREST_AT_RISK_HA。

## 重建与检查

首次补齐纹理缓存：powershell -NoProfile -File scripts/acquire-natural-forest.ps1。已有缓存且SHA-256一致时不联网。

npm run assets:natural从缓存用Node生成GLB、纹理、固定布局及来源清单；npm run check:natural检查UV、几何面数、资源哈希、预算、学习点及正文。npm run check继续检查全量研究数据和原文件哈希。完成资源或代码修改后npm run build，然后npm start服务生产构建。

npm run test:browser运行当前自然林地和便签检查。原surprise-tests、forest-tests为旧版本回归参考，不代表当前资产或便签验证。浏览器报告为reports/browser-field-notes.json，截图位于.impeccable/review/field-notes。完整60分钟测试仍另行记录，实际展览电脑和真实访客尚需测试。
