/**
 * TrendChart - 单传感器数值趋势迷你折线图（纯 SVG，无第三方依赖）
 *
 * 所在页面：AssessmentPage（/assessment）→ 单传感器视图
 * Props：
 *   records (object[]) - 该传感器的记录数组（含 value/unit/severity/recorded_at），必填
 * 功能：按时间升序绘制数值折线 + 渐变填充 + 数据点（按严重程度着色）；
 *       对 gas/thermal 叠加预警/危险阈值参考线；少于 2 个数值点时显示占位提示。
 * 依赖接口：无（数据由父组件透传）
 */
import React from "react";
import styled from "styled-components";
import {
  normalizeSeverity,
  severityColor,
  severityLabel,
  formatTime,
} from "../../../data/mock";

const W = 720;
const H = 200;
const PAD = { top: 16, right: 16, bottom: 26, left: 44 };

// 各类别的阈值参考线（与后端 get_severity 规则一致）
const THRESHOLDS = {
  gas: [
    { v: 200, label: "预警", color: "var(--color-warning)" },
    { v: 400, label: "危险", color: "var(--color-danger)" },
  ],
  thermal: [
    { v: 150, label: "预警", color: "var(--color-warning)" },
    { v: 300, label: "危险", color: "var(--color-danger)" },
  ],
};

function TrendChart({ records = [] }) {
  const [hover, setHover] = React.useState(null); // 悬浮的数据点索引
  // 升序、且只取有数值的点
  const points = React.useMemo(() => {
    return records
      .filter((r) => typeof r.value === "number")
      .slice()
      .sort((a, b) => (a.recorded_at || "").localeCompare(b.recorded_at || ""));
  }, [records]);

  if (points.length < 2) {
    return <Placeholder>数据点不足，无法绘制趋势</Placeholder>;
  }

  const category = points[points.length - 1].category;
  const unit = points[points.length - 1].unit || "";
  const values = points.map((p) => p.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    // 全部相等时给一点上下空间，避免除零
    min -= 1;
    max += 1;
  }
  const pad = (max - min) * 0.1;
  min -= pad;
  max += pad;

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const xAt = (i) => PAD.left + (points.length === 1 ? 0 : (i / (points.length - 1)) * innerW);
  const yAt = (v) => PAD.top + (1 - (v - min) / (max - min)) * innerH;

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(1)} ${yAt(p.value).toFixed(1)}`)
    .join(" ");
  const areaPath =
    `M ${xAt(0).toFixed(1)} ${(PAD.top + innerH).toFixed(1)} ` +
    points.map((p, i) => `L ${xAt(i).toFixed(1)} ${yAt(p.value).toFixed(1)}`).join(" ") +
    ` L ${xAt(points.length - 1).toFixed(1)} ${(PAD.top + innerH).toFixed(1)} Z`;

  // y 轴刻度（min/中/max）
  const yTicks = [min, (min + max) / 2, max];
  // 阈值参考线（仅画落在当前数值范围内的）
  const thresholds = (THRESHOLDS[category] || []).filter((t) => t.v >= min && t.v <= max);

  const hp = hover != null ? points[hover] : null;

  return (
    <Wrapper>
      <ChartBox>
      <Svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-secondary)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--color-secondary)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* y 轴网格线 + 刻度 */}
        {yTicks.map((v, i) => (
          <g key={i}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={yAt(v)}
              y2={yAt(v)}
              stroke="var(--border)"
              strokeWidth="1"
              strokeDasharray={i === 0 ? "0" : "0"}
              opacity="0.5"
            />
            <text x={PAD.left - 6} y={yAt(v) + 3} textAnchor="end" className="axis">
              {Math.round(v)}
            </text>
          </g>
        ))}

        {/* 阈值参考线 */}
        {thresholds.map((t) => (
          <g key={t.v}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={yAt(t.v)}
              y2={yAt(t.v)}
              stroke={t.color}
              strokeWidth="1"
              strokeDasharray="4 4"
              opacity="0.7"
            />
            <text x={W - PAD.right} y={yAt(t.v) - 4} textAnchor="end" className="thr" fill={t.color}>
              {t.label} {t.v}
            </text>
          </g>
        ))}

        {/* 面积 + 折线 */}
        <path d={areaPath} fill="url(#trend-fill)" />
        <path d={linePath} fill="none" stroke="var(--color-secondary)" strokeWidth="2" />

        {/* 悬浮竖参考线 */}
        {hp && (
          <line
            x1={xAt(hover)}
            x2={xAt(hover)}
            y1={PAD.top}
            y2={PAD.top + innerH}
            stroke="var(--text-muted)"
            strokeWidth="1"
            strokeDasharray="3 3"
            opacity="0.6"
          />
        )}

        {/* 数据点（按严重程度着色），含透明大热区便于悬浮 */}
        {points.map((p, i) => (
          <g
            key={p.id || i}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover((h) => (h === i ? null : h))}
            style={{ cursor: "pointer" }}
          >
            <circle cx={xAt(i)} cy={yAt(p.value)} r="9" fill="transparent" />
            <circle
              cx={xAt(i)}
              cy={yAt(p.value)}
              r={hover === i ? 4.5 : 2.8}
              style={{ fill: severityColor[normalizeSeverity(p.severity)] }}
              stroke={hover === i ? "var(--text-primary)" : "none"}
              strokeWidth="1.5"
            />
          </g>
        ))}

        {/* x 轴首尾时间 */}
        <text x={PAD.left} y={H - 8} textAnchor="start" className="axis">
          {formatTime(points[0].recorded_at).slice(5, 16)}
        </text>
        <text x={W - PAD.right} y={H - 8} textAnchor="end" className="axis">
          {formatTime(points[points.length - 1].recorded_at).slice(5, 16)}
        </text>
      </Svg>

      {/* 数据点 tooltip */}
      {hp && (
        <Tip
          style={{
            left: `${(xAt(hover) / W) * 100}%`,
            top: `${(yAt(hp.value) / H) * 100}%`,
          }}
        >
          <TipTime>{formatTime(hp.recorded_at)}</TipTime>
          <TipVal style={{ color: severityColor[normalizeSeverity(hp.severity)] }}>
            {hp.value}
            <small>{hp.unit || unit}</small>
          </TipVal>
          <TipSev>{severityLabel[normalizeSeverity(hp.severity)]}</TipSev>
        </Tip>
      )}
      </ChartBox>
      <UnitTag>单位：{unit || "—"}</UnitTag>
    </Wrapper>
  );
}

const Wrapper = styled.div`
  position: relative;
  padding: 8px 12px 4px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
