/**
 * ImageDetectPanel - 图像异常识别面板（YOLO-World 开放词表）
 *
 * 所在页面：AnalysisPage（/analysis）→「图像识别」Tab
 * Props：无
 * 布局：上方为检测目标 + 灵敏度 + 识别按钮；下方左右两栏——
 *   左：上传框（上传后框内直接显示图片 + 叠加检测框）
 *   右：识别结果列表（与检测框 hover 联动高亮）
 * 依赖接口：POST /api/detect-image（封装于 api.detectImage）
 */
import React, { useState, useRef, useEffect } from "react";
import styled from "styled-components";
import {
  detectImage,
  detectHelmetCompliance,
  detectTraffic,
  getDetectModels,
  parseDetectTargets,
  summarizeDetection,
} from "../../../../api";
import DetectionOverlay from "./DetectionOverlay";
import DetectionList from "./DetectionList";

// 组合管线（非单一模型）：前端静态加入下拉。
const COMPLIANCE_MODEL = {
  id: "helmet_compliance",
  name: "安全帽合规检测（人+帽）",
  open_vocab: false,
  kind: "pipeline",
  available: true,
  note: "",
};
const TRAFFIC_MODEL = {
  id: "traffic",
  name: "道路拥堵分析",
  open_vocab: false,
  kind: "pipeline",
  available: true,
  note: "",
};
const PIPELINES = [COMPLIANCE_MODEL, TRAFFIC_MODEL];

// 后端不可达时的兜底模型列表
const FALLBACK_MODELS = [
  { id: "open", name: "通用开放词表 (YOLO-World)", open_vocab: true, available: true, note: "" },
  ...PIPELINES,
];

// 拥堵等级 → 颜色
const LEVEL_COLOR = { smooth: "#22C55E", slow: "#FBBF24", congested: "#EF4444" };

// 合规检测的语义颜色
const C_OK = "#22C55E";    // 合规 绿
const C_BAD = "#EF4444";   // 违规 红
const C_HELMET = "#60A5FA"; // 安全帽 蓝

// 按类别配色的调色板（类 Tailwind 400，柔和耐看）。也是用户可手动选择的系统颜色。
// 默认按 label 首次出现顺序分配；用户可在「配色」处给每个标签改色。
const PALETTE = [
  "#60A5FA", // blue
  "#34D399", // emerald
  "#FBBF24", // amber
  "#F87171", // red
  "#A78BFA", // violet
  "#22D3EE", // cyan
  "#F472B6", // pink
  "#A3E635", // lime
  "#FB923C", // orange
  "#2DD4BF", // teal
  "#E879F9", // fuchsia
  "#FACC15", // yellow
];

// 由检测结果按「label 首次出现顺序」分配颜色
function buildColorMap(detections = []) {
  const map = {};
  let i = 0;
  for (const d of detections) {
    if (!(d.label in map)) {
      map[d.label] = PALETTE[i % PALETTE.length];
      i += 1;
    }
  }
  return map;
}

// 预设目标：选开放词表（YOLO-World）召回较高、易识别的通用物体（中文显示 / 英文提示词）。
const PRESET_TARGETS = [
  { cn: "人员", en: "person" },
  { cn: "车辆", en: "car" },
  { cn: "卡车", en: "truck" },
  { cn: "公交车", en: "bus" },
  { cn: "摩托车", en: "motorcycle" },
  { cn: "自行车", en: "bicycle" },
];

