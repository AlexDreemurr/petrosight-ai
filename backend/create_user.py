"""
创建系统用户（命令行工具）

用途：初始化首个管理员，或在没有前端时手动建号。密码用 bcrypt 哈希后写入 users 表。

用法：
    python create_user.py <用户名> <密码> [角色] [姓名]

示例：
    python create_user.py admin Passw0rd! admin 系统管理员
    python create_user.py zhangsan 123456 operator 张三

角色取值：admin / operator / viewer（默认 viewer）
依赖：与后端同一套环境变量（SUPABASE_URL、SUPABASE_SERVICE_KEY）。
"""

import os
import sys

from dotenv import load_dotenv
from supabase import create_client

from auth import hash_password, ROLE_LEVEL

load_dotenv()


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)

    username = sys.argv[1].strip()
    password = sys.argv[2]
    role = sys.argv[3].strip() if len(sys.argv) > 3 else "viewer"
    name = sys.argv[4].strip() if len(sys.argv) > 4 else username

    if role not in ROLE_LEVEL:
        print(f"非法角色：{role}，应为 {list(ROLE_LEVEL)} 之一")
        sys.exit(1)
    if len(password) < 6:
        print("密码至少 6 位")
        sys.exit(1)

    sb = create_client(os.getenv("SUPABASE_URL", ""), os.getenv("SUPABASE_SERVICE_KEY", ""))

    exists = sb.table("users").select("id").eq("username", username).execute().data
    if exists:
        print(f"用户名已存在：{username}")
        sys.exit(1)

    sb.table("users").insert(
        {
            "username": username,
            "password_hash": hash_password(password),
            "name": name,
            "role": role,
        }
    ).execute()
    print(f"已创建用户：{username}（角色 {role}）")


if __name__ == "__main__":
    main()
