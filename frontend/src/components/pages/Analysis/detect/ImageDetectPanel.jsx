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
import { detectImage, getDetectModels } from "../../../../api";
import DetectionOverlay from "./DetectionOverlay";
import DetectionList from "./DetectionList";

// 后端不可达时的兜底模型列表（至少保证开放词表可选）
const FALLBACK_MODELS = [
  { id: "open", name: "通用开放词表 (YOLO-World)", open_vocab: true, available: true, note: "" },
];

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

// 预设目标：中文显示 / 英文提示词（开放词表用英文最稳）。
// alts = 同义词，会一并加入检测以提升召回（火/烟这类弱概念尤其需要）。
const PRESET_TARGETS = [
  { cn: "人员", en: "person" },
  { cn: "明火", en: "fire", alts: ["flame", "flames", "burning"] },
  { cn: "烟雾", en: "smoke", alts: ["smog"] },
  { cn: "安全帽", en: "helmet", alts: ["hard hat"] },
  { cn: "未戴安全帽", en: "no helmet", alts: ["bare head"] },
  { cn: "车辆", en: "car" },
  { cn: "卡车", en: "truck" },
  { cn: "叉车", en: "forklift" },
];

function ImageDetectPanel() {
  const [models, setModels] = useState(FALLBACK_MODELS);
  const [modelId, setModelId] = useState("open");
  const [selected, setSelected] = useState(["person", "fire", "smoke"]);
  const [custom, setCustom] = useState("");
  const [conf, setConf] = useState(0.1);
  const [imgsz, setImgsz] = useState(640);
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [detecting, setDetecting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [activeId, setActiveId] = useState(null);
  const [colorOverrides, setColorOverrides] = useState({}); // label -> 用户选的颜色
  const [pickerFor, setPickerFor] = useState(null); // 当前打开调色盘的 label
  const inputRef = useRef();

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // 拉取可用模型列表（失败则保持兜底）
  useEffect(() => {
    getDetectModels()
      .then((list) => {
        if (Array.isArray(list) && list.length) setModels(list);
      })
      .catch(() => {});
  }, []);

  const curModel = models.find((m) => m.id === modelId) || models[0];
  const isOpenVocab = curModel?.open_vocab !== false;

  // 默认配色 + 用户覆盖 = 最终生效配色
  const baseColorMap = buildColorMap(result?.detections || []);
  const colorMap = {};
  for (const k of Object.keys(baseColorMap)) {
    colorMap[k] = colorOverrides[k] || baseColorMap[k];
  }

  // 图例：按出现顺序的唯一标签（label + 中文名）
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

  // 选中预设(含同义词) + 自由输入，去重
  function buildClasses() {
    const out = [];
    for (const en of selected) {
      const p = PRESET_TARGETS.find((t) => t.en === en);
      out.push(en, ...((p && p.alts) || []));
    }
    custom
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
    setActiveId(null);
    setFile(f);
  }

  async function runDetect() {
    if (!file) return;
    const classes = buildClasses();
    if (isOpenVocab && classes.length === 0) {
      setError("请至少选择或输入一个检测目标");
      return;
    }
    if (curModel && curModel.available === false) {
      setError(curModel.note || "该模型不可用");
      return;
    }
    setError("");
    setDetecting(true);
    try {
      const data = await detectImage(file, { classes, conf, imgsz, model: modelId });
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setDetecting(false);
    }
  }

  return (
    <Wrap>
      <StepHint>
        先选识别模型：通用开放词表可自定义目标；专用模型（安全帽 / 烟火）识别更准、类别固定。
        上传图片后点「开始识别」，火/烟等弱概念可调低灵敏度阈值。
      </StepHint>

      {/* 模型选择 */}
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

      {/* 检测目标：开放词表才显示；专用模型显示固定类别 */}
      {isOpenVocab ? (
        <Block>
          <BlockLabel>检测目标（开放词表，英文最准）</BlockLabel>
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
          <CustomInput
            placeholder="补充自定义英文目标，逗号分隔，如：valve, ladder, oil spill"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
          />
        </Block>
      ) : (
        <Block>
          <BlockLabel>该模型识别类别（固定）</BlockLabel>
          <Chips>
            {(curModel?.classes || []).map((c) => (
              <FixedChip key={c}>{c}</FixedChip>
            ))}
            {(!curModel?.classes || curModel.classes.length === 0) && (
              <FixedChip>由模型权重决定</FixedChip>
            )}
          </Chips>
        </Block>
      )}

      {/* 灵敏度 + 识别按钮 */}
      <Controls>
        <ConfField>
          <BlockLabel>
            置信度阈值 <b>{conf.toFixed(2)}</b>（越低越灵敏、误检越多）
          </BlockLabel>
          <Slider
            type="range"
            min="0.05"
            max="0.6"
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

      {/* 左：图片框 / 右：结果 */}
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
          {result && (
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

          {result && legend.length > 0 && (
            <Legend>
              <LegendHint>配色（点色块改色）</LegendHint>
              <LegendItems>
                {legend.map(({ label, label_cn }) => (
                  <LegendItem key={label}>
                    <Swatch
                      type="button"
                      style={{ background: colorMap[label] }}
                      onClick={() =>
                        setPickerFor((p) => (p === label ? null : label))
                      }
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
            <Placeholder>
              {file ? "点击「开始识别」查看检测结果" : "请先上传图片"}
            </Placeholder>
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

const CustomInput = styled.input`
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
