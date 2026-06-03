/**
 * AssessmentPage - 状态评估页面
 *
 * 所在页面：路由 /assessment
 * Props：无
 * 功能：主从布局——
 *   左侧：传感器标签列表（含「全部状态」入口），每个标签带状态点/图标/区域，可搜索
 *   右侧：
 *     - 选中「全部状态」→ 概览统计 + 严重程度/类别/区域筛选 + 全部记录列表（保留原有全部查询）
 *     - 选中某传感器 → 该传感器详情卡 + 其历史记录列表
 * 依赖接口：GET /api/records、GET /api/sensors（封装于 useSensorRecords）
 */
import React from "react";
import styled from "styled-components";
import { useSensorRecords } from "../../../hooks/useSensorRecords";
import Icon from "../../Icon/Icon";
import Spinner from "../../Spinner/Spinner";
import FilterBar from "../../AlertFeed/FilterBar";
import RecordList from "./RecordList";
import TrendChart from "./TrendChart";
import {
  normalizeSeverity,
  statusColor,
  deviceIconId,
  formatTime,
} from "../../../data/mock";

const ALL = "__ALL__";
const ALL_SEVERITIES = ["danger", "warning", "info"];
const ALL_CATEGORIES = ["gas", "thermal", "device", "behavior", "sensor"];
const SEV_RANK = { danger: 3, warning: 2, info: 1 };
const STATUS_TEXT = { danger: "异常", warning: "预警", normal: "正常" };

// 左栏分组模式
const GROUP_MODES = [
  { key: "flat", label: "默认" },
  { key: "zone", label: "按区域" },
  { key: "type", label: "按类型" },
];
const TYPE_LABEL = {
  gas: "气体传感器",
  thermal: "热成像",
  camera: "摄像头",
  drone: "无人机",
};