function ImageDetectPanel() {
  const [models, setModels] = useState(FALLBACK_MODELS);
  const [modelId, setModelId] = useState("open");
  const [mode, setMode] = useState("manual"); // manual | ai（顶层检测方式）
  const [selected, setSelected] = useState(["person", "car", "truck"]);
  const [manualText, setManualText] = useState("");
  const [nlText, setNlText] = useState("");
  const [planReady, setPlanReady] = useState(false); // AI 解析后展示可编辑方案
  const [aiTargets, setAiTargets] = useState([]); // AI 推荐目标（open 可编辑）
  const [aiAddText, setAiAddText] = useState(""); // 额外手动补充目标
  const [resultSummary, setResultSummary] = useState(""); // 结果一句话摘要
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState("");
  const [conf, setConf] = useState(0.1);
  const [imgsz, setImgsz] = useState(640);
  const [useSahi, setUseSahi] = useState(false); // 交通：切片推理（密集车流）
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [detecting, setDetecting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [activeId, setActiveId] = useState(null);
  const [colorOverrides, setColorOverrides] = useState({});
  const [pickerFor, setPickerFor] = useState(null);
  const inputRef = useRef();

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    getDetectModels()
      .then((list) => {
        if (Array.isArray(list) && list.length) {
          setModels([...list, ...PIPELINES]);
        }
      })
      .catch(() => {});
  }, []);

  const curModel = models.find((m) => m.id === modelId) || models[0];
  const isCompliance = modelId === "helmet_compliance";
  const isTraffic = modelId === "traffic";
  const isOpenVocab = !isCompliance && !isTraffic && curModel?.open_vocab !== false;

  // 切换模型时给合适的默认阈值与分辨率（交通：低阈值+高分辨率，提升密集/远处车辆召回）
  useEffect(() => {
    setConf(isCompliance ? 0.6 : isTraffic ? 0.15 : 0.1);
    setImgsz(isTraffic ? 960 : 640);
  }, [isCompliance, isTraffic]);

  // 默认配色 + 用户覆盖
  const baseColorMap = buildColorMap(result?.detections || []);
  const colorMap = {};
  for (const k of Object.keys(baseColorMap)) {
    colorMap[k] = colorOverrides[k] || baseColorMap[k];
  }

  const legend = [];
  const seen = new Set();
  for (const d of result?.detections || []) {
    if (!seen.has(d.label)) {
      seen.add(d.label);
      legend.push({ label: d.label, label_cn: d.label_cn });
    }
  }

  function toggleTarget(en) {
    setSelected((prev) =>
      prev.includes(en) ? prev.filter((t) => t !== en) : [...prev, en]
    );
  }

  function buildClasses() {
    const out = [...selected];
    manualText
      .split(/[,，\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((s) => out.push(s));
    return Array.from(new Set(out));
  }

  function pickFile(f) {
    if (!f) return;
    setError("");
    setResult(null);
    setResultSummary("");
    setActiveId(null);
    setFile(f);
  }

  // AI 模式最终送检的目标 = AI 推荐 + 用户补充
  function aiClasses() {
    const extra = aiAddText
      .split(/[,，\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    return Array.from(new Set([...aiTargets, ...extra]));
  }

  // ── 检测执行（返回 data，供生成摘要）──
  async function detectCompliance(hc) {
    const data = await detectHelmetCompliance(file, { imgsz, helmetConf: hc });
    const dets = [];
    (data.persons || []).forEach((p) => {
      dets.push({
        id: `p${p.id}`,
        label: "person",
        label_cn: p.compliant ? "合规人员" : "未戴安全帽人员",
        confidence: p.confidence,
        risk: !p.compliant,
        color: p.compliant ? C_OK : C_BAD,
        box: p.box,
      });
    });
    (data.helmets || []).forEach((hm) => {
      dets.push({
        id: `h${hm.id}`,
        label: "helmet",
        label_cn: "安全帽" + (hm.worn ? "" : "(未佩戴)"),
        confidence: hm.confidence,
        risk: false,
        color: C_HELMET,
        box: hm.box,
      });
    });
    setResult({ ...data, detections: dets, compliance: true });
    return data;
  }

  async function detectOpen(classes) {
    const data = await detectImage(file, { classes, conf, imgsz, model: "open" });
    setResult(data);
    return data;
  }

  async function detectTrafficFlow() {
    const data = await detectTraffic(file, { imgsz, conf, useSahi });
    setResult(data); // 含 traffic/level/level_cn/total/coverage/counts/detections
    return data;
  }

  // 结果一句话摘要：先放本地兜底，再用 DeepSeek 升级
  async function makeSummary(task, data) {
    let stats = {};
    let fallback = "";
    if (task === "helmet_compliance") {
      stats = {
        person_count: data.person_count,
        compliant_count: data.compliant_count,
        violation_count: data.violation_count,
      };
      fallback =
        data.violation_count > 0
          ? `共 ${data.person_count} 人，其中 ${data.violation_count} 人未佩戴安全帽。`
          : `共 ${data.person_count} 人，均已佩戴安全帽。`;
    } else if (task === "traffic") {
      stats = {
        total: data.total,
        coverage: data.coverage,
        level_cn: data.level_cn,
        counts: data.counts,
      };
      fallback = `检测到 ${data.total} 辆车，画面占比 ${Math.round(
        (data.coverage || 0) * 100
      )}%，判定：${data.level_cn}。`;
    } else {
      const counts = {};
      (data.detections || []).forEach((d) => {
        const k = d.label_cn || d.label;
        counts[k] = (counts[k] || 0) + 1;
      });
      stats = { counts };
      const parts = Object.entries(counts).map(([k, v]) => `${k}×${v}`);
      fallback = parts.length ? `检测到：${parts.join("、")}` : "未检测到目标。";
    }
    setResultSummary(fallback);
    try {
      const r = await summarizeDetection(task, stats);
      if (r && r.summary) setResultSummary(r.summary);
    } catch {
      /* 保留兜底 */
    }
  }

  // 「开始识别」：手动模式用预设/手动目标；AI 模式用（可编辑的）AI 推荐目标
  async function runDetect() {
    if (!file) return;
    if (curModel && curModel.available === false) {
      setError(curModel.note || "该模型不可用");
      return;
    }
    setError("");
    setResultSummary("");
    setDetecting(true);
    try {
      if (isCompliance) {
        const d = await detectCompliance(conf);
        await makeSummary("helmet_compliance", d);
      } else if (isTraffic) {
        const d = await detectTrafficFlow();
        await makeSummary("traffic", d);
      } else {
        const classes = mode === "ai" ? aiClasses() : buildClasses();
        if (classes.length === 0) {
          setError("请至少选择或输入一个检测目标");
          return;
        }
        const d = await detectOpen(classes);
        await makeSummary("open", d);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setDetecting(false);
    }
  }

  // AI 解析：判断最优模型 + 推荐目标，填入可编辑方案（不直接识别）
  async function runAiParse() {
    const t = nlText.trim();
    if (!t) {
      setParseError("请输入自然语言描述");
      return;
    }
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
        if (classes.length === 0) {
          setParseError("未能解析出目标，请换种说法再试");
          return;
        }
        setAiTargets(classes);
        setAiAddText("");
      }
      setModelId(task); // 触发 conf 默认值切换
      setResult(null);
      setResultSummary("");
      setPlanReady(true);
    } catch (e) {
      setParseError(e.message);
    } finally {
      setParsing(false);
    }
  }

  function removeAiTarget(t) {
    setAiTargets((prev) => prev.filter((x) => x !== t));
  }

  return (
    <Wrap>
      {/* 顶层：检测方式（始终可见） */}
      <SubToggle>
        <SubBtn type="button" data-on={mode === "manual"} onClick={() => setMode("manual")}>
          手动选择
        </SubBtn>
        <SubBtn type="button" data-on={mode === "ai"} onClick={() => setMode("ai")}>
          AI 智能识别
        </SubBtn>
      </SubToggle>

      {/* 模型选择 / AI 分析区（位于拖拽框上方） */}
      {mode === "manual" ? (
        <>
          <Block>
            <BlockLabel>识别模型</BlockLabel>
            <ModelSelect value={modelId} onChange={(e) => setModelId(e.target.value)}>
              {models.map((m) => (
                <option key={m.id} value={m.id} disabled={m.available === false}>
                  {m.name}
                  {m.available === false ? `（${m.note || "不可用"}）` : ""}
                </option>
              ))}
            </ModelSelect>
            {curModel?.available === false && (
              <ModelNote>{curModel.note || "该模型暂不可用"}</ModelNote>
            )}
          </Block>

          {isCompliance ? (
            <Block>
              <BlockLabel>安全帽合规检测</BlockLabel>
              <StepHint>
                自动检测人员与安全帽，按“安全帽是否在头顶”判定是否佩戴。
                <span style={{ color: C_OK }}> 绿=合规</span>、
                <span style={{ color: C_BAD }}> 红=未戴</span>、
                <span style={{ color: C_HELMET }}> 蓝=安全帽</span>。
              </StepHint>
            </Block>
          ) : isTraffic ? (
            <Block>
              <BlockLabel>道路拥堵分析</BlockLabel>
              <StepHint>
                自动检测画面车辆（汽车/卡车/公交/摩托/自行车），按数量与画面占比
                判定 <b>畅通 / 缓行 / 拥堵</b>。
              </StepHint>
              <SahiRow>
                <input
                  id="sahi-img"
                  type="checkbox"
                  checked={useSahi}
                  onChange={(e) => setUseSahi(e.target.checked)}
                />
                <label htmlFor="sahi-img">密集车流切片（SAHI，更准但更慢）</label>
              </SahiRow>
            </Block>
          ) : isOpenVocab ? (
            <Block>
              <BlockLabel>检测目标（点击勾选 / 手动补充）</BlockLabel>
              <Chips>
                {PRESET_TARGETS.map((t) => (
                  <Chip
                    key={t.en}
                    data-on={selected.includes(t.en)}
                    onClick={() => toggleTarget(t.en)}
                    type="button"
                  >
                    {t.cn}
                    <En>{t.en}</En>
                  </Chip>
                ))}
              </Chips>
              <ManualInput
                placeholder="手动补充英文目标，逗号分隔，如：forklift, ladder, dog"
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
              />
            </Block>
          ) : (
            <Block>
              <BlockLabel>该模型识别类别（固定）</BlockLabel>
              <Chips>
                {(curModel?.classes || []).map((c) => (
                  <FixedChip key={c}>{c}</FixedChip>
                ))}
              </Chips>
            </Block>
          )}

          <Controls>
            <ConfField>
              <BlockLabel>
                {isCompliance ? "安全帽置信度阈值 " : "置信度阈值 "}
                <b>{conf.toFixed(2)}</b>
                {isCompliance ? "（越高越严格）" : "（越低越灵敏）"}
              </BlockLabel>
              <Slider
                type="range"
                min="0.05"
                max="0.9"
                step="0.05"
                value={conf}
                onChange={(e) => setConf(Number(e.target.value))}
              />
            </ConfField>
            <ConfField style={{ flex: "0 0 auto", minWidth: 0 }}>
              <BlockLabel>检测精度</BlockLabel>
              <ImgszSelect value={imgsz} onChange={(e) => setImgsz(Number(e.target.value))}>
                <option value={640}>标准 (640)</option>
                <option value={960}>较高 (960)</option>
                <option value={1280}>高 (1280) · 小目标</option>
              </ImgszSelect>
            </ConfField>
            <DetectBtn onClick={runDetect} disabled={!file || detecting}>
              {detecting ? "识别中..." : "开始识别"}
            </DetectBtn>
          </Controls>
          {error && <ErrorMsg>{error}</ErrorMsg>}
        </>
      ) : (
        <Block>
          <BlockLabel>AI 智能识别</BlockLabel>
          <StepHint>
            用自然语言描述要找什么，AI 推荐最优模型与识别目标；可修改后点「开始识别」。
            例：“工人有没有戴安全帽” / “画面里有没有车和卡车”。
          </StepHint>
          <NlRow>
            <NlInput
              rows={2}
              placeholder="用自然语言描述要识别的内容..."
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
                <ModelSelect value={modelId} onChange={(e) => setModelId(e.target.value)}>
                  {models.map((m) => (
                    <option key={m.id} value={m.id} disabled={m.available === false}>
                      {m.name}
                      {m.available === false ? `（${m.note || "不可用"}）` : ""}
                    </option>
                  ))}
                </ModelSelect>
              </Field>

              {isCompliance ? (
                <StepHint>固定检测：人员 + 安全帽，自动判定每个人是否佩戴。</StepHint>
              ) : isTraffic ? (
                <>
                  <StepHint>固定检测：道路车辆，按数量与占比判定是否拥堵。</StepHint>
                  <SahiRow>
                    <input
                      id="sahi-img-ai"
                      type="checkbox"
                      checked={useSahi}
                      onChange={(e) => setUseSahi(e.target.checked)}
                    />
                    <label htmlFor="sahi-img-ai">密集车流切片（SAHI，更准但更慢）</label>
                  </SahiRow>
                </>
              ) : (
                <Field>
                  <BlockLabel>识别目标（可删除 / 补充）</BlockLabel>
                  {aiTargets.length > 0 && (
                    <AiChips>
                      {aiTargets.map((t) => (
                        <AiChip key={t}>
                          {t}
                          <Remove type="button" onClick={() => removeAiTarget(t)}>
                            ×
                          </Remove>
                        </AiChip>
                      ))}
                    </AiChips>
                  )}
                  <ManualInput
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
                <Slider
                  type="range"
                  min="0.05"
                  max="0.9"
                  step="0.05"
                  value={conf}
                  onChange={(e) => setConf(Number(e.target.value))}
                />
              </Field>

              <DetectBtn onClick={runDetect} disabled={!file || detecting}>
                {detecting ? "识别中..." : "开始识别"}
              </DetectBtn>
              {!file && <ModelNote>请先在下方上传图片</ModelNote>}
            </PlanBox>
          )}
          {error && <ErrorMsg>{error}</ErrorMsg>}
        </Block>
      )}

      {/* 拖拽框 + 结果 */}
      <Main>
        <LeftCol>
          {file ? (
            <ImageBox>
              <DetectionOverlay
                image={previewUrl}
                detections={result?.detections || []}
                colorMap={colorMap}
                activeId={activeId}
                onHover={setActiveId}
              />
              <Replace type="button" onClick={() => inputRef.current.click()}>
                更换图片
              </Replace>
            </ImageBox>
          ) : (
            <DropZone
              $active={dragOver}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                pickFile(e.dataTransfer.files[0]);
              }}
              onClick={() => inputRef.current.click()}
            >
              <DropIcon>📷</DropIcon>
              <DropText>拖拽或点击上传 图片</DropText>
              <DropHint>.jpg / .jpeg / .png</DropHint>
            </DropZone>
          )}
          {result && result.compliance && (
            <Stat>
              检测 <b>{result.person_count}</b> 人，
              <b style={{ color: C_OK }}> 合规 {result.compliant_count}</b>，
              <b style={{ color: C_BAD }}> 违规 {result.violation_count}</b>
            </Stat>
          )}
          {result && result.traffic && (
            <Stat>
              车辆 <b>{result.total}</b> 辆，拥堵程度：
              <b style={{ color: LEVEL_COLOR[result.level] || "var(--text-primary)" }}>
                {" "}{result.level_cn}{" "}
              </b>
              （画面占比 {Math.round((result.coverage || 0) * 100)}%）
            </Stat>
          )}
          {result && !result.compliance && !result.traffic && (
            <Stat>
              检测到 <b>{result.count}</b> 个目标，其中
              <b style={{ color: "var(--color-danger)" }}> {result.risk_count} </b>
              个风险
            </Stat>
          )}
          <input
            ref={inputRef}
            type="file"
            accept=".jpg,.jpeg,.png"
            style={{ display: "none" }}
            onChange={(e) => pickFile(e.target.files[0])}
          />
        </LeftCol>

        <RightCol>
          <BlockLabel>识别结果</BlockLabel>

          {resultSummary && (
            <ResultSummary>
              <SumTitle>AI 摘要</SumTitle>
              <SumText>{resultSummary}</SumText>
            </ResultSummary>
          )}

          {detecting && !result && <Placeholder>识别中…</Placeholder>}

          {result && !result.compliance && legend.length > 0 && (
            <Legend>
              <LegendHint>配色（点色块改色）</LegendHint>
              <LegendItems>
                {legend.map(({ label, label_cn }) => (
                  <LegendItem key={label}>
                    <Swatch
                      type="button"
                      style={{ background: colorMap[label] }}
                      onClick={() => setPickerFor((p) => (p === label ? null : label))}
                    />
                    <LegName>{label_cn}</LegName>
                    {pickerFor === label && (
                      <Palette>
                        {PALETTE.map((c) => (
                          <PalSwatch
                            key={c}
                            type="button"
                            data-sel={colorMap[label] === c}
                            style={{ background: c }}
                            onClick={() => {
                              setColorOverrides((o) => ({ ...o, [label]: c }));
                              setPickerFor(null);
                            }}
                          />
                        ))}
                      </Palette>
                    )}
                  </LegendItem>
                ))}
              </LegendItems>
            </Legend>
          )}

          {result ? (
            <DetectionList
              detections={result.detections}
              colorMap={colorMap}
              activeId={activeId}
              onHover={setActiveId}
            />
          ) : (
            !detecting && (
              <Placeholder>
                {file
                  ? mode === "ai"
                    ? "输入描述并点「AI 识别」"
                    : "点击「开始识别」查看检测结果"
                  : "请先上传图片"}
              </Placeholder>
            )
          )}
        </RightCol>
      </Main>
    </Wrap>
  );
}

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 14px;
`;

const StepHint = styled.p`
  font-size: var(--font-small);
  color: var(--text-muted);
  line-height: 1.6;
