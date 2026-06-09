/**
 * VideoDetectPanel - 视频识别（AI 自动识别风格）
 *
 * 所在页面：AnalysisPage（/analysis）→「视频识别」Tab
 * 流程：自然语言 → AI 解析（推荐模型+目标，可改）→ 上传视频 → 开始识别
 *       → 播放原视频并按时间轴叠加检测框 + AI 摘要。
 * 依赖接口：POST /api/parse-detect-targets、POST /api/detect-video、POST /api/summarize-detection
 */
import React, { useState, useRef, useEffect, useMemo } from "react";
import styled from "styled-components";
import {
  detectVideo,
  getDetectModels,
  parseDetectTargets,
  summarizeDetection,
} from "../../../../api";
import BoundingBox from "./BoundingBox";

const COMPLIANCE_MODEL = {
  id: "helmet_compliance",
  name: "安全帽合规检测（人+帽）",
  open_vocab: false,
  available: true,
  note: "",
};
const TRAFFIC_MODEL = {
  id: "traffic",
  name: "道路拥堵分析",
  open_vocab: false,
  available: true,
  note: "",
};
const PIPELINES = [COMPLIANCE_MODEL, TRAFFIC_MODEL];
const FALLBACK_MODELS = [
  { id: "open", name: "通用开放词表 (YOLO-World)", open_vocab: true, available: true, note: "" },
  ...PIPELINES,
];

const C_OK = "#22C55E";
const C_BAD = "#EF4444";
const C_HELMET = "#60A5FA";
const LEVEL_COLOR = { smooth: "#22C55E", slow: "#FBBF24", congested: "#EF4444" };
const PALETTE = [
  "#60A5FA", "#34D399", "#FBBF24", "#F87171", "#A78BFA", "#22D3EE",
  "#F472B6", "#A3E635", "#FB923C", "#2DD4BF", "#E879F9", "#FACC15",
];

