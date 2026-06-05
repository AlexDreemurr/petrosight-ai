/**
 * DetectionOverlay - 原图 + 检测框叠加容器
 *
 * 所在页面：AnalysisPage（/analysis）→ 图像识别 → ImageDetectPanel
 * Props：
 *   image (string) - 图片 URL（本地 objectURL 或远程），必填
 *   detections (object[]) - 检测结果数组，默认 []
 *   colorMap (object) - 类别 label → 颜色 的映射（同类同色），可选
 *   activeId (number|null) - 当前高亮的检测 id（与列表联动）
 *   onHover (function) - 悬浮回调
 * 功能：图片按容器宽度自适应，检测框用归一化坐标的百分比定位，天然随缩放对齐
 * 依赖接口：无
 */
import React from "react";
import styled from "styled-components";
import BoundingBox from "./BoundingBox";

function DetectionOverlay({ image, detections = [], colorMap = {}, activeId, onHover }) {
  return (
    <Frame>
      <Img src={image} alt="待识别图片" />
      {detections.map((d) => (
        <BoundingBox
          key={d.id}
          det={d}
          color={colorMap[d.label]}
          active={activeId === d.id}
          onHover={onHover}
        />
      ))}
    </Frame>
  );
}

const Frame = styled.div`
  position: relative;
  width: 100%;
  line-height: 0;
  border-radius: var(--radius-default);
  overflow: hidden;
  background: var(--bg-base);
  border: 1px solid var(--border);
`;

const Img = styled.img`
  display: block;
  width: 100%;
  height: auto;
  user-select: none;
  -webkit-user-drag: none;
`;

export default DetectionOverlay;
