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

## 认证与用户管理

登录后返回 JWT，前端在后续请求的 `Authorization: Bearer <token>` 头中携带。角色分级：`admin` > `operator` > `viewer`。用户管理接口仅 `admin` 可用。

### POST /api/auth/login

登录，校验用户名密码（bcrypt），成功返回令牌与用户信息。

**请求体：** `{ "username": "admin", "password": "..." }`

**响应示例：**
```json
{
  "token": "eyJhbGci...",
  "user": { "id": "...", "username": "admin", "name": "系统管理员", "role": "admin", "status": "active" }
}
```
**错误：** `401` 用户名或密码错误；`403` 账号已禁用

### GET /api/auth/me

返回当前 token 对应的用户（需登录）。

### POST /api/auth/change-password

修改自己的密码。请求体：`{ "old_password": "...", "new_password": "..." }`（新密码 ≥6 位）。

### 用户管理（仅 admin）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/auth/users` | 用户列表（不含密码哈希） |
| POST | `/api/auth/users` | 新建用户 `{username, password, name, role}` |
| PATCH | `/api/auth/users/{id}` | 更新姓名/角色/状态/密码（仅传需改字段） |
| DELETE | `/api/auth/users/{id}` | 删除用户（不能删自己） |

**错误：** `401` 未登录/令牌失效；`403` 权限不足

---

## 数据上传

### POST /api/register-sensors

**第一步**：上传传感器信息表 Excel，将传感器基础信息 upsert 到 sensors 表。上传数据快照前必须先完成此步骤。重复上传同一 ID 会更新其信息。

**请求格式**：`multipart/form-data`

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `file` | File | 是 | .xlsx 或 .xls 格式 |

**Excel 必须包含的列：**

| 列名 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | 字符串 | 是 | 传感器唯一标识，如 GAS-01 |
| `type` | 字符串 | 是 | gas / thermal / camera / drone |
| `zone` | 字符串 | 是 | 所在区域 |
| `name` | 字符串 | 否 | 显示名称（默认取 id） |
| `lng` | 数字 | 否 | 经度（默认 0） |
| `lat` | 数字 | 否 | 纬度（默认 0） |
| `status` | 字符串 | 否 | online / offline / fault（默认 online） |
| `floor` | 字符串 | 否 | 所在楼层 |
| `description` | 字符串 | 否 | 备注 |

**响应示例：**
```json
{
  "registered": 5,
  "sensor_ids": ["GAS-01", "GAS-02", "THERMAL-01", "CAM-01", "CAM-02"]
}
```

**错误响应：**
- `400`：文件格式不支持 / 缺少必填列 / type 非法（不在 gas/thermal/camera/drone 内）

---

### POST /api/upload-excel

**第二步**：上传一份「数据快照」Excel（同一时刻全场景传感器读数），解析后批量写入 sensor_records 表。severity 由后端规则自动判定。

> **注意**：文件中所涉及的 sensor_id 必须已通过 `/api/register-sensors` 注册，否则返回 400。

**请求格式**：`multipart/form-data`

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `file` | File | 是 | .xlsx 或 .xls 格式文件 |

**Excel 必须包含的列：**

