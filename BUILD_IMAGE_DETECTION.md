# 构建任务：异常图像识别功能（YOLO）

> 给 Claude Code 的实现规格。**先读本文件，再动手**。本功能在「数据分析」页（`/analysis`）
> 增加“图像识别”：上传图片 → 后端 YOLO 推理 → 返回检测结果 → 前端在图片上叠加检测框，
> 并把每次识别落库一条记录。

---

## 0. 背景与现状（必须先理解）

- 前端：React 19 + Vite + styled-components + react-router。深色主题，颜色/字体全部用
  `src/GlobalStyles.jsx` 里的 CSS 变量；**字重最大 500，禁止 600/700**。
- 图标统一走 `src/components/Icon/Icon.jsx`（`<Icon id="..." />`，基于 lucide-react）。
- API 封装在 `src/api.js`，统一用 `request()`，错误抛 `body.detail`。
- 后端：`backend/main.py`（FastAPI + Supabase + httpx）。已有接口：
  `/api/register-sensors`、`/api/upload-excel`、`/api/analyze`、`/api/history`、
  `/api/records`、`/api/sensors`。已有 `ALLOWED_SENSOR_TYPES` / `ALLOWED_CATEGORIES`
  常量与 `_to_float` 工具，沿用其风格（带 `summary`/`description`/`tags` 的路由装饰器 +
  规范 docstring）。
- 数据库：Supabase(Postgres)，3 张表（`sensors`/`sensor_records`/`analysis_records`），
  schema 在 `database/schema.sql`，**真实库带 CHECK 约束**（见该文件与 `claudeContext`）。
- 现状痛点：`/analysis` 页已经堆了「传感器注册 + 数据快照 + AI 分析」，再加“图像识别”
  会很乱 → **本任务要先把该页改成带子导航的索引式布局**。

参考实现风格：`src/components/OverallMap/AlertPin.jsx`（绝对定位 + hover tooltip）、
`src/components/pages/Assessment/TrendChart.jsx`（纯 SVG + 悬浮）。检测框叠加可借鉴它们。

---

## 1. 目标拆解

1. **前端导航重构**：`/analysis` 改为顶部子导航（Tab）索引，分 3 个模块：
   - 「数据接入」：传感器注册 + 数据快照上传（即现有的 ① ②）
   - 「AI 安全分析」：现有 AI 分析块
   - 「图像识别」：新功能
2. **后端开放词表检测接口** `POST /api/detect-image`：接收图片 + 目标词列表 →
   `YOLO-World/YOLOE.set_classes()` 按提示词检测 → 返回归一化检测框 → 落库。**本期纯检测，不接 LLM。**
3. **数据库**：新增 `detection_records` 表，并同步更新 `database/schema.sql`。
4. **前端图像识别 UI**：上传图片 + 在原图上叠加检测框小组件 + 检测结果列表。

---

## 2. 前端导航重构（Part A）

文件：`src/components/pages/Analysis/AnalysisPage.jsx`

- 在页面标题下方放一个 **子导航 Tab 组**（3 个）：`数据接入 / AI 安全分析 / 图像识别`。
  - 用受控 state `const [tab, setTab] = useState("ingest")`，按 `tab` 切换主体内容。
  - Tab 样式参考 `OverallMap.jsx` 里的胶囊 Toggle 或 `AssessmentPage.jsx` 的
    `GroupToggle`（保持视觉一致）。每个 Tab 配一个 `<Icon>`（如 `upload`/`analysis`/
    一个相机或眼睛类图标——需要时在 `Icon.jsx` 注册新 id，用 lucide 里的 `Camera`/`ScanEye`）。
- 把现有三块按归属拆进对应 Tab，**保留全部已有功能与状态**（注册、快照、AI 分析、时间段筛选）。
- 子模块切换不丢状态：state 仍提升在 `AnalysisPage`，只是条件渲染。
- 顶部可放一行 `StepHint` 简述当前模块用途，做“引导”。

> 不要新建路由，仍是同一个 `/analysis`，只是页内 Tab。

---

## 3. 后端 YOLO 接口（Part B）—— 开放词表 + 纯检测

文件：`backend/main.py`（新增路由）；依赖加到 `backend/requirements.txt`。

