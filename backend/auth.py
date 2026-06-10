"""
PetroSight AI · 认证与权限模块

职责：提供登录、当前用户、用户管理（增删改查）等认证相关 REST API，
      以及供其它接口复用的「登录校验 / 角色校验」依赖。

认证方式：轻量 JWT —— 登录校验 bcrypt 密码哈希后签发 token，
          前端在 Authorization: Bearer <token> 头中携带，后端解码校验。

角色分级（由高到低）：admin > operator > viewer
  admin    管理员：全部权限 + 用户管理
  operator 操作员：业务操作（上传/分析/识别）
  viewer   访客：只读

下游依赖：Supabase（users 表，关闭 RLS，service_role key 访问）
"""

import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from supabase import create_client, Client

# 自行加载 .env，保证无论被 main 还是 create_user.py 以何种顺序导入都能取到配置
load_dotenv()

# ── 配置 ──────────────────────────────────────────────────────────────────
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
JWT_SECRET = os.getenv("JWT_SECRET", "dev-insecure-secret-change-me")
JWT_ALGO = "HS256"
TOKEN_EXPIRE_HOURS = int(os.getenv("TOKEN_EXPIRE_HOURS", "12"))

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# 角色等级：require_min_role 用等级比较实现「不低于某角色」
ROLE_LEVEL = {"viewer": 1, "operator": 2, "admin": 3}

# 返回给前端的用户字段（绝不含 password_hash）
PUBLIC_FIELDS = "id, username, name, role, status, permissions, created_at, last_login_at"

router = APIRouter(prefix="/api/auth", tags=["认证"])
bearer = HTTPBearer(auto_error=False)


# ── 密码哈希 ──────────────────────────────────────────────────────────────
def hash_password(pw: str) -> str:
    """生成 bcrypt 密码哈希。"""
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(pw: str, hashed: str) -> bool:
    """校验明文密码与 bcrypt 哈希是否匹配。"""
    try:
        return bcrypt.checkpw(pw.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


# ── JWT ───────────────────────────────────────────────────────────────────
def create_token(user: dict) -> str:
    """为用户签发 JWT，载荷含 id/username/role 与过期时间。"""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user["id"],
        "username": user["username"],
        "role": user["role"],
        "iat": now,
        "exp": now + timedelta(hours=TOKEN_EXPIRE_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


def decode_token(token: str) -> dict:
    """解码并校验 JWT，失败抛 401。"""
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="登录已过期，请重新登录")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="无效的登录凭证")


# ── 依赖：登录校验 / 角色校验 ───────────────────────────────────────────────
def get_current_user(
    cred: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
) -> dict:
    """从 Bearer token 解析并返回当前用户（校验账号存在且未禁用）。"""
    if cred is None:
        raise HTTPException(status_code=401, detail="未登录")
    payload = decode_token(cred.credentials)
    rows = (
        supabase.table("users")
        .select(PUBLIC_FIELDS)
        .eq("id", payload.get("sub"))
        .limit(1)
        .execute()
        .data
    )
    if not rows:
        raise HTTPException(status_code=401, detail="用户不存在")
    user = rows[0]
    if user.get("status") != "active":
        raise HTTPException(status_code=403, detail="账号已被禁用")
    return user


def require_min_role(min_role: str):
    """生成「角色不低于 min_role」的依赖。用法：Depends(require_min_role('admin'))。"""
    threshold = ROLE_LEVEL.get(min_role, 99)

    def checker(user: dict = Depends(get_current_user)) -> dict:
        if ROLE_LEVEL.get(user.get("role"), 0) < threshold:
            raise HTTPException(status_code=403, detail="权限不足")
        return user

    return checker


# ── 请求体模型 ──────────────────────────────────────────────────────────────
class LoginRequest(BaseModel):
    username: str
    password: str


class UserCreate(BaseModel):
    username: str
    password: str
    name: Optional[str] = None
    role: str = "viewer"


class UserUpdate(BaseModel):
    """管理员更新用户：均为可选，仅更新提供的字段。"""
    name: Optional[str] = None
    role: Optional[str] = None
    status: Optional[str] = None
    password: Optional[str] = None


class ChangePassword(BaseModel):
    old_password: str
    new_password: str