function VideoDetectPanel() {
  const [models, setModels] = useState(FALLBACK_MODELS);
  const [modelId, setModelId] = useState("open");
  const [nlText, setNlText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState("");
  const [planReady, setPlanReady] = useState(false);
  const [aiTargets, setAiTargets] = useState([]);
  const [aiAddText, setAiAddText] = useState("");
  const [conf, setConf] = useState(0.25);
  const [imgsz, setImgsz] = useState(640);
  const [useSahi, setUseSahi] = useState(false);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [videoData, setVideoData] = useState(null);
  const [resultSummary, setResultSummary] = useState("");
  const [error, setError] = useState("");
  const [frameIdx, setFrameIdx] = useState(-1);
  const inputRef = useRef();
  const videoRef = useRef();

  const isCompliance = modelId === "helmet_compliance";
  const isTraffic = modelId === "traffic";

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    getDetectModels()
      .then((list) => {
        if (Array.isArray(list) && list.length) setModels([...list, ...PIPELINES]);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setConf(isCompliance ? 0.6 : isTraffic ? 0.15 : 0.25);
    setImgsz(isTraffic ? 960 : 640);
  }, [isCompliance, isTraffic]);

  // 播放时按 currentTime 找到对应采样帧
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !videoData) return;
    const frames = videoData.frames || [];
    let raf;
    const tick = () => {
      const t = v.currentTime;
      let lo = 0, hi = frames.length - 1, idx = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (frames[mid].t <= t) { idx = mid; lo = mid + 1; } else hi = mid - 1;
      }
      setFrameIdx((prev) => (prev === idx ? prev : idx));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [videoData]);

  const colorMap = useMemo(() => {
    if (!videoData || videoData.compliance) return {};
    const m = {};
    let i = 0;
    videoData.frames.forEach((f) =>
      f.dets.forEach((d) => {
        if (!(d.label in m)) { m[d.label] = PALETTE[i % PALETTE.length]; i += 1; }
      })
    );
    return m;
  }, [videoData]);

  const curDets =
    videoData && frameIdx >= 0 ? videoData.frames[frameIdx].dets : [];

  function colorOf(d) {
    if (videoData?.compliance) {
      if (d.role === "helmet") return C_HELMET;
      return d.risk ? C_BAD : C_OK;
    }
    return colorMap[d.label] || C_HELMET;
  }

  function aiClasses() {
    const extra = aiAddText.split(/[,，\n]/).map((s) => s.trim()).filter(Boolean);
    return Array.from(new Set([...aiTargets, ...extra]));
  }

  function pickFile(f) {
    if (!f) return;
    setError("");
    setVideoData(null);
    setResultSummary("");
    setFrameIdx(-1);
    setFile(f);
  }

  function removeAiTarget(t) {
    setAiTargets((prev) => prev.filter((x) => x !== t));
  }

  async function runAiParse() {
    const t = nlText.trim();
    if (!t) { setParseError("请输入自然语言描述"); return; }
    setParseError("");
    setError("");
    setParsing(true);
    try {
      const plan = await parseDetectTargets(t);
      const task = ["helmet_compliance", "traffic"].includes(plan.task)
        ? plan.task
        : "open";
      if (task === "open") {
        const classes = plan.classes || [];
        if (classes.length === 0) { setParseError("未能解析出目标，请换种说法再试"); return; }
        setAiTargets(classes);
        setAiAddText("");
      }
      setModelId(task);
      setVideoData(null);
      setResultSummary("");
      setPlanReady(true);
    } catch (e) {
      setParseError(e.message);
    } finally {
      setParsing(false);
    }
  }

  async function makeSummary(data) {
    const task = data.compliance
      ? "helmet_compliance"
      : data.traffic
      ? "traffic"
      : "open";
    const s = data.stats || {};
    let fallback;
    if (data.compliance) {
      const who = s.tracked ? "共出现" : "最多同时";
      fallback =
        s.violation_count > 0
          ? `视频中${who} ${s.person_count} 人，其中 ${s.violation_count} 人未佩戴安全帽。`
          : `视频中${who} ${s.person_count} 人，均已佩戴安全帽。`;
    } else if (data.traffic) {
      const uniq = s.unique_total != null ? s.unique_total : s.total;
      fallback = `视频中累计经过约 ${uniq} 辆车（峰值同时 ${s.total} 辆），画面占比 ${Math.round(
        (s.coverage || 0) * 100
      )}%，判定：${s.level_cn}。`;
    } else {
      const counts = s.counts || {};
      const parts = Object.entries(counts).map(([k, v]) => `${k}×${v}`);
      fallback = parts.length ? `画面中出现：${parts.join("、")}` : "未检测到目标。";
    }
    setResultSummary(fallback);
    try {
      const r = await summarizeDetection(task, data.stats || {});
      if (r && r.summary) setResultSummary(r.summary);
    } catch {
      /* 保留兜底 */
    }
  }

  async function runDetect() {
    if (!file) { setError("请先上传视频"); return; }
    setError("");
    setResultSummary("");
    setVideoData(null);
    setFrameIdx(-1);
    setDetecting(true);
    try {
      const needTargets = !isCompliance && !isTraffic;
      const classes = needTargets ? aiClasses() : [];
      if (needTargets && classes.length === 0) {
        setError("请至少保留一个识别目标");
        return;
      }
      const data = await detectVideo(file, {
        model: modelId,
        classes,
        conf,
        imgsz,
        helmetConf: conf,
        useSahi,
      });
      setVideoData(data);
      await makeSummary(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setDetecting(false);
    }
  }

  return (
    <Wrap>
      <Block>
        <BlockLabel>AI 视频识别</BlockLabel>
        <StepHint>
          用自然语言描述要找什么，AI 推荐最优模型与目标；可修改后上传视频并开始识别。
          识别后播放视频会按时间轴叠加检测框。
        </StepHint>
        <NlRow>
          <NlInput
            rows={2}
            placeholder="例如：工人有没有戴安全帽 / 画面里有没有车和卡车"
            value={nlText}
            onChange={(e) => setNlText(e.target.value)}
          />
          <AiBtn type="button" onClick={runAiParse} disabled={parsing}>
            {parsing ? "AI 解析中..." : "AI 解析"}
          </AiBtn>
        </NlRow>
        {parseError && <ErrorMsg>{parseError}</ErrorMsg>}

        {planReady && (
          <PlanBox>
            <SumTitle>AI 推荐方案（可修改）</SumTitle>
            <Field>
              <BlockLabel>识别模型</BlockLabel>
              <Select value={modelId} onChange={(e) => setModelId(e.target.value)}>
                {models.map((m) => (
                  <option key={m.id} value={m.id} disabled={m.available === false}>
                    {m.name}
                    {m.available === false ? `（${m.note || "不可用"}）` : ""}
                  </option>
                ))}
              </Select>
            </Field>

            {isCompliance ? (
              <StepHint>固定检测：人员 + 安全帽，自动判定每个人是否佩戴。</StepHint>
            ) : isTraffic ? (
              <>
                <StepHint>固定检测：道路车辆，按数量与占比判定是否拥堵。</StepHint>
                <SahiRow>
                  <input
                    id="sahi-video"
                    type="checkbox"
                    checked={useSahi}
                    onChange={(e) => setUseSahi(e.target.checked)}
                  />
                  <label htmlFor="sahi-video">密集车流切片（SAHI，更准但更慢，逐帧切片很耗时）</label>
                </SahiRow>
              </>
            ) : (
              <Field>
                <BlockLabel>识别目标（可删除 / 补充）</BlockLabel>
                {aiTargets.length > 0 && (
                  <Chips>
                    {aiTargets.map((t) => (
                      <Chip key={t}>
                        {t}
                        <Remove type="button" onClick={() => removeAiTarget(t)}>×</Remove>
                      </Chip>
                    ))}
                  </Chips>
                )}
                <TextInput
                  placeholder="补充英文目标，逗号分隔，如：forklift, ladder"
                  value={aiAddText}
                  onChange={(e) => setAiAddText(e.target.value)}
                />
              </Field>
            )}

            <Field>
              <BlockLabel>
                {isCompliance ? "安全帽置信度阈值 " : "置信度阈值 "}
                <b>{conf.toFixed(2)}</b>
              </BlockLabel>
              <Slider type="range" min="0.05" max="0.9" step="0.05"
                value={conf} onChange={(e) => setConf(Number(e.target.value))} />
            </Field>

            <DetectBtn onClick={runDetect} disabled={!file || detecting}>
              {detecting ? "识别中（视频较慢）..." : "开始识别"}
            </DetectBtn>
            {!file && <Note>请先在下方上传视频</Note>}
          </PlanBox>
        )}
        {error && <ErrorMsg>{error}</ErrorMsg>}
      </Block>

      <Main>
        <LeftCol>
          {file ? (
            <Frame>
              <Video ref={videoRef} src={previewUrl} controls />
              <Overlay>
                {curDets.map((d, i) => (
                  <BoundingBox key={i} det={d} color={colorOf(d)} />
                ))}
              </Overlay>
              <Replace type="button" onClick={() => inputRef.current.click()}>
                更换视频
              </Replace>
            </Frame>
          ) : (
            <DropZone
              $active={dragOver}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); pickFile(e.dataTransfer.files[0]); }}
              onClick={() => inputRef.current.click()}
            >
              <DropIcon>🎬</DropIcon>
              <DropText>拖拽或点击上传 视频</DropText>
              <DropHint>.mp4 / .mov / .avi / .mkv / .webm</DropHint>
            </DropZone>
          )}
          {videoData && (
            <Stat>
              已分析 {videoData.sampled} 帧（每 {videoData.interval}s 采样）
            </Stat>
          )}
          <input ref={inputRef} type="file" accept="video/*"
            style={{ display: "none" }} onChange={(e) => pickFile(e.target.files[0])} />
        </LeftCol>

        <RightCol>
          <BlockLabel>识别结果</BlockLabel>

          {videoData && (
            <StatsCard>
              <SumTitle>统计</SumTitle>
              {videoData.traffic && (
                <>
                  <KV>
                    <K>累计车辆</K>
                    <V>{videoData.stats.unique_total ?? videoData.stats.total} 辆</V>
                  </KV>
                  <KV>
                    <K>峰值同时</K>
                    <V>{videoData.stats.total} 辆</V>
                  </KV>
                  <KV>
                    <K>拥堵等级</K>
                    <V style={{ color: LEVEL_COLOR[videoData.stats.level] || "var(--text-primary)" }}>
                      {videoData.stats.level_cn}
                    </V>
                  </KV>
                  <KV>
                    <K>画面占比</K>
                    <V>{Math.round((videoData.stats.coverage || 0) * 100)}%</V>
                  </KV>
                  {Object.entries(videoData.stats.counts || {}).map(([k, v]) => (
                    <KV key={k}>
                      <K>{k}</K>
                      <V>{v} 辆</V>
                    </KV>
                  ))}
                </>
              )}
              {videoData.compliance && (
                <>
                  <KV>
                    <K>{videoData.stats.tracked ? "累计人数" : "峰值人数"}</K>
                    <V>{videoData.stats.person_count} 人</V>
                  </KV>
                  <KV>
                    <K>违规人数</K>
                    <V style={{ color: videoData.stats.violation_count > 0 ? C_BAD : C_OK }}>
                      {videoData.stats.violation_count} 人
                    </V>
                  </KV>
                </>
              )}
              {!videoData.traffic && !videoData.compliance &&
                Object.entries(videoData.stats.counts || {}).map(([k, v]) => (
                  <KV key={k}>
                    <K>{k}</K>
                    <V>{v}</V>
                  </KV>
                ))}
            </StatsCard>
          )}

          {resultSummary && (
            <ResultSummary>
              <SumTitle>AI 摘要</SumTitle>
              <SumText>{resultSummary}</SumText>
            </ResultSummary>
          )}
          {detecting && <Placeholder>识别中，视频逐帧分析较慢，请稍候…</Placeholder>}
          {!detecting && !videoData && (
            <Placeholder>{file ? "解析提示词并点「开始识别」" : "请先上传视频"}</Placeholder>
          )}
          {videoData && (
            <Hint>播放视频即可看到检测框随画面叠加。当前帧目标：{curDets.length}</Hint>
          )}
        </RightCol>
      </Main>
    </Wrap>
  );
}

