# 构建任务：厂区总览页（Overview）

## 背景

Overview 页面目前只有一张贴图，需要实现完整的三区域布局和所有子组件。
数据全部使用 mock 数据，不对接后端接口。

---

## 页面整体布局

```
┌─────────────────────────────────────────────────┐
│  OverallMap（左，约65%宽）  │  AlertFeed（右，约35%宽）  │
│                             │                           │
│                             │                           │
├─────────────────────────────────────────────────┤
│               StatusBox（横跨全宽）                      │
└─────────────────────────────────────────────────┘
```

---

## 组件一：OverallMap

文件路径：`src/components/OverallMap/index.jsx`

### 功能概述

地图组件，顶部有一个 Toggle 切换两种模式：**综合预览** / **分区查询**。

---

### 模式一：综合预览（OverviewMode）

文件：`src/components/OverallMap/OverviewMode.jsx`

- 底图用一张工厂俯视图 PNG（`/public/factory-map.png`，如果不存在则用深色渐变矩形占位）
- 从 mock 数据中读取异常事件，在对应坐标位置渲染**红针（AlertPin）**
- 红针样式：红色圆点 + 向上的细线，圆点上方显示 2-4 个字的简要标题（如"气体超标"）
- 红针交互：
  - **悬浮（hover）**：显示 tooltip，内容包括标题、区域、严重程度、时间
  - **点击**：显示详情弹窗（DevicePopup），内容包括完整 detail 描述、传感器 ID、当前值+单位
- 严重程度不同颜色：`danger` → `#E24B4A`，`warning` → `#EF9F27`，`info` → `#378ADD`

---

### 模式二：分区查询（ZoneMode）

文件：`src/components/OverallMap/ZoneMode.jsx`

- 同样使用工厂底图，底图上用 SVG `<polygon>` 覆盖绘制各区域边界
- 每个区域显示区域名称和当前状态颜色（danger/warning/normal）
- 点击某个区域 → 进入该区域的**区域详情视图**：
  - 显示该区域的放大示意图（可用带标注的占位图）
  - 列出该区域所有传感器/设备，每个设备是一个可点击的图标
  - 点击设备图标 → DevicePopup 弹出该设备的当前状态、最近一条记录

---

### 子组件

**AlertPin**（`src/components/OverallMap/AlertPin.jsx`）
- Props: `x, y`（百分比坐标）, `severity`, `title`, `data`（完整事件对象）
- 绝对定位在底图上

**DevicePopup**（`src/components/OverallMap/DevicePopup.jsx`）
- Props: `data`（事件或设备对象）, `onClose`
- 固定在地图区域内，有关闭按钮

---

## 组件二：AlertFeed

文件路径：`src/components/AlertFeed/index.jsx`

### 功能概述

右侧实时消息流，显示所有告警事件的列表，支持筛选。

### 子组件

**FilterBar**（`src/components/AlertFeed/FilterBar.jsx`）

两组筛选器，均为多选 Tag 按钮样式：

- **按严重程度**：`十分紧急`（danger）/ `紧急`（warning）/ `一般`（info）
- **按类别**：`气体泄漏`（gas）/ `高温异常`（thermal）/ `设备故障`（device）/ `不规范操作`（behavior）/ `传感器故障`（sensor）

默认全部选中（全部显示），点击某个 Tag 取消选中则过滤掉该类。

**AlertItem**（`src/components/AlertFeed/AlertItem.jsx`）

单条消息卡片，包含：
- 左侧色条（颜色对应 severity）
- 严重程度 Badge
- 类别 Badge
- 标题（粗体）
- 简要描述（一行，超出省略）
- 右下角时间戳

列表从上到下按时间倒序排列，最新的在最上面。

---

## 组件三：StatusBox

文件路径：`src/components/StatusBox/index.jsx`

### 功能概述

横跨全宽的状态栏，显示石化厂当前关键参数，一行横向排列多张参数卡片。