> 方案已定：用 **YOLO-World / YOLOE 开放词表检测器**，**提示词（目标词列表）直接作为检测
> 类别**，中间不经过 LLM（DeepSeek 的前置路由/后置解读为「后续可选」，见 3.5，本期不做）。

### 3.1 依赖与模型

- 依赖：`ultralytics`、`pillow`、`numpy`、`clip`（YOLO-World 需要，ultralytics 会带）。
- 模型：**开放词表权重**，支持 `set_classes(text_list)` 即时定义类别：
  - 用 `from ultralytics import YOLOWorld; model = YOLOWorld(path)`，
    默认权重 `yolov8s-worldv2.pt`（ultralytics 首次自动下载）；
  - 或新一代 `YOLOE`（`yoloe-11s-seg.pt` 等），二选一即可。
  - 用环境变量 `YOLO_OPEN_MODEL` 指定权重路径，默认 `yolov8s-worldv2.pt`。
- **懒加载单例**：首次请求时加载并缓存（不要在 import 时加载，避免启动慢/部署内存峰值）。CPU 推理即可。
- 开关 `ENABLE_YOLO`（默认 true）；加载失败 / 关闭时接口**返回 503 友好错误**，绝不拖垮现有服务。
- ⚠️ 部署：开放词表模型 + torch + CLIP 体积/内存更大，Render 免费层很可能跑不动 →
  线上默认可把 `ENABLE_YOLO=false`，本地开发用。

### 3.2 提示词 → 检测类别（开放词表，纯检测，无 LLM）

- 请求里带一个**目标词列表**（前端传 `classes`，见 3.3），直接：
  ```python
  model.set_classes(classes)   # 例如 ["person", "fire", "smoke", "helmet", "car"]
  results = model.predict(img, conf=conf)
  ```
- ⚠️ **开放词表的文本编码器（CLIP）对英文最稳**。所以：
  - 约定 `classes` 传**英文短语**；
  - 中文展示交给前端的「预设目标」芯片做 中文↔英文 映射（见 Part D）；
  - 后端再维护一份**最小英文→中文兜底映射** `LABEL_CN`（找不到就回退英文原词）。
- 若 `classes` 为空：用一组**默认目标** `DEFAULT_CLASSES`（如
  `["person","fire","smoke","helmet","car","truck"]`）。
- **风险判定（无 LLM 版）**：维护一个关键词集合
  `RISK_CLASSES = {"fire","smoke","no helmet","no-helmet","spill","leak"}`，
  命中即 `risk=true`（前端红色），否则普通（蓝色）。这个集合放模块常量、可改。

### 3.3 接口契约

`POST /api/detect-image`（multipart/form-data）：
- `file`：图片（必填）
- `classes`：JSON 字符串数组，如 `["person","fire"]`（可空 → 用默认）
- `conf`：置信度阈值（可选，默认 0.25）
- `zone`：可选，所属区域

**校验**：仅接受 `.jpg/.jpeg/.png`；限制大小（如 ≤ 10MB）；解析失败 → 400。

**返回 JSON（坐标归一化 0~1，杜绝缩放误差）**：

```json
{
  "image": { "width": 1920, "height": 1080, "name": "cam12.jpg" },
  "classes_used": ["person", "fire"],
  "count": 3,
  "risk_count": 1,
  "detections": [
    {
      "id": 0,
      "label": "fire",              // set_classes 里的英文目标词
      "label_cn": "明火",            // LABEL_CN 兜底映射，找不到回退英文
      "confidence": 0.91,
      "risk": true,                  // 命中 RISK_CLASSES
      "box": { "x": 0.41, "y": 0.22, "w": 0.12, "h": 0.34 }  // 归一化 左上角+宽高
    }
  ],
  "record_id": "uuid"
}
```

- `box` = **归一化左上角 (x,y) + 宽高 (w,h)**，全部 ∈ [0,1]，前端乘渲染尺寸即可。
- 处理流程：读图取尺寸 → `set_classes(classes)` → `predict(conf)` → 遍历 `boxes.xyxyn`
  （ultralytics 直接给归一化 xyxy，转成 x/y/w/h）→ 组装 → 落库 → 返回。

### 3.4 错误处理

- 非图片格式 / 解析失败 → `HTTPException(400)`。
- 模型未启用 / 加载失败 → `HTTPException(503, "图像识别服务不可用：<原因>")`。
- 错误信息放 `detail`，前端 `request()` 会直接显示。

