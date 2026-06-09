"""
PetroSight AI 后端主模块

职责：提供石化厂区传感器数据管理与 AI 分析的全部 REST API，
      包括 Excel 数据上传解析、DeepSeek AI 安全分析、历史记录查询、
      传感器信息查询及实时数据推送接口。

上游调用者：前端 React 应用（通过 VITE_API_BASE 指向本服务）
下游依赖：Supabase（PostgreSQL 数据存储）、DeepSeek API（AI 推理）
"""

from fastapi import FastAPI, File, UploadFile, HTTPException, Query, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pandas as pd
import io
import os
import httpx
from supabase import create_client, Client
from datetime import datetime
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# 数据库 CHECK 约束允许的取值集合（与 Supabase 实际约束一致，已实测验证）。
# 上传 Excel 时据此校验，避免非法值触发 Postgres 写库 500。
ALLOWED_SENSOR_TYPES = {"gas", "thermal", "camera", "drone"}        # sensors.type
ALLOWED_CATEGORIES = {"gas", "thermal", "behavior", "device"}      # sensor_records.category

# ──────────────────────────────────────────────────────────────────────────
# 图像识别（YOLO-World 开放词表）配置
# ──────────────────────────────────────────────────────────────────────────
ENABLE_YOLO = os.getenv("ENABLE_YOLO", "true").lower() != "false"
YOLO_OPEN_MODEL = os.getenv("YOLO_OPEN_MODEL", "yolov8s-worldv2.pt")

# classes 为空时的默认检测目标（开放词表用英文最稳）
DEFAULT_CLASSES = ["person", "fire", "smoke", "helmet", "car", "truck"]
# 命中即标记为风险（前端红色高亮），可按需扩充
RISK_CLASSES = {
    "fire", "flame", "flames", "burning", "smoke", "smog",
    "no helmet", "no-helmet", "bare head", "spill", "leak",
}
# 英文目标词 → 中文展示（兜底用，找不到回退英文原词）
LABEL_CN = {
    "person": "人员", "fire": "明火", "flame": "火焰", "flames": "火焰",
    "burning": "燃烧", "smoke": "烟雾", "smog": "烟雾", "helmet": "安全帽",
    "hard hat": "安全帽", "no helmet": "未戴安全帽", "bare head": "未戴安全帽",
    "car": "车辆", "truck": "卡车", "forklift": "叉车",
    "spill": "泄漏物", "leak": "泄漏",
}

# 可选模型注册表：开放词表通用模型 + 各专用权重。
# 专用权重不随仓库分发，需下载 best.pt 放到对应路径（或用环境变量覆盖）。
DETECT_MODELS = {
    "open": {
        "name": "通用开放词表 (YOLO-World)",
        "weights": YOLO_OPEN_MODEL,
        "open_vocab": True,
    },
}

# 安全帽权重路径（仅供「安全帽合规检测」管线内部使用，不作为单独模型暴露）
HELMET_MODEL_PATH = os.getenv("HELMET_MODEL_PATH", "weights/helmet.pt")

_model_cache = {}  # model_id -> 已加载模型


def get_detect_model(model_id: str):
    """懒加载并缓存指定模型；返回 (model, cfg)。失败抛 RuntimeError。"""
    cfg = DETECT_MODELS.get(model_id)
    if not cfg:
        raise RuntimeError(f"未知模型：{model_id}")
    if model_id in _model_cache:
        return _model_cache[model_id], cfg

    weights = cfg["weights"]
    if not cfg["open_vocab"] and not os.path.exists(weights):
        raise RuntimeError(
            f"权重文件不存在：{weights}。请下载该专用模型的 best.pt 放到此路径，"
            f"或用环境变量指定路径。"
        )
    try:
        if cfg["open_vocab"]:
            from ultralytics import YOLOWorld
            model = YOLOWorld(weights)
        else:
            from ultralytics import YOLO
            model = YOLO(weights)
    except ImportError as e:
        raise RuntimeError(f"未安装 ultralytics 依赖：{e}")
    except Exception as e:
        raise RuntimeError(f"模型加载失败（{weights}）：{e}")
    _model_cache[model_id] = model
    return model, cfg


# ──────────────────────────────────────────────────────────────────────────
# 安全帽合规检测（双模型 + 头部区域空间匹配）配置
# ──────────────────────────────────────────────────────────────────────────
PERSON_MODEL_PATH = os.getenv("PERSON_MODEL_PATH", "yolov8n.pt")  # 通用 person 检测
PERSON_CONF = 0.25       # person 置信度阈值
HELMET_CONF = 0.35       # helmet 阈值（略高，少误检）
HEAD_FRACTION = 0.32     # 头部区域占 person 框高度比例（顶部）
HEAD_PAD_X = 0.0         # 头部区域水平内缩比例

# 道路拥堵分析：用通用 COCO 模型检测车辆类。
# 默认 yolov8s（比 n 召回更好，密集/远处车辆漏检更少）；可用环境变量换 yolov8m 进一步提升。
TRAFFIC_MODEL_PATH = os.getenv("TRAFFIC_MODEL_PATH", "yolov8s.pt")
TRAFFIC_CLASSES = {"car", "truck", "bus", "motorcycle", "bicycle"}
TRAFFIC_LABEL_CN = {
    "car": "汽车", "truck": "卡车", "bus": "公交车",
    "motorcycle": "摩托车", "bicycle": "自行车",
}


def assess_congestion(n: int, coverage: float):
    """根据车辆数量与画面占比判定拥堵等级。返回 (level, level_cn)。"""
    if n >= 12 or coverage > 0.35:
        return "congested", "拥堵"
    if n <= 5 and coverage < 0.15:
        return "smooth", "畅通"
    return "slow", "缓行"


def load_yolo_weights(path: str):
    """通用 YOLO 权重懒加载缓存（用于 person 模型等非注册表模型）。"""
    key = "_w:" + path
    if key in _model_cache:
        return _model_cache[key]
    try:
        from ultralytics import YOLO
        model = YOLO(path)  # 文件不存在时 ultralytics 会尝试自动下载官方权重
    except ImportError as e:
        raise RuntimeError(f"未安装 ultralytics 依赖：{e}")
    except Exception as e:
        raise RuntimeError(f"模型加载失败（{path}）：{e}")
    _model_cache[key] = model
    return model


def get_sahi_model(path: str):
    """懒加载 SAHI 检测模型（包装 ultralytics 权重），缓存。失败抛 RuntimeError。"""
    key = "_sahi:" + path
    if key in _model_cache:
        return _model_cache[key]
    try:
        from sahi import AutoDetectionModel
    except Exception as e:
        raise RuntimeError(f"未安装 sahi 依赖：{e}")
    model = None
    for mtype in ("ultralytics", "yolov8"):  # 兼容不同 sahi 版本
        try:
            model = AutoDetectionModel.from_pretrained(
                model_type=mtype, model_path=path,
                confidence_threshold=0.05, device="cpu",
            )
            break
        except Exception:
            continue
    if model is None:
        raise RuntimeError(f"SAHI 模型加载失败（{path}）")
    _model_cache[key] = model
    return model


