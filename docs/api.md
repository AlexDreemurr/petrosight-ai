# API 接口文档

> 本地启动后端后，访问 [http://localhost:8000/docs](http://localhost:8000/docs) 可获得交互式 Swagger UI，支持在线调试所有接口。

**Base URL（生产）**：`https://petrosight-ai-piwm.onrender.com`

---

## 系统接口

### GET /

健康检查，确认服务是否存活。

**响应示例：**
```json
{
  "status": "ok",
  "service": "PetroSight AI"
}
```

---

## 数据上传

### POST /api/upload-excel

上传传感器数据 Excel 文件，解析并批量写入数据库。

**请求格式**：`multipart/form-data`

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `file` | File | 是 | .xlsx 或 .xls 格式文件 |

**Excel 必须包含的列：**

| 列名 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `sensor_id` | 字符串 | 是 | 传感器 ID，如 GAS-01 |
| `category` | 字符串 | 是 | gas / thermal / behavior / device |
| `value` | 数字 | 是 | 传感器数值 |
| `unit` | 字符串 | 否 | 单位，如 ppm、°C |
| `title` | 字符串 | 否 | 简要标题 |
| `detail` | 字符串 | 否 | 详细描述 |
| `zone` | 字符串 | 否 | 所在区域 |
| `recorded_at` | 日期时间 | 否 | 采集时间，默认为当前时间 |

**响应示例：**
```json
{
  "total": 50,
  "anomaly_count": 12,
  "categories": ["gas", "thermal"],
  "zones": ["A区-常压蒸馏", "B区-催化裂化"],
  "severity_breakdown": {
    "error": 3,
    "warning": 9,
    "info": 38
  },
  "preview": [
    {
      "sensor_id": "GAS-01",
      "category": "gas",
      "value": 520.0,
      "unit": "ppm",
      "severity": "error",
      "title": "气体浓度超标",
      "detail": "甲烷浓度达到爆炸下限的40%",
      "zone": "A区-常压蒸馏",
      "recorded_at": "2026-06-01T08:30:00"
    }
  ]
}
```

**错误响应：**
- `400`：文件格式不支持 / 缺少必填列 / Excel 解析失败

---

## AI 分析

### POST /api/analyze

基于上传的数据摘要调用 DeepSeek 生成安全分析报告。

**请求体（JSON）：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `user_prompt` | string | 是 | 分析任务描述，可为空字符串（使用默认提示） |
| `data_summary` | object | 是 | `/api/upload-excel` 返回的完整摘要对象 |

**请求示例：**
```json
{
  "user_prompt": "请重点分析A区气体泄漏风险，给出应急处置建议",
  "data_summary": {
    "total": 50,
    "anomaly_count": 12,
    "categories": ["gas", "thermal"],
    "zones": ["A区-常压蒸馏"],
    "severity_breakdown": {"error": 3, "warning": 9, "info": 38}
  }
}
```

**响应示例：**
```json
{
  "report": "## 一、风险评估摘要\n当前A区整体风险等级为**高风险**...\n\n## 二、主要异常分析\n..."
}
```

**错误响应：**
- `500`：DEEPSEEK_API_KEY 未配置
- `504`：AI 分析超时（>90秒）
- `502`：DeepSeek API 返回错误

---

## 历史记录

### GET /api/history

获取历史 AI 分析记录，按时间倒序排列。

**查询参数：**

| 参数 | 类型 | 默认值 | 最大值 | 说明 |
|------|------|--------|--------|------|
| `limit` | int | 50 | 200 | 返回条数上限 |

**响应示例：**
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "user_prompt": "请分析A区气体泄漏风险",
    "ai_report": "## 一、风险评估摘要\n...",
    "record_count": 50,
    "anomaly_count": 12,
    "created_at": "2026-06-01T10:23:45.123456"
  }
]
```

---

## 传感器

### GET /api/sensors

获取所有传感器基础信息，供地图组件打点使用。

**响应示例：**
```json
[
  {
    "id": "GAS-01",
    "name": "GAS-01",
    "type": "gas",
    "zone": "A区-常压蒸馏",
    "lng": 116.3974,
    "lat": 39.9087,
    "floor": "地面",
    "status": "online",
    "activated_at": "2026-05-31T16:21:23.476606",
    "description": null
  }
]
```

---

### GET /api/records

查询传感器数据记录，支持多维过滤，按采集时间倒序。

**查询参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `zone` | string | 否 | 按区域过滤，如 "A区-常压蒸馏" |
| `severity` | string | 否 | error / warning / info |
| `category` | string | 否 | gas / thermal / behavior / device |
| `limit` | int | 否 | 默认 100，最大 500 |

**响应示例：**
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "sensor_id": "GAS-01",
    "category": "gas",
    "value": 520.0,
    "unit": "ppm",
    "severity": "error",
    "title": "气体浓度超标",
    "detail": "甲烷浓度达到爆炸下限的40%",
    "zone": "A区-常压蒸馏",
    "recorded_at": "2026-06-01T08:30:00",
    "created_at": "2026-06-01T08:30:05.123456"
  }
]
```

---

### POST /api/sensor-data（预留）

供真实传感器硬件推送单条实时数据（当前阶段仅用于集成测试）。

**请求体（JSON）：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `sensor_id` | string | 是 | 传感器 ID |
| `category` | string | 是 | 类别 |
| `value` | number | 是 | 数值 |
| `unit` | string | 否 | 单位 |
| `title` | string | 否 | 标题 |
| `detail` | string | 否 | 详情 |
| `zone` | string | 否 | 区域 |
| `recorded_at` | string | 否 | ISO 8601 时间，默认当前时间 |

**响应：**
```json
{"status": "received"}
```
