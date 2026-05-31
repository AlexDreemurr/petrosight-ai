const BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `请求失败 (${res.status})`);
  }
  return res.json();
}

export async function uploadExcel(file) {
  const form = new FormData();
  form.append("file", file);
  return request("/api/upload-excel", { method: "POST", body: form });
}

export async function analyze(userPrompt, dataSummary) {
  return request("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_prompt: userPrompt, data_summary: dataSummary }),
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
