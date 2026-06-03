/**
 * StatusBox - 横跨全宽的厂区关键参数状态栏
 *
 * 所在页面：OverViewPage（/）
 * Props：
 *   params (object[]) - 参数卡片数组（由 useOverviewData 提供），必填
 *                       每项含 { label, value, unit, status }
 * 功能：一行横向排列多张参数卡片，每张含标签名、当前值、单位、状态颜色
 * 依赖接口：无（数据经 OverViewPage 透传，源自后端聚合）
 */
import React from "react";
import styled from "styled-components";
import { statusColor } from "../../data/mock";

function StatusBox({ params = [] }) {
  return (
    <Wrapper>
      {params.map((p) => {
        const color = statusColor[p.status];
        return (
          <Item key={p.label} style={{ "--accent": color }}>
            <Label>{p.label}</Label>
            <ValueRow>
              <Value style={{ color }}>{p.value}</Value>
              <Unit>{p.unit}</Unit>
            </ValueRow>
            <Bar />
          </Item>
        );
      })}
    </Wrapper>
  );
}

const Wrapper = styled.div`
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 12px;
  padding: 1rem;
  background-color: var(--bg-card-alpha);
  backdrop-filter: blur(12px);
  border-radius: var(--radius-default);

  @media (max-width: 1100px) {
    grid-template-columns: repeat(3, 1fr);
  }
`;

const Item = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
`;

const Label = styled.span`
  font-size: var(--font-small);
  color: var(--text-muted);
`;

const ValueRow = styled.div`
  display: flex;
  align-items: baseline;
  gap: 4px;
`;

const Value = styled.span`
  font-family: var(--font-data);
  font-size: var(--font-h1);
  font-weight: 500;
  line-height: 1;
`;

const Unit = styled.span`
  font-size: var(--font-small);
  color: var(--text-secondary);
`;

const Bar = styled.span`
  height: 3px;
  border-radius: 3px;
  background: var(--accent);
  opacity: 0.7;
`;

export default StatusBox;
