/**
 * HistoryPage - 历史分析日志页面
 *
 * 所在页面：路由 /history
 * Props：无
 * 功能：
 *   - 进入页面时自动拉取历史 AI 分析记录列表
 *   - 每条记录展示用户提示、异常数、总条数、创建时间
 *   - 点击卡片可展开/折叠完整的 AI 分析报告（Markdown 渲染）
 * 依赖接口：
 *   - GET /api/history（获取历史分析记录列表，默认最近 50 条）
 */
import React, { useState, useEffect } from "react";
import styled from "styled-components";
import { getHistory } from "../../../api";

function fmt(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("zh-CN", { hour12: false });
}

function HistoryPage() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    getHistory()
      .then(setRecords)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <StatusMsg>加载中...</StatusMsg>;
  if (error) return <ErrorMsg>{error}</ErrorMsg>;
  if (records.length === 0) return <StatusMsg>暂无历史分析记录</StatusMsg>;

  return (
    <Page>
      <PageTitle>历史分析记录</PageTitle>
      <List>
        {records.map((r) => (
          <RecordCard key={r.id}>
            <CardHeader onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
              <HeaderLeft>
                <PromptText>{r.user_prompt || "（无描述）"}</PromptText>
                <Meta>
                  <MetaItem $color="var(--color-danger)">异常 {r.anomaly_count}</MetaItem>
                  <MetaItem>共 {r.record_count} 条</MetaItem>
                  <MetaItem $muted>{fmt(r.created_at)}</MetaItem>
                </Meta>
              </HeaderLeft>
              <Chevron $open={expanded === r.id}>▾</Chevron>
            </CardHeader>
            {expanded === r.id && (
              <ReportBox>
                {(r.ai_report || "").split("\n").map((line, i) => {
                  if (line.startsWith("## ")) return <RH2 key={i}>{line.replace("## ", "")}</RH2>;
                  if (line.startsWith("# ")) return <RH1 key={i}>{line.replace("# ", "")}</RH1>;
                  if (line.trim() === "") return <br key={i} />;
                  return <RLine key={i}>{line}</RLine>;
                })}
              </ReportBox>
            )}
          </RecordCard>
        ))}
      </List>
    </Page>
  );
}

const Page = styled.div`display: flex; flex-direction: column; gap: 16px; max-width: 900px;`;
const PageTitle = styled.h1``;
const List = styled.div`display: flex; flex-direction: column; gap: 12px;`;

const StatusMsg = styled.p`color: var(--text-muted); padding: 24px 0;`;
const ErrorMsg = styled.p`color: var(--color-danger); padding: 24px 0;`;

const RecordCard = styled.div`
  background: var(--bg-card-alpha);
  border: 1px solid var(--border);
  border-radius: var(--radius-default);
  overflow: hidden;
`;

const CardHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  cursor: pointer;
  &:hover { background: rgba(255,255,255,0.02); }
`;

const HeaderLeft = styled.div`display: flex; flex-direction: column; gap: 6px;`;
const PromptText = styled.p`color: var(--text-secondary); font-size: var(--font-default); font-weight: 500;`;
const Meta = styled.div`display: flex; gap: 12px; align-items: center;`;
const MetaItem = styled.span`
  font-size: var(--font-small);
  color: ${(p) => p.$muted ? "var(--text-muted)" : p.$color || "var(--text-secondary)"};
`;
const Chevron = styled.span`
  font-size: 1.2rem;
  color: var(--text-muted);
  transform: ${(p) => p.$open ? "rotate(180deg)" : "none"};
  transition: transform 0.15s;
`;

const ReportBox = styled.div`
  padding: 20px 24px;
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const RH1 = styled.h1`margin-top: 10px;`;
const RH2 = styled.h2`margin-top: 10px; color: var(--color-secondary);`;
const RLine = styled.p`line-height: 1.7; font-size: var(--font-default);`;

export default HistoryPage;