def sahi_detect(sahi_model, img_np, conf, slice_size=640, overlap=0.2):
    """SAHI 切片推理，返回与 extract_boxes 同构的列表：[{box(归一化xyxy), conf, label, tid:None}]。"""
    from sahi.predict import get_sliced_prediction
    res = get_sliced_prediction(
        img_np, sahi_model,
        slice_height=slice_size, slice_width=slice_size,
        overlap_height_ratio=overlap, overlap_width_ratio=overlap,
        verbose=0,
    )
    h, w = img_np.shape[:2]
    out = []
    for o in res.object_prediction_list:
        score = float(o.score.value)
        if score < conf:
            continue
        x1, y1, x2, y2 = o.bbox.to_xyxy()
        out.append({
            "box": [x1 / w, y1 / h, x2 / w, y2 / h],
            "conf": round(score, 2),
            "label": str(o.category.name),
            "tid": None,
        })
    return out


def extract_boxes(res, want_label=None, min_conf=0.0):
    """从一次推理/追踪结果提取归一化框：[{box, conf, label, tid}]。

    tid 为追踪 id（来自 model.track），普通 predict 时为 None。
    """
    out = []
    boxes = getattr(res, "boxes", None)
    if boxes is None or len(boxes) == 0:
        return out
    names = res.names
    xyxyn = boxes.xyxyn.tolist()
    confs = boxes.conf.tolist()
    cls = [int(i) for i in boxes.cls.tolist()]
    ids = getattr(boxes, "id", None)
    id_list = ids.tolist() if ids is not None else None
    for i, (bb, cf, ci) in enumerate(zip(xyxyn, confs, cls)):
        if cf < min_conf:
            continue
        if isinstance(names, dict):
            label = names.get(ci, names.get(str(ci), str(ci)))
        elif isinstance(names, (list, tuple)) and 0 <= ci < len(names):
            label = names[ci]
        else:
            label = str(ci)
        if want_label and str(label).lower() != want_label:
            continue
        tid = int(id_list[i]) if (id_list is not None and i < len(id_list) and id_list[i] is not None) else None
        out.append({"box": [float(x) for x in bb], "conf": round(float(cf), 2),
                    "label": str(label), "tid": tid})
    return out


def _norm_xywh(bb):
    x1, y1, x2, y2 = bb
    return {"x": round(max(0.0, x1), 4), "y": round(max(0.0, y1), 4),
            "w": round(max(0.0, x2 - x1), 4), "h": round(max(0.0, y2 - y1), 4)}


def _head_region(bb, frac=HEAD_FRACTION, pad_x=HEAD_PAD_X):
    x1, y1, x2, y2 = bb
    w, h = x2 - x1, y2 - y1
    return (x1 + pad_x * w, y1, x2 - pad_x * w, y1 + frac * h)


def match_a_without_b(persons, items, frac=HEAD_FRACTION, pad_x=HEAD_PAD_X):
    """把 items（如 helmet）按“中心点落在 person 头部区域”匹配给 person。

    返回 (person_match, worn_items)：
      person_match: {person_idx: item_idx}（该人头部命中的物品，合规）
      worn_items:   set(item_idx)（被某人头部匹配上的物品，如戴着的帽）
    一个物品至多配给一个 person（多候选取离头部区域中心最近者）。
    """
    person_match, worn = {}, set()
    for hi, it in enumerate(items):
        b = it["box"]
        hx, hy = (b[0] + b[2]) / 2, (b[1] + b[3]) / 2
        best, best_d = None, 1e9
        for pi, ps in enumerate(persons):
            hr = _head_region(ps["box"], frac, pad_x)
            if hr[0] <= hx <= hr[2] and hr[1] <= hy <= hr[3]:
                cx, cy = (hr[0] + hr[2]) / 2, (hr[1] + hr[3]) / 2
                d = (hx - cx) ** 2 + (hy - cy) ** 2
                if d < best_d:
                    best_d, best = d, pi
        if best is not None:
            worn.add(hi)
            person_match.setdefault(best, hi)
    return person_match, worn


app = FastAPI(
    title="PetroSight AI 后端接口",
    description="石化厂区全场景北斗/多传感器融合主动感知识别与定位系统 API 文档",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:4173",
        "https://resplendent-syrniki-0e1a75.netlify.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_severity(category: str, value: float) -> str:
    """
    根据传感器类别和数值计算告警等级。

    业务规则：
    - gas（气体）：value > 400 → error；value > 200 → warning；否则 → info
    - thermal（热成像）：value > 300 → error；value > 150 → warning；否则 → info
    - behavior（摄像头行为识别）：value >= 1（拍到违规）→ warning；否则 → info
    - 其他类别（如 device/无人机）：统一返回 info

    Args:
        category: 传感器类别，如 "gas"、"thermal"、"behavior"、"device"
        value: 传感器采集的数值

    Returns:
        告警等级字符串："error" / "warning" / "info"
    """
    if category == "gas":
        if value > 400:
            return "error"
        if value > 200:
            return "warning"
        return "info"
    if category == "thermal":
        if value > 300:
            return "error"
        if value > 150:
            return "warning"
        return "info"
    if category == "behavior":
        # 摄像头识别到不规范行为（value>=1）即触发黄色预警
        return "warning" if value >= 1 else "info"
    return "info"


@app.get(
    "/",
    summary="健康检查",
    description="确认后端服务是否正常运行，无需鉴权。",
    tags=["系统"],
    response_description="服务状态与名称",
)
def root():
    """
    健康检查接口。

    Returns:
        包含 status 和 service 字段的 JSON，用于确认服务存活。
    """
    return {"status": "ok", "service": "PetroSight AI"}


def _to_float(val, default=0.0):
    """安全地把单元格转为 float，空值/异常返回默认值。"""
    try:
        if pd.isna(val):
            return default
    except (TypeError, ValueError):
        pass
    try:
        return float(val)
    except (ValueError, TypeError):
        return default


@app.post(
    "/api/register-sensors",
    summary="注册传感器（上传传感器信息表）",
    description=(
        "上传一张传感器信息 Excel，将其 upsert 到 sensors 表。这是数据上传前的第一步——"
        "先注册传感器（含坐标/类型/区域），之后再上传数据快照。重复上传同一 ID 会更新其信息。"
    ),
    tags=["数据上传"],
    response_description="注册结果：注册数量与传感器 ID 列表",
)
async def register_sensors(file: UploadFile = File(...)):
    """
    上传传感器信息 Excel 并 upsert 到 sensors 表。

    Excel 必填列：id、type、zone
    可选列：name（默认取 id）、lng、lat（默认 0）、status（默认 online）、floor、description

    Raises:
        HTTPException 400: 文件格式错误 / 缺列 / type 非法
    """
    if not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="仅支持 .xlsx / .xls 文件")

    contents = await file.read()
    try:
        df = pd.read_excel(io.BytesIO(contents))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Excel 解析失败: {str(e)}")

    required = {"id", "type", "zone"}
    miss = required - set(df.columns)
    if miss:
        raise HTTPException(status_code=400, detail=f"缺少必填列: {miss}")

    sensors = {}
    invalid_types = {}
    for _, row in df.iterrows():
        sid = str(row.get("id", "")).strip()
        if not sid:
            continue
        stype = str(row.get("type", "")).strip().lower()
        if stype not in ALLOWED_SENSOR_TYPES:
            invalid_types[sid] = stype
        sensors[sid] = {
            "id": sid,
            "name": str(row.get("name", "")).strip() or sid,
            "type": stype,
            "zone": str(row.get("zone", "")).strip(),
            "lng": _to_float(row.get("lng"), 0.0),
            "lat": _to_float(row.get("lat"), 0.0),
            "status": str(row.get("status", "")).strip() or "online",
        }

    if invalid_types:
        items = "、".join(f"{sid}（type={t}）" for sid, t in invalid_types.items())
        raise HTTPException(
            status_code=400,
            detail=(
                f"以下传感器 type 不合法：{items}。"
                f"type 仅允许 {sorted(ALLOWED_SENSOR_TYPES)} 之一。"
            ),
        )
    if not sensors:
        raise HTTPException(status_code=400, detail="未解析到任何传感器")

    supabase.table("sensors").upsert(list(sensors.values()), on_conflict="id").execute()
    return {"registered": len(sensors), "sensor_ids": list(sensors.keys())}


