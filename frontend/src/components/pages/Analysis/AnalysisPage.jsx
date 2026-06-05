/**
 * AnalysisPage - 数据分析页面
 *
 * 所在页面：路由 /analysis
 * 布局：
 *   第一行：传感器注册 | 上传数据快照（并排）
 *   第二行：AI 安全分析（常驻，任何时候都可调用，基于数据库现有数据）
 * 依赖接口：
 *   - POST /api/register-sensors（注册传感器）
 *   - POST /api/upload-excel（上传数据快照，返回解析摘要）
 *   - POST /api/analyze（调用 DeepSeek AI，返回安全分析报告）
 */
import React, { useState, useRef } from "react";
import styled from "styled-components";
import { registerSensors, uploadExcel, analyze } from "../../../api";
import Markdown from "../../Markdown/Markdown";
import Icon from "../../Icon/Icon";
import ImageDetectPanel from "./detect/ImageDetectPanel";

const TABS = [
  { key: "ingest", label: "数据接入", icon: "upload" },
  { key: "ai", label: "AI 安全分析", icon: "analysis" },
  { key: "image", label: "图像识别", icon: "scan" },
];

function AnalysisPage() {
  const [tab, setTab] = useState("ingest");

  // 传感器注册
  const [regDrag, setRegDrag] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [regResult, setRegResult] = useState(null);
  const [regError, setRegError] = useState("");
  const [regFile, setRegFile] = useState("");
  const regRef = useRef();

  // 数据快照上传
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [summary, setSummary] = useState(null);
  const [uploadError, setUploadError] = useState("");
  const [dataFile, setDataFile] = useState("");
  const fileRef = useRef();

  // AI 分析
  const [prompt, setPrompt] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [report, setReport] = useState("");
  const [analyzeError, setAnalyzeError] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  async function handleRegister(file) {
    if (!file) return;
    setRegError("");
    setRegFile(file.name);
    setRegistering(true);
    try {
      const data = await registerSensors(file);
      setRegResult(data);
    } catch (e) {
      setRegError(e.message);
    } finally {
      setRegistering(false);
    }
  }

  async function handleFile(file) {
    if (!file) return;
    setUploadError("");
    setSummary(null);
    setDataFile(file.name);
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

  async function handleAnalyze() {
    setAnalyzeError("");
    setReport("");
    setAnalyzing(true);
    try {
      // 不依赖本次是否上传快照：有摘要就用摘要，否则传空对象，后端会分析库中现有数据；
      // 若指定了时间段，则只分析该时间段内的数据。
      const data = await analyze(
        prompt || "请对当前传感器数据进行全面安全分析",
        summary || {},
        { start: startTime || undefined, end: endTime || undefined }
      );
      setReport(data.report);
    } catch (e) {
      setAnalyzeError(e.message);
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <Page>
      <PageTitle>数据分析</PageTitle>

      <TabBar>
        {TABS.map((t) => (
          <TabBtn key={t.key} data-active={tab === t.key} onClick={() => setTab(t.key)}>
            <Icon id={t.icon} size={16} />
            <span>{t.label}</span>
          </TabBtn>
        ))}
      </TabBar>

      {/* ===== 数据接入：注册 + 上传快照 ===== */}
      {tab === "ingest" && (
        <>
          <Row>
        <Card>
          <CardTitle>① 传感器注册</CardTitle>
          <StepHint>上传传感器信息表（含 id、type、zone、lng、lat）。</StepHint>
          <DropZone
            $active={regDrag}
            onDragOver={(e) => { e.preventDefault(); setRegDrag(true); }}
            onDragLeave={() => setRegDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setRegDrag(false);
              handleRegister(e.dataTransfer.files[0]);
            }}
            onClick={() => regRef.current.click()}
          >
            <input
              ref={regRef}
              type="file"
              accept=".xlsx,.xls"
              style={{ display: "none" }}
              onChange={(e) => handleRegister(e.target.files[0])}
            />
            {registering ? (
              <Loading>
                <Spin />
                <FileName>{regFile}</FileName>
                <DropHint>注册中...</DropHint>
              </Loading>
            ) : regResult ? (
              <>
                <DropIcon>✅</DropIcon>
                <DropText>已上传注册表</DropText>
                <FileName>{regFile}</FileName>
                <DropHint>点击可重新上传</DropHint>
              </>
            ) : (
              <>
                <DropIcon>🛰️</DropIcon>
                <DropText>拖拽或点击上传 传感器注册表</DropText>
                <DropHint>.xlsx / .xls，必填列：id、type、zone</DropHint>
              </>
            )}
          </DropZone>
          {regResult && (
            <OkMsg>
              ✓ 已注册 {regResult.registered} 个传感器。
              <small>再次上传将覆盖同名传感器信息，并新增表中新增的传感器。</small>
            </OkMsg>
          )}
          {regError && <ErrorMsg>{regError}</ErrorMsg>}
        </Card>

        <Card>
          <CardTitle>② 上传数据快照</CardTitle>
          <StepHint>上传某一时刻的全场景读数（需先完成传感器注册）。</StepHint>
          <DropZone
            $active={dragOver}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              handleFile(e.dataTransfer.files[0]);
            }}
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
              <Loading>
                <Spin />
                <FileName>{dataFile}</FileName>
                <DropHint>解析中...</DropHint>
              </Loading>
            ) : summary ? (
              <>
                <DropIcon>✅</DropIcon>
                <DropText>已上传快照（{summary.total} 条）</DropText>
                <FileName>{dataFile}</FileName>
                <DropHint>点击可继续上传下一份快照</DropHint>
              </>
            ) : (
              <>
                <DropIcon>📂</DropIcon>
                <DropText>拖拽或点击上传 数据快照</DropText>
                <DropHint>.xlsx / .xls，含 sensor_id、category、value</DropHint>
              </>
            )}
          </DropZone>
          {uploadError && <ErrorMsg>{uploadError}</ErrorMsg>}
        </Card>
      </Row>

      {/* 数据摘要（上传快照后出现） */}
      {summary && (
        <Card>
          <CardTitle>本次快照摘要</CardTitle>
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
        </Card>
      )}
        </>
      )}

      {/* ===== AI 安全分析 ===== */}
      {tab === "ai" && (
      <Card>
        <CardTitle>AI 安全分析</CardTitle>
        <StepHint>
          {summary
            ? "将结合刚上传的快照范围进行分析。"
            : "基于数据库中现有的传感器数据进行分析，无需先上传快照。"}
        </StepHint>

        <RangeRow>
          <RangeField>
            <RangeLabel>起始时间</RangeLabel>
            <DateInput
              type="datetime-local"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </RangeField>
          <RangeSep>~</RangeSep>
          <RangeField>
            <RangeLabel>结束时间</RangeLabel>
            <DateInput
              type="datetime-local"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </RangeField>
          {(startTime || endTime) && (
            <ClearBtn
              type="button"
              onClick={() => {
                setStartTime("");
                setEndTime("");
              }}
            >
              清除
            </ClearBtn>
          )}
          <RangeNote>
            {startTime || endTime ? "仅分析所选时间段内的数据" : "留空 = 分析全部数据"}
          </RangeNote>
        </RangeRow>

        <PromptArea
          placeholder="输入分析任务描述（可留空，使用默认提示）..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
        />
        <AnalyzeBtn onClick={handleAnalyze} disabled={analyzing}>
          {analyzing ? "分析中（最长约 90 秒）..." : "开始 AI 分析"}
        </AnalyzeBtn>
        {analyzeError && <ErrorMsg>{analyzeError}</ErrorMsg>}

        {report && (
          <ReportBox>
            <Markdown>{report}</Markdown>
          </ReportBox>
        )}
      </Card>
      )}

      {/* ===== 图像识别 ===== */}
      {tab === "image" && (
        <Card>
          <CardTitle>图像异常识别</CardTitle>
          <ImageDetectPanel />
        </Card>
      )}
    </Page>
  );
}

