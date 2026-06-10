-- ============================================================
-- PetroSight AI · 用户与权限表（Supabase / PostgreSQL）
-- 在 Supabase 控制台 → SQL Editor 执行本脚本。
-- 与其余业务表一致：关闭 RLS，后端用 service_role key 统一访问。
-- ============================================================

-- ------------------------------------------------------------
-- 表：users（系统用户 + 角色权限）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.users (
    id            UUID       PRIMARY KEY DEFAULT gen_random_uuid(),   -- 用户唯一ID
    username      VARCHAR    UNIQUE NOT NULL,                         -- 登录名（唯一）
    password_hash VARCHAR    NOT NULL,                                -- bcrypt 密码哈希（后端生成，绝不存明文）
    name          VARCHAR,                                            -- 显示姓名
    role          VARCHAR    NOT NULL DEFAULT 'viewer'
                  CHECK (role IN ('admin', 'operator', 'viewer')),    -- 角色：admin/operator/viewer
    status        VARCHAR    NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'disabled')),           -- 账号状态：active/disabled
    permissions   JSONB      DEFAULT '{}'::jsonb,                     -- 预留：后续细粒度权限（如按模块/区域授权）
    created_at    TIMESTAMP  DEFAULT NOW(),                           -- 创建时间
    last_login_at TIMESTAMP                                           -- 最近登录时间
);

ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;

-- 角色说明：
--   admin    管理员：全部权限，含用户管理（增删改用户、改角色）
--   operator 操作员：上传数据、AI 分析、图像识别等业务操作
--   viewer   访客：只读查看各页面
-- permissions（JSONB）当前未启用，为后续「人员细粒度权限设置」预留。

-- ------------------------------------------------------------
-- 首个管理员账号：用 backend/create_user.py 生成（密码需 bcrypt 哈希，勿直接写明文）：
--   python create_user.py admin <你的密码> admin 系统管理员
-- ------------------------------------------------------------
