/**
 * DetectionList - 检测结果列表（与叠加框联动高亮）
 *
 * 所在页面：AnalysisPage（/analysis）→ 图像识别 → ImageDetectPanel
 * Props：
 *   detections (object[]) - 检测结果数组，必填
 *   colorMap (object) - 类别 label → 颜色 的映射（同类同色），可选
 *   activeId (number|null) - 当前高亮 id
 *   onHover (function) - 悬浮回调（参数 id 或 null）
 * 功能：每行展示 序号 / 中文标签 / 原始类别 / 置信度条 / 风险徽章；同类同色；hover 行联动叠加框
 * 依赖接口：无
 */
import React from "react";
import styled from "styled-components";

function DetectionList({ detections = [], colorMap = {}, activeId, onHover }) {
  if (detections.length === 0) {
    return <Empty>未检测到目标</Empty>;
  }
  return (
    <List>
      {detections.map((d) => {
        const color =
          colorMap[d.label] ||
          (d.risk ? "var(--color-danger)" : "var(--color-secondary)");
        return (
          <Row
            key={d.id}
            data-active={activeId === d.id}
            onMouseEnter={() => onHover?.(d.id)}
            onMouseLeave={() => onHover?.(null)}
            style={{ "--c": color }}
          >
            <Idx>{d.id + 1}</Idx>
            <Info>
              <NameRow>
                <Name>{d.label_cn}</Name>
                {d.risk && <RiskTag>风险</RiskTag>}
              </NameRow>
              <Raw>{d.label}</Raw>
            </Info>
            <ConfWrap>
              <ConfBar style={{ width: `${d.confidence * 100}%` }} />
              <ConfNum>{Math.round(d.confidence * 100)}%</ConfNum>
            </ConfWrap>
          </Row>
        );
      })}
    </List>
  );
}

const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: 26px 1fr 96px;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-left: 3px solid var(--c);
  border-radius: 8px;
  background: var(--bg-card);
  cursor: pointer;
  transition: border-color 0.12s, background 0.12s;

  &[data-active="true"] {
    border-color: var(--c);
    background: color-mix(in srgb, var(--c) 10%, var(--bg-card));
  }
`;

const Idx = styled.span`
  font-family: var(--font-data);
  font-size: var(--font-small);
  color: var(--text-muted);
  text-align: center;
`;

const Info = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
`;

const NameRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
`;

const Name = styled.span`
  font-size: var(--font-default);
  font-weight: 500;
  color: var(--text-primary);
`;

const RiskTag = styled.span`
  font-size: var(--font-tiny);
  color: var(--color-danger);
  border: 1px solid var(--color-danger);
  border-radius: 999px;
  padding: 0 6px;
`;

const Raw = styled.span`
  font-family: var(--font-data);
  font-size: var(--font-tiny);
  color: var(--text-muted);
`;

const ConfWrap = styled.div`
  position: relative;
  height: 18px;
  border-radius: 4px;
  background: var(--bg-base);
  overflow: hidden;
  display: flex;
  align-items: center;
`;

const ConfBar = styled.span`
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  background: color-mix(in srgb, var(--c) 45%, transparent);
`;

const ConfNum = styled.span`
  position: relative;
  margin-left: auto;
  padding-right: 6px;
  font-family: var(--font-data);
  font-size: var(--font-tiny);
  color: var(--text-secondary);
`;

const Empty = styled.div`
  padding: 24px;
  text-align: center;
  color: var(--text-muted);
  font-size: var(--font-small);
`;

export default DetectionList;
