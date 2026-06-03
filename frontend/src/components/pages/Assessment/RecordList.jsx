/**
 * RecordList - 传感器记录列表（状态评估页复用）
 *
 * 所在页面：AssessmentPage（/assessment）—— 全部查询 / 单传感器视图共用
 * Props：
 *   records (object[]) - 后端 sensor_records 数组（severity 为 error/warning/info），必填
 *   showSensor (boolean) - 是否显示「传感器」列（全部视图为 true），默认 false
 * 功能：表头 + 可滚动的记录行，左侧色条按严重程度着色，含时间/等级/类别/标题/读数
 * 依赖接口：无（数据由父组件透传）
 */
import React from "react";
import styled from "styled-components";
import {
  normalizeSeverity,
  severityColor,
  severityLabel,
  categoryLabel,
  formatTime,
} from "../../../data/mock";

function RecordList({ records, showSensor = false }) {
  if (!records || records.length === 0) {
    return <Empty>暂无记录</Empty>;
  }

  return (
    <Wrapper>
      <HeadRow $sensor={showSensor}>
        <span>时间</span>
        <span>等级</span>
        <span>类别</span>
        {showSensor && <span>传感器</span>}
        <span>事件</span>
        <span style={{ textAlign: "right" }}>读数</span>
      </HeadRow>
      <Scroll>
        {records.map((r) => {
          const sev = normalizeSeverity(r.severity);
          const color = severityColor[sev];
          return (
            <Row key={r.id} $sensor={showSensor} style={{ "--bar": color }}>
              <Time>{formatTime(r.recorded_at)}</Time>
              <Badge style={{ color, borderColor: color }}>
                {severityLabel[sev]}
              </Badge>
              <Cat>{categoryLabel[r.category] || r.category}</Cat>
              {showSensor && <Sensor>{r.sensor_id}</Sensor>}
              <Title title={r.detail || r.title}>{r.title}</Title>
              <Val>
                {r.value}
                <Unit>{r.unit}</Unit>
              </Val>
            </Row>
          );
        })}
      </Scroll>
    </Wrapper>
  );
}

const COLS = "150px 72px 92px 1fr 110px";
const COLS_SENSOR = "150px 72px 92px 96px 1fr 110px";

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
`;

const HeadRow = styled.div`
  display: grid;
  grid-template-columns: ${(p) => (p.$sensor ? COLS_SENSOR : COLS)};
  gap: 12px;
  padding: 0 12px 8px 14px;
  font-size: var(--font-tiny);
  color: var(--text-muted);
  border-bottom: 1px solid var(--border);
`;

const Scroll = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 0 0 0;
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: ${(p) => (p.$sensor ? COLS_SENSOR : COLS)};
  gap: 12px;
  align-items: center;
  position: relative;
  flex-shrink: 0;
  padding: 9px 12px 9px 14px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  transition: border-color 0.15s;

  &::before {
    content: "";
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 3px;
    background: var(--bar);
  }
  &:hover {
    border-color: var(--text-muted);
  }
`;

const Time = styled.span`
  font-family: var(--font-data);
  font-size: var(--font-tiny);
  color: var(--text-muted);
`;

const Badge = styled.span`
  justify-self: start;
  font-size: var(--font-tiny);
  font-weight: 500;
  padding: 1px 8px;
  border-radius: 999px;
  border: 1px solid;
  background: var(--bg-base);
  white-space: nowrap;
`;

const Cat = styled.span`
  font-size: var(--font-small);
  color: var(--text-secondary);
`;

const Sensor = styled.span`
  font-family: var(--font-data);
  font-size: var(--font-small);
  color: var(--text-secondary);
`;

const Title = styled.span`
  font-size: var(--font-small);
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const Val = styled.span`
  text-align: right;
  font-family: var(--font-data);
  font-size: var(--font-small);
  font-weight: 500;
  color: var(--text-primary);
`;

const Unit = styled.span`
  font-size: var(--font-tiny);
  color: var(--text-muted);
  margin-left: 2px;
`;

const Empty = styled.div`
  flex: 1;
  display: grid;
  place-items: center;
  min-height: 160px;
  color: var(--text-muted);
  font-size: var(--font-small);
`;

export default RecordList;
