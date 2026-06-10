/**
 * OverallMap - 厂区平面地图展示组件（含模式切换）
 *
 * 所在页面：OverViewPage（/）
 * Props：
 *   alerts (object[]) - 告警事件数组（综合预览用），必填
 *   zones (object[]) - 区域数组（分区查询用），必填
 * 功能：顶部 Toggle 切换两种模式——
 *   - 综合预览（OverviewMode）：底图叠加告警红针
 *   - 分区查询（ZoneMode）：底图分区 → 区域详情 → 设备查询
 * 依赖接口：无（数据经 OverViewPage 透传，源自后端）
 */
import React from "react";
import styled from "styled-components";
import Icon from "../Icon/Icon";
import OverviewMode from "./OverviewMode";
import ZoneMode from "./ZoneMode";

const MODES = [
  { key: "overview", label: "综合预览", icon: "layers" },
  { key: "zone", label: "分区查询", icon: "grid" },
];

function OverallMap({ alerts = [], zones = [] }) {
  const [mode, setMode] = React.useState("overview");
  // 鼠标悬停在地图上时的经纬度（BD09），移出地图时为 null
  const [coord, setCoord] = React.useState(null);

  return (
    <Wrapper>
      <Toolbar>
        <SectionTitle>厂区地图</SectionTitle>
        <ToolbarRight>
          {coord && (
            <Coord>
              <span>经度</span>
              <strong>{coord.lng.toFixed(6)}</strong>
              <span>纬度</span>
              <strong>{coord.lat.toFixed(6)}</strong>
            </Coord>
          )}
          <Toggle>
            {MODES.map((m) => (
              <ToggleBtn
                key={m.key}
                data-active={mode === m.key}
                onClick={() => setMode(m.key)}
              >
                <Icon id={m.icon} size={15} />
                <span>{m.label}</span>
              </ToggleBtn>
            ))}
          </Toggle>
        </ToolbarRight>
      </Toolbar>

      <Body>
        {mode === "overview" ? (
          <OverviewMode alerts={alerts} onHover={setCoord} />
        ) : (
          <ZoneMode zones={zones} onHover={setCoord} />
        )}
      </Body>
    </Wrapper>
  );
}

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 1rem;
  background-color: var(--bg-card-alpha);
  backdrop-filter: blur(12px);
  border-radius: var(--radius-default);
`;

const Toolbar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
`;

const SectionTitle = styled.h3`
  font-size: var(--font-h3);
  font-weight: 500;
  color: var(--text-primary);
`;

const ToolbarRight = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 12px;
`;

// 鼠标位置经纬度显示（toggle 左侧）
const Coord = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--bg-base);
  border: 1px solid var(--border);
  font-family: var(--font-data);
  font-size: var(--font-tiny);
  white-space: nowrap;

  span {
    color: var(--text-muted);
  }
  strong {
    color: var(--text-secondary);
    font-weight: 500;
  }

  @media (max-width: 1000px) {
    display: none;
  }
`;

const Toggle = styled.div`
  display: inline-flex;
  padding: 3px;
  gap: 3px;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: 999px;
`;

const ToggleBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 14px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--text-muted);
  font-size: var(--font-small);
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;

  &[data-active="true"] {
    background: var(--color-primary);
    color: #fff;
  }
  &[data-active="false"]:hover {
    color: var(--text-secondary);
  }
`;

const Body = styled.div`
  flex: 1;
  min-height: 0;
`;

export default OverallMap;