@app.post(
    "/api/upload-excel",
    summary="上传数据快照",
    description=(
        "上传一份「数据快照」Excel：同一时刻全场景传感器的读数（所有行 recorded_at 相同）。"
        "解析后批量写入 sensor_records 表，severity 由后端规则自动判定。"
        "要求所涉传感器已通过 /api/register-sensors 注册，否则返回 400。"
    ),
    tags=["数据上传"],
    response_description="解析摘要，包含总记录数、异常统计、类别列表、区域列表及前5条预览",
)
async def upload_excel(file: UploadFile = File(...)):
    """
    上传一份数据快照并写入 sensor_records。

    Excel 必填列：sensor_id、category、value
    可选列：unit、title、detail、zone、recorded_at（同一份内通常相同）

    与旧版区别：不再从数据文件读取 / 写入坐标与类型——这些由传感器注册负责；
    本接口只追加读数，且会校验传感器是否已注册。

    Raises:
        HTTPException 400: 文件格式错误 / 缺列 / category 非法 / 存在未注册传感器
        HTTPException 500: Supabase 写入失败
    """
    if not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="仅支持 .xlsx / .xls 文件")

    contents = await file.read()
    try:
        df = pd.read_excel(io.BytesIO(contents))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Excel 解析失败: {str(e)}")

    required_cols = {"sensor_id", "category", "value"}
    missing = required_cols - set(df.columns)
    if missing:
        raise HTTPException(status_code=400, detail=f"缺少必填列: {missing}")

    records = []
    invalid_categories = set()
    for _, row in df.iterrows():
        category = str(row.get("category", "")).lower().strip()
        if category and category not in ALLOWED_CATEGORIES:
            invalid_categories.add(category)
        value = _to_float(row.get("value"), 0.0)

        raw_time = row.get("recorded_at")
        if pd.isna(raw_time) if hasattr(raw_time, "__class__") else not raw_time:
            recorded_at = datetime.now().isoformat()
        else:
            try:
                recorded_at = pd.to_datetime(raw_time).isoformat()
            except Exception:
                recorded_at = datetime.now().isoformat()

        record = {
            "sensor_id": str(row.get("sensor_id", "")).strip(),
            "category": category,
            "value": value,
            "unit": str(row.get("unit", "")).strip(),
            "severity": get_severity(category, value),
            "title": str(row.get("title", "")).strip(),
            "detail": str(row.get("detail", "")).strip(),
            "zone": str(row.get("zone", "")).strip(),
            "recorded_at": recorded_at,
        }
        records.append(record)

    # category 白名单校验
    if invalid_categories:
        raise HTTPException(
            status_code=400,
            detail=(
                f"以下 category 不合法：{sorted(invalid_categories)}。"
                f"category 仅允许 {sorted(ALLOWED_CATEGORIES)} 之一。"
                "请检查 Excel 的 category 列（注意 camera/drone 属于 type，不是 category）。"
            ),
        )

    # 校验传感器是否已注册（外键依赖 sensors 表）
    if records:
        referenced = {r["sensor_id"] for r in records if r["sensor_id"]}
        existing_rows = supabase.table("sensors").select("id").execute().data or []
        existing = {s["id"] for s in existing_rows}
        unregistered = sorted(referenced - existing)
        if unregistered:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"以下传感器尚未注册：{unregistered}。"
                    "请先在「传感器注册」上传传感器信息表（sensors.xlsx）后再上传数据快照。"
                ),
            )

        supabase.table("sensor_records").insert(records).execute()

    anomaly_count = sum(1 for r in records if r["severity"] in ("error", "warning"))
    categories = list({r["category"] for r in records if r["category"]})
    zones = list({r["zone"] for r in records if r["zone"]})

    severity_breakdown = {
        "error": sum(1 for r in records if r["severity"] == "error"),
        "warning": sum(1 for r in records if r["severity"] == "warning"),
        "info": sum(1 for r in records if r["severity"] == "info"),
    }

    return {
        "total": len(records),
        "anomaly_count": anomaly_count,
        "categories": categories,
        "zones": zones,
        "severity_breakdown": severity_breakdown,
        "preview": records[:5],
    }


class AnalyzeRequest(BaseModel):
    """
    AI 分析请求体。

    Attributes:
        user_prompt: 用户输入的分析任务描述，如"请重点分析A区气体泄漏风险"
        data_summary: 由 /api/upload-excel 返回的数据摘要 JSON（可为空对象）
        start_time: 可选，分析数据的起始时间（ISO 字符串，含此刻）
        end_time: 可选，分析数据的结束时间（ISO 字符串，含此刻）
    """
    user_prompt: str
    data_summary: dict = {}
    start_time: Optional[str] = None
    end_time: Optional[str] = None


