# 数据库结构

数据库托管于 Supabase（PostgreSQL），共四张表。完整建表 SQL 见 [`database/schema.sql`](../database/schema.sql)。

---

## 表一：sensors（传感器基础信息）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | VARCHAR | PRIMARY KEY | 传感器唯一标识，如 GAS-01、CAM-03 |
| `name` | VARCHAR | NOT NULL | 显示名称 |
| `type` | VARCHAR | CHECK (gas/thermal/camera/drone) | 传感器类别 |
| `zone` | VARCHAR | NOT NULL | 所在厂区区域，如"A区-常压蒸馏" |
| `lng` | FLOAT | — | 传感器经度坐标 |
| `lat` | FLOAT | — | 传感器纬度坐标 |
| `floor` | VARCHAR | DEFAULT '地面' | 所在楼层 |
| `status` | VARCHAR | DEFAULT 'online' | 运行状态：online / offline / fault |
| `activated_at` | TIMESTAMP | DEFAULT NOW() | 首次激活时间 |
| `description` | VARCHAR | — | 传感器备注说明 |

**说明**：传感器需通过 `/api/register-sensors` 预先注册。上传数据快照（`/api/upload-excel`）时会校验 sensor_id 是否已注册，未注册则返回 400。

---

## 表二：sensor_records（传感器数据记录）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | 记录唯一标识 |
| `sensor_id` | VARCHAR | REFERENCES sensors(id) | 关联的传感器 ID |
| `category` | VARCHAR | CHECK (gas/thermal/behavior/device) | 数据类别 |
| `value` | FLOAT | — | 传感器数值 |
| `unit` | VARCHAR | — | 单位，如 ppm、°C |
| `severity` | VARCHAR | CHECK (error/warning/info) | 告警等级（后端规则判定） |
| `title` | VARCHAR | NOT NULL | 简要标题，如"气体浓度超标" |
| `detail` | VARCHAR | — | 详细描述 |
| `zone` | VARCHAR | NOT NULL | 冗余存储区域，方便前端按区域筛选（无需 JOIN） |
| `recorded_at` | TIMESTAMP | NOT NULL | 数据采集时间（来自 Excel 或推送时间） |
| `created_at` | TIMESTAMP | DEFAULT NOW() | 记录写入数据库的时间 |

**外键约束**：`sensor_id` → `sensors(id)`，插入前必须确保 sensors 表中存在对应 ID。

---

## 表三：analysis_records（AI 分析历史）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | 记录唯一标识 |
| `user_prompt` | TEXT | NOT NULL | 用户输入的分析任务描述 |
| `data_summary` | JSONB | — | 传给 AI 的简要统计摘要（原始数据已直传 AI，此处仅存摘要） |
| `ai_report` | TEXT | — | DeepSeek 返回的 Markdown 格式安全分析报告 |
| `record_count` | INT | DEFAULT 0 | 本次分析涉及的传感器数据条数 |
| `anomaly_count` | INT | DEFAULT 0 | 本次分析中的异常记录数（error + warning） |
| `created_at` | TIMESTAMP | DEFAULT NOW() | 分析完成的时间 |

---

## 表四：detection_records（图像识别记录）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | 识别记录唯一标识 |
| `image_name` | VARCHAR | — | 原图文件名 |
| `image_w` | INTEGER | — | 原图宽（px） |
| `image_h` | INTEGER | — | 原图高（px） |
| `zone` | VARCHAR | — | 所属区域（可选） |
| `classes` | JSONB | — | 本次使用的目标词列表 |
| `object_count` | INTEGER | DEFAULT 0 | 检测到的目标总数 |
| `risk_count` | INTEGER | DEFAULT 0 | 风险目标数 |
| `detections` | JSONB | — | 检测结果数组（归一化坐标，同接口返回值） |
| `created_at` | TIMESTAMP | DEFAULT NOW() | 记录创建时间 |

**落库逻辑**：`/api/detect-image`、`/api/detect-helmet-compliance`、`/api/detect-traffic` 均会在返回检测结果的同时异步落库，落库失败不影响接口返回值（容错设计）。

---

## 表五：users（系统用户与权限）

建表脚本见 [`database/auth_schema.sql`](../database/auth_schema.sql)。

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | 用户唯一标识 |
| `username` | VARCHAR | UNIQUE, NOT NULL | 登录名 |
| `password_hash` | VARCHAR | NOT NULL | bcrypt 密码哈希（后端生成，绝不存明文） |
| `name` | VARCHAR | — | 显示姓名 |
| `role` | VARCHAR | CHECK (admin/operator/viewer), DEFAULT 'viewer' | 角色 |
| `status` | VARCHAR | CHECK (active/disabled), DEFAULT 'active' | 账号状态 |
| `permissions` | JSONB | DEFAULT '{}' | 预留：后续细粒度权限（按模块/区域授权等） |
| `created_at` | TIMESTAMP | DEFAULT NOW() | 创建时间 |
| `last_login_at` | TIMESTAMP | — | 最近登录时间 |

**角色分级**（由高到低）：`admin`（全部权限 + 用户管理）> `operator`（业务操作）> `viewer`（只读）。后端用 `require_min_role()` 依赖做「不低于某角色」的校验。密码用 bcrypt 哈希，登录签发 JWT（`Authorization: Bearer` 头携带）。

---

## 表间关系

```
sensors (id)
    ↑ 外键引用
sensor_records (sensor_id)

analysis_records 独立存储（data_summary 以 JSONB 存简要快照）

detection_records 独立存储（不关联 sensors 表）
```

---

## RLS 状态

**全部五张表的 Row Level Security（RLS）均已关闭。**

后端统一使用 `SUPABASE_SERVICE_KEY`（service_role key）访问数据库，该 key 绕过所有 RLS 策略。

> 注意：service_role key 拥有完整数据库写权限，绝对不能暴露给前端或提交到 Git 仓库。
