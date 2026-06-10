/**
 * useOverviewData - 厂区总览页的统一数据源 Hook
 *
 * 所在页面：OverViewPage（/）
 * 功能：从后端拉取传感器记录与传感器列表，转换为总览页各组件所需结构，
 *       与「数据分析」页共用同一后端数据，保证全应用数据流统一。
 * 依赖接口：
 *   - GET /api/records（传感器数据记录）
 *   - GET /api/sensors（传感器基础信息）
 * 返回：{ loading, error, alerts, zones, statusParams, reload }
 */
import { useState, useEffect, useCallback } from "react";
import { getRecords, getSensors } from "../api";
import { lngLatToPercent } from "../data/geo";
import {
  squareBBoxRect,
  rectToPoints,
  remapToRect,
  positionFromId,
  normalizeSeverity,
  severityToStatus,
  worstStatus,
  formatTime,
} from "../data/mock";

export function useOverviewData() {
  const [state, setState] = useState({
    loading: true,
    error: "",
    alerts: [],
    zones: [],
    statusParams: [],
  });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: "" }));
    try {
      const [records, sensors] = await Promise.all([
        getRecords({ limit: 200 }),
        getSensors(),
      ]);
      setState({
        loading: false,
        error: "",
        ...transform(records || [], sensors || []),
      });
    } catch (e) {
      setState({
        loading: false,
        error: e.message || "数据加载失败",
        alerts: [],
        zones: [],
        statusParams: [],
      });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cancelled) await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  return { ...state, reload: load };
}

// ---- 数据转换 ----
//
// 总览页始终反映「当前快照」：对每个传感器只取时间上最新的一条记录。
// 数据按快照上传（每份快照内 recorded_at 相同），故最新记录即当前状态。

function transform(records, sensors) {
  // 传感器坐标查找表：优先用后端真实 lng/lat，缺失或为 0 时退回哈希坐标
  const posBySensor = {};
  // 原始 BD09 经纬度查找表：仅在坐标有效时保留，供弹窗展示；无效则为 null
  const coordBySensor = {};
  for (const s of sensors) {
    posBySensor[s.id] = resolvePos(s.id, s.lng, s.lat);
    coordBySensor[s.id] = isGeoCoord(s.lng, s.lat)
      ? { lng: s.lng, lat: s.lat }
      : null;
  }

  // 每个传感器的最新一条记录
  const latestBySensor = {};
  for (const r of records) {
    const sid = r.sensor_id;
    if (!sid) continue;
    const cur = latestBySensor[sid];
    if (!cur || (r.recorded_at || "") > (cur.recorded_at || "")) {
      latestBySensor[sid] = r;
    }
  }

  const alerts = buildAlerts(latestBySensor, posBySensor, coordBySensor);
  const zones = buildZones(sensors, latestBySensor, posBySensor, coordBySensor);
  const statusParams = buildStatus(latestBySensor, sensors);
  return { alerts, zones, statusParams };
}

// 判断 lng/lat 是否为中国范围内的真实经纬度（BD09），用于区分有效坐标与占位/缺失。
function isGeoCoord(lng, lat) {
  return (
    typeof lng === "number" &&
    typeof lat === "number" &&
    lng > 70 &&
    lng < 140 &&
    lat > 3 &&
    lat < 55
  );
}

// 解析坐标：有效真实经纬度（BD09）则用墨卡托换算成底图百分比，否则用 id 哈希兜底。
function resolvePos(id, lng, lat) {
  return isGeoCoord(lng, lat) ? lngLatToPercent(lng, lat) : positionFromId(id);
}

// 每个传感器最新记录 → 告警事件（综合预览红针 + AlertFeed 共用，均为当前状态）
function buildAlerts(latestBySensor, posBySensor, coordBySensor) {
  return Object.values(latestBySensor).map((r) => ({
    id: r.id,
    severity: normalizeSeverity(r.severity),
    category: r.category,
    title: r.title || r.sensor_id || "传感器告警",
    detail: r.detail || `${r.sensor_id} 在 ${r.zone} 上报 ${r.value}${r.unit || ""}`,
    sensor_id: r.sensor_id,
    zone: r.zone,
    value: r.value,
    unit: r.unit || "",
    position: posBySensor[r.sensor_id] || positionFromId(r.sensor_id || r.id),
    coord: coordBySensor[r.sensor_id] || null, // 原始 BD09 经纬度（弹窗展示）
    time: formatTime(r.recorded_at),
    _ts: r.recorded_at || "",
  }));
}

