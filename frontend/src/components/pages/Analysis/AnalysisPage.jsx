import React, { useState, useRef } from "react";
import styled from "styled-components";
import { uploadExcel, analyze } from "../../../api";

const SEVERITY_COLOR = {
  error: "var(--color-danger)",
  warning: "var(--color-warning)",
  info: "var(--color-primary)",
};

function AnalysisPage() {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [summary, setSummary] = useState(null);
  const [uploadError, setUploadError] = useState("");
  const [prompt, setPrompt] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [report, setReport] = useState("");
  const [analyzeError, setAnalyzeError] = useState("");
  const fileRef = useRef();

  async function handleFile(file) {
    if (!file) return;
    setUploadError("");
    setSummary(null);
    setReport("");
    setUploading(true);
    try {
      const data = await uploadExcel(file);
      setSummary(data);
    } catch (e) {
      setUploadError(e.message);
    } finally {
      setUploading(false);
    }
  }

  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    handleFile(file);
  }

  async function handleAnalyze() {
    if (!summary) return;
    setAnalyzeError("");
    setReport("");
    setAnalyzing(true);
    try {
      const data = await analyze(prompt || "请对当前传感器数据进行全面安全分析", summary);
      setReport(data.report);
    } catch (e) {
      setAnalyzeError(e.message);
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <Page>
      <Section>
        <SectionTitle>上传传感器数据</SectionTitle>
        <DropZone
          $active={dragOver}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current.click()}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            style={{ display: "none" }}
            onChange={(e) => handleFile(e.target.files[0])}
          />
          {uploading ? (
            <Status>解析中...</Status>
          ) : (
            <>
              <DropIcon>📂</DropIcon>
              <DropText>拖拽或点击上传 Excel 文件</DropText>
              <DropHint>.xlsx / .xls 格式，含 sensor_id、category、value 等列</DropHint>
            </>
          )}
        </DropZone>
        {uploadError && <ErrorMsg>{uploadError}</ErrorMsg>}
      </Section>

      {summary && (
        <Section>
          <SectionTitle>数据摘要</SectionTitle>
          <SummaryGrid>
            <StatCard>
              <StatLabel>总记录数</StatLabel>
              <StatValue>{summary.total}</StatValue>
            </StatCard>
            <StatCard $color="var(--color-danger)">
              <StatLabel>严重异常</StatLabel>
              <StatValue $color="var(--color-danger)">{summary.severity_breakdown?.error ?? 0}</StatValue>
            </StatCard>
            <StatCard $color="var(--color-warning)">
              <StatLabel>一般告警</StatLabel>
              <StatValue $color="var(--color-warning)">{summary.severity_breakdown?.warning ?? 0}</StatValue>
            </StatCard>
            <StatCard $color="var(--color-primary)">
              <StatLabel>正常记录</StatLabel>
              <StatValue $color="var(--color-primary)">{summary.severity_breakdown?.info ?? 0}</StatValue>
            </StatCard>
          </SummaryGrid>
          <TagRow>
            <TagLabel>类别：</TagLabel>
            {summary.categories.map((c) => <Tag key={c}>{c}</Tag>)}
            <TagLabel style={{ marginLeft: 16 }}>区域：</TagLabel>
            {summary.zones.map((z) => <Tag key={z}>{z}</Tag>)}
          </TagRow>
        </Section>
      )}

      {summary && (
        <Section>
          <SectionTitle>AI 分析</SectionTitle>
          <PromptArea
            placeholder="输入分析任务描述（可留空，使用默认提示）..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
          />
          <AnalyzeBtn onClick={handleAnalyze} disabled={analyzing}>
            {analyzing ? "分析中..." : "开始 AI 分析"}
          </AnalyzeBtn>
          {analyzeError && <ErrorMsg>{analyzeError}</ErrorMsg>}
        </Section>
      )}

      {report && (
        <Section>
          <SectionTitle>分析报告</SectionTitle>
          <ReportBox>
            {report.split("\n").map((line, i) => {
              if (line.startsWith("## ")) return <ReportH2 key={i}>{line.replace("## ", "")}</ReportH2>;
              if (line.startsWith("# ")) return <ReportH1 key={i}>{line.replace("# ", "")}</ReportH1>;
              if (line.trim() === "") return <br key={i} />;
              return <ReportLine key={i}>{line}</ReportLine>;
            })}
          </ReportBox>
        </Section>
      )}
    </Page>
  );
}

const Page = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
  max-width: 900px;
`;

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const SectionTitle = styled.h2``;

const DropZone = styled.div`
  border: 2px dashed ${(p) => p.$active ? "var(--color-primary)" : "var(--border)"};
  border-radius: var(--radius-default);
  padding: 48px 32px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  background: ${(p) => p.$active ? "rgba(29,158,117,0.08)" : "var(--bg-card-alpha)"};
  transition: border-color 0.15s, background 0.15s;
  &:hover { border-color: var(--color-primary); }
`;

const DropIcon = styled.span`font-size: 2rem;`;
const DropText = styled.p`color: var(--text-secondary); font-size: var(--font-h3);`;
const DropHint = styled.p`color: var(--text-muted); font-size: var(--font-small);`;
const Status = styled.p`color: var(--text-muted);`;

const ErrorMsg = styled.p`
  color: var(--color-danger);
  font-size: var(--font-small);
  background: rgba(226,75,74,0.1);
  padding: 8px 12px;
  border-radius: 6px;
`;

const SummaryGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
`;

const StatCard = styled.div`
  background: var(--bg-card-alpha);
  border: 1px solid ${(p) => p.$color || "var(--border)"};
  border-radius: 10px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const StatLabel = styled.p`font-size: var(--font-small); color: var(--text-muted);`;
const StatValue = styled.p`
  font-size: var(--font-h1);
  font-family: var(--font-data);
  font-weight: 600;
  color: ${(p) => p.$color || "var(--text-primary)"};
`;

const TagRow = styled.div`display: flex; align-items: center; gap: 8px; flex-wrap: wrap;`;
const TagLabel = styled.span`font-size: var(--font-small); color: var(--text-muted);`;
const Tag = styled.span`
  font-size: var(--font-small);
  padding: 2px 10px;
  border-radius: 999px;
  background: rgba(55,138,221,0.15);
  color: var(--color-secondary);
`;

const PromptArea = styled.textarea`
  width: 100%;
  background: var(--bg-card-alpha);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px;
  color: var(--text-secondary);
  font-family: var(--font-text);
  resize: vertical;
  &:focus { outline: none; border-color: var(--color-primary); }
`;

const AnalyzeBtn = styled.button`
  align-self: flex-start;
  padding: 10px 28px;
  background: var(--color-primary);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: var(--font-default);
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;
  &:disabled { opacity: 0.5; cursor: not-allowed; }
  &:hover:not(:disabled) { opacity: 0.85; }
`;

const ReportBox = styled.div`
  background: var(--bg-card-alpha);
  border: 1px solid var(--border);
  border-radius: var(--radius-default);
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const ReportH1 = styled.h1`margin-top: 12px;`;
const ReportH2 = styled.h2`margin-top: 12px; color: var(--color-secondary);`;
const ReportLine = styled.p`line-height: 1.7; font-size: var(--font-default);`;

export default AnalysisPage;
