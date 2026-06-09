# 构建任务：安全帽合规检测（人 + 帽 组合判定）

> 给 Claude Code 的实现规格。**先读本文件，再动手。**
> 目标：实现“检测不戴安全帽的员工”——双模型检测 person 与 helmet，再做**头部区域空间匹配**，
> 判定每个人是否合规，在结果图上用绿/红框区分并统计违规人数。

---

## 0. 背景与已验证事实（务必先看）

在 `backend/test.jpg`（两名工人：右侧戴黄帽、左侧没戴但手拎白帽）上实测：

| 模型 | person | helmet | head |
|---|---|---|---|
| `weights/helmet.pt`（类别 `{0:helmet,1:head,2:person}`） | ❌ 检不到 | ✅ 0.88 / 0.74（黄帽+手拎白帽都检到） | ❌ 检不到 |
| 通用 COCO `yolov8n.pt` | ✅ 两人均 0.94 | — | — |

结论：
1. `helmet.pt` **只擅长找“安全帽”这个物体**，person/head 召回差 → **person 必须交给通用模型**。
2. 这张图暴露关键难点：左侧工人**手拎一顶白帽**也被检为 helmet。若用“人附近有没有 helmet”判合规会**误判为合规**。
   → 必须用 **“helmet 是否落在 person 的头部区域”** 来判定（手拎的帽在腰/手部高度，自然落选 → 正确判违规）。

参考现有实现：
- 后端 `backend/main.py`：已有 `get_detect_model()`（按 id 懒加载缓存）、`DETECT_MODELS` 注册表、
  `/api/detect-image`、归一化坐标约定、`ENABLE_YOLO` 开关、`_to_float`、落库 `detection_records`。
- 前端 `src/components/pages/Analysis/detect/`：`DetectionOverlay` / `BoundingBox` / `DetectionList`、
  `ImageDetectPanel`（模型下拉、imgsz、置信度、按类别配色 `colorMap`）。
- 约定：归一化坐标贯穿前后端；颜色用现有方案；**字重 ≤ 500**。

---

## 1. 架构：双模型 + 头部区域空间匹配（路线 A）

```
图片
 ├─ person 模型(通用 COCO/YOLO-World) ─► person 框[]
 └─ helmet 模型(weights/helmet.pt)    ─► helmet 框[]（只取 helmet 类）
                    │
                    ▼
        头部区域空间匹配引擎
   每个 person 取头部区域(顶部~30%)，
   判断该区域内是否有 helmet 中心点
                    │
        ┌───────────┴───────────┐
   命中 → 合规(绿)          未命中 → 违规(红)
```

> 这是通用“A_without_B”规则的第一个具体实例。**先做死这一个场景**（安全帽），
> 但代码结构尽量留好扩展位（见第 7 节），便于以后泛化成 NL→规则 DSL。

---

## 2. 后端实现（`backend/main.py`）

### 2.1 模型配置

- **person 模型**：环境变量 `PERSON_MODEL_PATH`，默认 `yolov8n.pt`（已在 backend 目录）。
  用 `from ultralytics import YOLO`，只保留 `person` 类（COCO 索引 0）。
- **helmet 模型**：复用 `weights/helmet.pt`，只取 `helmet` 类（忽略它的 person/head，因为不准）。
- 两个模型都**懒加载缓存**（沿用 `_model_cache` 思路）；`ENABLE_YOLO=false` 或权重缺失 → 503。

可调常量（放模块顶部）：
```python
PERSON_CONF = 0.25       # person 置信度阈值
HELMET_CONF = 0.35       # helmet 阈值（略高，少误检帽子）
HEAD_FRACTION = 0.32     # 头部区域占 person 框高度的比例（顶部）
HEAD_PAD_X = 0.0         # 头部区域水平内缩比例（0=不缩）
```

### 2.2 新接口 `POST /api/detect-helmet-compliance`

表单字段：
- `file`：图片（.jpg/.jpeg/.png）
- `imgsz`：可选，默认 640（小/远目标可调高，复用现有精度档位）
- `zone`：可选，所属区域

处理流程：
1. 读图取尺寸 `(W,H)`。
2. person 模型推理 → 收集 person 框（归一化 xyxy）。
3. helmet 模型推理 → 收集 **helmet 类**框（归一化）。
4. **头部区域**：对每个 person 框 `(x1,y1,x2,y2)`：
   `head = (x1+pad, y1, x2-pad, y1 + HEAD_FRACTION*(y2-y1))`。
5. **匹配**：对每个 helmet，算其中心点 `(cx,cy)`；找“头部区域包含该中心点”的 person。
   一个 helmet 只配给一个 person（若多个候选，选头部区域中心距离最近的）；贪心即可。
   - 备选更稳判据：IoU(helmet, head) > 0.1 或 helmet 中心在 head 内，二选一命中即可。
6. **判定**：person 的头部区域匹配到 ≥1 helmet → `compliant=true`；否则 `false`（违规）。
   helmet 被某 person 头部匹配上 → `worn=true`，否则 `worn=false`（如手拎/地上的帽）。

### 2.3 返回 JSON（坐标归一化 0~1）

```json
{
  "image": { "width": 1600, "height": 1067, "name": "test.jpg" },
  "person_count": 2,
  "compliant_count": 1,
  "violation_count": 1,
  "persons": [
    { "id": 0, "compliant": true,  "confidence": 0.94,
      "matched_helmet_id": 1,
      "box": { "x": 0.55, "y": 0.06, "w": 0.30, "h": 0.90 } },
    { "id": 1, "compliant": false, "confidence": 0.94,
      "matched_helmet_id": null,
      "box": { "x": 0.18, "y": 0.10, "w": 0.30, "h": 0.88 } }
  ],
  "helmets": [
    { "id": 0, "confidence": 0.74, "worn": false, "box": {…} },
    { "id": 1, "confidence": 0.88, "worn": true,  "box": {…} }
  ],
  "record_id": "uuid"
}
```

