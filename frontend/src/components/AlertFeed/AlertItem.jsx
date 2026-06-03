/**
 * AlertItem - AlertFeed 中的单条告警消息卡片
 *
 * 所在页面：OverViewPage（/）→ AlertFeed
 * Props：
 *   data (object) - 单条告警事件对象（见 data/mock.js 的 alerts），必填
 * 功能：左侧色条（对应 severity）+ 严重程度 Badge + 类别 Badge +
 *       标题（粗体）+ 一行省略描述 + 右下角时间戳
 * 依赖接口：无
 */
import React from "react";
import styled from "styled-components";
import {
  severityColor,
  severityLabel,
  categoryLabel,
} from "../../data/mock";

function AlertItem({ data }) {
  const color = severityColor[data.severity];

  return (
    <Wrapper style={{ "--bar": color }}>
      <Top>
        <Badges>
          <Badge style={{ color, borderColor: color }}>
            {severityLabel[data.severity]}
          </Badge>
          <Badge
            style={{ color: "var(--text-secondary)", borderColor: "var(--border)" }}
          >
            {categoryLabel[data.category]}
          </Badge>
        </Badges>
      </Top>
      <Title>{data.title}</Title>
      <Desc>{data.detail}</Desc>
      <Time>{data.time}</Time>
    </Wrapper>
  );
}

const Wrapper = styled.div`
  position: relative;
  flex-shrink: 0;
  padding: 10px 12px 10px 16px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
  transition: border-color 0.15s;

  &::before {
    content: "";
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 4px;
    background: var(--bar);
  }
  &:hover {
    border-color: var(--text-muted);
  }
`;

const Top = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const Badges = styled.div`
  display: flex;
  gap: 6px;
`;

const Badge = styled.span`
  font-size: var(--font-tiny);
  font-weight: 500;
  padding: 1px 7px;
  border-radius: 999px;
  border: 1px solid;
  background: var(--bg-base);
`;

const Title = styled.div`
  margin-top: 7px;
  font-size: var(--font-default);
  font-weight: 500;
  color: var(--text-primary);
`;

const Desc = styled.p`
  margin-top: 3px;
  font-size: var(--font-small);
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const Time = styled.div`
  margin-top: 8px;
  text-align: right;
  font-family: var(--font-data);
  font-size: var(--font-tiny);
  color: var(--text-muted);
`;

export default AlertItem;
