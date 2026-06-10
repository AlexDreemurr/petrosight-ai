# 遥感底图与坐标换算

本文档说明厂区总览页地图从「虚拟厂区图」改为「HDU 真实卫星图」后，底图、坐标系、经纬度换算、传感器定位、鼠标坐标读数等全部相关机制。

核心文件：[`frontend/src/data/geo.js`](../frontend/src/data/geo.js)（换算工具）。

---

## 一、底图：百度静态图 API 的 HDU 卫星图

综合预览与分区查询的底图是一张固定 PNG —— [`frontend/public/map_img/hdu.png`](../frontend/public/map_img/hdu.png)，由百度地图开放平台的「静态图 API」截取，带卫星/遥感图层。

### 什么是「遥感/卫星图层」

地图软件通常有多种「图层」可切换，百度静态图用 `maptype` 参数控制：

| 图层类型 | 看到的内容 | `maptype` |
|----------|-----------|-----------|
| 普通街道图 | 矢量线条画的路、楼块、文字标注 | `normal`（默认） |
| **卫星/遥感图** | 真实卫星拍摄的地表影像（真实楼顶、树、操场） | `satellite` |

本项目用 `satellite`，因为传感器/人员要叠加在真实地理位置上，需要真实地貌而非抽象线条。

### 下载地址与参数

```
https://api.map.baidu.com/staticimage/v2?ak=你的AK
  &center=120.349678,30.320160   # 图心经纬度（BD09）
  &zoom=18                       # 缩放级别
  &width=640&height=640          # 画幅（API 上限 1024）
  &maptype=satellite             # 卫星/遥感图层
  &scale=2                       # 可选：2 倍像素密度（更清晰，不改变地理范围）
```

> **清晰度**：`width/height` 上限是 1024。想更高清用 `scale=2`（逻辑尺寸不变、实际像素翻倍），此时 `MAP_META` 的 `width/height` 仍填逻辑值（如 640），无需改换算逻辑。

> **网络注意**：大响应（>500KB）在不稳定网络/代理下易被截断，表现为「响应头到了但图片 0 字节」。换稳定网络或先用较小尺寸下载即可。

### 关键约定

`hdu.png` 的下载参数（center / zoom / width / height）**必须**与 [`geo.js`](../frontend/src/data/geo.js) 里的 `MAP_META` 完全一致：

```js
export const MAP_META = {
  center: [120.349678, 30.320160], // 图片中心经纬度（BD09）
  zoom: 18,
  width: 640,
  height: 640,
};
```

这四个参数是把「一张哑像素图」和「地球真实坐标」绑定起来的**地理参照**。换图就必须同步改这里。

---

## 二、坐标系：WGS84 / GCJ-02 / BD09

三种坐标系务必分清，混用会偏移上百米：

| 坐标系 | 谁在用 | 说明 |
|--------|--------|------|
| **WGS84** | GPS、北斗原始输出、遥感影像、国际标准 | 实测设备坐标大概率是这个 |
| **GCJ-02** | 高德、腾讯、Google 中国 | 国测局加密（「火星坐标」） |
| **BD09** | **百度地图（含百度静态图 API）** | 在 GCJ-02 上再加密，本项目地图用的就是它 |

