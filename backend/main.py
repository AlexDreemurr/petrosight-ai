"""
PetroSight AI 后端主模块

职责：提供石化厂区传感器数据管理与 AI 分析的全部 REST API，
      包括 Excel 数据上传解析、DeepSeek AI 安全分析、历史记录查询、
      传感器信息查询及实时数据推送接口。

上游调用者：前端 React 应用（通过 VITE_API_BASE 指向本服务）
下游依赖：Supabase（PostgreSQL 数据存储）、DeepSeek API（AI 推理）
"""

from fastapi import FastAPI, File, UploadFile, HTTPException, Query
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
    - 其他类别：统一返回 info

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


@app.post(
    "/api/upload-excel",
    summary="上传并解析传感器 Excel 数据",
    description=(
        "接收 .xlsx / .xls 格式的传感器数据文件，使用 pandas 解析后批量写入 "
        "sensor_records 表。上传前会自动将文件中出现的传感器 ID upsert 到 sensors 表，"
        "避免外键约束报错。每条记录的 severity 由后端规则自动判定，无需前端传入。"
    ),
    tags=["数据上传"],
    response_description="解析摘要，包含总记录数、异常统计、类别列表、区域列表及前5条预览",
)
async def upload_excel(file: UploadFile = File(...)):
    """
    上传传感器数据 Excel 文件并批量写入数据库。

    Excel 必须包含以下列（大小写不敏感）：
    - sensor_id：传感器 ID，如 GAS-01
    - category：类别，gas / thermal / behavior / device
    - value：数值（浮点）

    可选列：unit、severity（会被覆盖）、title、detail、zone、recorded_at

    Args:
        file: 上传的 Excel 文件，仅支持 .xlsx / .xls 格式

    Returns:
        {
            "total": 总记录数,
            "anomaly_count": 异常记录数（error + warning）,
            "categories": 涉及的类别列表,
            "zones": 涉及的区域列表,
            "severity_breakdown": {"error": N, "warning": N, "info": N},
            "preview": 前5条记录列表
        }

    Raises:
        HTTPException 400: 文件格式不是 .xlsx/.xls，或缺少必填列，或 Excel 解析失败
        HTTPException 500: Supabase 写入失败（如外键冲突等数据库错误）
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
    for _, row in df.iterrows():
        category = str(row.get("category", "")).lower().strip()
        try:
            value = float(row.get("value", 0))
        except (ValueError, TypeError):
            value = 0.0

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

    if records:
        # 自动注册 sensors 表中不存在的传感器（避免外键约束报错）
        unique_sensors = {}
        for r in records:
            sid = r["sensor_id"]
            if sid and sid not in unique_sensors:
                unique_sensors[sid] = {
                    "id": sid,
                    "name": sid,
                    "type": r["category"],
                    "zone": r["zone"],
                    "status": "online",
                    "lng": 0.0,
                    "lat": 0.0,
                }
        if unique_sensors:
            supabase.table("sensors").upsert(
                list(unique_sensors.values()), on_conflict="id"
            ).execute()

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
        data_summary: 由 /api/upload-excel 返回的数据摘要 JSON
    """
    user_prompt: str
    data_summary: dict


@app.post(
    "/api/analyze",
    summary="调用 DeepSeek AI 进行安全分析",
    description=(
        "根据用户描述和已上传的数据摘要，调用 DeepSeek Chat API 生成专业安全分析报告，"
        "并将报告持久化到 analysis_records 表。报告包含风险评估摘要、主要异常分析、"
        "建议措施和后续监控重点四个章节。超时时间为 90 秒。"
    ),
    tags=["AI 分析"],
    response_description="包含 Markdown 格式 AI 报告的 JSON，字段名为 report",
)
async def analyze(req: AnalyzeRequest):
    """
    调用 DeepSeek API 生成安全分析报告并存储历史记录。

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
    categories = ", ".join(req.data_summary.get("categories", []))
    zones = ", ".join(req.data_summary.get("zones", []))
    severity = req.data_summary.get("severity_breakdown", {})

    prompt = f"""你是一名石化厂区安全分析专家。用户提供了以下传感器数据摘要和分析任务，请用中文输出专业的安全分析报告。

【用户任务描述】
{req.user_prompt}

【数据摘要】
- 总记录数：{total} 条
- 异常数量：{anomaly_count} 条（其中 error {severity.get('error', 0)} 条，warning {severity.get('warning', 0)} 条）
- 涉及传感器类别：{categories}
- 涉及区域：{zones}

请按照以下结构输出报告：

## 一、风险评估摘要
（整体风险等级与核心结论）

## 二、主要异常分析
（列举并分析关键异常，给出可能的成因）

## 三、建议措施
（列出 3-5 条具体可执行的安全措施）

## 四、后续监控重点
（指出需要持续关注的传感器类别、区域或指标）
"""

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

    supabase.table("analysis_records").insert({
        "user_prompt": req.user_prompt,
        "data_summary": req.data_summary,
        "ai_report": ai_report,
        "record_count": total,
        "anomaly_count": anomaly_count,
    }).execute()

    return {"report": ai_report}


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
