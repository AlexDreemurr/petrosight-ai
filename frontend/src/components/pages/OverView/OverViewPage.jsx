/**
 * OverViewPage - 厂区总览页面
 *
 * 所在页面：路由 /
 * Props：无
 * 功能：渲染 OverallMap 组件，展示厂区平面地图
 * 依赖接口：无（通过 OverallMap 间接依赖 GET /api/sensors）
 */
import React from "react";
import OverallMap from "../../OverallMap/OverallMap";

function OverViewPage() {
  return <OverallMap></OverallMap>;
}

export default OverViewPage;