**约定**：传感器/人员坐标统一以 **BD09** 入库（用[百度坐标拾取器](https://api.map.baidu.com/lbsapi/getpoint/index.html)取点即为 BD09）。

若实测坐标是 **WGS84**（GPS/北斗），入库或打点前必须先转 BD09，否则偏移上百米。`geo.js` 提供了 `wgs84ToBd09(lng, lat)`：

```js
import { wgs84ToBd09 } from "../data/geo";
const { lng, lat } = wgs84ToBd09(gpsLng, gpsLat); // → BD09
```

---

## 三、经纬度 → 图片像素：换算原理

地球是球面、图片是平面，中间需要「投影」。把一个 BD09 经纬度画到图上的百分比位置，分三步：

1. **投影**：用百度官方 BD09 墨卡托投影，把经纬度转成「墨卡托米」坐标。
2. **比例尺**：用该 zoom 的「每像素米数」把米偏移换成像素偏移。
3. **定位**：像素偏移叠加到图心像素 `(width/2, height/2)`，再除以画幅转成百分比，喂给 CSS 的 `left%/top%`。

### 关键一：必须用百度自己的投影（不是标准 Web 墨卡托）

百度地图用的是它自己的 **BD09 墨卡托投影**，**经度方向**接近线性（≈111320 米/度），但**纬度方向**用「分纬度带的 6 次多项式」拟合。标准 Web 墨卡托的简化公式在经度上对得上，但纬度会累积出十几~二十米的偏差。

因此 [`geo.js`](../frontend/src/data/geo.js) 内置了百度官方的 `LL2MC` / `MC2LL` 系数表与 `bd09ToMercator` / `mercatorToBd09` 两个转换函数。

### 关键二：分辨率必须用百度的公式（不是标准瓦片常数）

> **百度地图平面坐标以 zoom 18 为基准：zoom 18 时 1 个平面坐标单位 = 1 像素。每升降一级分辨率翻倍/减半。**

而平面坐标（墨卡托米）单位约等于米，故：

```js
// 百度 zoom=z 的每像素米数 = 2^(18 - z)（zoom 18 = 1 米/像素）
const baiduResolution = (zoom) => Math.pow(2, 18 - zoom);
```

⚠️ **这是最容易踩的坑**：若用「百度投影」却配「标准 Web 墨卡托分辨率」（约 0.597 米/像素），两套体系混用会导致**整体缩放偏小约 1.7 倍** —— 表现为「图心准、离中心越远越偏、左右上下对称放大」。必须用 `2^(18-zoom)` 与 BD09 投影配套。

来源参考：
- [百度地图缩放级别与比例尺的关系](https://blog.csdn.net/Boale_H/article/details/119651265)
- [百度地图API详解之地图坐标系统](https://blog.csdn.net/lanximu/article/details/16964967)

### 换算函数

```js
import { lngLatToPercent, percentToLngLat } from "../data/geo";

// 正向：BD09 经纬度 → 底图百分比 {x, y}（喂给 AlertPin 的 left%/top%）
const { x, y } = lngLatToPercent(120.350, 30.321);

// 反向：底图百分比 → BD09 经纬度（鼠标读数用，与正向互为逆运算）
const { lng, lat } = percentToLngLat(x, y);
```

### 微调旋钮 `SCALE`

百度 MC 单位只是「约等于米」，理论公式能到几米级精度，最后一点残差可用 `geo.js` 里的 `SCALE` 常数微调（默认 1，打点太分散调小、太密集调大）。最可靠的定标方式是**实测反推**（见下）。

---

## 四、传感器/人员怎么定位到图上

数据流：后端存 BD09 经纬度 → 前端取出 → `lngLatToPercent` 换成百分比 → 绝对定位在底图上。

涉及文件：

| 环节 | 文件 | 说明 |
|------|------|------|
| 坐标解析 | [`useOverviewData.js`](../frontend/src/hooks/useOverviewData.js) | `resolvePos` 识别中国范围内的真实经纬度则调 `lngLatToPercent`，无坐标则用 id 哈希兜底 |
| 综合预览打点 | [`OverviewMode.jsx`](../frontend/src/components/OverallMap/OverviewMode.jsx) | 底图 `hdu.png` + 按百分比叠加 `AlertPin` |
| 分区区域几何 | [`useOverviewData.js`](../frontend/src/hooks/useOverviewData.js) `buildZones` | 用 `squareBBoxRect` 从该区域所有传感器的投影坐标**自动框出**正方形区域矩形（不再硬编码厂区几何） |
| 分区详情放大 | [`ZoneMode.jsx`](../frontend/src/components/OverallMap/ZoneMode.jsx) | 点开区域后裁剪放大 `hdu.png` 显示该区域，设备按局部坐标打点 |
| 测试数据坐标 | [`generate_mock.py`](../backend/generate_mock.py) | `HDU_ZONE_CENTERS` 定义校区 5 个片区中心（BD09），传感器在片区内散布生成真实经纬度 |

> **底图显示**：地图容器（`Stage`）锁定为正方形（与正方形底图一致），`object-fit: cover` 零裁切零留白，保证红针百分比坐标系与底图完全重合、打点不偏。窄屏（≤1000px）改为宽度驱动正方形，竖向堆叠（地图在上、其他在下）。

---

## 五、鼠标实时经纬度读数

鼠标在地图上移动时，「综合预览/分区查询」切换按钮左侧实时显示当前 BD09 经纬度。

实现：

- [`OverallMap.jsx`](../frontend/src/components/OverallMap/OverallMap.jsx)：持有坐标状态，在工具栏 toggle 左侧渲染 `经度 xxx 纬度 xxx`（窄屏隐藏）。
- [`OverviewMode.jsx`](../frontend/src/components/OverallMap/OverviewMode.jsx) / [`ZoneMode.jsx`](../frontend/src/components/OverallMap/ZoneMode.jsx)：`Stage` 上挂 `onMouseMove` / `onMouseLeave`，把鼠标像素位置换成百分比，调 `percentToLngLat` 得经纬度上报。
- 分区**详情视图**里底图是裁剪放大的，会先把局部坐标映射回整图全局坐标再换算，读数依然正确。

这套读数功能正是「正向换算反着算一遍」，与打点互为逆运算，也是**实测定标的工具**。

---

## 六、换图 / 定标操作手册

### 换一张新底图时

1. 用新的 center/zoom/width/height 调静态图 API 下载，覆盖 [`hdu.png`](../frontend/public/map_img/hdu.png)。
2. 同步修改 [`geo.js`](../frontend/src/data/geo.js) 的 `MAP_META` 为新参数。
3. 若传感器坐标范围变了，相应调整 [`generate_mock.py`](../backend/generate_mock.py) 的 `HDU_ZONE_CENTERS`。

### 发现整体偏移/缩放时如何定标

误差类型可由现象判断：

| 现象 | 误差类型 | 修法 |
|------|----------|------|
| 图心准、离中心越远越偏、左右上下对称 | **缩放（分辨率）** | 检查 `baiduResolution` 是否为 `2^(18-zoom)`；残差用 `SCALE` 微调 |
| 各处偏移量基本一致（含图心） | **固定偏移** | 微调 `MAP_META.center` |

**实测反推流程**（比任何文档都可靠）：

1. 鼠标悬停在能精确辨认的地标上，记下 app 读数；
2. 在[百度拾取器](https://lbsyun.baidu.com/maptool/getpoint)找同一点，记下真值；
3. 取**相距较远**的多个点（如地图四角），点越远测量噪声占比越小；
4. 对比 app 读数与真值：差值随距离增长 → 缩放问题；差值恒定 → 偏移问题；据此调 `SCALE` 或 `center`。

> 本项目的换算经实测验证：经度比例尺与实测推算一致，纬度为经度的约 1.15 倍（符合「1 度纬度≈111km、此纬度 1 度经度≈96km」的物理比值）。

---

## 七、为什么不直接用 Leaflet 动态地图

静态图方案需要自己处理「下载受限、清晰度、cover 裁切、坐标换算、定标」等问题，本质是「用一张死图当地图」的代价。

若改用 **Leaflet（react-leaflet）+ 百度卫星瓦片**：地图天然可拖动缩放、任意清晰度，传感器用经纬度直接打点（连本文的换算都不用自己写，库自动处理）。改造量更大但一劳永逸。当前项目选静态图是为了贴合既有「一张图 + 百分比打点」的架构、改动最小。