| 列名 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `sensor_id` | 字符串 | 是 | 传感器 ID，必须已注册 |
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
  "preview": [...]
}
```

**错误响应：**
- `400`：文件格式不支持 / 缺少必填列 / category 非法 / 存在未注册的传感器

---

### POST /api/clear-data

清空数据库中的传感器数据（调试用）。

**请求体（JSON）：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `target` | string | 是 | `records`：仅清空 sensor_records；`sensors`：清空 sensors（会先清空 sensor_records） |

**响应示例：**
```json
{"status": "ok", "target": "records"}
```

**错误响应：**
- `400`：target 不合法
- `500`：数据库操作失败

---

## AI 分析

### POST /api/analyze

从数据库查询原始传感器记录，转 CSV 后直传 DeepSeek API，生成结构化安全分析报告，并将报告持久化到 analysis_records 表。

**请求体（JSON）：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `user_prompt` | string | 是 | 分析任务描述，可为空字符串（使用默认提示） |
| `data_summary` | object | 是 | `/api/upload-excel` 返回的完整摘要对象 |
| `start_time` | string | 否 | 数据过滤起始时间（ISO 8601） |
| `end_time` | string | 否 | 数据过滤结束时间（ISO 8601） |

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
  },
  "start_time": "2026-06-01T00:00:00",
  "end_time": "2026-06-01T23:59:59"
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
| `zone` | string | 否 | 按区域过滤 |
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

---

## 图像识别

> 所有图像识别接口依赖环境变量 `ENABLE_YOLO=true`（默认开启）。模型权重文件放置于 `backend/weights/` 目录。

### GET /api/detect-models

获取可用的图像识别模型列表，供前端下拉选择。

**响应示例：**
```json
[
  {
    "id": "open",
    "name": "通用开放词表（YOLO-World）",
    "open_vocab": true,
    "classes": null,
    "available": true,
    "note": ""
  },
  {
    "id": "fire_smoke",
    "name": "火焰烟雾专用",
    "open_vocab": false,
    "classes": ["火焰", "烟雾"],
    "available": true,
    "note": ""
  },
  {
    "id": "helmet_compliance",
    "name": "安全帽合规检测",
    "open_vocab": false,
    "classes": ["安全帽", "人员"],
    "available": true,
    "note": ""
  }
]
```

---

### POST /api/detect-image

上传图片，用 YOLO 模型进行目标检测，返回归一化检测框并落库到 detection_records。

**请求格式**：`multipart/form-data`

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `file` | File | 是 | — | .jpg / .jpeg / .png 图片 |
| `model` | string | 否 | `open` | 模型 id，见 GET /api/detect-models |
| `classes` | string | 否 | `[]` | JSON 字符串数组，仅开放词表模型有效，如 `["person","fire"]` |
| `conf` | float | 否 | `0.1` | 置信度阈值 |
| `imgsz` | int | 否 | `640` | 推理图像尺寸（320~1536），越大对小目标召回越好 |
| `zone` | string | 否 | — | 所属区域（落库用） |

**响应示例：**
```json
{
  "image": {"width": 1920, "height": 1080, "name": "test.jpg"},
  "model": "open",
  "classes_used": ["person", "fire", "smoke"],
  "count": 3,
  "risk_count": 1,
  "detections": [
    {
      "id": 0,
      "label": "fire",
      "label_cn": "火焰",
      "confidence": 0.87,
      "risk": true,
      "box": {"x": 0.12, "y": 0.34, "w": 0.08, "h": 0.15}
    }
  ],
  "record_id": "550e8400-e29b-41d4-a716-446655440002"
}
```

> `box` 字段为归一化坐标（相对图像宽高），`x/y` 为左上角，`w/h` 为宽高。

**错误响应：**
- `400`：非图片 / classes 不是 JSON 数组
- `503`：YOLO 未启用 / 模型权重未就绪

---

### POST /api/detect-video

上传视频，按时间间隔（默认 0.4 秒）采样逐帧检测，返回带时间戳的检测时间线。前端在播放原视频时按进度叠加检测框，无需重编码。

**请求格式**：`multipart/form-data`

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `file` | File | 是 | — | .mp4 / .avi / .mov / .mkv / .webm |
| `model` | string | 否 | `open` | `open` / `helmet_compliance` / `traffic` |
| `classes` | string | 否 | `[]` | JSON 字符串数组，仅 open 模型有效 |
| `conf` | float | 否 | `0.25` | 置信度阈值 |
| `imgsz` | int | 否 | `640` | 推理图像尺寸 |
| `helmet_conf` | float | 否 | `0.6` | 安全帽模型专用置信度（仅 helmet_compliance） |
| `use_sahi` | bool | 否 | `false` | 是否用切片推理（仅 traffic，增强小目标召回） |

**响应示例（open 模型）：**
```json
{
  "task": "open",
  "compliance": false,
  "traffic": false,
  "fps": 25.0,
  "duration": 12.4,
  "interval": 0.4,
  "sampled": 31,
  "frames": [
    {
      "t": 0.0,
      "dets": [
        {
          "label": "person",
          "label_cn": "人员",
          "confidence": 0.92,
          "risk": false,
          "box": {"x": 0.3, "y": 0.1, "w": 0.1, "h": 0.4}
        }
      ]
    }
  ],
  "stats": {"counts": {"人员": 2}}
}
```

**helm_compliance 模式下 stats 字段：**
```json
{
  "person_count": 5,
  "violation_count": 2,
  "compliant_count": 3,
  "peak_persons": 4,
  "tracked": true
}
```

**traffic 模式下 stats 字段：**
```json
{
  "total": 12,
  "unique_total": 18,
  "coverage": 0.24,
  "level": "congested",
  "level_cn": "拥堵",
  "counts": {"轿车": 8, "卡车": 4},
  "tracked": true
}
```

**错误响应：**
- `400`：不支持的视频格式
- `503`：YOLO 未启用 / 模型权重未就绪 / opencv 未安装

---

### POST /api/detect-helmet-compliance

双模型安全帽合规检测：通用模型检测 person，专用模型检测 helmet，再按 helmet 是否落在 person 头部区域判定每人是否合规。

**请求格式**：`multipart/form-data`

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `file` | File | 是 | — | .jpg / .jpeg / .png |
| `imgsz` | int | 否 | `640` | 推理图像尺寸 |
| `helmet_conf` | float | 否 | `0.6` | 安全帽置信度阈值（建议 ≥0.5 以滤除裸头误检） |
| `zone` | string | 否 | — | 所属区域 |

**响应示例：**
```json
{
  "image": {"width": 1280, "height": 720, "name": "site.jpg"},
  "persons": [
    {
      "id": 0,
      "label": "person",
      "label_cn": "未戴安全帽人员",
      "confidence": 0.95,
      "compliant": false,
      "risk": true,
      "box": {"x": 0.1, "y": 0.05, "w": 0.12, "h": 0.5}
    }
  ],
  "helmets": [
    {
      "id": 0,
      "label": "helmet",
      "label_cn": "安全帽",
      "confidence": 0.82,
      "worn": true,
      "box": {"x": 0.35, "y": 0.0, "w": 0.08, "h": 0.12}
    }
  ],
  "stats": {
    "person_count": 3,
    "compliant_count": 2,
    "violation_count": 1
  },
  "record_id": "550e8400-e29b-41d4-a716-446655440003"
}
```

**错误响应：**
- `503`：YOLO 未启用 / 安全帽权重 `weights/helmet.pt` 未就绪

---

### POST /api/detect-traffic

道路拥堵分析：检测画面中的车辆（轿车/卡车/公交/摩托/自行车），按车辆数量与画面占比判定畅通/缓行/拥堵。

**请求格式**：`multipart/form-data`

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `file` | File | 是 | — | .jpg / .jpeg / .png |
| `imgsz` | int | 否 | `640` | 推理图像尺寸 |
| `conf` | float | 否 | `0.25` | 置信度阈值 |
| `use_sahi` | bool | 否 | `false` | 切片推理（增强密集小目标召回） |
| `zone` | string | 否 | — | 所属区域 |

**响应示例：**
```json
{
  "image": {"width": 1920, "height": 1080, "name": "road.jpg"},
  "traffic": true,
  "use_sahi": false,
  "level": "moderate",
  "level_cn": "缓行",
  "total": 8,
  "coverage": 0.18,
  "counts": {"轿车": 5, "卡车": 3},
  "detections": [...],
  "record_id": "550e8400-e29b-41d4-a716-446655440004"
}
```

拥堵等级：`free`（畅通）/ `moderate`（缓行）/ `congested`（拥堵）

---

### POST /api/parse-detect-targets

将用户自然语言描述解析为检测任务类型和目标词列表，供前端调用后直接传给检测接口。

**请求体（JSON）：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `text` | string | 是 | 自然语言描述，如"检查有没有人没戴安全帽" |

**响应示例（安全帽合规意图）：**
```json
{"task": "helmet_compliance", "classes": [], "text": "检查有没有人没戴安全帽"}
```

**响应示例（开放词表意图）：**
```json
{"task": "open", "classes": ["car", "truck", "fire"], "text": "看看有没有车和火"}
```

**响应示例（道路拥堵意图）：**
```json
{"task": "traffic", "classes": [], "text": "这条路堵不堵"}
```

**错误响应：**
- `400`：text 为空
- `500`：DEEPSEEK_API_KEY 未配置

---

### POST /api/summarize-detection

将检测统计数据交给 DeepSeek，生成一句简短中文摘要。AI 不可用时返回空串，由前端兜底。

**请求体（JSON）：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `task` | string | 是 | `helmet_compliance` / `traffic` / `open` |
| `stats` | object | 否 | 对应检测接口返回的 stats 字段 |

**响应示例：**
```json
{"summary": "现场共检测到5人，其中2人未佩戴安全帽，存在安全合规风险。"}
```