`;

const ChartBox = styled.div`
  position: relative;
`;

const Tip = styled.div`
  position: absolute;
  transform: translate(-50%, calc(-100% - 10px));
  pointer-events: none;
  white-space: nowrap;
  padding: 6px 9px;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
  z-index: 5;
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const TipTime = styled.span`
  font-family: var(--font-data);
  font-size: var(--font-tiny);
  color: var(--text-muted);
`;

const TipVal = styled.span`
  font-family: var(--font-data);
  font-size: var(--font-default);
  font-weight: 500;

  small {
    font-size: var(--font-tiny);
    color: var(--text-muted);
    margin-left: 2px;
  }
`;

const TipSev = styled.span`
  font-size: var(--font-tiny);
  color: var(--text-secondary);
`;

const Svg = styled.svg`
  width: 100%;
  height: auto;
  display: block;

  .axis {
    fill: var(--text-muted);
    font-size: 11px;
    font-family: var(--font-data);
  }
  .thr {
    font-size: 10px;
    font-family: var(--font-data);
  }
`;

const UnitTag = styled.span`
  position: absolute;
  top: 10px;
  left: 14px;
  font-size: var(--font-tiny);
  color: var(--text-muted);
`;

const Placeholder = styled.div`
  display: grid;
  place-items: center;
  min-height: 100px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text-muted);
  font-size: var(--font-small);
`;

export default TrendChart;
