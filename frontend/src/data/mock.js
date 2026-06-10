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
//
// 区域矩形不再硬编码：由 hooks/useOverviewData.js 的 buildZones 用 squareBBoxRect
// 从该区域所有传感器的真实投影坐标自动框出（综合预览多边形、区域详情裁剪、设备打点共用）。

// 矩形 [x0,y0,x1,y1] → SVG polygon points 字符串
export function rectToPoints([x0, y0, x1, y1]) {
  return `${x0},${y0} ${x1},${y0} ${x1},${y1} ${x0},${y1}`;
}

/**
 * 计算包住一组点的「正方形」矩形（百分比坐标 [x0,y0,x1,y1]），带边距。
 * 用于把同一区域的传感器自动框成一块方形区域：综合预览画多边形、区域详情裁剪放大底图、
 * 设备局部打点三者共用这一矩形，保证对齐；正方形可避免详情放大时底图被拉伸变形。
 *
 * @param {{x:number,y:number}[]} points 该区域所有传感器的底图全局百分比坐标
 * @param {number} pad 向四周扩展的边距（百分比）
 * @returns {[number,number,number,number]}
 */
export function squareBBoxRect(points, pad = 7) {
  if (!points || !points.length) return [10, 10, 90, 90];
  let minX = 100, minY = 100, maxX = 0, maxY = 0;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  minX -= pad; minY -= pad; maxX += pad; maxY += pad;
  // 取较长边做成正方形（中心不变）
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const half = Math.max(maxX - minX, maxY - minY) / 2;
  const clamp = (v) => Math.max(0, Math.min(100, v));
  return [clamp(cx - half), clamp(cy - half), clamp(cx + half), clamp(cy + half)];
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
