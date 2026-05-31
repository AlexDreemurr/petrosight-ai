# PetroSight AI — 项目进展上下文

## 项目简介
石化厂区全场景北斗/多传感器融合主动感知识别与定位系统。
当前阶段：使用 mock 数据 + 真实 AI API 构建可演示雏形。

---

## 仓库结构

```
petrosight-ai/
├── .git/
├── .claude/
├── .gitignore          # 包含 .env
├── netlify.toml        # 前端部署配置
├── BACKEND_CONTEXT.md
├── PROJECT_CONTEXT.md
├── frontend/           # React + Vite（已部署）
│   ├── src/
│   ├── public/
│   └── package.json
└── backend/            # FastAPI（待开发）
    ├── main.py
    ├── requirements.txt
    └── .env            # 不上传 GitHub
```

---

## 部署状态

| 端 | 平台 | 状态 |
|----|------|------|
| 前端 | Netlify，连接 GitHub 自动部署 | ✅ 已部署 |
| 后端 | Render，连接 GitHub 自动部署 | 🔲 待开发 |
| 数据库 | Supabase | ✅ 表已创建 |

---

## 前端技术栈
- React + Vite
- styled-components
- React Router

---

## 后端技术栈
- Python + FastAPI
- pandas（解析 Excel）
- supabase-py（数据库访问）
- DeepSeek API（AI 分析）

---

## 环境变量

### backend/.env（本地，不上传）
```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJh......
DEEPSEEK_API_KEY=sk-......
```

### frontend/.env（本地，不上传）
```
VITE_API_BASE=http://localhost:8000
```

---

## Supabase 数据库表结构

### 表一：sensors（传感器基础信息）
```sql
id           VARCHAR PRIMARY KEY        -- 如 GAS-01、CAM-03
name         VARCHAR NOT NULL           -- 显示名称
type         VARCHAR                    -- gas / thermal / camera / drone
zone         VARCHAR                    -- 所在区域
lng          FLOAT                      -- 经度
lat          FLOAT                      -- 纬度
floor        VARCHAR DEFAULT '地面'
status       VARCHAR DEFAULT 'online'   -- online / offline / fault
activated_at TIMESTAMP DEFAULT NOW()
description  VARCHAR
```

### 表二：sensor_records（传感器数据记录）
```sql
id          UUID PRIMARY KEY DEFAULT gen_random_uuid()
sensor_id   VARCHAR REFERENCES sensors(id)
category    VARCHAR    -- gas / thermal / behavior / device
value       FLOAT      -- 具体数值
unit        VARCHAR    -- ppm / °C / —
severity    VARCHAR    -- error / warning / info
title       VARCHAR    -- 简要标题，如"气体浓度超标"
detail      VARCHAR    -- 详细描述
zone        VARCHAR    -- 冗余存区域，方便前端筛选
recorded_at TIMESTAMP  -- 数据采集时间
created_at  TIMESTAMP DEFAULT NOW()
```

### 表三：analysis_records（AI 分析历史）
```sql
id            UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_prompt   TEXT       -- 用户输入的任务描述
data_summary  JSONB      -- Excel 解析后的摘要
ai_report     TEXT       -- DeepSeek 返回的分析报告
record_count  INT        -- 本次分析的数据条数
anomaly_count INT        -- 异常条数
created_at    TIMESTAMP DEFAULT NOW()
```

### RLS 状态
全部关闭，后端统一用 service_role key 访问。

---

## severity 判断规则
severity 由后端规则判断，数据入库时已确定，不依赖 AI：

```python
def get_severity(category, value):
    if category == "gas":
        if value > 400: return "error"
        if value > 200: return "warning"
        return "info"
    if category == "thermal":
        if value > 300: return "error"
        if value > 150: return "warning"
        return "info"
```

---

## 后端接口清单

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/upload-excel | 上传并解析 Excel，批量写入 sensor_records |
| POST | /api/analyze | AI 分析，返回报告，写入 analysis_records |
| GET  | /api/history | 获取历史分析记录列表 |
| GET  | /api/sensors | 获取所有传感器信息（供地图打点用） |
| GET  | /api/records | 获取传感器数据记录（支持按 zone/severity/category 筛选） |
| POST | /api/sensor-data | 预留，真实传感器推送用 |

---

## 数据流

```
前端拖拽上传 Excel
      ↓
POST /api/upload-excel
      ↓
pandas 解析 → get_severity() 判断级别 → 批量写入 sensor_records
      ↓
返回解析摘要给前端展示
      ↓
用户输入任务描述，点击分析
      ↓
POST /api/analyze
      ↓
生成摘要 → 组合 prompt → 调用 DeepSeek API
      ↓
写入 analysis_records → 返回报告给前端
```

---

## CORS 配置
```python
allow_origins = [
    "http://localhost:5173",
    "https://你的netlify地址.netlify.app"
]
```

---

## 当前待办
- [ ] 搭建 backend/main.py 基础框架
- [ ] 实现 /api/upload-excel 接口
- [ ] 实现 /api/analyze 接口（接 DeepSeek）
- [ ] 实现 /api/history 和 /api/records 接口
- [ ] 生成 mock Excel 数据文件
- [ ] Render 部署后端