// 传感器 + 最新记录 → 区域列表（分区查询用），状态基于每个传感器的最新读数
function buildZones(sensors, latestBySensor, posBySensor, coordBySensor) {
  // 按 zone 分组传感器（保持出现顺序）
  const order = [];
  const grouped = {};
  for (const s of sensors) {
    const z = s.zone || "未分区";
    if (!grouped[z]) {
      grouped[z] = [];
      order.push(z);
    }
    grouped[z].push(s);
  }

  return order.map((zoneName) => {
    const members = grouped[zoneName];
    // 该区域所有传感器在底图上的全局坐标，自动框成一块正方形区域矩形
    const gposList = members.map((s) => posBySensor[s.id] || positionFromId(s.id));
    const rect = squareBBoxRect(gposList);

    const devices = members.map((s) => {
      const rep = latestBySensor[s.id]; // 该传感器最新一条记录
      const status =
        s.status === "offline" || s.status === "fault"
          ? "warning"
          : rep
          ? severityToStatus(rep.severity)
          : "normal";
      // 传感器在整张底图上的全局坐标（落在本区域矩形内）
      const gpos = posBySensor[s.id] || positionFromId(s.id);
      // 区域详情大图用的局部坐标：把全局坐标按本区域矩形重映射到 0~100
      const dpos = remapToRect(gpos.x, gpos.y, rect);
      return {
        id: s.id,
        type: s.type || rep?.category || "sensor",
        name: s.name || s.id,
        status,
        value: rep ? rep.value : 0,
        unit: rep ? rep.unit || "" : "",
        x: dpos.x,
        y: dpos.y,
        coord: coordBySensor[s.id] || null, // 原始 BD09 经纬度（弹窗展示）
        time: rep ? formatTime(rep.recorded_at) : "—",
      };
    });

    return {
      id: zoneName,
      name: zoneName,
      status: worstStatus(devices.map((d) => d.status)),
      points: rectToPoints(rect),
      rect, // 供区域详情裁剪放大底图（hdu.png）使用
      devices,
    };
  });
}

// 最新记录 + 传感器 → StatusBox 参数卡片（反映当前快照）
function buildStatus(latestBySensor, sensors) {
  const records = Object.values(latestBySensor);
  const gas = records.filter((r) => r.category === "gas" && r.value != null);
  const thermal = records.filter((r) => r.category === "thermal" && r.value != null);

  const avgGas = gas.length
    ? Math.round(gas.reduce((sum, r) => sum + r.value, 0) / gas.length)
    : 0;
  const maxTemp = thermal.length
    ? Math.round(Math.max(...thermal.map((r) => r.value)))
    : 0;

  const onlineCount = sensors.filter((s) => s.status === "online").length;
  const droneCount = sensors.filter((s) => s.type === "drone").length;
  const anomalyCount = records.filter(
    (r) => r.severity === "error" || r.severity === "warning"
  ).length;
  const uptime = sensors.length
    ? Math.round((onlineCount / sensors.length) * 1000) / 10
    : 0;

  return [
    { label: "平均气体浓度", value: avgGas, unit: "ppm", status: avgGas > 200 ? "warning" : "normal" },
    { label: "最高区域温度", value: maxTemp, unit: "°C", status: maxTemp > 400 ? "danger" : maxTemp > 300 ? "warning" : "normal" },
    { label: "在线设备数", value: onlineCount, unit: "台", status: onlineCount < 40 ? "warning" : "normal" },
    { label: "活跃无人机", value: droneCount, unit: "架", status: "normal" },
    { label: "当前告警数", value: anomalyCount, unit: "处", status: anomalyCount > 20 ? "warning" : "normal" },
    { label: "系统运行时长", value: uptime, unit: "%", status: uptime < 95 ? "warning" : "normal" },
  ];
}
