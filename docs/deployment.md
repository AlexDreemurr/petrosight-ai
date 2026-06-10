# 部署操作手册

---

## 一、本地开发环境搭建

### 前提条件
- Node.js >= 18
- Python >= 3.10
- Git

### 1. 克隆仓库
```bash
git clone https://github.com/AlexDreemurr/petrosight-ai.git
cd petrosight-ai
```

### 2. 启动后端
```bash
cd backend
pip install -r requirements.txt

# 创建本地环境变量文件
cp .env.example .env
# 编辑 .env，填入真实的 SUPABASE_URL、SUPABASE_SERVICE_KEY、DEEPSEEK_API_KEY

uvicorn main:app --reload
# 后端运行在 http://localhost:8000
# Swagger UI: http://localhost:8000/docs
```

### 3. 启动前端
```bash
cd frontend
npm install

# 创建本地环境变量文件
cp .env.example .env
# 确认 VITE_API_BASE=http://localhost:8000

npm run dev
# 前端运行在 http://localhost:5173
```

---

## 二、Supabase 数据库初始化

1. 登录 [supabase.com](https://supabase.com)，创建新项目
2. 进入项目 → **SQL Editor**，执行 [`database/schema.sql`](../database/schema.sql) 中的完整建表脚本（共四张表）

   或手动执行以下 SQL：

```sql
-- 传感器基础信息表
CREATE TABLE sensors (
    id           VARCHAR PRIMARY KEY,
    name         VARCHAR NOT NULL,
    type         VARCHAR NOT NULL CHECK (type IN ('gas', 'thermal', 'camera', 'drone')),
    zone         VARCHAR NOT NULL,
    lng          FLOAT,
    lat          FLOAT,
    floor        VARCHAR DEFAULT '地面',
    status       VARCHAR DEFAULT 'online',
    activated_at TIMESTAMP DEFAULT NOW(),
    description  VARCHAR
);

-- 传感器数据记录表
CREATE TABLE sensor_records (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sensor_id   VARCHAR REFERENCES sensors(id),
    category    VARCHAR NOT NULL CHECK (category IN ('gas', 'thermal', 'behavior', 'device')),
    value       FLOAT,
    unit        VARCHAR,
    severity    VARCHAR NOT NULL CHECK (severity IN ('error', 'warning', 'info')),
    title       VARCHAR NOT NULL,
    detail      VARCHAR,
    zone        VARCHAR NOT NULL,
    recorded_at TIMESTAMP NOT NULL,
    created_at  TIMESTAMP DEFAULT NOW()
);

-- AI 分析历史表
CREATE TABLE analysis_records (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_prompt   TEXT NOT NULL,
    data_summary  JSONB,
    ai_report     TEXT,
    record_count  INT DEFAULT 0,
    anomaly_count INT DEFAULT 0,
    created_at    TIMESTAMP DEFAULT NOW()
);

-- 图像识别记录表
CREATE TABLE detection_records (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    image_name   VARCHAR,
    image_w      INTEGER,
    image_h      INTEGER,
    zone         VARCHAR,
    classes      JSONB,
    object_count INTEGER DEFAULT 0,
    risk_count   INTEGER DEFAULT 0,
    detections   JSONB,
    created_at   TIMESTAMP DEFAULT NOW()
);
```

3. 执行用户认证建表脚本 [`database/auth_schema.sql`](../database/auth_schema.sql)，创建 `users` 表（登录/权限用）。

4. 确保全部五张表的 **RLS（Row Level Security）均关闭**：
   - Table Editor → 选择表 → RLS → Disable RLS

5. 获取密钥：**Settings → API**
   - **Project URL**：填入后端 `SUPABASE_URL`
   - **service_role（secret）key**：填入后端 `SUPABASE_SERVICE_KEY`

6. 创建首个管理员账号（在 `backend/` 目录，需先配好 `.env`）：
   ```bash
   python create_user.py admin <你的密码> admin 系统管理员
   ```

---

## 三、YOLO 模型权重文件

图像识别功能依赖本地 YOLO 权重文件，部署时需手动放置（文件较大，未纳入 Git）：

| 文件路径 | 用途 | 说明 |
|----------|------|------|
| `backend/yolov8s-worldv2.pt` | 开放词表检测（YOLO-World） | 必须，影响所有 open 模式 |
| `backend/yolov8n.pt` | 通用 person 检测 | 安全帽合规检测中定位人员 |
| `backend/yolov8s.pt` | 通用车辆检测 | 道路拥堵分析 |
| `backend/weights/fire_smoke.pt` | 火焰烟雾专用 | 可选 |
| `backend/weights/fire_smoke2.pt` | 火焰烟雾专用（备选） | 可选 |
| `backend/weights/helmet.pt` | 安全帽专用 | 安全帽合规检测必须 |

权重文件路径均可通过后端环境变量覆盖（见下方环境变量说明）。

若不需要图像识别功能，可设置 `ENABLE_YOLO=false` 禁用（所有 `/api/detect-*` 接口返回 503）。

---

## 四、后端 Render 部署

1. 登录 [render.com](https://render.com)，点击 **New → Web Service**
2. 连接 GitHub 仓库 `petrosight-ai`
3. 填写配置：

   | 字段 | 值 |
   |------|----|
   | Language | Python |
   | Root Directory | `backend` |
   | Build Command | `pip install -r requirements.txt` |
   | Start Command | `uvicorn main:app --host 0.0.0.0 --port $PORT` |
   | Instance Type | Free（演示用） |

4. 添加环境变量（Environment Variables）：

   | 变量名 | 值来源 | 说明 |
   |--------|--------|------|
   | `SUPABASE_URL` | Supabase Settings → API → Project URL | 必填 |
   | `SUPABASE_SERVICE_KEY` | Supabase Settings → API → service_role key | 必填 |
   | `DEEPSEEK_API_KEY` | platform.deepseek.com → API Keys | 必填 |
   | `JWT_SECRET` | 自定义高强度随机串 | 登录令牌签名密钥，**生产必填**（默认值不安全） |
   | `TOKEN_EXPIRE_HOURS` | 数字 | 可选，登录有效期小时数，默认 12 |
   | `ENABLE_YOLO` | `true` / `false` | 可选，默认 `true` |
   | `HELMET_MODEL_PATH` | 路径字符串 | 可选，默认 `weights/helmet.pt` |
   | `PERSON_MODEL_PATH` | 路径字符串 | 可选，默认 `yolov8n.pt` |
   | `TRAFFIC_MODEL_PATH` | 路径字符串 | 可选，默认 `yolov8s.pt` |

5. 点击 **Create Web Service**，等待构建完成（首次约 5～10 分钟，含 pandas/torch 编译）
6. 记录 Render 分配的域名，如 `https://petrosight-ai-piwm.onrender.com`

> **注意**：Render 免费套餐在无流量时会休眠，首次请求需 30～60 秒唤醒。YOLO 模型在首次请求时懒加载，耗时约 2～5 秒。

---

## 五、前端 Netlify 部署

1. 登录 [netlify.com](https://app.netlify.com)，点击 **Add new site → Import an existing project**
2. 连接 GitHub，选择 `petrosight-ai` 仓库
3. Netlify 会自动读取根目录的 `netlify.toml`，无需手动填写构建配置：
   - Base directory：`frontend`
   - Build command：`npm run build`
   - Publish directory：`frontend/dist`

4. 添加环境变量：**Site configuration → Environment variables → Add a variable**

   | 变量名 | 值 |
   |--------|-----|
   | `VITE_API_BASE` | Render 后端的完整 URL，如 `https://petrosight-ai-piwm.onrender.com` |

5. 点击 **Deploys → Trigger deploy → Deploy site** 重新构建使环境变量生效
6. 部署完成后，Netlify 会分配域名，如 `https://resplendent-syrniki-0e1a75.netlify.app`

---

## 六、更新 CORS 白名单

每次前端域名变更后，需同步更新后端 CORS 配置：

编辑 `backend/main.py` 中的 `allow_origins` 列表，添加新域名，提交 Git 后 Render 自动重部署：

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:4173",
        "https://resplendent-syrniki-0e1a75.netlify.app",  # 实际 Netlify 域名
    ],
    ...
)
```

---

## 七、netlify.toml 说明

```toml
[build]
  base = "frontend"           # 构建根目录
  command = "npm run build"   # 构建命令
  publish = "/dist"           # 产物目录

[build.environment]
  NODE_VERSION = "22"         # 指定 Node 版本

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200                # SPA 路由回退，所有路径均指向 index.html
```

---

## 八、数据导入快速流程

本地或生产环境首次写入数据的操作顺序：

```bash
# 1. 注册传感器（上传 sensors.xlsx）
curl -X POST http://localhost:8000/api/register-sensors \
  -F "file=@mock_data/data1/sensors.xlsx"

# 2. 上传数据快照
curl -X POST http://localhost:8000/api/upload-excel \
  -F "file=@mock_data/data1/20260603_150310.xlsx"

# 3. 触发 AI 分析（使用步骤 2 返回的 data_summary）
curl -X POST http://localhost:8000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"user_prompt":"全面安全分析","data_summary":{"total":50,"anomaly_count":5,"categories":["gas"],"zones":["A区"],"severity_breakdown":{"error":1,"warning":4,"info":45}}}'
```

`mock_data/` 目录下提供了两套测试数据（data1、data2），每套包含 sensors.xlsx 和多份按时间命名的数据快照 Excel。