const Wrap = styled.div`display: flex; flex-direction: column; gap: 14px;`;
const Block = styled.div`display: flex; flex-direction: column; gap: 8px;`;
const BlockLabel = styled.span`
  font-size: var(--font-small);
  color: var(--text-secondary);
  b { font-family: var(--font-data); font-weight: 500; color: var(--text-primary); }
`;
const StepHint = styled.p`font-size: var(--font-small); color: var(--text-muted); line-height: 1.6;`;
const NlRow = styled.div`display: flex; gap: 10px; align-items: stretch; @media (max-width:520px){flex-direction:column;}`;
const NlInput = styled.textarea`
  flex: 1; padding: 8px 12px; background: var(--bg-base); border: 1px solid var(--border);
  border-radius: 8px; color: var(--text-primary); font-family: var(--font-text);
  font-size: var(--font-small); resize: vertical;
  &::placeholder { color: var(--text-muted); }
  &:focus { outline: none; border-color: var(--color-primary); }
`;
const AiBtn = styled.button`
  flex: 0 0 auto; padding: 8px 18px; background: var(--color-secondary); color: #fff;
  border: none; border-radius: 8px; font-size: var(--font-small); font-weight: 500; cursor: pointer;
  &:disabled { opacity: 0.5; cursor: not-allowed; }
  &:hover:not(:disabled) { opacity: 0.85; }
`;
const PlanBox = styled.div`
  display: flex; flex-direction: column; gap: 10px; padding: 12px;
  background: rgba(29,158,117,0.08); border: 1px solid var(--color-primary); border-radius: 8px;
`;
const SumTitle = styled.span`font-size: var(--font-tiny); font-weight: 500; color: var(--color-primary);`;
const Field = styled.div`display: flex; flex-direction: column; gap: 6px;`;
const SahiRow = styled.div`
  display: flex; align-items: center; gap: 6px;
  font-size: var(--font-small); color: var(--text-secondary);
  input { accent-color: var(--color-primary); cursor: pointer; }
  label { cursor: pointer; }
`;
const Select = styled.select`
  align-self: flex-start; min-width: 260px; padding: 8px 12px; background: var(--bg-base);
  border: 1px solid var(--border); border-radius: 8px; color: var(--text-primary);
  font-size: var(--font-small); cursor: pointer; color-scheme: dark;
  &:focus { outline: none; border-color: var(--color-primary); }
`;
const Chips = styled.div`display: flex; flex-wrap: wrap; gap: 6px;`;
const Chip = styled.span`
  display: inline-flex; align-items: center; gap: 4px; padding: 3px 6px 3px 10px;
  border-radius: 999px; border: 1px solid var(--color-secondary); background: rgba(55,138,221,0.12);
  color: var(--text-primary); font-family: var(--font-data); font-size: var(--font-small);
`;
const Remove = styled.button`
  display: grid; place-items: center; width: 16px; height: 16px; border: none; border-radius: 50%;
  background: transparent; color: var(--text-muted); font-size: 14px; line-height: 1; cursor: pointer;
  &:hover { color: var(--color-danger); }
`;
const TextInput = styled.input`
  width: 100%; padding: 8px 12px; background: var(--bg-base); border: 1px solid var(--border);
  border-radius: 8px; color: var(--text-primary); font-size: var(--font-small);
  &::placeholder { color: var(--text-muted); }
  &:focus { outline: none; border-color: var(--color-primary); }
`;
const Slider = styled.input`width: 100%; accent-color: var(--color-primary); cursor: pointer;`;
const DetectBtn = styled.button`
  align-self: flex-start; padding: 10px 28px; background: var(--color-primary); color: #fff;
  border: none; border-radius: 8px; font-size: var(--font-default); font-weight: 500; cursor: pointer;
  &:disabled { opacity: 0.5; cursor: not-allowed; }
  &:hover:not(:disabled) { opacity: 0.85; }
`;
const Note = styled.span`font-size: var(--font-tiny); color: var(--color-warning);`;
const ErrorMsg = styled.p`
  color: var(--color-danger); font-size: var(--font-small); background: rgba(226,75,74,0.1);
  padding: 8px 12px; border-radius: 6px;
`;
const Main = styled.div`
  display: grid; grid-template-columns: 1.5fr 1fr; gap: 16px; align-items: start;
  @media (max-width: 860px) { grid-template-columns: 1fr; }
`;
const LeftCol = styled.div`display: flex; flex-direction: column; gap: 8px; min-width: 0;`;
const RightCol = styled.div`display: flex; flex-direction: column; gap: 8px; min-width: 0;`;
const Frame = styled.div`
  position: relative; width: 100%; line-height: 0; border-radius: var(--radius-default);
  overflow: hidden; background: var(--bg-base); border: 1px solid var(--border);
`;
const Video = styled.video`display: block; width: 100%; height: auto;`;
const Overlay = styled.div`position: absolute; inset: 0; pointer-events: none;`;
const Replace = styled.button`
  position: absolute; top: 10px; right: 10px; z-index: 4; padding: 5px 12px;
  background: rgba(5,8,15,0.7); border: 1px solid var(--border); border-radius: 8px;
  color: var(--text-primary); font-size: var(--font-small); cursor: pointer; backdrop-filter: blur(4px);
  &:hover { border-color: var(--text-muted); }
`;
const DropZone = styled.div`
  border: 2px dashed ${(p) => (p.$active ? "var(--color-primary)" : "var(--border)")};
  border-radius: var(--radius-default); padding: 48px 24px; min-height: 220px;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
  cursor: pointer; background: ${(p) => (p.$active ? "rgba(29,158,117,0.08)" : "var(--bg-base)")};
  &:hover { border-color: var(--color-primary); }
`;
const DropIcon = styled.span`font-size: 1.8rem;`;
const DropText = styled.p`color: var(--text-secondary); font-size: var(--font-h3);`;
const DropHint = styled.p`color: var(--text-muted); font-size: var(--font-small);`;
const Stat = styled.p`
  font-size: var(--font-small); color: var(--text-secondary);
  b { font-family: var(--font-data); font-weight: 500; color: var(--text-primary); }
`;
const StatsCard = styled.div`
  display: flex; flex-direction: column; gap: 6px; padding: 10px 12px;
  background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px;
`;
const KV = styled.div`display: flex; justify-content: space-between; gap: 12px; font-size: var(--font-small);`;
const K = styled.span`color: var(--text-muted);`;
const V = styled.span`font-family: var(--font-data); font-weight: 500; color: var(--text-primary);`;
const ResultSummary = styled.div`
  display: flex; flex-direction: column; gap: 4px; padding: 10px 12px;
  background: rgba(55,138,221,0.1); border: 1px solid var(--color-secondary); border-radius: 8px;
`;
const SumText = styled.span`font-size: var(--font-default); line-height: 1.6; color: var(--text-primary);`;
const Hint = styled.p`font-size: var(--font-small); color: var(--text-muted);`;
const Placeholder = styled.div`
  padding: 24px; text-align: center; color: var(--text-muted); font-size: var(--font-small);
  border: 1px dashed var(--border); border-radius: 8px;
`;

export default VideoDetectPanel;
