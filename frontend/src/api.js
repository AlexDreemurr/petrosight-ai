const BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

const TOKEN_KEY = "petrosight_token";

// 登录 token 读写（AuthContext 负责写入，request 自动读取附带）
export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}
export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request(path, options = {}) {
  const token = getToken();
  const headers = { ...(options.headers || {}) };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    // 401：登录失效，清掉本地 token 并跳回登录
    if (res.status === 401) {
      setToken(null);
      if (!path.startsWith("/api/auth/login")) {
        window.dispatchEvent(new Event("auth:logout"));
      }
    }
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `请求失败 (${res.status})`);
  }
  return res.json();
}

// ── 认证 ────────────────────────────────────────────────────────────────
export async function login(username, password) {
  return request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
}

export async function getMe() {
  return request("/api/auth/me");
}

export async function changePassword(oldPassword, newPassword) {
  return request("/api/auth/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
  });
}

// ── 用户管理（仅 admin）──────────────────────────────────────────────────
export async function listUsers() {
  return request("/api/auth/users");
}

export async function createUser({ username, password, name, role }) {
  return request("/api/auth/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, name, role }),
  });
}

export async function updateUser(id, patch) {
  return request(`/api/auth/users/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export async function deleteUser(id) {
  return request(`/api/auth/users/${id}`, { method: "DELETE" });
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

export async function clearData(target) {
  return request("/api/clear-data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target }),
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

export async function parseDetectTargets(text) {
  return request("/api/parse-detect-targets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
}

export async function summarizeDetection(task, stats) {
  return request("/api/summarize-detection", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task, stats }),
  });
}

export async function detectTraffic(file, { imgsz, conf, useSahi, zone } = {}) {
  const form = new FormData();
  form.append("file", file);
  if (imgsz != null) form.append("imgsz", String(imgsz));
  if (conf != null) form.append("conf", String(conf));
  if (useSahi != null) form.append("use_sahi", useSahi ? "true" : "false");
  if (zone) form.append("zone", zone);
  return request("/api/detect-traffic", { method: "POST", body: form });
}

export async function detectHelmetCompliance(file, { imgsz, helmetConf, zone } = {}) {
  const form = new FormData();
  form.append("file", file);
  if (imgsz != null) form.append("imgsz", String(imgsz));
  if (helmetConf != null) form.append("helmet_conf", String(helmetConf));
  if (zone) form.append("zone", zone);
  return request("/api/detect-helmet-compliance", { method: "POST", body: form });
}

export async function detectVideo(
  file,
  { classes = [], conf, imgsz, helmetConf, useSahi, model = "open" } = {}
) {
  const form = new FormData();
  form.append("file", file);
  form.append("model", model);
  form.append("classes", JSON.stringify(classes));
  if (conf != null) form.append("conf", String(conf));
  if (imgsz != null) form.append("imgsz", String(imgsz));
  if (helmetConf != null) form.append("helmet_conf", String(helmetConf));
  if (useSahi != null) form.append("use_sahi", useSahi ? "true" : "false");
  return request("/api/detect-video", { method: "POST", body: form });
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
