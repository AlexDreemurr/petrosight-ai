"""一键把某组数据集导入后端（注册传感器 + 按时间顺序上传所有快照）。

依赖：httpx（上传，已在 requirements）、supabase + python-dotenv（--clear 清库，可选）。

用法（在 backend 目录下运行）：
    python seed.py data1                # 注册 data1 的传感器并上传其全部快照
    python seed.py data1 --clear        # 先清空数据库再导入
    python seed.py data2 --base http://localhost:8000
    python seed.py data1 --clear --no-snapshots   # 只清库+注册，不传快照

参数：
    dataset            数据集文件夹名（mock_data/ 下，如 data1 / data2）
    --base URL         后端地址，默认 http://localhost:8000（也可用环境变量 API_BASE）
    --clear            导入前清空 sensor_records / analysis_records / sensors
    --no-snapshots     只注册传感器，不上传快照

提示：数据文件由 `python generate_mock.py` 生成。
"""
import os
import sys
import glob
import argparse

import httpx

# 让 Windows 终端也能正常打印中文
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

HERE = os.path.dirname(os.path.abspath(__file__))
MOCK_ROOT = os.path.join(HERE, "..", "mock_data")
XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def clear_database():
    """用 service_role key 直接清空三张业务表（需要 backend/.env 配置）。"""
    from dotenv import load_dotenv
    from supabase import create_client

    load_dotenv(os.path.join(HERE, ".env"))
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY")
    if not url or not key:
        print("  [跳过清库] 未找到 SUPABASE_URL / SUPABASE_SERVICE_KEY")
        return
    sb = create_client(url, key)
    # 先删子表（外键），再删父表
    sb.table("sensor_records").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
    sb.table("analysis_records").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
    sb.table("sensors").delete().neq("id", "__none__").execute()
    print("  已清空 sensor_records / analysis_records / sensors")


def post_file(base, path_, endpoint):
    """上传单个 Excel 到指定接口，返回 (ok, message)。"""
    with open(path_, "rb") as f:
        files = {"file": (os.path.basename(path_), f, XLSX_MIME)}
        try:
            r = httpx.post(f"{base}{endpoint}", files=files, timeout=120)
        except Exception as e:
            return False, f"请求失败：{e}"
    if r.status_code == 200:
        return True, r.json()
    try:
        detail = r.json().get("detail", r.text)
    except Exception:
        detail = r.text
    return False, f"HTTP {r.status_code}：{detail}"


def main():
    ap = argparse.ArgumentParser(description="导入一组数据集到 PetroSight 后端")
    ap.add_argument("dataset", help="数据集文件夹名，如 data1 / data2")
    ap.add_argument("--base", default=os.getenv("API_BASE", "http://localhost:8000"),
                    help="后端地址，默认 http://localhost:8000")
    ap.add_argument("--clear", action="store_true", help="导入前清空数据库")
    ap.add_argument("--no-snapshots", action="store_true", help="只注册传感器，不上传快照")
    args = ap.parse_args()

    folder = os.path.join(MOCK_ROOT, args.dataset)
    sensors_file = os.path.join(folder, "sensors.xlsx")
    if not os.path.isdir(folder):
        sys.exit(f"找不到数据集文件夹：{folder}\n请先运行 python generate_mock.py 生成数据。")
    if not os.path.isfile(sensors_file):
        sys.exit(f"找不到注册表：{sensors_file}")

    base = args.base.rstrip("/")
    print(f"目标后端：{base}")
    print(f"数据集：{folder}")

    # 健康检查
    try:
        httpx.get(f"{base}/", timeout=10)
    except Exception as e:
        sys.exit(f"无法连接后端 {base}：{e}\n请确认后端已启动（uvicorn main:app --port 8000）。")

    # 1) 清库
    if args.clear:
        print("[1/3] 清空数据库...")
        clear_database()

    # 2) 注册传感器
    print("[2/3] 注册传感器...")
    ok, res = post_file(base, sensors_file, "/api/register-sensors")
    if not ok:
        sys.exit(f"  传感器注册失败：{res}")
    print(f"  已注册 {res.get('registered')} 个传感器")

    # 3) 上传快照（按文件名 = 时间，升序）
    if args.no_snapshots:
        print("[3/3] 跳过快照上传（--no-snapshots）")
        print("完成。")
        return

    snapshots = sorted(
        p for p in glob.glob(os.path.join(folder, "*.xlsx"))
        if os.path.basename(p) != "sensors.xlsx"
    )
    print(f"[3/3] 上传 {len(snapshots)} 份快照（按时间升序）...")
    success = 0
    for p in snapshots:
        ok, res = post_file(base, p, "/api/upload-excel")
        name = os.path.basename(p)
        if ok:
            success += 1
            print(f"  ✓ {name}  共 {res.get('total')} 条，异常 {res.get('anomaly_count')} 条")
        else:
            print(f"  ✗ {name}  {res}")
    print(f"完成：{success}/{len(snapshots)} 份快照上传成功。")
    if success:
        print("打开「厂区总览」即可看到最新快照状态。")


if __name__ == "__main__":
    main()
