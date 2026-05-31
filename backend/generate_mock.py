"""运行此脚本生成 mock_data.xlsx，可直接上传到 PetroSight 演示"""
import pandas as pd
from datetime import datetime, timedelta
import random

zones = ["A区-常压蒸馏", "B区-加氢裂化", "C区-催化裂化", "D区-储罐区", "E区-公用工程"]
sensors = {
    "gas": ["GAS-01", "GAS-02", "GAS-03", "GAS-04"],
    "thermal": ["THM-01", "THM-02", "THM-03"],
    "behavior": ["CAM-01", "CAM-02"],
}

rows = []
base_time = datetime.now() - timedelta(hours=8)

for i in range(60):
    t = base_time + timedelta(minutes=i * 8)
    zone = random.choice(zones)

    # 气体传感器（容易触发告警）
    for sid in sensors["gas"]:
        v = random.choice([
            random.uniform(50, 180),    # 正常
            random.uniform(210, 380),   # warning
            random.uniform(410, 600),   # error（少数）
        ] if random.random() > 0.85 else [random.uniform(50, 180)])
        rows.append({
            "sensor_id": sid,
            "category": "gas",
            "value": round(v, 1),
            "unit": "ppm",
            "title": "可燃气体浓度检测" if v < 200 else "可燃气体浓度超标",
            "detail": f"传感器 {sid} 在 {zone} 检测到浓度 {v:.1f} ppm",
            "zone": zone,
            "recorded_at": t.strftime("%Y-%m-%d %H:%M:%S"),
        })

    # 热成像传感器
    for sid in sensors["thermal"]:
        v = random.choice([
            random.uniform(60, 140),    # 正常
            random.uniform(155, 290),   # warning
            random.uniform(310, 450),   # error
        ] if random.random() > 0.9 else [random.uniform(60, 140)])
        rows.append({
            "sensor_id": sid,
            "category": "thermal",
            "value": round(v, 1),
            "unit": "°C",
            "title": "表面温度正常" if v < 150 else "高温预警",
            "detail": f"传感器 {sid} 检测到设备表面温度 {v:.1f}°C",
            "zone": zone,
            "recorded_at": t.strftime("%Y-%m-%d %H:%M:%S"),
        })

df = pd.DataFrame(rows)
df.to_excel("mock_data.xlsx", index=False)
print(f"生成完成：{len(df)} 条记录 → mock_data.xlsx")