### 3.5 （后续可选，本期不做）DeepSeek 增强层

预留、先不实现，但接口设计留好口子：
- **检测前**：DeepSeek 把自然语言（"看看有没有人没戴安全帽和明火"）解析成
  `classes` + `conf` + `risk_rules`，再喂给 `set_classes`。
- **检测后**：把检测结果 + 原始诉求回灌 DeepSeek，生成风险结论/处置建议，接入现有 AI 分析。
- 实现时新增字段 `prompt`（自然语言）即可，不破坏现有 `classes` 直传链路。

---

## 4. 数据库（Part C）

### 4.1 新表 `detection_records`

在 `database/schema.sql` 增加，并保持与现有表相同的风格（`DISABLE ROW LEVEL SECURITY`）：

```sql
CREATE TABLE IF NOT EXISTS public.detection_records (
    id           UUID       PRIMARY KEY DEFAULT gen_random_uuid(),
    image_name   VARCHAR,                         -- 原图文件名
    image_w      INTEGER,                         -- 原图宽（px）
    image_h      INTEGER,                         -- 原图高（px）
    zone         VARCHAR,                         -- 可选，所属区域
    classes      JSONB,                           -- 本次使用的开放词表目标词列表
    object_count INTEGER    DEFAULT 0,            -- 检测到的目标总数
    risk_count   INTEGER    DEFAULT 0,            -- 风险目标数
    detections   JSONB,                           -- 完整检测结果数组（同接口返回的 detections）
    created_at   TIMESTAMP  DEFAULT NOW()
);
ALTER TABLE public.detection_records DISABLE ROW LEVEL SECURITY;
```

> 预留：3.5 的 DeepSeek 增强落地时再加 `prompt TEXT`（自然语言原文）列。

- 不存图片二进制。`detections` 存 JSONB（归一化坐标），便于历史回看时复现框。
- 落库放在返回前：`supabase.table("detection_records").insert({...}).execute()`，
  取回 `id` 放进响应的 `record_id`。
- 同步更新 `claudeContext`/`docs/database.md`（如果还在用）记录新表。
- （可选）历史日志页 `/history` 后续可加“图像识别记录”分区——本任务不强制，但接口要为它留好数据。

---

## 5. 前端图像识别 UI（Part D）

### 5.1 api.js

新增：

```js
export async function detectImage(file, { classes = [], conf, zone } = {}) {
  const form = new FormData();
  form.append("file", file);
  form.append("classes", JSON.stringify(classes)); // 英文目标词数组
  if (conf != null) form.append("conf", String(conf));
  if (zone) form.append("zone", zone);
  return request("/api/detect-image", { method: "POST", body: form });
}
```

### 5.2 组件清单（放 `src/components/pages/Analysis/detect/` 下）

1. **`ImageDetectPanel.jsx`** —— 「图像识别」Tab 的主体。
   - **目标选择区（提示词）**：开放词表的核心交互。
     - 一组**预设目标芯片**（中文显示 / 英文 prompt），可多选，如
       `人员→person`、`明火→fire`、`烟雾→smoke`、`安全帽→helmet`、`车辆→car`、`卡车→truck`；
       维护一个 `PRESET_TARGETS = [{cn, en}]` 常量。
     - 一个**自由输入框**：允许补充自定义英文目标词（逗号/换行分隔）。
     - 提示文案说明“开放词表用英文最准，可点预设或自己输英文”。
     - 最终把选中的英文词数组通过 `detectImage(file, { classes })` 提交。
   - 上传区（拖拽/点击，复用 `AnalysisPage` 现有 DropZone 风格 + 上传中 Spinner + 文件名）。
   - 选中图片后用 `URL.createObjectURL(file)` 本地预览；点“开始识别”后带上选中的目标词请求。
   - 渲染 `<DetectionOverlay image=预览URL detections=... />` + `<DetectionList />`。
   - 加载/错误状态处理（与其它块一致）；记得 `URL.revokeObjectURL` 清理。

2. **`DetectionOverlay.jsx`** —— 原图 + 检测框叠加容器。
   - 结构：相对定位容器 `position: relative`，里面 `<img style="display:block; width:100%; height:auto">`，
     检测框为绝对定位子元素。
   - **定位公式**（归一化坐标 → 百分比，天然自适应）：
     `left: box.x*100%`，`top: box.y*100%`，`width: box.w*100%`，`height: box.h*100%`。
   - 颜色：`risk` → `var(--color-danger)`，非 risk → `var(--color-secondary)`；
     也可按置信度调透明度。
   - hover 某个框高亮并显示 tooltip（标签_cn + 置信度），可联动 `DetectionList`。
   - 框上方一个小标签条显示 `label_cn confidence`（参考 `AlertPin` 的 Label）。

