/**
 * AlertFeed - 右侧实时告警消息流
 *
 * 所在页面：OverViewPage（/）
 * Props：
 *   alerts (object[]) - 告警事件数组（由 useOverviewData 提供），必填
 * 功能：展示所有告警事件列表（按时间倒序），顶部 FilterBar 支持按
 *       severity 与 category 多选过滤；列表为 AlertItem
 * 依赖接口：无（数据经 OverViewPage 透传，源自后端 /api/records）
 */
import React from "react";
import styled from "styled-components";
import FilterBar from "./FilterBar";
import AlertItem from "./AlertItem";

const ALL_SEVERITIES = ["danger", "warning", "info"];
const ALL_CATEGORIES = ["gas", "thermal", "device", "behavior", "sensor"];

function AlertFeed({ alerts = [] }) {
  const [severities, setSeverities] = React.useState(ALL_SEVERITIES);
  const [categories, setCategories] = React.useState(ALL_CATEGORIES);

  const toggle = (setter) => (key) =>
    setter((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );

  const list = React.useMemo(
    () =>
      alerts
        .filter(
          (a) => severities.includes(a.severity) && categories.includes(a.category)
        )
        .sort((a, b) => (b._ts || b.time).localeCompare(a._ts || a.time)),
    [alerts, severities, categories]
  );

  return (
    <Wrapper>
      <Header>
        <Title>实时告警</Title>
        <Count>{list.length} 条</Count>
      </Header>

      <FilterBar
        severities={severities}
        categories={categories}
        onToggleSeverity={toggle(setSeverities)}
        onToggleCategory={toggle(setCategories)}
      />

      <List>
        {list.length > 0 ? (
          list.map((a) => <AlertItem key={a.id} data={a} />)
        ) : (
          <Empty>当前筛选条件下暂无告警</Empty>
        )}
      </List>
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

const Header = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 12px;
`;

const Title = styled.h3`
  font-size: var(--font-h3);
  font-weight: 500;
  color: var(--text-primary);
`;

const Count = styled.span`
  font-family: var(--font-data);
  font-size: var(--font-small);
  color: var(--text-muted);
`;

const List = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-right: 2px;

  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-thumb {
    background: var(--border);
    border-radius: 3px;
  }
`;

const Empty = styled.div`
  margin-top: 24px;
  text-align: center;
  font-size: var(--font-small);
  color: var(--text-muted);
`;

export default AlertFeed;
