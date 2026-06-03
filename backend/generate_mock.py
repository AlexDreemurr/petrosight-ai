"""生成 PetroSight 演示数据（贴近真实传感器逻辑）。

数据组织：mock_data/ 下两组「独立数据集」 data1、data2，每组包含：
  - sensors.xlsx        —— 传感器注册表（上传到 /api/register-sensors）
  - <时间戳>.xlsx ×8    —— 数据快照（上传到 /api/upload-excel）

数据特征：
  1. 约 80% 的读数正常，约 20% 略微超过预警/异常区间。
  2. 多数异常是「瞬态事件」：某传感器在中间若干个快照报警，最后又回归正常；
     另保留少量「持续异常」让最新快照仍有少量告警。
  3. 摄像头(category=behavior)拍到违规即触发预警；无人机 category=device（恒正常）。
  4. 每份快照内所有行 recorded_at 相同，文件名即该快照时间。
"""
import os
import glob
import math
import random
import pandas as pd
from datetime import datetime, timedelta

ZONES = ["A区-常压蒸馏", "B区-加氢裂化", "C区-催化裂化", "D区-储罐区", "E区-公用工程"]

# 传感器花名册：(sensor_id, category, type, zone)
#   - type     (sensors.type)            ∈ gas / thermal / camera / drone
#   - category (sensor_records.category) ∈ gas / thermal / behavior / device
#   注意：摄像头 type=camera/category=behavior；无人机 type=drone/category=device
ROSTER = [
    ("GAS-01", "gas", "gas", ZONES[0]),
    ("GAS-02", "gas", "gas", ZONES[1]),
    ("GAS-03", "gas", "gas", ZONES[2]),
    ("GAS-04", "gas", "gas", ZONES[3]),
    ("GAS-05", "gas", "gas", ZONES[4]),
    ("GAS-06", "gas", "gas", ZONES[0]),
    ("THM-01", "thermal", "thermal", ZONES[0]),
    ("THM-02", "thermal", "thermal", ZONES[1]),
    ("THM-03", "thermal", "thermal", ZONES[2]),
    ("THM-04", "thermal", "thermal", ZONES[3]),
    ("THM-05", "thermal", "thermal", ZONES[4]),
    ("CAM-01", "behavior", "camera", ZONES[1]),
    ("CAM-02", "behavior", "camera", ZONES[2]),
    ("CAM-03", "behavior", "camera", ZONES[3]),
    ("CAM-04", "behavior", "camera", ZONES[4]),
    ("CAM-05", "behavior", "camera", ZONES[0]),
    ("UAV-01", "device", "drone", ZONES[0]),
    ("UAV-02", "device", "drone", ZONES[3]),
]

ZONE_REGIONS = {
    "A区-常压蒸馏": (8, 8, 44, 46),
    "B区-加氢裂化": (46, 8, 80, 40),
    "C区-催化裂化": (46, 42, 80, 78),
    "D区-储罐区": (8, 48, 44, 78),
    "E区-公用工程": (8, 80, 80, 94),
}

N_SNAPSHOTS = 8
CAM_VIOLATION_PROB = 0.12  # 摄像头每个快照拍到违规的概率


def positions_in_rect(n, rect, margin=4.0, jitter_ratio=0.18, seed=7):
    """在矩形（留 margin 边距）内为 n 个点生成唯一、均匀分布的坐标。"""
    x0, y0, x1, y1 = rect
    x0 += margin; y0 += margin; x1 -= margin; y1 -= margin
    rng = random.Random(seed)
    cols = math.ceil(math.sqrt(n))
    rows = math.ceil(n / cols)
    cw = (x1 - x0) / cols
    ch = (y1 - y0) / rows
    pts = []
    for idx in range(n):
        r, c = divmod(idx, cols)
        x = x0 + cw * (c + 0.5) + rng.uniform(-cw * jitter_ratio, cw * jitter_ratio)
        y = y0 + ch * (r + 0.5) + rng.uniform(-ch * jitter_ratio, ch * jitter_ratio)
        pts.append((round(x, 2), round(y, 2)))
    rng.shuffle(pts)
    return pts


def compute_positions(roster):
    pos, by_zone = {}, {}
    for sid, _c, _t, zone in roster:
        by_zone.setdefault(zone, []).append(sid)
    for zi, (zone, sids) in enumerate(by_zone.items()):
        for sid, p in zip(sids, positions_in_rect(len(sids), ZONE_REGIONS[zone], seed=7 + zi)):
            pos[sid] = p
    return pos