`;

const Block = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const BlockLabel = styled.span`
  font-size: var(--font-small);
  color: var(--text-secondary);

  b {
    font-family: var(--font-data);
    font-weight: 500;
    color: var(--text-primary);
  }
`;

const ModelSelect = styled.select`
  align-self: flex-start;
  min-width: 280px;
  padding: 8px 12px;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: var(--font-small);
  cursor: pointer;
  color-scheme: dark;

  &:focus {
    outline: none;
    border-color: var(--color-primary);
  }
`;

const ModelNote = styled.span`
  font-size: var(--font-tiny);
  color: var(--color-warning);
`;

const SumTitle = styled.span`
  font-size: var(--font-tiny);
  font-weight: 500;
  color: var(--color-primary);
`;

const PlanBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  background: rgba(29, 158, 117, 0.08);
  border: 1px solid var(--color-primary);
  border-radius: 8px;
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const AiChips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

const AiChip = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 6px 3px 10px;
  border-radius: 999px;
  border: 1px solid var(--color-secondary);
  background: rgba(55, 138, 221, 0.12);
  color: var(--text-primary);
  font-family: var(--font-data);
  font-size: var(--font-small);
`;

const Remove = styled.button`
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--text-muted);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  &:hover {
    color: var(--color-danger);
  }
`;