const Page = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 1000px;
`;

const PageTitle = styled.h1`
  font-size: var(--font-h1);
  font-weight: 500;
`;

const TabBar = styled.div`
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: 999px;
  align-self: flex-start;
`;

const TabBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 7px 16px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--text-muted);
  font-size: var(--font-small);
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;

  &[data-active="true"] {
    background: var(--color-primary);
    color: #fff;
  }
  &[data-active="false"]:hover {
    color: var(--text-secondary);
  }
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;

  @media (max-width: 820px) {
    grid-template-columns: 1fr;
  }
`;

const Card = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: var(--bg-card-alpha);
  backdrop-filter: blur(12px);
  border-radius: var(--radius-default);
`;

const CardTitle = styled.h2`
  font-size: var(--font-h2);
  font-weight: 500;
`;

const DropZone = styled.div`
  border: 2px dashed ${(p) => (p.$active ? "var(--color-primary)" : "var(--border)")};
  border-radius: var(--radius-default);
  padding: 32px 24px;
  min-height: 160px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  background: ${(p) => (p.$active ? "rgba(29,158,117,0.08)" : "var(--bg-base)")};
  transition: border-color 0.15s, background 0.15s;
  &:hover {
    border-color: var(--color-primary);
  }
`;

const Loading = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
`;

