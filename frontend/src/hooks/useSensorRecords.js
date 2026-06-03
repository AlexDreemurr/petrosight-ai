/**
 * useSensorRecords - 状态评估页的统一数据源 Hook
 *
 * 所在页面：AssessmentPage（/assessment）
 * 功能：拉取全部传感器与传感器记录，供「全部状态查询」与「单传感器记录」视图共用。
 * 依赖接口：
 *   - GET /api/records（传感器数据记录，最多 500 条）
 *   - GET /api/sensors（传感器基础信息）
 * 返回：{ loading, error, sensors, records, reload }
 */
import { useState, useEffect, useCallback } from "react";
import { getRecords, getSensors } from "../api";

export function useSensorRecords() {
  const [state, setState] = useState({
    loading: true,
    error: "",
    sensors: [],
    records: [],
  });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: "" }));
    try {
      const [records, sensors] = await Promise.all([
        getRecords({ limit: 500 }),
        getSensors(),
      ]);
      setState({
        loading: false,
        error: "",
        sensors: sensors || [],
        records: records || [],
      });
    } catch (e) {
      setState({
        loading: false,
        error: e.message || "数据加载失败",
        sensors: [],
        records: [],
      });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { ...state, reload: load };
}