const ResultSummary = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  background: rgba(55, 138, 221, 0.1);
  border: 1px solid var(--color-secondary);
  border-radius: 8px;
`;

const SumText = styled.span`
  font-size: var(--font-default);
  line-height: 1.6;
  color: var(--text-primary);
`;

const SubToggle = styled.div`
  display: inline-flex;
  gap: 3px;
  padding: 3px;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: 8px;
  align-self: flex-start;
`;

const SubBtn = styled.button`
  padding: 5px 14px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  font-size: var(--font-small);
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;

  &[data-on="true"] {
    background: var(--color-secondary);
    color: #fff;
  }
  &[data-on="false"]:hover {
    color: var(--text-secondary);
  }
`;

const ManualInput = styled.input`
  width: 100%;
  padding: 8px 12px;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: var(--font-small);
  &::placeholder {
    color: var(--text-muted);
  }
  &:focus {
    outline: none;
    border-color: var(--color-primary);
  }
`;

const SahiRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--font-small);
  color: var(--text-secondary);

  input {
    accent-color: var(--color-primary);
    cursor: pointer;
  }
  label {
    cursor: pointer;
  }
`;

const Chips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

const FixedChip = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: var(--font-small);
`;

const Chip = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--bg-base);
  color: var(--text-muted);
  font-size: var(--font-small);
  cursor: pointer;
  transition: all 0.15s;

  &[data-on="true"] {
    color: #fff;
    background: var(--color-secondary);
    border-color: var(--color-secondary);
  }
`;