@app.post(
    "/api/analyze",
    summary="调用 DeepSeek AI 进行安全分析",
    description=(
        "从数据库查询本次上传的原始传感器记录，转为 CSV 后直接传递给 DeepSeek API，"
        "让 AI 基于完整原始数据生成安全分析报告，并将报告持久化到 analysis_records 表。"
        "超时时间为 90 秒。"
    ),
    tags=["AI 分析"],
    response_description="包含 Markdown 格式 AI 报告的 JSON，字段名为 report",
)
async def analyze(req: AnalyzeRequest):
    """
    从数据库取回原始传感器记录，转 CSV 后传给 DeepSeek 生成安全分析报告。

    流程：
    1. 从 data_summary 提取 zones 和 total，到 sensor_records 中查对应的最新记录
    2. 用 pandas 将记录转为 CSV 字符串（只保留分析有意义的字段）
    3. 将 CSV 原始数据嵌入 prompt，调用 DeepSeek API
    4. 将报告写入 analysis_records，data_summary 只存简要统计

    Args:
        req.user_prompt: 用户输入的分析任务描述（必填，可为空字符串使用默认提示）
        req.data_summary: upload-excel 返回的摘要对象，包含 total、anomaly_count、
                          categories、zones、severity_breakdown 字段

    Returns:
        {"report": "Markdown 格式的安全分析报告文本"}

    Raises:
        HTTPException 500: DEEPSEEK_API_KEY 环境变量未配置
        HTTPException 504: DeepSeek API 请求超时（>90秒）
        HTTPException 502: DeepSeek API 返回错误或网络异常
    """
    if not DEEPSEEK_API_KEY:
        raise HTTPException(status_code=500, detail="DeepSeek API Key 未配置")

    total = req.data_summary.get("total", 0)
    anomaly_count = req.data_summary.get("anomaly_count", 0)
    zones: list = req.data_summary.get("zones", [])
    severity_breakdown = req.data_summary.get("severity_breakdown", {})

    # ── 1. 从 DB 查出原始记录（可选按区域 / 时间段过滤）────────────────────────
    query = supabase.table("sensor_records").select(
        "recorded_at, zone, sensor_id, category, value, unit, severity, title, detail"
    )
    if zones:
        # 用 in_ 过滤，按区域范围缩小查询
        query = query.in_("zone", zones)
    if req.start_time:
        query = query.gte("recorded_at", req.start_time)
    if req.end_time:
        query = query.lte("recorded_at", req.end_time)
    # 指定了时间段时取满额上限，否则沿用 summary 的 total（默认 500）
    limit = 500 if (req.start_time or req.end_time) else (total or 500)
    raw_rows = (
        query.order("recorded_at", desc=True)
        .limit(limit)
        .execute()
        .data
    )

    # ── 2. 转 CSV ─────────────────────────────────────────────────────────────
    csv_columns = ["recorded_at", "zone", "sensor_id", "category",
                   "value", "unit", "severity", "title", "detail"]
    if raw_rows:
        df_csv = pd.DataFrame(raw_rows)[csv_columns]
        csv_text = df_csv.to_csv(index=False)
    else:
        csv_text = "（无可用原始数据）"

    # ── 3. 组装 prompt ────────────────────────────────────────────────────────
    if req.start_time or req.end_time:
        scope = f"（数据时间范围：{req.start_time or '最早'} ~ {req.end_time or '最新'}）"
    else:
        scope = "（数据范围：数据库中全部记录）"
    prompt = f"""你是一名石化厂区安全分析专家。以下是待分析的传感器原始数据{scope}（CSV格式）：

{csv_text}

请根据以上数据完成以下分析：
1. 按区域归纳异常情况，重点说明哪个区域问题最集中
2. 按传感器类型分析，哪类传感器出现异常最多
3. 列出最需要立即处理的事件（error 级别）
4. 给出整体安全评估和处理建议

用户的具体问题是：{req.user_prompt or "请对当前传感器数据进行全面安全分析"}
"""

    # ── 4. 调用 DeepSeek API ──────────────────────────────────────────────────
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(
                "https://api.deepseek.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "deepseek-chat",
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 2000,
                    "temperature": 0.7,
                },
                timeout=90.0,
            )
            resp.raise_for_status()
        except httpx.TimeoutException:
            raise HTTPException(status_code=504, detail="AI 分析超时，请重试")
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"AI 接口错误: {str(e)}")

    ai_report = resp.json()["choices"][0]["message"]["content"]

    # ── 5. 写入 analysis_records（data_summary 只存简要统计）────────────────
    slim_summary = {
        "total": total,
        "severity_breakdown": severity_breakdown,
        "zones": zones,
        "categories": req.data_summary.get("categories", []),
        "note": "原始数据已直接传递给AI，未做二次聚合",
    }
    supabase.table("analysis_records").insert({
        "user_prompt": req.user_prompt,
        "data_summary": slim_summary,
        "ai_report": ai_report,
        "record_count": total,
        "anomaly_count": anomaly_count,
    }).execute()

    return {"report": ai_report}


class TargetParseRequest(BaseModel):
    """自然语言 → 检测目标 请求体。text 为用户的自然语言描述。"""
    text: str


@app.post(
    "/api/parse-detect-targets",
    summary="自然语言解析为检测目标（DeepSeek）",
    description=(
        "把用户的自然语言描述交给 DeepSeek，转成一组简洁英文目标词，"
        "供 YOLO-World 开放词表检测使用。仅返回目标词数组。"
    ),
    tags=["图像识别"],
    response_description='{"task":"open|helmet_compliance","classes":[...],"text":原文}',
)
async def parse_detect_targets(req: TargetParseRequest):
    """
    用 DeepSeek 判断检测任务并抽取目标：
      - 若用户意图是“检查工人是否佩戴安全帽（PPE 合规）”→ task=helmet_compliance
      - 否则 → task=open，并给出开放词表英文目标词数组

    Raises:
        HTTPException 400: 输入为空
        HTTPException 500: DEEPSEEK_API_KEY 未配置
        HTTPException 502/504: DeepSeek 接口错误 / 超时
    """
    import json
    import re

    text = (req.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="请输入自然语言描述")
    if not DEEPSEEK_API_KEY:
        raise HTTPException(status_code=500, detail="DeepSeek API Key 未配置")

    prompt = (
        "你是石化厂区视觉检测的任务规划器。判断用户意图并只输出一个 JSON 对象：\n"
        "1) 若想检查【工人是否佩戴安全帽 / 安全帽合规 / 有没有人没戴安全帽】，"
        '输出 {"task":"helmet_compliance"}。\n'
        "2) 若想分析【道路车流 / 是否拥堵 / 交通是否堵车】，"
        '输出 {"task":"traffic"}。\n'
        "3) 否则输出 "
        '{"task":"open","classes":[英文目标词...]}，'
        "classes 为简洁的小写英文名词（适合 YOLO-World 开放词表），可含必要同义词。\n"
        "不要输出任何解释或多余文字。\n"
        '示例："工人有没有戴安全帽" -> {"task":"helmet_compliance"}\n'
        '示例："这条路堵不堵" -> {"task":"traffic"}\n'
        '示例："看看有没有车和卡车" -> {"task":"open","classes":["car","truck"]}\n'
        f"用户需求：{text}"
    )

    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(
                "https://api.deepseek.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "deepseek-chat",
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 200,
                    "temperature": 0,
                },
                timeout=30.0,
            )
            resp.raise_for_status()
        except httpx.TimeoutException:
            raise HTTPException(status_code=504, detail="AI 解析超时，请重试")
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"AI 接口错误: {str(e)}")

    content = resp.json()["choices"][0]["message"]["content"]
    task = "open"
    classes = []
    m = re.search(r"\{.*\}", content, re.S)
    if m:
        try:
            obj = json.loads(m.group(0))
            if obj.get("task") in ("helmet_compliance", "traffic"):
                task = obj["task"]
            seen = set()
            for c in obj.get("classes", []) or []:
                s = str(c).strip().lower()
                if s and s not in seen:
                    seen.add(s)
                    classes.append(s)
        except Exception:
            pass

    return {"task": task, "classes": classes, "text": text}


class SummarizeRequest(BaseModel):
    """检测结果摘要请求：task=helmet_compliance|open，stats 为统计数据。"""
    task: str
    stats: dict = {}


@app.post(
    "/api/summarize-detection",
    summary="检测结果一句话摘要（DeepSeek）",
    description="把检测统计交给 DeepSeek，生成一句简短中文摘要。失败返回空串，由前端兜底。",
    tags=["图像识别"],
    response_description='{"summary": "一句话摘要"}',
)
async def summarize_detection(req: SummarizeRequest):
    """生成检测结果的一句话中文摘要（容错：任何异常返回空串）。"""
    if not DEEPSEEK_API_KEY:
        return {"summary": ""}

    s = req.stats or {}
    if req.task == "helmet_compliance":
        info = (
            f"安全帽合规检测：共 {s.get('person_count', 0)} 人，"
            f"合规 {s.get('compliant_count', 0)} 人，"
            f"未佩戴 {s.get('violation_count', 0)} 人。"
        )
        ask = "请用一句简短中文总结现场安全帽佩戴情况，点明是否有人未佩戴及人数。"
    elif req.task == "traffic":
        counts = s.get("counts", {})
        uniq = s.get("unique_total")
        peak = f"峰值同时 {s.get('total', 0)} 辆" + (
            f"、累计经过约 {uniq} 辆" if uniq is not None else ""
        )
        info = (
            f"道路拥堵分析：{peak}，画面占比 "
            f"{round(s.get('coverage', 0) * 100)}%，判定 {s.get('level_cn', '')}。"
            "明细：" + ("、".join(f"{k}{v}" for k, v in counts.items()) or "无")
        )
        ask = "请用一句简短中文总结道路车流与是否会造成拥堵，给出拥堵等级。"
    else:
        counts = s.get("counts", {})
        info = "目标检测统计：" + (
            "、".join(f"{k}={v}" for k, v in counts.items()) or "无"
        )
        ask = "请用一句简短中文总结检测到的物体及数量。"

    prompt = f"{info}\n{ask}\n只输出一句话，不要 markdown、不要解释。"

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://api.deepseek.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "deepseek-chat",
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 120,
                    "temperature": 0.3,
                },
                timeout=30.0,
            )
            resp.raise_for_status()
        summary = resp.json()["choices"][0]["message"]["content"].strip()
    except Exception:
        summary = ""
    return {"summary": summary}


