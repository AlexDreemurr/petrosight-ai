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

app = FastAPI(title="PetroSight AI Backend")

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


@app.get("/")
def root():
    return {"status": "ok", "service": "PetroSight AI"}


@app.post("/api/upload-excel")
async def upload_excel(file: UploadFile = File(...)):
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
    user_prompt: str
    data_summary: dict


@app.post("/api/analyze")
async def analyze(req: AnalyzeRequest):
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


@app.get("/api/history")
def get_history(limit: int = Query(50, le=200)):
    result = (
        supabase.table("analysis_records")
        .select("id, user_prompt, ai_report, record_count, anomaly_count, created_at")
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return result.data


@app.get("/api/sensors")
def get_sensors():
    result = supabase.table("sensors").select("*").execute()
    return result.data


@app.get("/api/records")
def get_records(
    zone: Optional[str] = None,
    severity: Optional[str] = None,
    category: Optional[str] = None,
    limit: int = Query(100, le=500),
):
    query = supabase.table("sensor_records").select("*")
    if zone:
        query = query.eq("zone", zone)
    if severity:
        query = query.eq("severity", severity)
    if category:
        query = query.eq("category", category)
    result = query.order("recorded_at", desc=True).limit(limit).execute()
    return result.data


@app.post("/api/sensor-data")
async def push_sensor_data(payload: dict):
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
