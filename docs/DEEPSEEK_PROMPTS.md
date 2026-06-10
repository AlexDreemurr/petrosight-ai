# DeepSeek 提示词汇总

> 本项目所有调用 DeepSeek API 的提示词（Prompt）及调用参数汇总。
> 模型统一为 `deepseek-chat`，接口 `https://api.deepseek.com/v1/chat/completions`。
> 全部为**单轮、单条 `user` 消息**（无 system 角色、无多轮对话）。
> 源码位置：`backend/main.py`。

| # | 用途 | 接口 | temperature | max_tokens | 超时 |
|---|------|------|:-:|:-:|:-:|
| 1 | 安全分析报告 | `POST /api/analyze` | 0.7 | 2000 | 90s |
| 2 | 自然语言 → 检测任务 | `POST /api/parse-detect-targets` | 0 | 200 | 30s |
| 3 | 检测结果一句话摘要 | `POST /api/summarize-detection` | 0.3 | 120 | 30s |

设计上的几个共同点：
- **结构化输出靠提示词约束**：路由任务用 `temperature=0` + "只输出 JSON"，摘要用"只输出一句话，不要 markdown"。
- **数据直接进 prompt**：分析报告把数据库原始记录转成 CSV 整段塞进提示词，让模型基于真实数据推理，而非二次聚合后的摘要。
- **容错**：摘要接口任何异常都返回空串，由前端用本地模板兜底，保证不卡。

---

## 1. 安全分析报告（`/api/analyze`）

把数据库中（可按时间段/区域过滤的）传感器原始记录转成 CSV，连同用户问题交给 DeepSeek 生成 Markdown 安全分析报告。这是项目「AI 数据分析」的核心。

**参数**：`temperature=0.7`、`max_tokens=2000`、`timeout=90s`。

**提示词模板**（`{scope}`/`{csv_text}`/`{user_prompt}` 为运行时填充）：

```
你是一名石化厂区安全分析专家。以下是待分析的传感器原始数据{scope}（CSV格式）：

{csv_text}

请根据以上数据完成以下分析：
1. 按区域归纳异常情况，重点说明哪个区域问题最集中
2. 按传感器类型分析，哪类传感器出现异常最多
3. 列出最需要立即处理的事件（error 级别）
4. 给出整体安全评估和处理建议

用户的具体问题是：{user_prompt 或 "请对当前传感器数据进行全面安全分析"}
```

**占位说明**
- `{scope}`：数据范围提示。指定了时间段 →「（数据时间范围：起 ~ 止）」；否则 →「（数据范围：数据库中全部记录）」。
- `{csv_text}`：`sensor_records` 查出的原始记录转 CSV，列为
  `recorded_at, zone, sensor_id, category, value, unit, severity, title, detail`；无数据时为「（无可用原始数据）」。
- `{user_prompt}`：用户在前端输入的分析任务描述；留空则用默认全面分析提示。

**输出**：Markdown 文本（前端用 `react-markdown` 渲染），并持久化到 `analysis_records` 表。

---

## 2. 自然语言 → 检测任务规划（`/api/parse-detect-targets`）

图像/视频识别的「AI 智能识别」入口：把用户的自然语言意图，解析成"用哪个检测任务 + 检测哪些目标"。

**参数**：`temperature=0`（要求确定性）、`max_tokens=200`、`timeout=30s`。

**提示词**（`{text}` 为用户输入）：

```
你是石化厂区视觉检测的任务规划器。判断用户意图并只输出一个 JSON 对象：
1) 若想检查【工人是否佩戴安全帽 / 安全帽合规 / 有没有人没戴安全帽】，输出 {"task":"helmet_compliance"}。
2) 若想分析【道路车流 / 是否拥堵 / 交通是否堵车】，输出 {"task":"traffic"}。
3) 否则输出 {"task":"open","classes":[英文目标词...]}，classes 为简洁的小写英文名词（适合 YOLO-World 开放词表），可含必要同义词。
不要输出任何解释或多余文字。
示例："工人有没有戴安全帽" -> {"task":"helmet_compliance"}
示例："这条路堵不堵" -> {"task":"traffic"}
示例："看看有没有车和卡车" -> {"task":"open","classes":["car","truck"]}
用户需求：{text}
```

**输出**：JSON 对象。后端用正则提取 `{...}` 并解析为：
- `task ∈ {helmet_compliance, traffic, open}`
- `classes`：开放词表英文目标词数组（仅 `open` 任务有；做小写去重）。

前端据此自动切换模型（安全帽合规 / 道路拥堵 / 开放词表）并填充可编辑的识别目标。

---

## 3. 检测结果一句话摘要（`/api/summarize-detection`）

图像/视频识别完成后，把结构化统计交给 DeepSeek 生成一句自然语言摘要（如"共 2 人，其中 1 人未佩戴安全帽"）。

**参数**：`temperature=0.3`、`max_tokens=120`、`timeout=30s`。
**容错**：未配置 Key 或任何异常 → 返回空串，前端用本地模板兜底。

**提示词结构**：`{info}` + `{ask}` + 固定收尾，三段拼成：

```
{info}
{ask}
只输出一句话，不要 markdown、不要解释。
```

`{info}` 与 `{ask}` 按任务类型不同：

**a) 安全帽合规（helmet_compliance）**
```
info：安全帽合规检测：共 {person_count} 人，合规 {compliant_count} 人，未佩戴 {violation_count} 人。
ask ：请用一句简短中文总结现场安全帽佩戴情况，点明是否有人未佩戴及人数。
```

**b) 道路拥堵（traffic）**
```
info：道路拥堵分析：峰值同时 {total} 辆[、累计经过约 {unique_total} 辆]，画面占比 {coverage%}%，判定 {level_cn}。明细：{各车型数量}
ask ：请用一句简短中文总结道路车流与是否会造成拥堵，给出拥堵等级。
```

**c) 通用开放词表（open）**
```
info：目标检测统计：{各类别=数量}
ask ：请用一句简短中文总结检测到的物体及数量。
```

**输出**：一句中文摘要，前端显示在结果区「AI 摘要」卡片。

---

## 附：未使用 DeepSeek 的"看起来像 AI"的部分

为避免误解，以下功能**不经过 DeepSeek**：
- **图像/视频目标检测**：YOLO（YOLO-World 开放词表 / yolov8 系列）本地推理，纯视觉模型。
- **安全帽合规判定**：person + helmet 两模型 + 头部区域空间匹配（规则引擎），非 LLM。
- **道路拥堵等级**：基于车辆数量与画面占比的阈值规则（`assess_congestion`），非 LLM。
- **目标追踪 / SAHI 切片**：ByteTrack / SAHI，均为视觉算法。

即：**DeepSeek 只负责文本侧**——安全分析报告、自然语言意图解析、结果摘要；**视觉侧全部由 YOLO 与规则引擎完成**。