# ── 接口 ───────────────────────────────────────────────────────────────────
@router.post("/login", summary="登录", response_description="JWT 令牌与用户信息")
def login(req: LoginRequest):
    """校验用户名密码，成功返回 {token, user}。"""
    rows = (
        supabase.table("users")
        .select("*")
        .eq("username", req.username.strip())
        .limit(1)
        .execute()
        .data
    )
    if not rows or not verify_password(req.password, rows[0]["password_hash"]):
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    user = rows[0]
    if user.get("status") != "active":
        raise HTTPException(status_code=403, detail="账号已被禁用")

    supabase.table("users").update(
        {"last_login_at": datetime.now(timezone.utc).isoformat()}
    ).eq("id", user["id"]).execute()

    token = create_token(user)
    user.pop("password_hash", None)
    return {"token": token, "user": user}


@router.get("/me", summary="获取当前登录用户")
def me(user: dict = Depends(get_current_user)):
    """返回当前 token 对应的用户信息。"""
    return user


@router.post("/change-password", summary="修改自己的密码")
def change_password(req: ChangePassword, user: dict = Depends(get_current_user)):
    """校验旧密码后更新为新密码。"""
    rows = (
        supabase.table("users").select("password_hash").eq("id", user["id"]).limit(1).execute().data
    )
    if not rows or not verify_password(req.old_password, rows[0]["password_hash"]):
        raise HTTPException(status_code=400, detail="原密码错误")
    if len(req.new_password) < 6:
        raise HTTPException(status_code=400, detail="新密码至少 6 位")
    supabase.table("users").update(
        {"password_hash": hash_password(req.new_password)}
    ).eq("id", user["id"]).execute()
    return {"status": "ok"}


# ── 用户管理（仅 admin）────────────────────────────────────────────────────
@router.get("/users", summary="用户列表（管理员）")
def list_users(_: dict = Depends(require_min_role("admin"))):
    """返回全部用户（不含密码哈希），按创建时间倒序。"""
    return (
        supabase.table("users")
        .select(PUBLIC_FIELDS)
        .order("created_at", desc=True)
        .execute()
        .data
    )


@router.post("/users", summary="新建用户（管理员）")
def create_user(req: UserCreate, _: dict = Depends(require_min_role("admin"))):
    """创建用户，用户名唯一、密码 bcrypt 加密存储。"""
    if req.role not in ROLE_LEVEL:
        raise HTTPException(status_code=400, detail=f"非法角色：{req.role}")
    if len(req.password) < 6:
        raise HTTPException(status_code=400, detail="密码至少 6 位")
    username = req.username.strip()
    exists = supabase.table("users").select("id").eq("username", username).execute().data
    if exists:
        raise HTTPException(status_code=400, detail="用户名已存在")
    inserted = (
        supabase.table("users")
        .insert(
            {
                "username": username,
                "password_hash": hash_password(req.password),
                "name": (req.name or username).strip(),
                "role": req.role,
            }
        )
        .execute()
        .data
    )
    row = inserted[0]
    row.pop("password_hash", None)
    return row


@router.patch("/users/{uid}", summary="更新用户（管理员）")
def update_user(uid: str, req: UserUpdate, admin: dict = Depends(require_min_role("admin"))):
    """更新用户的姓名/角色/状态/密码（仅更新提供的字段）。"""
    patch = {}
    if req.name is not None:
        patch["name"] = req.name.strip()
    if req.role is not None:
        if req.role not in ROLE_LEVEL:
            raise HTTPException(status_code=400, detail=f"非法角色：{req.role}")
        patch["role"] = req.role
    if req.status is not None:
        if req.status not in ("active", "disabled"):
            raise HTTPException(status_code=400, detail="非法状态")
        # 不允许把自己禁用，避免自锁
        if req.status == "disabled" and uid == admin["id"]:
            raise HTTPException(status_code=400, detail="不能禁用自己的账号")
        patch["status"] = req.status
    if req.password:
        if len(req.password) < 6:
            raise HTTPException(status_code=400, detail="密码至少 6 位")
        patch["password_hash"] = hash_password(req.password)
    if not patch:
        raise HTTPException(status_code=400, detail="没有要更新的字段")

    updated = supabase.table("users").update(patch).eq("id", uid).execute().data
    if not updated:
        raise HTTPException(status_code=404, detail="用户不存在")
    row = updated[0]
    row.pop("password_hash", None)
    return row


@router.delete("/users/{uid}", summary="删除用户（管理员）")
def delete_user(uid: str, admin: dict = Depends(require_min_role("admin"))):
    """删除指定用户，不能删除自己。"""
    if uid == admin["id"]:
        raise HTTPException(status_code=400, detail="不能删除自己的账号")
    supabase.table("users").delete().eq("id", uid).execute()
    return {"status": "ok"}