@app.get(
    "/api/history",
    summary="获取历史 AI 分析记录",
    description="按创建时间倒序返回 analysis_records 表中的历史分析结果列表，最多返回 200 条。",
    tags=["历史记录"],
    response_description="历史分析记录数组，每条包含 id、user_prompt、ai_report、record_count、anomaly_count、created_at",
)
def get_history(limit: int = Query(50, le=200)):
    """
    获取历史 AI 分析记录列表。

    Args:
        limit: 返回条数上限，默认 50，最大 200

    Returns:
        analysis_records 数组，字段：id / user_prompt / ai_report /
        record_count / anomaly_count / created_at
    """
    result = (
        supabase.table("analysis_records")
        .select("id, user_prompt, ai_report, record_count, anomaly_count, created_at")
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return result.data


@app.get(
    "/api/sensors",
    summary="获取所有传感器信息",
    description="返回 sensors 表的全部记录，包含 id、名称、类型、区域、坐标和状态，供前端地图组件打点使用。",
    tags=["传感器"],
    response_description="传感器对象数组",
)
def get_sensors():
    """
    获取所有传感器基础信息。

    Returns:
        sensors 表全部记录，字段包含 id / name / type / zone /
        lng / lat / floor / status / activated_at / description
    """
    result = supabase.table("sensors").select("*").execute()
    return result.data


@app.get(
    "/api/records",
    summary="查询传感器数据记录",
    description=(
        "从 sensor_records 表查询数据，支持按 zone（区域）、severity（告警等级）、"
        "category（传感器类别）过滤，按采集时间倒序排列。用于状态评估页面的列表展示。"
    ),
    tags=["传感器"],
    response_description="sensor_records 数组，按 recorded_at 倒序",
)
def get_records(
    zone: Optional[str] = None,
    severity: Optional[str] = None,
    category: Optional[str] = None,
    limit: int = Query(100, le=500),
):
    """
    查询传感器数据记录，支持多维度过滤。

    Args:
        zone: 可选，按区域过滤，如 "A区-常压蒸馏"
        severity: 可选，按告警等级过滤，取值 "error" / "warning" / "info"
        category: 可选，按传感器类别过滤，取值 "gas" / "thermal" / "behavior" / "device"
        limit: 返回条数上限，默认 100，最大 500

    Returns:
        sensor_records 数组，字段：id / sensor_id / category / value / unit /
        severity / title / detail / zone / recorded_at / created_at
    """
    query = supabase.table("sensor_records").select("*")
    if zone:
        query = query.eq("zone", zone)
    if severity:
        query = query.eq("severity", severity)
    if category:
        query = query.eq("category", category)
    result = query.order("recorded_at", desc=True).limit(limit).execute()
    return result.data


@app.post(
    "/api/sensor-data",
    summary="实时传感器数据推送（预留）",
    description=(
        "预留接口，供真实硬件传感器或边缘计算节点以 JSON 格式推送单条数据。"
        "接收后计算 severity 并写入 sensor_records 表。"
        "注意：当前阶段使用 mock 数据，此接口仅用于集成测试。"
    ),
    tags=["传感器"],
    response_description='{"status": "received"}',
)
async def push_sensor_data(payload: dict):
    """
    接收单条传感器实时数据并写入数据库（预留接口）。

    Args:
        payload: JSON 对象，包含以下字段：
            - sensor_id (str): 传感器 ID，必填
            - category (str): 类别，必填
            - value (float): 数值，必填
            - unit (str): 单位，可选
            - title (str): 标题，可选
            - detail (str): 详情，可选
            - zone (str): 区域，可选
            - recorded_at (str): ISO 8601 时间字符串，可选，默认当前时间

    Returns:
        {"status": "received"}

    Raises:
        HTTPException 500: Supabase 写入失败
    """
    category = str(payload.get("category", "")).lower()
    try:
        value = float(payload.get("value", 0))
    except (ValueError, TypeError):
        value = 0.0

    record = {
        "sensor_id": str(payload.get("sensor_id", "")),
        "category": category,
        "value": value,
        "unit": str(payload.get("unit", "")),
        "severity": get_severity(category, value),
        "title": str(payload.get("title", "")),
        "detail": str(payload.get("detail", "")),
        "zone": str(payload.get("zone", "")),
        "recorded_at": payload.get("recorded_at", datetime.now().isoformat()),
    }
    supabase.table("sensor_records").insert(record).execute()
    return {"status": "received"}


@app.post(
    "/api/detect-image",
    summary="图像异常识别（YOLO-World 开放词表）",
    description=(
        "上传图片 + 目标词列表（classes），用 YOLO-World 开放词表模型按提示词检测，"
        "返回归一化检测框并落库 detection_records。目标词建议用英文（开放词表文本编码器对英文最稳）。"
    ),
    tags=["图像识别"],
    response_description="检测结果：图片尺寸、目标数、风险数、归一化检测框数组、记录 id",
)
async def detect_image(
    file: UploadFile = File(...),
    model: str = Form("open"),
    classes: str = Form("[]"),
    conf: float = Form(0.1),
    imgsz: int = Form(640),
    zone: Optional[str] = Form(None),
):
    """
    对上传图片做目标检测，可选模型。

    表单字段：
        file:    图片（.jpg/.jpeg/.png）
        model:   模型 id，见 GET /api/detect-models（默认 "open" 开放词表）
        classes: JSON 字符串数组（仅开放词表模型有效），如 ["person","fire"]
        conf:    置信度阈值，默认 0.1
        zone:    可选，所属区域

    Returns:
        {image, model, classes_used, count, risk_count, detections[], record_id}

    Raises:
        HTTPException 400: 非图片 / 解析失败 / classes 不是 JSON 数组
        HTTPException 503: 服务未启用 / 模型未就绪（权重缺失等）
    """
    if not ENABLE_YOLO:
        raise HTTPException(status_code=503, detail="图像识别服务未启用（ENABLE_YOLO=false）")
    if not file.filename.lower().endswith((".jpg", ".jpeg", ".png")):
        raise HTTPException(status_code=400, detail="仅支持 .jpg / .jpeg / .png 图片")
    if model not in DETECT_MODELS:
        raise HTTPException(status_code=400, detail=f"未知模型：{model}")

    # 解析 classes（仅开放词表用）
    import json
    try:
        target_classes = json.loads(classes) if classes else []
        if not isinstance(target_classes, list):
            raise ValueError
        target_classes = [str(c).strip() for c in target_classes if str(c).strip()]
    except Exception:
        raise HTTPException(status_code=400, detail="classes 需为 JSON 字符串数组，如 [\"person\",\"fire\"]")

    # 读图
    from PIL import Image
    contents = await file.read()
    try:
        img = Image.open(io.BytesIO(contents)).convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"图片解析失败：{e}")
    w, h = img.size

    # 加载模型 + 推理
    try:
        net, cfg = get_detect_model(model)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=f"图像识别服务不可用：{e}")
    try:
        import numpy as np
        if cfg["open_vocab"]:
            if not target_classes:
                target_classes = list(DEFAULT_CLASSES)
            net.set_classes(target_classes)
        # imgsz 提高可改善小/远目标（如远处火焰、烟雾）召回；限制在合理范围
        isz = max(320, min(1536, int(imgsz)))
        results = net.predict(np.array(img), conf=float(conf), imgsz=isz, verbose=False)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"推理失败：{e}")

    # 该模型的中文/风险映射（专用模型用自己的，找不到回退全局）
    label_cn_map = cfg.get("label_cn", LABEL_CN)
    risk_set = cfg.get("risk", RISK_CLASSES)

    res = results[0]
    # 类名查找：res.names 可能是 dict（{idx:名}）或 list（[名,...]），兼容两者
    names = res.names  # 开放词表时即 set_classes 设定的类

    def name_of(ci):
        if isinstance(names, dict):
            return names.get(ci, names.get(str(ci), str(ci)))
        if isinstance(names, (list, tuple)) and 0 <= ci < len(names):
            return names[ci]
        return str(ci)

    # 组装归一化检测框
    detections = []
    boxes = getattr(res, "boxes", None)
    if boxes is not None and len(boxes) > 0:
        xyxyn = boxes.xyxyn.tolist()
        confs = boxes.conf.tolist()
        cls_idx = [int(i) for i in boxes.cls.tolist()]
        for i, (bb, cf, ci) in enumerate(zip(xyxyn, confs, cls_idx)):
            x1, y1, x2, y2 = bb
            label = str(name_of(ci))
            low = label.lower()
            detections.append({
                "id": i,
                "label": label,
                "label_cn": label_cn_map.get(low, label_cn_map.get(label, LABEL_CN.get(low, label))),
                "confidence": round(float(cf), 2),
                "risk": (low in risk_set) or (label in risk_set),
                "box": {
                    "x": round(max(0.0, x1), 4),
                    "y": round(max(0.0, y1), 4),
                    "w": round(max(0.0, x2 - x1), 4),
                    "h": round(max(0.0, y2 - y1), 4),
                },
            })

    risk_count = sum(1 for d in detections if d["risk"])
    if cfg["open_vocab"]:
        classes_used = target_classes
    elif isinstance(names, dict):
        classes_used = list(names.values())
    elif isinstance(names, (list, tuple)):
        classes_used = list(names)
    else:
        classes_used = []

    # 落库
    record_id = None
    try:
        inserted = supabase.table("detection_records").insert({
            "image_name": file.filename,
            "image_w": w,
            "image_h": h,
            "zone": zone,
            "classes": classes_used,
            "object_count": len(detections),
            "risk_count": risk_count,
            "detections": detections,
        }).execute()
        if inserted.data:
            record_id = inserted.data[0].get("id")
    except Exception:
        # 落库失败不影响返回检测结果
        record_id = None

    return {
        "image": {"width": w, "height": h, "name": file.filename},
        "model": model,
        "classes_used": classes_used,
        "count": len(detections),
        "risk_count": risk_count,
        "detections": detections,
        "record_id": record_id,
    }


