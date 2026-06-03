/**
 * AlertPin - 综合预览模式下叠加在底图上的告警红针
 *
 * 所在页面：OverViewPage（/）→ OverallMap → OverviewMode
 * Props：
 *   data (object) - 完整告警事件对象（见 data/mock.js 的 alerts），必填
 *   onClick (function) - 点击红针的回调，参数为 data，可选
 * 功能：按 position 百分比绝对定位；圆点 + 细线 + 简要标题；
 *       hover 显示 tooltip（标题/区域/严重程度/时间），点击触发 onClick
 * 依赖接口：无
 */
import React from "react";
import styled from "styled-components";
import { severityColor, severityLabel } from "../../data/mock";

function AlertPin({ data, onClick }) {
  const color = severityColor[data.severity];

  return (
    <Wrapper
      style={{ left: `${data.position.x}%`, top: `${data.position.y}%` }}
      onClick={() => onClick?.(data)}
    >
      <Label style={{ borderColor: color, color }}>{data.title}</Label>
      <Stem style={{ background: color }} />
      <Dot style={{ background: color, boxShadow: `0 0 0 4px ${color}33` }}>
        <Pulse style={{ background: color }} />
      </Dot>

      <Tooltip className="pin-tooltip">
        <TipTitle>{data.title}</TipTitle>
        <TipRow>
          <span>区域</span>
          <strong>{data.zone}</strong>
        </TipRow>
        <TipRow>
          <span>严重程度</span>
          <strong style={{ color }}>{severityLabel[data.severity]}</strong>
        </TipRow>
        <TipRow>
          <span>时间</span>
          <strong>{data.time}</strong>
        </TipRow>
      </Tooltip>
    </Wrapper>
  );
}

const Wrapper = styled.div`
  position: absolute;
  transform: translate(-50%, -100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  z-index: 2;

  &:hover {
    z-index: 30;
  }
  &:hover .pin-tooltip {
    opacity: 1;
    visibility: visible;
  }
`;

const Label = styled.div`
  white-space: nowrap;
  font-family: var(--font-data);
  font-size: var(--font-tiny);
  font-weight: 500;
  padding: 2px 6px;
  margin-bottom: 2px;
  border-radius: 4px;
  background: rgba(5, 8, 15, 0.85);
  border: 1px solid;
`;

const Stem = styled.div`
  width: 2px;
  height: 14px;
`;

const Dot = styled.div`
  position: relative;
  width: 10px;
  height: 10px;
  border-radius: 50%;
`;

const Pulse = styled.span`
  position: absolute;
  inset: 0;
  border-radius: 50%;
  opacity: 0.6;
  animation: pin-pulse 1.8s ease-out infinite;

  @keyframes pin-pulse {
    0% {
      transform: scale(1);
      opacity: 0.6;
    }
    100% {
      transform: scale(3.2);
      opacity: 0;
    }
  }
`;

const Tooltip = styled.div`
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  width: 200px;
  padding: 10px 12px;
  margin-bottom: 8px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.15s, visibility 0.15s;
  pointer-events: none;
`;

const TipTitle = styled.div`
  font-size: var(--font-default);
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 6px;
`;

const TipRow = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: var(--font-tiny);
  line-height: 1.7;

  span {
    color: var(--text-muted);
  }
  strong {
    color: var(--text-secondary);
    font-weight: 500;
    text-align: right;
  }
`;

export default AlertPin;