function AssessmentPage() {
  const { loading, error, sensors, records, reload } = useSensorRecords();
  const [selected, setSelected] = React.useState(ALL);
  const [query, setQuery] = React.useState("");
  const [groupMode, setGroupMode] = React.useState("flat");
  const [severities, setSeverities] = React.useState(ALL_SEVERITIES);
  const [categories, setCategories] = React.useState(ALL_CATEGORIES);
  const [zone, setZone] = React.useState("");

  // 按传感器分组记录 + 计算每个传感器的汇总（状态/数量/最新）
  const perSensor = React.useMemo(() => {
    const map = {};
    for (const r of records) {
      const sid = r.sensor_id;
      if (!sid) continue;
      (map[sid] ||= []).push(r);
    }
    const summary = {};
    for (const [sid, list] of Object.entries(map)) {
      list.sort((a, b) => (b.recorded_at || "").localeCompare(a.recorded_at || ""));
      let worst = "info";
      let anomaly = 0;
      for (const r of list) {
        const s = normalizeSeverity(r.severity);
        if (SEV_RANK[s] > SEV_RANK[worst]) worst = s;
        if (s === "danger" || s === "warning") anomaly++;
      }
      summary[sid] = {
        list,
        count: list.length,
        anomaly,
        status: worst === "info" ? "normal" : worst, // danger/warning/normal
        latest: list[0],
      };
    }
    return summary;
  }, [records]);

  const toggle = (setter) => (key) =>
    setter((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );

  if (loading) {
    return (
      <Centered>
        <Spinner label="正在加载传感器数据..." size={40} />
      </Centered>
    );
  }
  if (error) {
    return (
      <Centered>
        <ErrBox>
          <h3>数据加载失败</h3>
          <p>{error}</p>
          <RetryBtn onClick={reload}>重试</RetryBtn>
        </ErrBox>
      </Centered>
    );
  }

  const visibleSensors = sensors.filter((s) =>
    `${s.id} ${s.name || ""} ${s.zone || ""}`
      .toLowerCase()
      .includes(query.toLowerCase())
  );

  // 按当前分组模式把可见传感器分组
  const groups = (() => {
    if (groupMode === "flat") return [{ label: null, items: visibleSensors }];
    const keyOf =
      groupMode === "zone"
        ? (s) => s.zone || "未分区"
        : (s) => TYPE_LABEL[s.type] || s.type || "其他";
    const map = {};
    for (const s of visibleSensors) {
      const k = keyOf(s);
      (map[k] ||= []).push(s);
    }
    return Object.keys(map)
      .sort()
      .map((label) => ({ label, items: map[label] }));
  })();

  const renderChip = (s) => {
    const sum = perSensor[s.id];
    const color = sum ? statusColor[sum.status] : "var(--text-muted)";
    return (
      <Chip
        key={s.id}
        data-active={selected === s.id}
        onClick={() => setSelected(s.id)}
      >
        <Dot style={{ background: color }} />
        <ChipIcon style={{ color }}>
          <Icon id={deviceIconId[s.type] || "sensor"} size={16} />
        </ChipIcon>
        <ChipMain>
          <ChipName>{s.id}</ChipName>
          <ChipSub>{s.zone || "未分区"}</ChipSub>
        </ChipMain>
        {sum?.anomaly > 0 && <CountTag>{sum.anomaly}</CountTag>}
      </Chip>
    );
  };

  return (
    <Page>
      <Title>状态评估</Title>

      <Body>
        {/* 左侧：传感器标签 */}
        <SideList>
          <GroupToggle>
            {GROUP_MODES.map((m) => (
              <GroupBtn
                key={m.key}
                data-active={groupMode === m.key}
                onClick={() => setGroupMode(m.key)}
              >
                {m.label}
              </GroupBtn>
            ))}
          </GroupToggle>

          <Search
            placeholder="搜索传感器 / 区域..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          <ChipScroll>
            <Chip data-active={selected === ALL} onClick={() => setSelected(ALL)}>
              <ChipIcon style={{ color: "var(--text-secondary)" }}>
                <Icon id="grid" size={16} />
              </ChipIcon>
              <ChipMain>
                <ChipName>全部状态</ChipName>
                <ChipSub>{records.length} 条记录</ChipSub>
              </ChipMain>
            </Chip>

            <Divider />

            {visibleSensors.length === 0 && <NoMatch>无匹配传感器</NoMatch>}

            {groups.map((g) => (
              <React.Fragment key={g.label || "all"}>
                {g.label && (
                  <GroupHeader>
                    {g.label}
                    <GroupCount>{g.items.length}</GroupCount>
                  </GroupHeader>
                )}
                {g.items.map(renderChip)}
              </React.Fragment>
            ))}
          </ChipScroll>
        </SideList>

        {/* 右侧：详情 */}
        <Detail>
          {selected === ALL ? (
            <AllView
              records={records}
              sensors={sensors}
              perSensor={perSensor}
              severities={severities}
              categories={categories}
              zone={zone}
              onZone={setZone}
              onToggleSeverity={toggle(setSeverities)}
              onToggleCategory={toggle(setCategories)}
            />
          ) : (
            <SensorView
              sensor={sensors.find((s) => s.id === selected)}
              summary={perSensor[selected]}
            />
          )}
        </Detail>
      </Body>
    </Page>
  );
}

/* ---------- 全部状态视图 ---------- */
function AllView({
  records,
  sensors,
  perSensor,
  severities,
  categories,
  zone,
  onZone,
  onToggleSeverity,
  onToggleCategory,
}) {
  const errorCount = records.filter((r) => r.severity === "error").length;
  const warnCount = records.filter((r) => r.severity === "warning").length;
  const abnormalSensors = Object.values(perSensor).filter(
    (s) => s.status !== "normal"
  ).length;
  const zones = [...new Set(records.map((r) => r.zone).filter(Boolean))];

  const filtered = React.useMemo(
    () =>
      records
        .filter((r) => {
          const sev = normalizeSeverity(r.severity);
          return (
            severities.includes(sev) &&
            categories.includes(r.category) &&
            (!zone || r.zone === zone)
          );
        })
        .sort((a, b) => (b.recorded_at || "").localeCompare(a.recorded_at || "")),
    [records, severities, categories, zone]
  );

  return (
    <Panel>
      <PanelHead>
        <PanelTitle>全部状态查询</PanelTitle>
        <HeadRight>
          <ZoneSelect value={zone} onChange={(e) => onZone(e.target.value)}>
            <option value="">全部区域</option>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </ZoneSelect>
          <Muted>共 {filtered.length} 条</Muted>
        </HeadRight>
      </PanelHead>

      <StatRow>
        <Stat>
          <StatLabel>传感器总数</StatLabel>
          <StatVal>{sensors.length}</StatVal>
        </Stat>
        <Stat $c="var(--color-danger)">
          <StatLabel>严重 (error)</StatLabel>
          <StatVal style={{ color: "var(--color-danger)" }}>{errorCount}</StatVal>
        </Stat>
        <Stat $c="var(--color-warning)">
          <StatLabel>预警 (warning)</StatLabel>
          <StatVal style={{ color: "var(--color-warning)" }}>{warnCount}</StatVal>
        </Stat>
        <Stat>
          <StatLabel>异常传感器</StatLabel>
          <StatVal>{abnormalSensors}</StatVal>
        </Stat>
      </StatRow>

      <FilterBar
        severities={severities}
        categories={categories}
        onToggleSeverity={onToggleSeverity}
        onToggleCategory={onToggleCategory}
      />

      <RecordList records={filtered} showSensor />
    </Panel>
  );
}

/* ---------- 单传感器视图 ---------- */
function SensorView({ sensor, summary }) {
  if (!sensor) {
    return (
      <Panel>
        <Muted>传感器不存在</Muted>
      </Panel>
    );
  }
  const list = summary?.list || [];
  const status = summary?.status || "normal";
  const color = statusColor[status];
  const latest = summary?.latest;

  return (
    <Panel>
      <SensorHead>
        <HeadIcon style={{ color, borderColor: color }}>
          <Icon id={deviceIconId[sensor.type] || "sensor"} size={22} />
        </HeadIcon>
        <HeadInfo>
          <HeadTop>
            <SensorId>{sensor.id}</SensorId>
            <StatusPill style={{ color, borderColor: color }}>
              <Dot style={{ background: color }} />
              {STATUS_TEXT[status]}
            </StatusPill>
          </HeadTop>
          <HeadName>{sensor.name || sensor.id}</HeadName>
        </HeadInfo>
      </SensorHead>

      <MetaGrid>
        <Meta label="类型" value={sensor.type || "—"} />
        <Meta label="所属区域" value={sensor.zone || "未分区"} />
        <Meta
          label="坐标 (lng, lat)"
          value={`${fmt(sensor.lng)}, ${fmt(sensor.lat)}`}
        />
        <Meta label="运行状态" value={sensor.status || "online"} />
        <Meta label="记录总数" value={summary?.count ?? 0} />
        <Meta label="异常次数" value={summary?.anomaly ?? 0} />
        <Meta
          label="最新读数"
          value={latest ? `${latest.value}${latest.unit || ""}` : "—"}
        />
        <Meta label="最新上报" value={latest ? formatTime(latest.recorded_at) : "—"} />
      </MetaGrid>

      <SubTitle>数值趋势</SubTitle>
      <TrendChart records={list} />

      <SubTitle>历史记录（{list.length}）</SubTitle>
      <RecordList records={list} />
    </Panel>
  );
}

function Meta({ label, value }) {
  return (
    <MetaItem>
      <MetaLabel>{label}</MetaLabel>
      <MetaValue>{value}</MetaValue>
    </MetaItem>
  );
}

function fmt(n) {
  return typeof n === "number" ? n.toFixed(2) : "—";
}

/* ---------- 样式 ---------- */
const Page = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
`;

const Title = styled.h1`
  font-size: var(--font-h1);
  font-weight: 500;
`;

const Body = styled.div`
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: 16px;
  flex: 1;
  min-height: 0;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

const SideList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  background: var(--bg-card-alpha);
  backdrop-filter: blur(12px);
  border-radius: var(--radius-default);
  min-height: 0;
`;

const GroupToggle = styled.div`
  display: flex;
  gap: 3px;
  padding: 3px;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: 8px;
`;

const GroupBtn = styled.button`
  flex: 1;
  padding: 5px 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  font-size: var(--font-small);
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;

  &[data-active="true"] {
    background: var(--color-secondary);
    color: #fff;
  }
  &[data-active="false"]:hover {
    color: var(--text-secondary);
  }
`;

const GroupHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px 4px;
  margin-top: 4px;
  font-size: var(--font-tiny);
  font-weight: 500;
  color: var(--text-muted);
  letter-spacing: 0.03em;
`;

const GroupCount = styled.span`
  font-family: var(--font-data);
  color: var(--text-muted);
`;

const Search = styled.input`
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

const ChipScroll = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
  min-height: 0;
  padding-right: 2px;

  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-thumb {
    background: var(--border);
    border-radius: 3px;
  }
`;

const Chip = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s, border-color 0.15s;

  &:hover {
    background: rgba(255, 255, 255, 0.04);
  }
  &[data-active="true"] {
    background: rgba(55, 138, 221, 0.12);
    border-color: var(--color-secondary);
  }
`;

const Dot = styled.span`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
`;

const ChipIcon = styled.span`
  display: grid;
  place-items: center;
  flex-shrink: 0;
`;

const ChipMain = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
`;

const ChipName = styled.span`
  font-family: var(--font-data);
  font-size: var(--font-small);
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const ChipSub = styled.span`
  font-size: var(--font-tiny);
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const CountTag = styled.span`
  flex-shrink: 0;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: var(--color-danger);
  color: #fff;
  font-size: var(--font-tiny);
  font-weight: 500;
  display: grid;
  place-items: center;
`;

const Divider = styled.div`
  height: 1px;
  background: var(--border);
  margin: 4px 0;
`;

const NoMatch = styled.div`
  padding: 16px;
  text-align: center;
  color: var(--text-muted);
  font-size: var(--font-small);
`;

const Detail = styled.div`
  min-height: 0;
  display: flex;
`;

const Panel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 14px;
  flex: 1;
  min-height: 0;
  padding: 16px;
  background: var(--bg-card-alpha);
  backdrop-filter: blur(12px);
  border-radius: var(--radius-default);
  /* 整个右侧面板统一滚动，内部列表不再各自滚动，避免历史记录被遮挡 */
  overflow-y: auto;

  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-thumb {
    background: var(--border);
    border-radius: 3px;
  }
`;

const PanelHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
`;

const PanelTitle = styled.h2`
  font-size: var(--font-h2);
  font-weight: 500;
`;

const HeadRight = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const ZoneSelect = styled.select`
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 6px 12px;
  color: var(--text-secondary);
  font-size: var(--font-small);
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: var(--color-primary);
  }
`;

const Muted = styled.span`
  font-size: var(--font-small);
  color: var(--text-muted);
  font-family: var(--font-data);
  white-space: nowrap;
`;

const StatRow = styled.div`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
`;

const Stat = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 14px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  border-left: 3px solid ${(p) => p.$c || "var(--border)"};
`;

const StatLabel = styled.span`
  font-size: var(--font-tiny);
  color: var(--text-muted);
`;

const StatVal = styled.span`
  font-family: var(--font-data);
  font-size: var(--font-h2);
  font-weight: 500;
  color: var(--text-primary);
`;

const SensorHead = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
`;

const HeadIcon = styled.div`
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  border-radius: 12px;
  border: 1px solid;
  background: var(--bg-base);
  flex-shrink: 0;
`;

const HeadInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
`;

const HeadTop = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

const SensorId = styled.span`
  font-family: var(--font-data);
  font-size: var(--font-h2);
  font-weight: 500;
  color: var(--text-primary);
`;

const StatusPill = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: var(--font-tiny);
  font-weight: 500;
  padding: 2px 9px;
  border-radius: 999px;
  border: 1px solid;
`;

const HeadName = styled.span`
  font-size: var(--font-small);
  color: var(--text-secondary);
`;

const MetaGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px 12px;
  padding: 14px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;

  @media (max-width: 1200px) {
    grid-template-columns: repeat(2, 1fr);
  }
`;

const MetaItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
`;

const MetaLabel = styled.span`
  font-size: var(--font-tiny);
  color: var(--text-muted);
`;

const MetaValue = styled.span`
  font-family: var(--font-data);
  font-size: var(--font-default);
  color: var(--text-primary);
`;

const SubTitle = styled.h3`
  font-size: var(--font-h3);
  font-weight: 500;
  color: var(--text-secondary);
`;

const Centered = styled.div`
  display: grid;
  place-items: center;
  height: 100%;
  min-height: 400px;
`;

const ErrBox = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;

  h3 {
    font-size: var(--font-h2);
  }
  p {
    font-size: var(--font-small);
    color: var(--color-danger);
  }
`;

const RetryBtn = styled.button`
  margin-top: 8px;
  padding: 8px 24px;
  background: var(--color-primary);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-weight: 500;
  cursor: pointer;

  &:hover {
    opacity: 0.85;
  }
`;

export default AssessmentPage;