@app.post(
    "/api/detect-video",
    summary="视频识别（按时间采样逐帧检测）",
    description=(
        "上传视频，按时间间隔采样若干帧逐帧检测，返回带时间戳的检测时间线，"
        "前端在播放原视频时按进度叠加检测框（不重编码视频）。支持开放词表与安全帽合规。"
    ),
    tags=["图像识别"],
    response_description="{compliance, fps, duration, interval, sampled, frames[], stats}",
)
async def detect_video(
    file: UploadFile = File(...),
    model: str = Form("open"),
    classes: str = Form("[]"),
    conf: float = Form(0.25),
    imgsz: int = Form(640),
    helmet_conf: float = Form(0.6),
    use_sahi: bool = Form(False),
):
    """对视频按时间采样逐帧检测，返回检测时间线（归一化坐标）。use_sahi 仅对 traffic 生效。"""
    import json
    import math
    import tempfile

    if not ENABLE_YOLO:
        raise HTTPException(status_code=503, detail="图像识别服务未启用（ENABLE_YOLO=false）")
    if not file.filename.lower().endswith((".mp4", ".avi", ".mov", ".mkv", ".webm")):
        raise HTTPException(status_code=400, detail="仅支持 .mp4/.avi/.mov/.mkv/.webm 视频")

    try:
        import cv2
        import numpy as np
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"未安装 opencv 依赖：{e}")

    is_compliance = model == "helmet_compliance"
    is_traffic = model == "traffic"
    if model not in ("open", "helmet_compliance", "traffic"):
        raise HTTPException(status_code=400, detail=f"视频识别支持 open / helmet_compliance / traffic，收到：{model}")

    # 解析开放词表目标（仅 open 用）
    target_classes = []
    if model == "open":
        try:
            target_classes = [str(c).strip() for c in (json.loads(classes) or []) if str(c).strip()]
        except Exception:
            target_classes = []
        if not target_classes:
            target_classes = list(DEFAULT_CLASSES)

    # 写临时文件供 cv2 读取
    suffix = os.path.splitext(file.filename)[1] or ".mp4"
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    try:
        tmp.write(await file.read())
        tmp.close()
        cap = cv2.VideoCapture(tmp.name)
        if not cap.isOpened():
            raise HTTPException(status_code=400, detail="视频解析失败")

        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        interval_s = 0.4          # 采样间隔（秒）
        max_samples = 80          # 最多采样帧数（控制耗时）
        step = max(1, int(round(fps * interval_s)))
        if total > 0:
            step = max(step, math.ceil(total / max_samples))
        isz = max(320, min(1536, int(imgsz)))

        # 加载模型
        try:
            if is_compliance:
                if not os.path.exists(HELMET_MODEL_PATH):
                    raise RuntimeError(f"安全帽权重未就绪：{HELMET_MODEL_PATH}")
                person_net = load_yolo_weights(PERSON_MODEL_PATH)
                helmet_net = load_yolo_weights(HELMET_MODEL_PATH)
            elif is_traffic:
                if use_sahi:
                    traffic_sahi = get_sahi_model(TRAFFIC_MODEL_PATH)
                else:
                    traffic_net = load_yolo_weights(TRAFFIC_MODEL_PATH)
            else:
                open_net, _ = get_detect_model("open")
                open_net.set_classes(target_classes)
        except RuntimeError as e:
            raise HTTPException(status_code=503, detail=f"图像识别服务不可用：{e}")

        frames = []
        idx, processed = 0, 0
        while processed < max_samples:
            ret, frame_bgr = cap.read()
            if not ret:
                break
            if idx % step == 0:
                rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
                t = round(idx / fps, 2)
                persist = processed > 0  # 同一请求内保持追踪状态，新请求首帧重置
                if is_compliance:
                    p_res = person_net.track(rgb, conf=PERSON_CONF, imgsz=isz,
                                             persist=persist, tracker="bytetrack.yaml", verbose=False)[0]
                    h_res = helmet_net.predict(rgb, conf=float(helmet_conf), imgsz=isz, verbose=False)[0]
                    persons = extract_boxes(p_res, want_label="person", min_conf=PERSON_CONF)
                    helmets = extract_boxes(h_res, want_label="helmet", min_conf=float(helmet_conf))
                    pmatch, worn = match_a_without_b(persons, helmets)
                    dets = []
                    for pi, ps in enumerate(persons):
                        ok = pi in pmatch
                        dets.append({"role": "person", "label": "person",
                                     "label_cn": "合规人员" if ok else "未戴安全帽人员",
                                     "confidence": ps["conf"], "compliant": ok,
                                     "risk": not ok, "tid": ps.get("tid"),
                                     "box": _norm_xywh(ps["box"])})
                    for hi, hm in enumerate(helmets):
                        dets.append({"role": "helmet", "label": "helmet",
                                     "label_cn": "安全帽" + ("" if hi in worn else "(未佩戴)"),
                                     "confidence": hm["conf"], "worn": hi in worn,
                                     "risk": False, "box": _norm_xywh(hm["box"])})
                    frames.append({"t": t, "dets": dets})
                elif is_traffic:
                    if use_sahi:
                        raw = sahi_detect(traffic_sahi, rgb, float(conf))
                    else:
                        res = traffic_net.track(rgb, conf=float(conf), imgsz=isz,
                                                persist=persist, tracker="bytetrack.yaml", verbose=False)[0]
                        raw = extract_boxes(res, min_conf=float(conf))
                    dets, cov = [], 0.0
                    for d in raw:
                        low = d["label"].lower()
                        if low not in TRAFFIC_CLASSES:
                            continue
                        box = _norm_xywh(d["box"])
                        cov += box["w"] * box["h"]
                        dets.append({"label": low,
                                     "label_cn": TRAFFIC_LABEL_CN.get(low, low),
                                     "confidence": d["conf"], "risk": False,
                                     "tid": d.get("tid"), "box": box})
                    frames.append({"t": t, "dets": dets, "coverage": round(min(1.0, cov), 3)})
                else:
                    res = open_net.predict(rgb, conf=float(conf), imgsz=isz, verbose=False)[0]
                    raw = extract_boxes(res, min_conf=float(conf))
                    dets = []
                    for d in raw:
                        low = d["label"].lower()
                        dets.append({"label": d["label"],
                                     "label_cn": LABEL_CN.get(low, d["label"]),
                                     "confidence": d["conf"],
                                     "risk": low in RISK_CLASSES,
                                     "box": _norm_xywh(d["box"])})
                    frames.append({"t": t, "dets": dets})
                processed += 1
            idx += 1
        cap.release()
    finally:
        try:
            os.unlink(tmp.name)
        except Exception:
            pass

    # 聚合统计
    if is_compliance:
        # 优先用追踪 id 做「唯一人数」；无 id 时退回单帧峰值
        person_tids = {d["tid"] for f in frames for d in f["dets"]
                       if d.get("role") == "person" and d.get("tid") is not None}
        viol_tids = {d["tid"] for f in frames for d in f["dets"]
                     if d.get("role") == "person" and d.get("risk") and d.get("tid") is not None}
        max_persons = max((sum(1 for d in f["dets"] if d.get("role") == "person") for f in frames), default=0)
        max_viol = max((sum(1 for d in f["dets"] if d.get("role") == "person" and d.get("risk")) for f in frames), default=0)
        unique_persons = len(person_tids) if person_tids else max_persons
        unique_viol = len(viol_tids) if person_tids else max_viol
        stats = {
            "person_count": unique_persons,
            "violation_count": unique_viol,
            "compliant_count": max(0, unique_persons - unique_viol),
            "peak_persons": max_persons,
            "tracked": bool(person_tids),
        }
    elif is_traffic:
        max_total = max((len(f["dets"]) for f in frames), default=0)
        max_cov = max((f.get("coverage", 0.0) for f in frames), default=0.0)
        level, level_cn = assess_congestion(max_total, max_cov)
        # 唯一车辆数（按 track id 去重）+ 各类别唯一数
        veh_tids = {d["tid"] for f in frames for d in f["dets"] if d.get("tid") is not None}
        per_label_tids = {}
        counts_simul = {}  # 单帧峰值（无 id 兜底）
        for f in frames:
            per = {}
            for d in f["dets"]:
                per[d["label_cn"]] = per.get(d["label_cn"], 0) + 1
                if d.get("tid") is not None:
                    per_label_tids.setdefault(d["label_cn"], set()).add(d["tid"])
            for k, v in per.items():
                counts_simul[k] = max(counts_simul.get(k, 0), v)
        if veh_tids:
            counts = {k: len(v) for k, v in per_label_tids.items()}
            unique_total = len(veh_tids)
        else:
            counts = counts_simul
            unique_total = max_total
        stats = {
            "total": max_total,            # 单帧峰值（用于拥堵判定）
            "unique_total": unique_total,  # 累计经过车辆数
            "coverage": round(max_cov, 3),
            "level": level,
            "level_cn": level_cn,
            "counts": counts,
            "tracked": bool(veh_tids),
        }
    else:
        counts = {}
        for f in frames:
            per = {}
            for d in f["dets"]:
                k = d["label_cn"]
                per[k] = per.get(k, 0) + 1
            for k, v in per.items():
                counts[k] = max(counts.get(k, 0), v)  # 取各类别同帧最大值
        stats = {"counts": counts}

    return {
        "task": "helmet_compliance" if is_compliance else ("traffic" if is_traffic else "open"),
        "compliance": is_compliance,
        "traffic": is_traffic,
        "fps": round(fps, 2),
        "duration": round(total / fps, 2) if total else None,
        "interval": round(step / fps, 2),
        "sampled": len(frames),
        "frames": frames,
        "stats": stats,
    }


