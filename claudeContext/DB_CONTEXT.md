# 数据库结构上下文 · PetroSight AI

> 本文件是 Claude Code 的数据库上下文参考。
> **每次修改表结构后必须同步更新此文件。**

---

## 基本信息

| 项目 | 值 |
|---|---|
| 数据库 | Supabase (PostgreSQL) |
| Schema | public |
| RLS | 全部关闭 |
| 访问方式 | service_role key（后端 `.env` 中的 `SUPABASE_SERVICE_KEY`） |

---

## 表结构

### sensors · 传感器基础信息

传感器的静态档案，每个物理传感器对应一条记录。

| 字段 | 类型 | 可空 | 默认值 | 说明 |
|---|---|---|---|---|
| `id` | VARCHAR | ❌ | — | **主键**，人工命名，如 `GAS-01`、`CAM-03`、`DRONE-02` |
| `name` | VARCHAR | ❌ | — | 显示名称，如"装置区甲烷传感器" |
| `type` | VARCHAR | ❌ | — | 传感器类型：`gas` / `thermal` / `camera` / `drone` |
| `zone` | VARCHAR | ❌ | — | 所在区域编号，如 `A区`、`B区` |
| `lng` | FLOAT | ✅ | — | 经度（北斗/GPS坐标） |
| `lat` | FLOAT | ✅ | — | 纬度（北斗/GPS坐标） |
| `floor` | VARCHAR | ✅ | `'地面'` | 楼层或垂直位置 |
| `status` | VARCHAR | ✅ | `'online'` | 状态：`online` / `offline` / `fault` |
| `activated_at` | TIMESTAMP | ✅ | `now()` | 传感器激活时间 |
| `description` | VARCHAR | ✅ | — | 备注描述 |

---

### sensor_records · 传感器数据记录

传感器采集到的每一条事件/数据记录，是系统的核心数据表。

| 字段 | 类型 | 可空 | 默认值 | 说明 |
|---|---|---|---|---|
| `id` | UUID | ❌ | `gen_random_uuid()` | **主键**，自动生成 |
| `sensor_id` | VARCHAR | ✅ | — | **外键** → `sensors.id`，允许为空（传感器被删除后记录保留） |
| `category` | VARCHAR | ❌ | — | 数据类别，如 `gas`、`temperature`、`image`、`position` |
| `value` | FLOAT | ✅ | — | 数值型读数（非数值类传感器可为空） |
| `unit` | VARCHAR | ✅ | — | 单位，如 `ppm`、`℃`、`%LEL` |
| `severity` | VARCHAR | ❌ | — | 严重程度：`normal` / `warning` / `danger` |
| `title` | VARCHAR | ❌ | — | 事件标题，如"甲烷浓度超标" |
| `detail` | VARCHAR | ✅ | — | 详细描述 |
| `zone` | VARCHAR | ❌ | — | 所在区域（冗余存储，不需要 JOIN sensors 就能按区域查询） |
| `recorded_at` | TIMESTAMP | ❌ | — | 传感器**采集时间**（非写入时间，用于时序分析） |
| `created_at` | TIMESTAMP | ✅ | `now()` | 记录写入数据库的时间 |

---

### analysis_records · AI 分析记录

每次用户发起 AI 分析时产生一条记录，存储请求和结果。

| 字段 | 类型 | 可空 | 默认值 | 说明 |
|---|---|---|---|---|
| `id` | UUID | ❌ | `gen_random_uuid()` | **主键**，自动生成 |
| `user_prompt` | TEXT | ❌ | — | 用户输入的原始自然语言请求 |
| `data_summary` | JSONB | ✅ | — | 发送给 DeepSeek API 的结构化数据摘要 |
| `ai_report` | TEXT | ✅ | — | DeepSeek API 返回的完整分析报告文本 |
| `record_count` | INTEGER | ✅ | `0` | 本次分析涉及的 sensor_records 条数 |
| `anomaly_count` | INTEGER | ✅ | `0` | 本次分析检测到的异常事件数量 |
| `created_at` | TIMESTAMP | ✅ | `now()` | 分析记录创建时间 |

---

## 表关系

```
sensors (id)
    ↑
    └── sensor_records.sensor_id (外键，ON DELETE SET NULL)

analysis_records
    └── 不直接关联 sensors，通过 data_summary JSONB 字段内含区域/时间范围信息
```

---

## 常用查询参考

```sql
-- 查询某区域最近的异常记录
SELECT * FROM sensor_records
WHERE zone = 'A区' AND severity != 'normal'
ORDER BY recorded_at DESC
LIMIT 20;

-- 查询某传感器的历史数据
SELECT * FROM sensor_records
WHERE sensor_id = 'GAS-01'
ORDER BY recorded_at DESC;

-- 查询在线传感器列表
SELECT * FROM sensors WHERE status = 'online';

-- 查询最近的 AI 分析报告
SELECT id, user_prompt, anomaly_count, created_at
FROM analysis_records
ORDER BY created_at DESC
LIMIT 10;
```

---

## 注意事项

- `sensor_records.zone` 是冗余字段，写入时需与对应 `sensors.zone` 保持一致
- `recorded_at` 是传感器采集时间，时序图表和历史查询都用这个字段，不要用 `created_at`
- `data_summary` 是 JSONB，后端写入时确保是合法 JSON，建议包含 `{ zone, time_range, records: [...] }` 结构
- `severity` 取值固定为 `normal` / `warning` / `danger`，前端颜色映射依赖这三个值，不要随意扩展