# 异常事件（瞬态/持续）：(sensor_id, band, start_idx, end_idx)，索引含两端，7 为最新快照。
# end < 7 → 瞬态（最后回归正常）；end == 7 → 持续到当前。
EPISODES = {
    "data1": [
        ("GAS-02", "warning", 0, 2),   # 早期瞬态
        ("THM-02", "warning", 1, 5),   # 中段瞬态
        ("GAS-01", "error", 2, 4),     # 中段瞬态（一度危险后恢复）
        ("GAS-03", "warning", 3, 6),   # 中后段瞬态
        ("THM-04", "error", 5, 7),     # 持续到当前
        ("GAS-05", "warning", 6, 7),   # 持续到当前
    ],
    "data2": [
        ("THM-02", "warning", 2, 6),   # 较长瞬态
        ("GAS-04", "error", 3, 5),     # 中段瞬态
        ("GAS-06", "warning", 6, 7),   # 持续到当前
    ],
}


def band_at(sid, k, episodes):
    for s, b, a, e in episodes:
        if s == sid and a <= k <= e:
            return b
    return "normal"


def gen_reading(category, stype, band, rng):
    """生成某传感器在某时刻的读数：(value, unit, title, detail)。"""
    if category == "gas":
        v = round({
            "error": lambda: rng.uniform(410, 560),
            "warning": lambda: rng.uniform(210, 360),
            "normal": lambda: rng.uniform(50, 180),
        }[band](), 1)
        title = "可燃气体浓度检测" if v < 200 else "可燃气体浓度超标"
        return v, "ppm", title, f"检测到可燃气体浓度 {v} ppm"
    if category == "thermal":
        v = round({
            "error": lambda: rng.uniform(310, 430),
            "warning": lambda: rng.uniform(160, 290),
            "normal": lambda: rng.uniform(60, 140),
        }[band](), 1)
        title = "表面温度正常" if v < 150 else "高温预警"
        return v, "°C", title, f"检测到设备表面温度 {v} °C"
    if stype == "drone":
        v = round(rng.uniform(40, 100), 0)
        return v, "%", "无人机巡检", f"无人机巡检中，剩余电量 {v:.0f}%"
    # 摄像头行为识别：拍到违规 → value=1（后端据此判为 warning）
    violation = rng.random() < CAM_VIOLATION_PROB
    if violation:
        return 1, "人", "识别到不规范操作", "识别到作业人员未佩戴安全帽"
    return 0, "人", "人员行为正常", "区域内人员行为规范"


def build_dataset(out_dir, episodes, seed):
    os.makedirs(out_dir, exist_ok=True)
    # 清空旧文件，避免多次运行的快照（时间戳不同）累积
    for f in glob.glob(os.path.join(out_dir, "*.xlsx")):
        os.remove(f)
    rng = random.Random(seed)
    pos = compute_positions(ROSTER)

    # 1) 注册表
    sensor_rows = []
    for sid, _cat, typ, zone in ROSTER:
        lng, lat = pos[sid]
        sensor_rows.append({
            "id": sid,
            "name": f"{zone[:2]}{typ}传感器-{sid.split('-')[1]}",
            "type": typ,
            "zone": zone,
            "lng": lng,
            "lat": lat,
            "status": "online",
        })
    pd.DataFrame(sensor_rows).to_excel(os.path.join(out_dir, "sensors.xlsx"), index=False)

    # 2) 快照
    now = datetime.now().replace(microsecond=0)
    files, anomaly_pts, total_pts = [], 0, 0
    for k in range(N_SNAPSHOTS):
        t = now - timedelta(minutes=10 * (N_SNAPSHOTS - 1 - k))
        ts = t.strftime("%Y-%m-%d %H:%M:%S")
        rows = []
        for sid, cat, typ, zone in ROSTER:
            band = band_at(sid, k, episodes)
            v, unit, title, detail = gen_reading(cat, typ, band, rng)
            # 统计异常占比（gas/thermal 看 band，camera 看是否违规）
            total_pts += 1
            if band != "normal" or (typ == "camera" and v >= 1):
                anomaly_pts += 1
            rows.append({
                "sensor_id": sid,
                "category": cat,
                "value": v,
                "unit": unit,
                "title": title,
                "detail": f"传感器 {sid} 在 {zone}：{detail}",
                "zone": zone,
                "recorded_at": ts,
            })
        fname = t.strftime("%Y%m%d_%H%M%S") + ".xlsx"
        pd.DataFrame(rows).to_excel(os.path.join(out_dir, fname), index=False)
        files.append(fname)

    return sensor_rows, files, anomaly_pts, total_pts


def main():
    base = os.path.join(os.path.dirname(__file__), "..", "mock_data")
    for i, (name, episodes) in enumerate(EPISODES.items()):
        out_dir = os.path.join(base, name)
        sensors, files, an, tot = build_dataset(out_dir, episodes, seed=100 + i)
        pct = round(an / tot * 100, 1) if tot else 0
        print(f"[{name}] 传感器 {len(sensors)} 个，快照 {len(files)} 份，"
              f"异常读数 {an}/{tot}（{pct}%） -> {out_dir}")
    print("完成。导入：python seed.py data1 --clear")


if __name__ == "__main__":
    main()