const En = styled.span`
  font-family: var(--font-data);
  font-size: var(--font-tiny);
  opacity: 0.7;
`;

const NlRow = styled.div`
  display: flex;
  gap: 10px;
  align-items: stretch;

  @media (max-width: 520px) {
    flex-direction: column;
  }
`;

const NlInput = styled.textarea`
  flex: 1;
  padding: 8px 12px;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-primary);
  font-family: var(--font-text);
  font-size: var(--font-small);
  resize: vertical;
  &::placeholder {
    color: var(--text-muted);
  }
  &:focus {
    outline: none;
    border-color: var(--color-primary);
  }
`;

const AiBtn = styled.button`
  flex: 0 0 auto;
  align-self: stretch;
  padding: 8px 18px;
  background: var(--color-secondary);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: var(--font-small);
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

const Controls = styled.div`
  display: flex;
  align-items: flex-end;
  gap: 16px;
  flex-wrap: wrap;
`;

const ConfField = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
  min-width: 240px;
`;

const Slider = styled.input`
  width: 100%;
  accent-color: var(--color-primary);
  cursor: pointer;
`;

const ImgszSelect = styled.select`
  padding: 7px 10px;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: var(--font-small);
  cursor: pointer;
  color-scheme: dark;

  &:focus {
    outline: none;
    border-color: var(--color-primary);
  }
`;