3. **`BoundingBox.jsx`** —— 单个检测框（被 `DetectionOverlay` 复用）。
   - Props：`det`（单条检测）、`active`、`onHover`。
   - 一个带边框的矩形 + 顶部标签条 + hover tooltip。边框 2px，半透明填充（如 `背景色 + 0.12 alpha`）。

4. **`DetectionList.jsx`** —— 右侧/下方结果列表。
   - 每行：序号 + 中文标签 + 原始类别 + 置信度（进度条或百分比）+ 风险徽章。
   - hover 行 ↔ 高亮对应框（共享 `activeId` state，提升到 `ImageDetectPanel`）。
   - 顶部统计：`检测到 N 个目标，其中 M 个风险`。

### 5.3 样式约束（务必遵守）

- 只用 `GlobalStyles` 的 CSS 变量配色，不要引入新色值。
- **字重最大 500**。
- 圆角用 `var(--radius-default)`；卡片底色 `var(--bg-card-alpha)` / `var(--bg-card)`。
- 图标用 `<Icon>`；需要新图标在 `Icon.jsx` 注册（lucide 的 `Camera` / `ScanLine` / `Box`）。
- tooltip / 悬浮层风格参考 `AlertPin.jsx`、`TrendChart.jsx`。

---

## 6. 完成后自检清单

- [ ] `/analysis` 顶部出现 3 个子导航 Tab，切换不丢失各自状态；原有注册/快照/AI 分析全部保留可用。
- [ ] 「图像识别」Tab 有目标选择（预设芯片 + 自由英文输入），选中的目标词作为开放词表类别提交。
- [ ] `POST /api/detect-image` 接收图片 + `classes`，用 `set_classes()` 按提示词检测，
      返回归一化检测框 JSON，并在 `detection_records` 落一条记录（含 `classes`）。
- [ ] 开放词表模型懒加载单例；`ENABLE_YOLO=false` 或加载失败时返回 503 而非崩溃。
- [ ] 不同目标词能改变检测对象（例如只选“明火/烟雾”时不再框人）。
- [ ] 上传图片后，前端在原图上准确叠加检测框（缩放窗口仍对齐，因为用百分比）。
- [ ] 框/列表 hover 联动高亮，tooltip 显示中文标签 + 置信度。
- [ ] 风险类红色、普通类蓝色；统计数字正确。
- [ ] 所有新样式用 CSS 变量、字重 ≤ 500、复用 `Icon`。
- [ ] `database/schema.sql` 增加 `detection_records` 表；`requirements.txt` 增加 YOLO 依赖。
- [ ] `frontend` `npm run build` 通过；`backend` `python -c "import ast"` 语法通过。

---

## 7. 不在本次范围 / 注意事项

- **本期纯检测**：不接 DeepSeek 前置路由/后置解读（3.5 已留口子，后续再做）。
- 检测内核用**开放词表 YOLO-World/YOLOE**，靠 `set_classes(目标词)` 让提示词决定检测对象；
  不要求训练自定义模型。后续若要更稳的“未戴安全帽/明火/烟雾”，可换自训练权重 + 调 `RISK_CLASSES`。
- 开放词表文本编码器对**英文**最稳：`classes` 传英文，中文仅用于前端展示（预设芯片做中↔英映射）。
- 不强制把图片存进 Supabase Storage（MVP 用浏览器本地预览 + DB 只存检测 JSON + classes）。
  以后要在历史页回看带框图片，再加 Storage 上传并存 URL。
- ⚠️ Render 免费层资源有限，开放词表模型 + torch + CLIP 偏重：提供 `ENABLE_YOLO` 开关，
  本地开发可用、线上按需关闭，避免拖垮现有服务。
- 坐标一律**归一化**贯穿前后端，杜绝像素缩放误差（过去坐标对不齐踩过的坑）。
- 提交前自测：选不同目标词上传同一张图，确认检测对象随提示词变化、框位置正确、列表统计与 DB 记录一致。