### 2.4 落库

复用 `detection_records` 表（不新增列）：
- `classes` = `["person","helmet"]`
- `object_count` = `person_count`
- `risk_count` = `violation_count`
- `detections` = 把 persons（带 compliant）与 helmets（带 worn）合并存入，每条加 `role`
  （`"person"` / `"helmet"`）与中文 `label_cn`（合规人员 / 未戴安全帽人员 / 安全帽）。
- 落库失败不阻断返回（沿用现有 try/except）。

### 2.5 错误处理

- 非图片/解析失败 → 400；`ENABLE_YOLO=false` 或任一模型加载失败 → 503（信息进 `detail`）。

---

## 3. 前端实现

### 3.1 接入入口

在「图像识别」Tab 的**模型下拉框**里增加一个特殊项：
`安全帽合规检测（人+帽）`，id 例如 `helmet_compliance`。

- 选中它时：
  - **隐藏**目标选择/AI 解析（这是固定任务，不需要选类别）。
  - 「开始识别」调用 `detectHelmetCompliance(file, { imgsz })`（新 api.js 方法 → `/api/detect-helmet-compliance`）。
  - 置信度滑条对本任务可隐藏或忽略（阈值由后端常量定），imgsz 精度档保留。
- 这个特殊项可由前端**静态加入**下拉（不依赖 `/api/detect-models`），或后端 `/api/detect-models`
  额外返回一项 `{id:"helmet_compliance", name:"安全帽合规检测（人+帽）", kind:"pipeline"}`。二选一，前端静态加更省事。

### 3.2 结果渲染（复用现有叠加组件）

- **person 框**：`compliant` → 绿（`var(--color-primary)`）；`violation` → 红（`var(--color-danger)`）。
  标签条显示「合规」/「未戴安全帽」。
- **helmet 框**：细一点的中性/蓝框（`var(--color-secondary)`），标签「安全帽」+ 置信度；`worn=false`
  的可加“(未佩戴)”。
- 复用 `DetectionOverlay` / `BoundingBox`：把 persons+helmets 转成它能渲染的 `detections` 数组
  （含归一化 `box`、`label_cn`、用于上色的字段）。颜色这里**按合规/角色**给，不走类别 `colorMap`
  （或给 `colorMap` 传入 {合规:绿, 违规:红, 安全帽:蓝}）。
- **右侧列表/统计**：顶部「检测 N 人，合规 M，违规 K」；列表每行一个 person（合规/违规徽章 + 置信度），
  可与框 hover 联动（沿用 `activeId`）。

### 3.3 api.js

```js
export async function detectHelmetCompliance(file, { imgsz, zone } = {}) {
  const form = new FormData();
  form.append("file", file);
  if (imgsz != null) form.append("imgsz", String(imgsz));
  if (zone) form.append("zone", zone);
  return request("/api/detect-helmet-compliance", { method: "POST", body: form });
}
```

---

## 4. 关键判据与参数（实现时注意）

- **头部区域** = person 框顶部 `HEAD_FRACTION`（默认 0.32）高度；必要时水平略缩。
- **匹配判据**：helmet 中心点落在某 person 头部区域内（首选，简单稳）。多候选取最近。
- `HELMET_CONF` 设比 person 高一点（默认 0.35），减少把别的黄色物体当帽子。
- imgsz 调高（960/1280）对远处小目标（人/帽）召回有帮助，复用现有精度档。

---

## 5. 边界情况（要在实现/测试时考虑）

| 情况 | 处理 |
|---|---|
| 手拎/地上的帽（如 test.jpg 左侧白帽） | 不在头部区域 → 不匹配 → 该人正确判违规；helmet `worn=false` |
| 人群重叠、互相遮挡 | 贪心匹配 + 头部区域较小可缓解；接受一定误差 |
| 背对/侧脸、远处小人 | 调高 imgsz；person 漏检则该人不参与判定 |
| 一人多帽候选 | 一顶帽只配一人，按距离最近 |
| person 漏检 | 无法判定该人（宁可不报，不要乱报） |

---

## 6. 完成后自检清单

- [ ] `POST /api/detect-helmet-compliance` 跑通：person 用通用模型、helmet 用 `helmet.pt`，返回归一化结果 + 落库。
- [ ] 用 `backend/test.jpg` 验证：**右侧戴黄帽=合规(绿)，左侧手拎白帽=违规(红)**，`violation_count=1`。
- [ ] 手拎的白帽 `worn=false`，且不导致左侧被误判合规。
- [ ] 前端下拉框可选「安全帽合规检测」，结果图绿/红人框 + 帽框 + 统计正确，hover 联动。
- [ ] `ENABLE_YOLO=false` 或权重缺失返回 503，不崩。
- [ ] 颜色用 CSS 变量、字重 ≤500、复用现有叠加组件；`npm run build` 通过、后端语法通过。

---

## 7. 不在本次范围 / 后续可扩展

- 本次**只做安全帽合规**这一固定管线，不做通用规则 DSL。但请把空间匹配函数写成
  **通用的 `a_without_b(persons, helmets, region="head")`**，方便日后被 NL→规则引擎复用。
- 后续可扩展：反光衣合规、区域闯入（A_in_zone + 多边形）、人员聚集计数、DeepSeek 把自然语言
  翻译成规则 DSL 再调用同一引擎（即之前分析的“路线 C + A”）。
- “帽子戴歪/戴在手肘”等细粒度合规、或彻底开放式判断，可后续引入 VLM 兜底（仅作文字结论，框仍以 YOLO 为准）。
```
