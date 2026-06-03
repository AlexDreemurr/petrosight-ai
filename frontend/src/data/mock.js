/**
 * mock.js - 厂区总览页面的展示层常量与几何布局工具
 *
 * 所在页面：OverViewPage（/）及其子组件
 * 说明：本文件不再包含任何「业务数据」。告警、设备、状态等数据全部由
 *       后端接口（/api/records、/api/sensors）提供，并在 hooks/useOverviewData.js
 *       中转换。这里仅保留与展示相关的纯常量（标签/颜色映射）以及地图几何工具
 *       （区域多边形槽位、由 sensor_id 推导稳定坐标），因为地图坐标不存于后端。
 */

// ---- 标签映射 ----

// severity（已归一化为 danger/warning/info）→ 中文标签
export const severityLabel = {
  danger: "十分紧急",
  warning: "紧急",
  info: "一般",
};

// category → 中文标签
export const categoryLabel = {
  gas: "气体泄漏",
  thermal: "高温异常",
  device: "设备故障",
  behavior: "不规范操作",
  sensor: "传感器故障",
};

// ---- 颜色映射（取自 GlobalStyles 的 CSS 变量）----

// severity → CSS 颜色变量
export const severityColor = {
  danger: "var(--color-danger)",
  warning: "var(--color-warning)",
  info: "var(--color-secondary)",
};

// 区域/设备 status → CSS 颜色变量
export const statusColor = {
  danger: "var(--color-danger)",
  warning: "var(--color-warning)",
  normal: "var(--color-primary)",
};

// 设备类型/类别 → Icon id
export const deviceIconId = {
  gas: "gas",
  thermal: "thermal",
  device: "device",
  behavior: "behavior",
  sensor: "sensor",
  camera: "camera",
  drone: "drone",
};

// ---- 地图几何（展示层，不来自后端）----

// 每个区域固定占据底图上的一块矩形（百分比坐标 [x0,y0,x1,y1]）+ 区域放大示意图。
// 关键约定：后端 generate_mock.py 用「完全一致」的矩形（按相同的区域名）生成传感器
// lng/lat，使其落在该矩形内部。这样综合预览的红针位置与分区查询的多边形位置保持一致。
// 若上传了未知区域名，则按出现顺序退回到 ZONE_FALLBACK_RECTS 兜底。
export const ZONE_REGIONS = {
  "A区-常压蒸馏": { rect: [8, 8, 44, 46], image: "/map_img/area1.png" },
  "B区-加氢裂化": { rect: [46, 8, 80, 40], image: "/map_img/area2.png" },
  "C区-催化裂化": { rect: [46, 42, 80, 78], image: "/map_img/area3.png" },
  "D区-储罐区": { rect: [8, 48, 44, 78], image: "/map_img/area1.png" },
  "E区-公用工程": { rect: [8, 80, 80, 94], image: "/map_img/area2.png" },
};

const ZONE_FALLBACK_RECTS = [
  [8, 8, 44, 46],
  [46, 8, 80, 40],
  [46, 42, 80, 78],
  [8, 48, 44, 78],
  [8, 80, 80, 94],
];
const ZONE_FALLBACK_IMAGES = [
  "/map_img/area1.png",
  "/map_img/area2.png",
  "/map_img/area3.png",
];

// 矩形 [x0,y0,x1,y1] → SVG polygon points 字符串
export function rectToPoints([x0, y0, x1, y1]) {
  return `${x0},${y0} ${x1},${y0} ${x1},${y1} ${x0},${y1}`;
}

// 取某区域的几何：优先按区域名精确匹配，未知区域按出现序号兜底
export function getZoneRegion(name, index = 0) {
  if (ZONE_REGIONS[name]) return ZONE_REGIONS[name];
  const i = ((index % ZONE_FALLBACK_RECTS.length) + ZONE_FALLBACK_RECTS.length) %
    ZONE_FALLBACK_RECTS.length;
  return { rect: ZONE_FALLBACK_RECTS[i], image: ZONE_FALLBACK_IMAGES[i % ZONE_FALLBACK_IMAGES.length] };
}

// 把底图全局坐标 (x,y) 从某矩形内重映射到 0~100（用于区域详情大图的设备打点）
export function remapToRect(x, y, [x0, y0, x1, y1]) {
  const clamp = (v) => Math.max(4, Math.min(96, v));
  return {
    x: clamp(((x - x0) / (x1 - x0)) * 100),
    y: clamp(((y - y0) / (y1 - y0)) * 100),
  };
}

/**
 * 由 id 推导一个稳定的百分比坐标（无有效 lng/lat 时的兜底打点）。
 * 同一个 id 永远落在同一位置，避免每次刷新跳动。
 * @param {string} id
 * @returns {{x:number,y:number}} x:10~90, y:12~84
 */
export function positionFromId(id = "") {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0;
  }
  return {
    x: 10 + (h % 80),
    y: 12 + ((h >> 9) % 72),
  };
}

// 后端 severity（error/warning/info）→ 前端告警 severity（danger/warning/info）
export function normalizeSeverity(s) {
  return { error: "danger", warning: "warning", info: "info" }[s] || "info";
}

// 后端 severity → 设备/区域 status（danger/warning/normal）
export function severityToStatus(s) {
  return { error: "danger", warning: "warning", info: "normal" }[s] || "normal";
}

// 多个 status 取最严重的
export function worstStatus(list) {
  if (list.includes("danger")) return "danger";
  if (list.includes("warning")) return "warning";
  return "normal";
}

/**
 * 将后端 ISO 时间格式化为 "YYYY-MM-DD HH:mm:ss"（本地时区）。
 * 该格式按字典序排序与时间顺序一致，可直接用于列表排序。
 */
export function formatTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const p = (n) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  );
}
