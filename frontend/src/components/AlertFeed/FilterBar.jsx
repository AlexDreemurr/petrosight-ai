/**
 * FilterBar - AlertFeed 的筛选器（多选 Tag）
 *
 * 所在页面：OverViewPage（/）→ AlertFeed
 * Props：
 *   severities (string[]) - 当前选中的 severity 集合，必填
 *   categories (string[]) - 当前选中的 category 集合，必填
 *   onToggleSeverity (function) - 切换某 severity，参数为 key，必填
 *   onToggleCategory (function) - 切换某 category，参数为 key，必填
 * 功能：两组多选 Tag；默认全部选中，点击取消则过滤掉该类
 * 依赖接口：无
 */
import React from "react";
import styled from "styled-components";
import {
  severityLabel,
  severityColor,
  categoryLabel,
} from "../../data/mock";

const SEVERITIES = ["danger", "warning", "info"];
const CATEGORIES = ["gas", "thermal", "device", "behavior", "sensor"];

function FilterBar({
  severities,
  categories,
  onToggleSeverity,
  onToggleCategory,
}) {
  return (
    <Wrapper>
      <Group>
        <GroupLabel>严重程度</GroupLabel>
        <Tags>
          {SEVERITIES.map((s) => {
            const on = severities.includes(s);
            const color = severityColor[s];
            return (
              <Tag
                key={s}
                data-on={on}
                style={on ? { color, borderColor: color } : undefined}
                onClick={() => onToggleSeverity(s)}
              >
                {severityLabel[s]}
              </Tag>
            );
          })}
        </Tags>
      </Group>

      <Group>
        <GroupLabel>类别</GroupLabel>
        <Tags>
          {CATEGORIES.map((c) => {
            const on = categories.includes(c);
            return (
              <Tag key={c} data-on={on} onClick={() => onToggleCategory(c)}>
                {categoryLabel[c]}
              </Tag>
            );
          })}
        </Tags>
      </Group>
    </Wrapper>
  );
}

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-bottom: 12px;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--border);
`;

const Group = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const GroupLabel = styled.span`
  font-size: var(--font-tiny);
  color: var(--text-muted);
`;

const Tags = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

const Tag = styled.button`
  font-size: var(--font-small);
  font-weight: 500;
  padding: 3px 10px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--bg-base);
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s;

  &[data-on="true"] {
    color: var(--text-primary);
    border-color: var(--text-muted);
    background: var(--bg-card);
  }
  &[data-on="false"] {
    opacity: 0.5;
    text-decoration: line-through;
  }
`;

export default FilterBar;