### 参数卡片内容（从 mock 数据读取）

每张卡片包含：标签名、当前值、单位、状态颜色

默认展示以下参数：

| 标签 | 示例值 | 单位 | 说明 |
|---|---|---|---|
| 平均气体浓度 | 127 | ppm | 超过200为warning |
| 最高区域温度 | 312 | °C | 超过400为danger |
| 在线设备数 | 48 | 台 | 低于40为warning |
| 活跃无人机 | 3 | 架 | 正常显示 |
| 今日告警总数 | 12 | 次 | 超过20为warning |
| 系统运行时长 | 99.8 | % | 低于95为warning |

---

## Mock 数据

创建文件 `src/data/mock.js`，包含以下数据结构：

```js
// 告警事件列表（AlertFeed 和 OverallMap 共用）
export const alerts = [
  {
    id: 1,
    severity: "danger",           // danger / warning / info
    category: "gas",              // gas / thermal / device / behavior / sensor
    title: "气体浓度超标",
    detail: "传感器 GAS-03 在 A区-常压蒸馏 检测到 H₂S 浓度 423ppm，超出安全阈值",
    sensor_id: "GAS-03",
    zone: "A区-常压蒸馏",
    value: 423,
    unit: "ppm",
    position: { x: 32, y: 45 },  // 在底图上的百分比坐标
    time: "2026-06-01 14:23:11",
  },
  // 共 8-10 条，覆盖不同 severity 和 category
]

// 区域列表（ZoneMode 用）
export const zones = [
  {
    id: "A",
    name: "A区-常压蒸馏",
    status: "danger",
    // SVG polygon 坐标点（百分比）
    points: "10,10 40,10 40,50 10,50",
    devices: [
      { id: "GAS-01", type: "gas", name: "甲烷传感器", status: "normal", value: 99.9, unit: "ppm" },
      { id: "THM-01", type: "thermal", name: "红外热成像", status: "danger", value: 418.4, unit: "°C" },
    ]
  },
  // 共 5 个区域，覆盖 A-E 区
]

// 状态参数（StatusBox 用）
export const statusParams = [
  { label: "平均气体浓度", value: 127, unit: "ppm", status: "normal" },
  { label: "最高区域温度", value: 312, unit: "°C", status: "warning" },
  { label: "在线设备数",   value: 48,  unit: "台",  status: "normal" },
  { label: "活跃无人机",   value: 3,   unit: "架",  status: "normal" },
  { label: "今日告警总数", value: 12,  unit: "次",  status: "normal" },
  { label: "系统运行时长", value: 99.8,unit: "%",   status: "normal" },
]
```

---

## 样式要求

严格沿用已有的 CSS 变量，不要引入新的颜色值：

```
--bg-base: #05080F
--bg-surface: #080D18
--bg-card: #0E1624
--color-primary: #1D9E75
--color-secondary: #378ADD
--color-danger: #E24B4A
--color-warning: #EF9F27
--color-text: 主文字色
--color-text-secondary: 次要文字色
```

字体同样沿用已有定义：Rajdhani / Space Grotesk / JetBrains Mono / Noto Sans SC。

---

## 不需要做的

- 不对接任何后端接口，全部用 mock 数据
- 不做真实地图（Leaflet/Mapbox），用 PNG 底图 + SVG 叠加即可
- 不做实时数据刷新（WebSocket 等）
- 不改动其他页面（Analysis / History / Assessment）

---

## 完成后确认清单

- [ ] Overview 页面呈现三区域布局（OverallMap + AlertFeed 上方，StatusBox 下方）
- [ ] OverallMap 可以在"综合预览"和"分区查询"之间切换
- [ ] 综合预览模式下红针可 hover 和点击
- [ ] 分区查询模式下区域可点击进入详情
- [ ] AlertFeed 筛选器可以按 severity 和 category 过滤消息
- [ ] StatusBox 展示至少 5 个参数卡片
- [ ] 所有颜色来自已有 CSS 变量