const DetectBtn = styled.button`
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

const ErrorMsg = styled.p`
  color: var(--color-danger);
  font-size: var(--font-small);
  background: rgba(226, 75, 74, 0.1);
  padding: 8px 12px;
  border-radius: 6px;
`;

const Main = styled.div`
  display: grid;
  grid-template-columns: 1.5fr 1fr;
  gap: 16px;
  align-items: start;

  @media (max-width: 860px) {
    grid-template-columns: 1fr;
  }
`;

const LeftCol = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
`;

const RightCol = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
`;

const ImageBox = styled.div`
  position: relative;
`;

const Replace = styled.button`
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 4;
  padding: 5px 12px;
  background: rgba(5, 8, 15, 0.7);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: var(--font-small);
  cursor: pointer;
  backdrop-filter: blur(4px);

  &:hover {
    border-color: var(--text-muted);
  }
`;

const DropZone = styled.div`
  border: 2px dashed ${(p) => (p.$active ? "var(--color-primary)" : "var(--border)")};
  border-radius: var(--radius-default);
  padding: 48px 24px;
  min-height: 220px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
  background: ${(p) => (p.$active ? "rgba(29,158,117,0.08)" : "var(--bg-base)")};
  transition: border-color 0.15s, background 0.15s;
  &:hover {
    border-color: var(--color-primary);
  }