@app.post(
    "/api/detect-traffic",
    summary="道路拥堵分析（车辆检测 + 拥堵判定）",
    description=(
        "用通用模型检测画面中的车辆（汽车/卡车/公交/摩托/自行车），"
        "按车辆数量与画面占比判定 畅通/缓行/拥堵，返回归一化检测框并落库。"
    ),
    tags=["图像识别"],
    response_description="{traffic, level, level_cn, total, coverage, counts, detections, record_id}",
)
async def detect_traffic(
    file: UploadFile = File(...),
    imgsz: int = Form(640),
    conf: float = Form(0.25),
    use_sahi: bool = Form(False),
    zone: Optional[str] = Form(None),
):
    """检测道路车辆并评估是否拥堵。use_sahi=True 时用切片推理增强密集小目标召回。"""
    if not ENABLE_YOLO:
        raise HTTPException(status_code=503, detail="图像识别服务未启用（ENABLE_YOLO=false）")
    if not file.filename.lower().endswith((".jpg", ".jpeg", ".png")):
        raise HTTPException(status_code=400, detail="仅支持 .jpg / .jpeg / .png 图片")

    from PIL import Image
    contents = await file.read()
    try:
        img = Image.open(io.BytesIO(contents)).convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"图片解析失败：{e}")
    w, h = img.size

    try:
        import numpy as np
        arr = np.array(img)
        if use_sahi:
            sm = get_sahi_model(TRAFFIC_MODEL_PATH)
            raw = sahi_detect(sm, arr, float(conf))
        else:
            net = load_yolo_weights(TRAFFIC_MODEL_PATH)
            isz = max(320, min(1536, int(imgsz)))
            res = net.predict(arr, conf=float(conf), imgsz=isz, verbose=False)[0]
            raw = extract_boxes(res, min_conf=float(conf))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=f"图像识别服务不可用：{e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"推理失败：{e}")
    detections, counts, coverage = [], {}, 0.0
    for i, d in enumerate(raw):
        low = d["label"].lower()
        if low not in TRAFFIC_CLASSES:
            continue
        box = _norm_xywh(d["box"])
        coverage += box["w"] * box["h"]
        counts[low] = counts.get(low, 0) + 1
        detections.append({
            "id": i,
            "label": low,
            "label_cn": TRAFFIC_LABEL_CN.get(low, low),
            "confidence": d["conf"],
            "risk": False,
            "box": box,
        })

    total = len(detections)
    coverage = round(min(1.0, coverage), 3)
    level, level_cn = assess_congestion(total, coverage)
    counts_cn = {TRAFFIC_LABEL_CN.get(k, k): v for k, v in counts.items()}

    record_id = None
    try:
        inserted = supabase.table("detection_records").insert({
            "image_name": file.filename,
            "image_w": w,
            "image_h": h,
            "zone": zone,
            "classes": sorted(counts.keys()),
            "object_count": total,
            "risk_count": total if level == "congested" else 0,
            "detections": detections,
        }).execute()
        if inserted.data:
            record_id = inserted.data[0].get("id")
    except Exception:
        record_id = None

    return {
        "image": {"width": w, "height": h, "name": file.filename},
        "traffic": True,
        "use_sahi": use_sahi,
        "level": level,
        "level_cn": level_cn,
        "total": total,
        "coverage": coverage,
        "counts": counts_cn,
        "detections": detections,
        "record_id": record_id,
    }


