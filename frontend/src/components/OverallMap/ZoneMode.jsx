/**
 * ZoneMode - 分区查询模式
 *
 * 所在页面：OverViewPage（/）→ OverallMap
 * Props：
 *   zones (object[]) - 区域数组（由 useOverviewData 提供），必填
 * 功能：
 *   1) 区域总览：工厂底图 + SVG polygon 覆盖各区域，按 status 着色，显示区域名
 *      点击某区域进入「区域详情」
 *   2) 区域详情：放大示意图 + 该区域所有设备图标，点击设备弹出 DevicePopup
 * 依赖接口：无（数据经 OverallMap 透传，源自后端 /api/sensors + /api/records）
 */
import React from "react";
import styled from "styled-components";
import { statusColor } from "../../data/mock";
import Icon from "../Icon/Icon";
import DevicePopup from "./DevicePopup";

function ZoneMode({ zones = [] }) {
  const [zoneId, setZoneId] = React.useState(null);
  const [device, setDevice] = React.useState(null);

  const zone = zones.find((z) => z.id === zoneId) || null;

  // ---- 区域详情视图 ----
  if (zone) {
    return (
      <Stage>
        <DetailBar>
          <BackBtn
            onClick={() => {
              setZoneId(null);
              setDevice(null);
            }}
          >
            <Icon id="back" size={16} />
            <span>返回区域总览</span>
          </BackBtn>
          <DetailTitle>
            {zone.name}
            <StatusDot style={{ background: statusColor[zone.status] }} />
          </DetailTitle>
        </DetailBar>

        <DetailStage>
          <BaseMap src={zone.image} alt={zone.name} />
          {zone.devices.map((d) => (
            <DeviceNode
              key={d.id}
              style={{ left: `${d.x}%`, top: `${d.y}%` }}
              onClick={() => setDevice(d)}
            >
              <DeviceIcon
                style={{
                  color: statusColor[d.status],
                  borderColor: statusColor[d.status],
                }}
              >
                <Icon id={d.type} size={16} />
              </DeviceIcon>
              <DeviceTag>{d.id}</DeviceTag>
            </DeviceNode>
          ))}
          {device && (
            <DevicePopup data={device} onClose={() => setDevice(null)} />
          )}
        </DetailStage>
      </Stage>
    );
  }

  // ---- 区域总览视图 ----
  return (
    <Stage>
      <BaseMap src="/map_img/factory.png" alt="厂区俯视图" />
      <Svg viewBox="0 0 100 100" preserveAspectRatio="none">
        {zones.map((z) => (
          <polygon
            key={z.id}
            points={z.points}
            className="zone-poly"
            style={{ "--zone-color": rawColor(z.status) }}
            onClick={() => setZoneId(z.id)}
          />
        ))}
      </Svg>
      {zones.map((z) => {
        const c = centroid(z.points);
        return (
          <ZoneLabel
            key={z.id}
            style={{ left: `${c.x}%`, top: `${c.y}%` }}
            onClick={() => setZoneId(z.id)}
          >
            <ZoneName>{z.name}</ZoneName>
            <ZoneStatus style={{ color: statusColor[z.status] }}>
              <StatusDot style={{ background: statusColor[z.status] }} />
              {statusText(z.status)}
            </ZoneStatus>
          </ZoneLabel>
        );
      })}
    </Stage>
  );
}

// status → 原始色值（SVG fill 不支持 CSS 变量嵌套时直接给值）
function rawColor(status) {
  return (
    {
      danger: "#E24B4A",
      warning: "#EF9F27",
      normal: "#1D9E75",
    }[status] || "#1D9E75"
  );
}

function statusText(status) {
  return { danger: "异常", warning: "预警", normal: "正常" }[status];
}

// 计算 polygon 几何中心（百分比）
function centroid(points) {
  const pts = points
    .trim()
    .split(/\s+/)
    .map((p) => p.split(",").map(Number));
  const sum = pts.reduce(
    (acc, [x, y]) => ({ x: acc.x + x, y: acc.y + y }),
    { x: 0, y: 0 }
  );
  return { x: sum.x / pts.length, y: sum.y / pts.length };
}

const Stage = styled.div`
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 360px;
  border-radius: var(--radius-default);
  overflow: hidden;
  background: radial-gradient(circle at 50% 35%, #0c1626 0%, var(--bg-base) 75%);
`;

const BaseMap = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  user-select: none;
  -webkit-user-drag: none;
`;

const Svg = styled.svg`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;

  .zone-poly {
    fill: var(--zone-color);
    fill-opacity: 0.16;
    stroke: var(--zone-color);
    stroke-width: 0.4;
    cursor: pointer;
    transition: fill-opacity 0.15s;
    vector-effect: non-scaling-stroke;
  }
  .zone-poly:hover {
    fill-opacity: 0.34;
  }
`;

const ZoneLabel = styled.div`
  position: absolute;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 4px 10px;
  border-radius: 8px;
  background: rgba(5, 8, 15, 0.7);
  border: 1px solid var(--border);
  cursor: pointer;
  pointer-events: auto;
  backdrop-filter: blur(2px);

  &:hover {
    border-color: var(--text-muted);
  }
`;

const ZoneName = styled.span`
  font-size: var(--font-small);
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
`;

const ZoneStatus = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--font-tiny);
  font-family: var(--font-data);
`;

const StatusDot = styled.span`
  width: 7px;
  height: 7px;
  border-radius: 50%;
  display: inline-block;
`;

const DetailBar = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 4;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: linear-gradient(to bottom, rgba(5, 8, 15, 0.9), transparent);
`;

const BackBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px 5px 6px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: var(--font-small);

  &:hover {
    color: var(--text-primary);
    border-color: var(--text-muted);
  }
`;

const DetailTitle = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: var(--font-h3);
  font-weight: 500;
  color: var(--text-primary);
`;

const DetailStage = styled.div`
  position: absolute;
  inset: 0;
`;

const DeviceNode = styled.div`
  position: absolute;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  cursor: pointer;
  z-index: 2;

  &:hover {
    z-index: 5;
  }
`;

const DeviceIcon = styled.div`
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 1px solid;
  background: rgba(5, 8, 15, 0.85);
  transition: transform 0.12s;

  ${DeviceNode}:hover & {
    transform: scale(1.12);
  }
`;

const DeviceTag = styled.span`
  font-family: var(--font-data);
  font-size: var(--font-tiny);
  font-weight: 500;
  color: var(--text-primary);
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(5, 8, 15, 0.85);
  white-space: nowrap;
`;

export default ZoneMode;