`;

const DropIcon = styled.span`
  font-size: 1.8rem;
`;
const DropText = styled.p`
  color: var(--text-secondary);
  font-size: var(--font-h3);
`;
const DropHint = styled.p`
  color: var(--text-muted);
  font-size: var(--font-small);
`;

const Stat = styled.p`
  font-size: var(--font-small);
  color: var(--text-secondary);

  b {
    font-family: var(--font-data);
    font-weight: 500;
    color: var(--text-primary);
  }
`;

const Placeholder = styled.div`
  padding: 24px;
  text-align: center;
  color: var(--text-muted);
  font-size: var(--font-small);
  border: 1px dashed var(--border);
  border-radius: 8px;
`;

const Legend = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
`;

const LegendHint = styled.span`
  font-size: var(--font-tiny);
  color: var(--text-muted);
`;

const LegendItems = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
`;

const LegendItem = styled.div`
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
`;

const Swatch = styled.button`
  width: 16px;
  height: 16px;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  cursor: pointer;
  padding: 0;
`;

const LegName = styled.span`
  font-size: var(--font-small);
  color: var(--text-secondary);
`;

const Palette = styled.div`
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 10;
  display: grid;
  grid-template-columns: repeat(6, 18px);
  gap: 6px;
  padding: 8px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
`;

const PalSwatch = styled.button`
  width: 18px;
  height: 18px;
  border-radius: 4px;
  border: 2px solid transparent;
  cursor: pointer;
  padding: 0;

  &[data-sel="true"] {
    border-color: var(--text-primary);
  }
  &:hover {
    transform: scale(1.12);
  }
`;

export default ImageDetectPanel;
