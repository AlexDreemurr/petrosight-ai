# 数据库结构

数据库托管于 Supabase（PostgreSQL），共三张表。

---

## 表一：sensors（传感器基础信息）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | VARCHAR | PRIMARY KEY | 传感器唯一标识，如 GAS-01、CAM-03 |
| `name` | VARCHAR | NOT NULL | 显示名称 |
| `type` | VARCHAR | — | 传感器类别：gas / thermal / camera / drone |
| `zone` | VARCHAR | — | 所在厂区区域，如"A区-常压蒸馏" |
| `lng` | FLOAT | NOT NULL | 传感器经度坐标 |
| `lat` | FLOAT | NOT NULL | 传感器纬度坐标 |
| `floor` | VARCHAR | DEFAULT '地面' | 所在楼层 |
| `status` | VARCHAR | DEFAULT 'online' | 运行状态：online / offline / fault |
| `activated_at` | TIMESTAMP | DEFAULT NOW() | 首次激活时间 |
| `description` | VARCHAR | — | 传感器备注说明 |

**说明**：当通过 `/api/upload-excel` 上传的 Excel 中出现新的 `sensor_id` 时，后端会自动以该 ID 为 `id` upsert 一条记录，`lng` 和 `lat` 默认填 0.0。

---

## 表二：sensor_records（传感器数据记录）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | 记录唯一标识 |
| `sensor_id` | VARCHAR | REFERENCES sensors(id) | 关联的传感器 ID |
| `category` | VARCHAR | — | 数据类别：gas / thermal / behavior / device |
| `value` | FLOAT | — | 传感器数值 |
| `unit` | VARCHAR | — | 单位，如 ppm、°C |
| `severity` | VARCHAR | — | 告警等级：error / warning / info（后端规则判定） |
| `title` | VARCHAR | — | 简要标题，如"气体浓度超标" |
| `detail` | VARCHAR | — | 详细描述 |
| `zone` | VARCHAR | — | 冗余存储区域，方便前端按区域筛选（无需 JOIN） |
| `recorded_at` | TIMESTAMP | — | 数据采集时间（来自 Excel 或推送时间） |
| `created_at` | TIMESTAMP | DEFAULT NOW() | 记录写入数据库的时间 |

**外键约束**：`sensor_id` → `sensors(id)`，插入前必须确保 sensors 表中存在对应 ID。

---

## 表三：analysis_records（AI 分析历史）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | 记录唯一标识 |
| `user_prompt` | TEXT | — | 用户输入的分析任务描述 |
| `data_summary` | JSONB | — | 上传 Excel 后返回的数据摘要 JSON |
| `ai_report` | TEXT | — | DeepSeek 返回的 Markdown 格式安全分析报告 |
| `record_count` | INT | — | 本次分析涉及的传感器数据条数 |
| `anomaly_count` | INT | — | 本次分析中的异常记录数（error + warning） |
| `created_at` | TIMESTAMP | DEFAULT NOW() | 分析完成的时间 |

---

## 表间关系

```
sensors (id)
    ↑ 外键引用
sensor_records (sensor_id)

analysis_records 独立存储，不直接关联其他表
（data_summary 字段以 JSONB 存储上传摘要快照）
```

---

## RLS 状态

**全部三张表的 Row Level Security（RLS）均已关闭。**

后端统一使用 `SUPABASE_SERVICE_KEY`（service_role key）访问数据库，该 key 绕过所有 RLS 策略。

> 注意：service_role key 拥有完整数据库写权限，绝对不能暴露给前端或提交到 Git 仓库。
