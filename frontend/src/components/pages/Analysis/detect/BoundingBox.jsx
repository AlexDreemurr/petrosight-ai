/**
 * BoundingBox - 单个检测框（叠加在原图上）
 *
 * 所在页面：AnalysisPage（/analysis）→ 图像识别 → DetectionOverlay
 * Props：
 *   det (object) - 单条检测结果 { id, label, label_cn, confidence, risk, box:{x,y,w,h} }，必填
 *   color (string) - 该类别对应的颜色（同类同色），可选，默认按风险蓝/红
 *   active (boolean) - 是否高亮（与列表联动）
 *   onHover (function) - 悬浮回调，参数为 det.id 或 null
 * 功能：按归一化 box（0~1）以百分比绝对定位；颜色按类别区分；顶部标签条显示中文标签+置信度
 * 依赖接口：无
 */
import React from "react";
import styled from "styled-components";

function BoundingBox({ det, color, active, onHover }) {
  const c = color || (det.risk ? "var(--color-danger)" : "var(--color-secondary)");
  const { x, y, w, h } = det.box;
  return (
    <Box
      style={{
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        width: `${w * 100}%`,
        height: `${h * 100}%`,
        "--c": c,
      }}
      data-active={active}
      onMouseEnter={() => onHover?.(det.id)}
      onMouseLeave={() => onHover?.(null)}
    >
      <Label>
        {det.label_cn} {Math.round(det.confidence * 100)}%
      </Label>
    </Box>
  );
}

const Box = styled.div`
  position: absolute;
  border: 2px solid var(--c);
  background: color-mix(in srgb, var(--c) 12%, transparent);
  border-radius: 3px;
  cursor: pointer;
  transition: background 0.12s, box-shadow 0.12s;

  &[data-active="true"] {
    background: color-mix(in srgb, var(--c) 26%, transparent);
    box-shadow: 0 0 0 2px var(--c);
    z-index: 3;
  }
`;

const Label = styled.span`
  position: absolute;
  top: 0;
  left: 0;
  transform: translateY(-100%);
  white-space: nowrap;
  font-family: var(--font-data);
  font-size: var(--font-tiny);
  font-weight: 500;
  line-height: 1.4;
  padding: 1px 5px;
  color: #fff;
  background: var(--c);
  border-radius: 3px 3px 3px 0;
`;

export default BoundingBox;
