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
2. 进入项目 → **SQL Editor**，执行以下建表 SQL：

```sql
-- 传感器基础信息表
CREATE TABLE sensors (
    id           VARCHAR PRIMARY KEY,
    name         VARCHAR NOT NULL,
    type         VARCHAR,
    zone         VARCHAR,
    lng          FLOAT NOT NULL DEFAULT 0.0,
    lat          FLOAT NOT NULL DEFAULT 0.0,
    floor        VARCHAR DEFAULT '地面',
    status       VARCHAR DEFAULT 'online',
    activated_at TIMESTAMP DEFAULT NOW(),
    description  VARCHAR
);

-- 传感器数据记录表
CREATE TABLE sensor_records (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sensor_id   VARCHAR REFERENCES sensors(id),
    category    VARCHAR,
    value       FLOAT,
    unit        VARCHAR,
    severity    VARCHAR,
    title       VARCHAR,
    detail      VARCHAR,
    zone        VARCHAR,
    recorded_at TIMESTAMP,
    created_at  TIMESTAMP DEFAULT NOW()
);

-- AI 分析历史表
CREATE TABLE analysis_records (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_prompt   TEXT,
    data_summary  JSONB,
    ai_report     TEXT,
    record_count  INT,
    anomaly_count INT,
    created_at    TIMESTAMP DEFAULT NOW()
);
```

3. 确保三张表的 **RLS（Row Level Security）均关闭**：
   - Table Editor → 选择表 → RLS → Disable RLS

4. 获取密钥：**Settings → API**
   - **Project URL**：填入后端 `SUPABASE_URL`
   - **service_role（secret）key**：填入后端 `SUPABASE_SERVICE_KEY`

---

## 三、后端 Render 部署

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

   | 变量名 | 值来源 |
   |--------|--------|
   | `SUPABASE_URL` | Supabase Settings → API → Project URL |
   | `SUPABASE_SERVICE_KEY` | Supabase Settings → API → service_role key |
   | `DEEPSEEK_API_KEY` | platform.deepseek.com → API Keys |

5. 点击 **Create Web Service**，等待构建完成（首次约 5～10 分钟，含 pandas 编译）
6. 记录 Render 分配的域名，如 `https://petrosight-ai-piwm.onrender.com`

> **注意**：Render 免费套餐在无流量时会休眠，首次请求需 30～60 秒唤醒。

---

## 四、前端 Netlify 部署

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

## 五、更新 CORS 白名单

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

## 六、netlify.toml 说明

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
