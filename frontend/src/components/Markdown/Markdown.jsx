/**
 * Markdown - 统一的 Markdown 渲染组件（用于展示 DeepSeek 返回的分析报告）
 *
 * 所在页面：HistoryPage、AnalysisPage 的报告区域
 * Props：
 *   children (string) - Markdown 文本，必填
 * 功能：基于 react-markdown + remark-gfm 渲染标题、列表、加粗、表格、代码、
 *       分割线等，并套用项目深色主题样式。
 * 依赖接口：无
 */
import React from "react";
import styled from "styled-components";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function Markdown({ children }) {
  return (
    <Wrapper>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children || ""}</ReactMarkdown>
    </Wrapper>
  );
}

const Wrapper = styled.div`
  color: var(--text-secondary);
  font-size: var(--font-default);
  line-height: 1.75;
  word-break: break-word;

  h1,
  h2,
  h3,
  h4 {
    color: var(--text-primary);
    line-height: 1.4;
    margin: 1.1em 0 0.5em;
  }
  h1 {
    font-size: var(--font-h1);
  }
  h2 {
    font-size: var(--font-h2);
    color: var(--color-secondary);
    padding-bottom: 0.3em;
    border-bottom: 1px solid var(--border);
  }
  h3 {
    font-size: var(--font-h3);
    color: var(--text-primary);
  }
  h4 {
    font-size: var(--font-default);
    color: var(--text-secondary);
  }
  /* 首个标题不要额外上边距 */
  > :first-child {
    margin-top: 0;
  }

  p {
    margin: 0.5em 0;
    color: var(--text-secondary);
  }

  strong {
    color: var(--text-primary);
    font-weight: 500;
  }
  em {
    color: var(--text-secondary);
  }

  ul,
  ol {
    margin: 0.5em 0;
    padding-left: 1.5em;
  }
  li {
    margin: 0.25em 0;
    color: var(--text-secondary);
  }
  li::marker {
    color: var(--color-primary);
  }

  a {
    color: var(--color-secondary);
    text-decoration: underline;
  }

  blockquote {
    margin: 0.6em 0;
    padding: 0.4em 0.9em;
    border-left: 3px solid var(--color-secondary);
    background: rgba(55, 138, 221, 0.08);
    color: var(--text-secondary);
    border-radius: 0 6px 6px 0;
  }

  code {
    font-family: var(--font-data);
    font-size: 0.9em;
    background: var(--bg-base);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 1px 5px;
  }
  pre {
    margin: 0.6em 0;
    padding: 12px 14px;
    background: var(--bg-base);
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow-x: auto;
  }
  pre code {
    border: none;
    padding: 0;
    background: transparent;
  }

  hr {
    border: none;
    border-top: 1px solid var(--border);
    margin: 1em 0;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin: 0.7em 0;
    font-size: var(--font-small);
  }
  th,
  td {
    border: 1px solid var(--border);
    padding: 7px 10px;
    text-align: left;
  }
  th {
    background: var(--bg-base);
    color: var(--text-primary);
    font-weight: 500;
  }
  td {
    color: var(--text-secondary);
  }
  tr:nth-child(even) td {
    background: rgba(255, 255, 255, 0.02);
  }
`;

export default Markdown;