const Spin = styled.span`
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 3px solid var(--border);
  border-top-color: var(--color-primary);
  animation: ap-spin 0.8s linear infinite;
  @keyframes ap-spin {
    to {
      transform: rotate(360deg);
    }
  }
`;

const DropIcon = styled.span`
  font-size: 2rem;
`;
const DropText = styled.p`
  color: var(--text-secondary);
  font-size: var(--font-h3);
`;
const DropHint = styled.p`
  color: var(--text-muted);
  font-size: var(--font-small);
`;
const FileName = styled.p`
  font-family: var(--font-data);
  font-size: var(--font-small);
  color: var(--color-secondary);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const ErrorMsg = styled.p`
  color: var(--color-danger);
  font-size: var(--font-small);
  background: rgba(226, 75, 74, 0.1);
  padding: 8px 12px;
  border-radius: 6px;
`;

const OkMsg = styled.p`
  color: var(--color-primary);
  font-size: var(--font-small);
  background: rgba(29, 158, 117, 0.1);
  padding: 8px 12px;
  border-radius: 6px;
  line-height: 1.6;

  small {
    display: block;
    color: var(--text-muted);
    font-size: var(--font-tiny);
  }
`;

const StepHint = styled.p`
  font-size: var(--font-small);
  color: var(--text-muted);
`;

const SummaryGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
`;

const StatCard = styled.div`
  background: var(--bg-card);
  border: 1px solid ${(p) => p.$color || "var(--border)"};
  border-radius: 10px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const StatLabel = styled.p`
  font-size: var(--font-small);
  color: var(--text-muted);
`;
const StatValue = styled.p`
  font-size: var(--font-h1);
  font-family: var(--font-data);
  font-weight: 500;
  color: ${(p) => p.$color || "var(--text-primary)"};
`;

const TagRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
`;
const TagLabel = styled.span`
  font-size: var(--font-small);
  color: var(--text-muted);
`;
const Tag = styled.span`
  font-size: var(--font-small);
  padding: 2px 10px;
  border-radius: 999px;
  background: rgba(55, 138, 221, 0.15);
  color: var(--color-secondary);
`;

const RangeRow = styled.div`
  display: flex;
  align-items: flex-end;
  flex-wrap: wrap;
  gap: 10px;
`;

const RangeField = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const RangeLabel = styled.span`
  font-size: var(--font-tiny);
  color: var(--text-muted);
`;

const DateInput = styled.input`
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 7px 10px;
  color: var(--text-primary);
  font-family: var(--font-data);
  font-size: var(--font-small);
  color-scheme: dark;

  &:focus {
    outline: none;
    border-color: var(--color-primary);
  }
`;

const RangeSep = styled.span`
  color: var(--text-muted);
  padding-bottom: 8px;
`;

const ClearBtn = styled.button`
  padding: 7px 14px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-secondary);
  font-size: var(--font-small);
  cursor: pointer;

  &:hover {
    border-color: var(--text-muted);
    color: var(--text-primary);
  }
`;

const RangeNote = styled.span`
  font-size: var(--font-tiny);
  color: var(--text-muted);
  padding-bottom: 8px;
`;

const PromptArea = styled.textarea`
  width: 100%;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px;
  color: var(--text-secondary);
  font-family: var(--font-text);
  resize: vertical;
  &:focus {
    outline: none;
    border-color: var(--color-primary);
  }
`;

const AnalyzeBtn = styled.button`
  align-self: flex-start;
  padding: 10px 28px;
  background: var(--color-primary);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: var(--font-default);
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.15s;
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  &:hover:not(:disabled) {
    opacity: 0.85;
  }
`;

const ReportBox = styled.div`
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-default);
  padding: 24px;
`;

export default AnalysisPage;
