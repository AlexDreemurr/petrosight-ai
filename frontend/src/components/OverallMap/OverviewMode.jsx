/**
 * OverviewMode - 综合预览模式
 *
 * 所在页面：OverViewPage（/）→ OverallMap
 * Props：
 *   alerts (object[]) - 告警事件数组（由 useOverviewData 提供），必填
 * 功能：以工厂俯视图为底图，按 alerts 的 position 叠加 AlertPin 红针；
 *       点击红针弹出 DevicePopup 告警详情。仅展示异常级别（danger/warning）。
 * 依赖接口：无（数据经 OverallMap 透传，源自后端 /api/records）
 */
import React from "react";
import styled from "styled-components";
import AlertPin from "./AlertPin";
import DevicePopup from "./DevicePopup";

function OverviewMode({ alerts = [] }) {
  const [active, setActive] = React.useState(null);

  // alerts 已是每个传感器的最新状态（一传感器一条），这里只取异常的作为红/黄针。
  const pins = React.useMemo(
    () => alerts.filter((a) => a.severity === "danger" || a.severity === "warning"),
    [alerts]
  );

  return (
    <Stage>
      <BaseMap src="/map_img/factory.png" alt="厂区俯视图" />
      {pins.map((a) => (
        <AlertPin key={a.id} data={a} onClick={setActive} />
      ))}
      {active && <DevicePopup data={active} onClose={() => setActive(null)} />}
    </Stage>
  );
}

const Stage = styled.div`
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 360px;
  border-radius: var(--radius-default);
  /* 不裁切：让红针 hover 的 tooltip 可以溢出到地图边界之外而不被边框遮挡 */
  overflow: visible;
  background: radial-gradient(
    circle at 50% 35%,
    #0c1626 0%,
    var(--bg-base) 75%
  );
`;

const BaseMap = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  /* Stage 不再裁切，圆角改由图片自身负责，保证四角仍是圆的 */
  border-radius: var(--radius-default);
  user-select: none;
  -webkit-user-drag: none;
`;

export default OverviewMode;
