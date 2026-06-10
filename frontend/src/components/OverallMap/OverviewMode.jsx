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
import { percentToLngLat } from "../../data/geo";

function OverviewMode({ alerts = [], onHover }) {
  const [active, setActive] = React.useState(null);

  // alerts 已是每个传感器的最新状态（一传感器一条），这里只取异常的作为红/黄针。
  const pins = React.useMemo(
    () => alerts.filter((a) => a.severity === "danger" || a.severity === "warning"),
    [alerts]
  );

  // 鼠标在底图上移动 → 换算经纬度上报；移出则清空
  const handleMove = (e) => {
    if (!onHover) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    onHover(percentToLngLat(x, y));
  };
  const handleLeave = () => onHover?.(null);

  return (
    <Stage onMouseMove={handleMove} onMouseLeave={handleLeave}>
      <BaseMap src="/map_img/hdu.png" alt="厂区卫星底图" />
      {pins.map((a) => (
        <AlertPin key={a.id} data={a} onClick={setActive} />
      ))}
      {active && <DevicePopup data={active} onClose={() => setActive(null)} />}
    </Stage>
  );
}

const Stage = styled.div`
  position: relative;
  /* 锁正方形：边长 = 容器高度（高度不变），宽度随之相等。
     卡片宽度由外层收窄到与正方形一致，故无左右留白。
     底图为正方形（640×640），方形容器 + object-fit:cover 零裁切零留白，
     红针的百分比坐标系与底图完全重合，保证打点不偏。 */
  height: 100%;
  aspect-ratio: 1 / 1;
  margin: 0 auto;
  min-height: 360px;
  border-radius: var(--radius-default);
  /* 不裁切：让红针 hover 的 tooltip 可以溢出到地图边界之外而不被边框遮挡 */
  overflow: visible;

  /* 窄屏/移动端：改宽度驱动正方形，避免高度驱动时横向溢出 */
  @media (max-width: 1000px) {
    width: 100%;
    height: auto;
    min-height: 0;
  }
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
