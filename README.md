# PetroSight AI

> 石化厂区全场景北斗/多传感器融合主动感知识别与定位系统

---

## 技术栈总览

| 层次 | 技术 |
|------|------|
| 前端 | React 19 + Vite + styled-components + React Router |
| 后端 | Python 3.14 + FastAPI + pandas + httpx |
| 数据库 | Supabase（PostgreSQL + REST API） |
| AI | DeepSeek API（deepseek-chat 模型） |
| 部署 | 前端 Netlify / 后端 Render |

---

## 目录结构

```
petrosight-ai/
├── frontend/                   # React + Vite 前端应用
│   ├── src/
│   │   ├── components/
│   │   │   ├── pages/          # 页面级组件（OverView / Analysis / History / Assessment）
│   │   │   ├── Header/         # 顶部导航栏
│   │   │   ├── SideBar/        # 左侧路由导航
│   │   │   ├── OverallMap/     # 厂区平面地图展示
│   │   │   ├── Card/           # 通用卡片容器
│   │   │   ├── Icon/           # 图标封装（lucide-react + react-feather）
│   │   │   └── Calligraphy/    # 基础排版组件（Tag / Caption / Display）
│   │   ├── api.js              # 统一封装所有后端接口调用
│   │   ├── App.jsx             # 根组件，路由定义
│   │   ├── main.jsx            # 应用入口
│   │   └── GlobalStyles.jsx    # CSS 全局变量与 Reset
│   ├── public/                 # 静态资源（地图图片等）
│   ├── .env                    # 本地环境变量（不提交 Git）
│   ├── .env.example            # 环境变量模板
│   └── package.json
├── backend/                    # FastAPI 后端服务
│   ├── main.py                 # 全部路由与业务逻辑
│   ├── requirements.txt        # Python 依赖
│   ├── .env                    # 本地环境变量（不提交 Git）
│   └── .env.example            # 环境变量模板
├── docs/                       # 项目文档
│   ├── architecture.md         # 系统架构图与数据流说明
│   ├── database.md             # Supabase 数据库表结构
│   ├── api.md                  # 后端接口文档
│   └── deployment.md           # 部署操作手册
├── netlify.toml                # Netlify 构建配置（base=frontend）
└── claudeContext/              # AI 辅助开发上下文文档
```

---

## 快速启动

### 前端

```bash
cd frontend
npm install
npm run dev
# 访问 http://localhost:5173
```

### 后端

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
# 访问 http://localhost:8000
# Swagger UI: http://localhost:8000/docs
```

---

## 环境变量说明

### backend/.env

| 变量名 | 用途 | 获取方式 |
|--------|------|---------|
| `SUPABASE_URL` | Supabase 项目地址 | Supabase 控制台 → Settings → API → Project URL |
| `SUPABASE_SERVICE_KEY` | 后端数据库访问密钥（绕过 RLS） | Supabase 控制台 → Settings → API → service_role key |
| `DEEPSEEK_API_KEY` | DeepSeek AI 分析接口密钥 | platform.deepseek.com → API Keys |

### frontend/.env

| 变量名 | 用途 |
|--------|------|
| `VITE_API_BASE` | 后端服务根地址（本地开发填 `http://localhost:8000`，生产填 Render URL） |

---

## 部署信息

### 前端 — Netlify
- 连接 GitHub 仓库，自动检测 `netlify.toml`
- 构建目录：`frontend`，构建命令：`npm run build`，发布目录：`dist`
- 在 Netlify 控制台 → Site configuration → Environment variables 中添加 `VITE_API_BASE`

### 后端 — Render
- 连接 GitHub 仓库，Root Directory 设为 `backend`
- 语言：Python，Build Command：`pip install -r requirements.txt`
- Start Command：`uvicorn main:app --host 0.0.0.0 --port $PORT`
- 在 Render 控制台 → Environment 中添加 `SUPABASE_URL`、`SUPABASE_SERVICE_KEY`、`DEEPSEEK_API_KEY`

### 数据库 — Supabase
- 在 Supabase 控制台创建项目后，通过 SQL Editor 建表（见 `docs/database.md`）
- RLS 全部关闭，后端统一使用 service_role key 访问

---

## API 文档

本地启动后端后，访问 [http://localhost:8000/docs](http://localhost:8000/docs) 查看交互式 Swagger UI，可在线调试所有接口。

详细接口说明见 [docs/api.md](docs/api.md)。