@app.get(
    "/api/detect-models",
    summary="获取可用的图像识别模型列表",
    description="返回开放词表通用模型与各专用模型的可用性，供前端下拉选择。",
    tags=["图像识别"],
    response_description="模型数组：id / name / open_vocab / classes / available / note",
)
def list_detect_models():
    """列出注册的检测模型及其可用状态。"""
    out = []
    for mid, cfg in DETECT_MODELS.items():
        available, note = True, ""
        if not ENABLE_YOLO:
            available, note = False, "图像识别未启用（ENABLE_YOLO=false）"
        elif not cfg["open_vocab"] and not os.path.exists(cfg["weights"]):
            available, note = False, "专用权重未就绪，请放置 best.pt"
        # 专用模型用 label_cn 的中文值展示其可识别类别（开放词表为 None）
        cn_classes = None
        if not cfg["open_vocab"]:
            cn_classes = sorted(set(cfg.get("label_cn", {}).values())) or None
        out.append({
            "id": mid,
            "name": cfg["name"],
            "open_vocab": cfg["open_vocab"],
            "classes": cn_classes,
            "available": available,
            "note": note,
        })
    return out


@app.post(
    "/api/detect-helmet-compliance",
    summary="安全帽合规检测（人+帽组合判定）",
    description=(
        "双模型：通用模型检测 person，专用模型检测 helmet，再按“helmet 是否落在 person "
        "头部区域”判定每个人是否佩戴安全帽。返回归一化结果并落库。"
    ),
    tags=["图像识别"],
    response_description="persons（含 compliant）+ helmets（含 worn）+ 统计 + record_id",
)
async def detect_helmet_compliance(
    file: UploadFile = File(...),
    imgsz: int = Form(640),
    helmet_conf: float = Form(0.6),
    zone: Optional[str] = Form(None),
):
    """检测画面中未佩戴安全帽的人员。

    helmet_conf 默认 0.6：该专用权重会把裸头误检成 helmet（约 0.5 置信度），
    阈值取高可滤掉这类误报、避免把没戴帽的人误判为合规。可由前端调节。
    """
    if not ENABLE_YOLO:
        raise HTTPException(status_code=503, detail="图像识别服务未启用（ENABLE_YOLO=false）")
    if not file.filename.lower().endswith((".jpg", ".jpeg", ".png")):
        raise HTTPException(status_code=400, detail="仅支持 .jpg / .jpeg / .png 图片")

    from PIL import Image
    contents = await file.read()
    try:
        img = Image.open(io.BytesIO(contents)).convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"图片解析失败：{e}")
    w, h = img.size

    # 加载两个模型
    if not os.path.exists(HELMET_MODEL_PATH):
        raise HTTPException(
            status_code=503,
            detail=f"安全帽权重未就绪：{HELMET_MODEL_PATH}，请放置 best.pt。",
        )
    try:
        person_net = load_yolo_weights(PERSON_MODEL_PATH)
        helmet_net = load_yolo_weights(HELMET_MODEL_PATH)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=f"图像识别服务不可用：{e}")

    try:
        import numpy as np
        arr = np.array(img)
        isz = max(320, min(1536, int(imgsz)))
        hconf = max(0.1, min(0.9, float(helmet_conf)))
        p_res = person_net.predict(arr, conf=PERSON_CONF, imgsz=isz, verbose=False)[0]
        h_res = helmet_net.predict(arr, conf=hconf, imgsz=isz, verbose=False)[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"推理失败：{e}")

    persons = extract_boxes(p_res, want_label="person", min_conf=PERSON_CONF)
    helmets = extract_boxes(h_res, want_label="helmet", min_conf=hconf)

    person_match, worn = match_a_without_b(persons, helmets)

    persons_out = []
    for pi, ps in enumerate(persons):
        compliant = pi in person_match
        persons_out.append({
            "id": pi,
            "compliant": compliant,
            "confidence": ps["conf"],
            "matched_helmet_id": person_match.get(pi),
            "box": _norm_xywh(ps["box"]),
        })
    helmets_out = []
    for hi, hm in enumerate(helmets):
        helmets_out.append({
            "id": hi,
            "confidence": hm["conf"],
            "worn": hi in worn,
            "box": _norm_xywh(hm["box"]),
        })

    violation_count = sum(1 for p in persons_out if not p["compliant"])
    compliant_count = len(persons_out) - violation_count

    # 落库（复用 detection_records；detections 合并 person/helmet，带 role）
    record_id = None
    try:
        merged = []
        for p in persons_out:
            merged.append({
                "role": "person",
                "label": "person",
                "label_cn": "合规人员" if p["compliant"] else "未戴安全帽人员",
                "compliant": p["compliant"],
                "confidence": p["confidence"],
                "box": p["box"],
            })
        for hm in helmets_out:
            merged.append({
                "role": "helmet",
                "label": "helmet",
                "label_cn": "安全帽" + ("" if hm["worn"] else "(未佩戴)"),
                "worn": hm["worn"],
                "confidence": hm["confidence"],
                "box": hm["box"],
            })
        inserted = supabase.table("detection_records").insert({
            "image_name": file.filename,
            "image_w": w,
            "image_h": h,
            "zone": zone,
            "classes": ["person", "helmet"],
            "object_count": len(persons_out),
            "risk_count": violation_count,
            "detections": merged,
        }).execute()
        if inserted.data:
            record_id = inserted.data[0].get("id")
    except Exception:
        record_id = None

    return {
        "image": {"width": w, "height": h, "name": file.filename},
        "person_count": len(persons_out),
        "compliant_count": compliant_count,
        "violation_count": violation_count,
        "persons": persons_out,
        "helmets": helmets_out,
        "record_id": record_id,
    }
