# PetroSight AI — 后端开发上下文

## 项目背景
石化厂区全场景北斗/多传感器融合主动感知识别与定位系统。
前端为 React + Vite + styled-components，后端为 Python + FastAPI。
当前阶段：使用 mock 数据 + 真实 AI API 构建可演示雏形，无真实传感器硬件。

---

## 技术栈
- 后端框架：FastAPI
- 数据处理：pandas（解析 Excel）
- AI 接口：DeepSeek API
- 数据库：Supabase
- 部署：Zeabur（国内可访问）

---

## 核心功能需求

### 1. Excel 文件上传与解析
- 前端拖拽上传 Excel 文件
- 后端用 pandas 读取并解析
- 数据结构示例（传感器历史数据）：
  ```
  时间戳 | 区域 | 传感器ID | 数值 | 是否异常
  2026-05-30 | 3号区 | GAS-01 | 423ppm | true
  ```
- 接口：`POST /api/upload-excel`
- 返回：解析后的结构化 JSON

### 2. AI 数据分析
- 用户在前端输入任务描述（自然语言）
- 后端把任务描述 + Excel 解析结果组合成 prompt
- 调用 DeepSeek API 生成分析报告
- 接口：`POST /api/analyze`
- 注意：Excel 数据量大时，后端先做摘要再传给 AI，避免 token 超限

摘要示例：
```python
summary = {
    "总记录数": 1440,
    "异常次数": 23,
    "最高气体浓度": "523ppm，发生在14:32",
    "异常集中区域": "3号反应釜"
}
```

Prompt 模板：
```
你是一个石化厂区安全分析专家。
用户任务：{user_input}
传感器数据摘要：{summary}
请给出专业的分析报告。
```

### 3. 历史记录存储
- 每次分析完成后存入 Supabase
- 存储字段：任务ID、上传时间、用户描述、分析结果、原始数据摘要
- 接口：`GET /api/history`（前端拉取历史列表）

### 4. 传感器数据推送（预留接口，真实部署时用）
- 真实场景：传感器通过 HTTP 或 MQTT 自动推送数据，不经过人工上传
- 现阶段只需预留接口，不需要实现
```python
# 预留
POST /api/sensor-data   # 传感器自动推送
POST /api/upload-excel  # 当前demo用，人工上传
```

---

## 接口汇总

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/upload-excel | 上传并解析 Excel |
| POST | /api/analyze | AI 分析，返回报告 |
| GET  | /api/history | 获取历史分析记录 |
| POST | /api/sensor-data | 预留，传感器推送 |

---

## 数据流

```
前端拖拽上传 Excel
      ↓
POST /api/upload-excel
      ↓
pandas 解析 → 生成摘要 JSON
      ↓
返回前端展示原始数据
      ↓
用户输入任务描述，点击分析
      ↓
POST /api/analyze
      ↓
摘要 + 描述 → DeepSeek API
      ↓
返回分析报告文本
      ↓
存入 Supabase + 返回前端展示
```

---

## CORS 配置
前端本地开发地址为 http://localhost:5173，需要在 FastAPI 里配置 CORS：

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "https://你的netlify地址"],
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

## 注意事项
- DeepSeek API 调用方式与 HappyJPGrammar 项目一致，可直接复用
- 当前阶段所有传感器数据均为 mock，Excel 文件由 AI 生成造假数据即可
- 后端本地开发运行在 http://localhost:8000
- 前端请求后端统一用环境变量管理地址：
  ```
  VITE_API_BASE=http://localhost:8000
  ```
