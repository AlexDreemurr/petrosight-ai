const BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `请求失败 (${res.status})`);
  }
  return res.json();
}

export async function registerSensors(file) {
  const form = new FormData();
  form.append("file", file);
  return request("/api/register-sensors", { method: "POST", body: form });
}

export async function uploadExcel(file) {
  const form = new FormData();
  form.append("file", file);
  return request("/api/upload-excel", { method: "POST", body: form });
}

export async function analyze(userPrompt, dataSummary, range = {}) {
  return request("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_prompt: userPrompt,
      data_summary: dataSummary,
      start_time: range.start || null,
      end_time: range.end || null,
    }),
  });
}

export async function getHistory(limit = 50) {
  return request(`/api/history?limit=${limit}`);
}

export async function getRecords({ zone, severity, category, limit = 100 } = {}) {
  const params = new URLSearchParams();
  if (zone) params.set("zone", zone);
  if (severity) params.set("severity", severity);
  if (category) params.set("category", category);
  params.set("limit", limit);
  return request(`/api/records?${params}`);
}

export async function getSensors() {
  return request("/api/sensors");
}

export async function getDetectModels() {
  return request("/api/detect-models");
}

export async function detectImage(
  file,
  { classes = [], conf, imgsz, zone, model = "open" } = {}
) {
  const form = new FormData();
  form.append("file", file);
  form.append("model", model);
  form.append("classes", JSON.stringify(classes)); // 英文目标词数组（仅开放词表用）
  if (conf != null) form.append("conf", String(conf));
  if (imgsz != null) form.append("imgsz", String(imgsz));
  if (zone) form.append("zone", zone);
  return request("/api/detect-image", { method: "POST", body: form });
}
