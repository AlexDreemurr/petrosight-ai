-- ============================================================
-- PetroSight AI · Supabase Database Schema
-- Project: 石化厂区全场景北斗/多传感器融合主动感知识别与定位系统
-- Database: PostgreSQL (Supabase)
-- RLS: 全部关闭，使用 service_role key 访问
-- ============================================================


-- ------------------------------------------------------------
-- 表一：sensors（传感器基础信息）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sensors (
    id           VARCHAR        PRIMARY KEY,                          -- 传感器唯一ID，如 GAS-01、CAM-03
    name         VARCHAR        NOT NULL,                             -- 显示名称
    type         VARCHAR        NOT NULL
                 CHECK (type IN ('gas', 'thermal', 'camera', 'drone')), -- 类型：gas / thermal / camera / drone
    zone         VARCHAR        NOT NULL,                             -- 所在区域编号
    lng          FLOAT,                                               -- 经度
    lat          FLOAT,                                               -- 纬度
    floor        VARCHAR        DEFAULT '地面',                       -- 楼层/位置，默认地面
    status       VARCHAR        DEFAULT 'online',                     -- 状态：online / offline / fault
    activated_at TIMESTAMP      DEFAULT NOW(),                        -- 激活时间
    description  VARCHAR                                              -- 备注描述
);

ALTER TABLE public.sensors DISABLE ROW LEVEL SECURITY;


-- ------------------------------------------------------------
-- 表二：sensor_records（传感器数据记录）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sensor_records (
    id          UUID           PRIMARY KEY DEFAULT gen_random_uuid(), -- 记录唯一ID
    sensor_id   VARCHAR        REFERENCES public.sensors(id),        -- 关联传感器ID（外键）
    category    VARCHAR        NOT NULL
                CHECK (category IN ('gas', 'thermal', 'behavior', 'device')), -- 数据类别：gas / thermal / behavior / device
    value       FLOAT,                                                -- 数值（数值类传感器）
    unit        VARCHAR,                                              -- 单位，如 ppm、℃、%
    severity    VARCHAR        NOT NULL
                CHECK (severity IN ('error', 'warning', 'info')),     -- 严重程度：error / warning / info（后端 get_severity 判定）
    title       VARCHAR        NOT NULL,                              -- 事件标题
    detail      VARCHAR,                                              -- 事件详情描述
    zone        VARCHAR        NOT NULL,                              -- 所在区域（冗余存储，方便查询）
    recorded_at TIMESTAMP      NOT NULL,                              -- 传感器采集时间
    created_at  TIMESTAMP      DEFAULT NOW()                          -- 记录写入数据库时间
);

ALTER TABLE public.sensor_records DISABLE ROW LEVEL SECURITY;


-- ------------------------------------------------------------
-- 表三：analysis_records（AI 分析记录）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.analysis_records (
    id            UUID      PRIMARY KEY DEFAULT gen_random_uuid(),    -- 分析记录唯一ID
    user_prompt   TEXT      NOT NULL,                                 -- 用户输入的分析请求原文
    data_summary  JSONB,                                              -- 传给 AI 的数据摘要（结构化JSON）
    ai_report     TEXT,                                               -- DeepSeek API 返回的分析报告
    record_count  INTEGER   DEFAULT 0,                                -- 本次分析涉及的传感器记录条数
    anomaly_count INTEGER   DEFAULT 0,                                -- 本次分析检测到的异常数量
    created_at    TIMESTAMP DEFAULT NOW()                             -- 分析创建时间
);

ALTER TABLE public.analysis_records DISABLE ROW LEVEL SECURITY;
