# 重构任务：/api/analyze 数据传递方式

## 背景

当前后端在处理 Excel 上传后，会把数据"加工"成一个精练的 `data_summary` JSON 结构（包含聚合统计、preview 预览等），然后把这个摘要传给 DeepSeek API。

这个设计有问题：后端替 AI 做了数据分析，AI 拿到的是"半成品结论"而非原始数据，导致 AI 无法发现我们没有预设的异常模式。

---

## 要做的改动

### 保留：简要统计信息（给前端展示用）

上传 Excel 后返回给前端的统计摘要**保持不变**，继续包含：

- `total`：总记录条数
- `anomaly_count`：异常条数（severity 为 warning 或 error 的）
- `severity_breakdown`：`{ info: N, warning: N, error: N }`
- `zones`：涉及的区域列表
- `categories`：涉及的传感器类型列表

这些信息是给前端 UI 展示"本次上传概况"用的，和 AI 分析无关，继续保留。

### 删除：`data_summary` 精练 JSON 的构造逻辑

删除后端把数据加工成 `data_summary`（含 `by_zone`、`by_category`、`preview` 等嵌套结构）的所有代码。

### 新增：原始数据转 CSV 直接传给 AI

在调用 DeepSeek API 时，不再传 `data_summary`，改为：

1. 从数据库查出本次上传的所有 `sensor_records`（用 `upload_id` 或时间范围关联，根据现有代码的关联方式决定）
2. 用 `pandas` 将这些记录转成 CSV 字符串
3. CSV 只保留对分析有意义的字段，字段顺序如下：

```
recorded_at, zone, sensor_id, category, value, unit, severity, title, detail
```

4. 将 CSV 字符串直接嵌入 prompt，格式如下：

```python
prompt = f"""你是一名石化厂区安全分析专家。以下是本次上传的传感器原始数据（CSV格式）：

{csv_text}

请根据以上数据完成以下分析：
1. 按区域归纳异常情况，重点说明哪个区域问题最集中
2. 按传感器类型分析，哪类传感器出现异常最多
3. 列出最需要立即处理的事件（error 级别）
4. 给出整体安全评估和处理建议

用户的具体问题是：{user_prompt}
"""
```

---

## 不要改动的部分

- Excel 解析逻辑（读取字段、severity 判断规则）
- 数据写入 `sensor_records` 表的逻辑
- 写入 `analysis_records` 表的逻辑（`ai_report`、`record_count`、`anomaly_count` 字段继续保存）
- 返回给前端的统计摘要结构（`total`、`severity_breakdown` 等）
- 所有查询接口（`/api/history`、`/api/records`、`/api/sensors`）

---

## 改动后 analysis_records 的 data_summary 字段

`data_summary` 字段继续写入数据库，但内容改为只保存简要统计，不再保存精练 JSON：

```json
{
  "total": 420,
  "severity_breakdown": { "info": 388, "warning": 21, "error": 11 },
  "zones": ["A区-常压蒸馏", "B区-加氢裂化"],
  "categories": ["gas", "thermal"],
  "note": "原始数据已直接传递给AI，未做二次聚合"
}
```

---

## 完成后请确认

- [ ] `/api/analyze` 接口调用 DeepSeek 时，prompt 中包含完整 CSV 原始数据
- [ ] 不再有任何 `by_zone`、`by_category`、`preview` 的构造代码
- [ ] 前端收到的上传统计响应结构未发生变化
- [ ] `analysis_records.data_summary` 只存简要统计，不存聚合数据
