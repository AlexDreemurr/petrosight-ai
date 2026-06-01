/**
 * AssessmentPage - 传感器状态评估页面
 *
 * 所在页面：路由 /assessment
 * Props：无
 * 功能：
 *   - 以表格形式展示传感器数据记录，每行显示等级/传感器ID/类别/标题/数值/区域/时间
 *   - 支持按 severity（等级）、category（类别）、zone（区域）实时过滤
 *   - 每次过滤条件变更后重新请求后端数据（非前端筛选）
 * 依赖接口：
 *   - GET /api/records（查询传感器数据记录，支持 zone/severity/category 过滤参数）
 */
import React, { useState, useEffect } from "react";
import styled from "styled-components";
import { getRecords } from "../../../api";

const SEVERITY_CONFIG = {
  error: { label: "严重", color: "var(--color-danger)", bg: "rgba(226,75,74,0.12)" },
  warning: { label: "告警", color: "var(--color-warning)", bg: "rgba(239,159,39,0.12)" },
  info: { label: "正常", color: "var(--color-primary)", bg: "rgba(29,158,117,0.10)" },
};

const CATEGORY_LABEL = {
  gas: "气体",
  thermal: "热成像",
  behavior: "行为",
  device: "设备",
};

function fmt(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("zh-CN", { hour12: false });
}

function AssessmentPage() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({ severity: "", category: "", zone: "" });

  function load(f = filters) {
    setLoading(true);
    setError("");
    getRecords({ ...f, limit: 200 })
      .then(setRecords)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  function setFilter(key, val) {
    const next = { ...filters, [key]: val };
    setFilters(next);
    load(next);
  }

  const zones = [...new Set(records.map((r) => r.zone).filter(Boolean))];

  return (
    <Page>
      <PageTitle>传感器状态评估</PageTitle>

      <FilterBar>
        <FilterSelect value={filters.severity} onChange={(e) => setFilter("severity", e.target.value)}>
          <option value="">全部等级</option>
          <option value="error">严重</option>
          <option value="warning">告警</option>
          <option value="info">正常</option>
        </FilterSelect>
        <FilterSelect value={filters.category} onChange={(e) => setFilter("category", e.target.value)}>
          <option value="">全部类别</option>
          <option value="gas">气体</option>
          <option value="thermal">热成像</option>
          <option value="behavior">行为</option>
          <option value="device">设备</option>
        </FilterSelect>
        <FilterSelect value={filters.zone} onChange={(e) => setFilter("zone", e.target.value)}>
          <option value="">全部区域</option>
          {zones.map((z) => <option key={z} value={z}>{z}</option>)}
        </FilterSelect>
        <CountBadge>{loading ? "加载中..." : `共 ${records.length} 条`}</CountBadge>
      </FilterBar>

      {error && <ErrorMsg>{error}</ErrorMsg>}

      {!loading && records.length === 0 && !error && (
        <Empty>暂无匹配记录</Empty>
      )}

      {records.length > 0 && (
        <Table>
          <thead>
            <tr>
              <Th>等级</Th>
              <Th>传感器</Th>
              <Th>类别</Th>
              <Th>标题</Th>
              <Th align="right">数值</Th>
              <Th>区域</Th>
              <Th>时间</Th>
            </tr>
          </thead>
          <tbody>
            {records.map((r) => {
              const sev = SEVERITY_CONFIG[r.severity] || SEVERITY_CONFIG.info;
              return (
                <Tr key={r.id} $bg={sev.bg}>
                  <Td>
                    <SeverityBadge $color={sev.color}>{sev.label}</SeverityBadge>
                  </Td>
                  <Td $mono>{r.sensor_id}</Td>
                  <Td>{CATEGORY_LABEL[r.category] || r.category}</Td>
                  <Td>{r.title}</Td>
                  <Td align="right" $mono>
                    {r.value != null ? `${r.value} ${r.unit}` : "—"}
                  </Td>
                  <Td>{r.zone}</Td>
                  <Td $muted>{fmt(r.recorded_at)}</Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </Page>
  );
}

const Page = styled.div`display: flex; flex-direction: column; gap: 16px;`;
const PageTitle = styled.h1``;

const FilterBar = styled.div`
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
`;

const FilterSelect = styled.select`
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px 12px;
  color: var(--text-secondary);
  font-size: var(--font-small);
  cursor: pointer;
  &:focus { outline: none; border-color: var(--color-primary); }
`;

const CountBadge = styled.span`
  margin-left: auto;
  font-size: var(--font-small);
  color: var(--text-muted);
`;

const ErrorMsg = styled.p`color: var(--color-danger);`;
const Empty = styled.p`color: var(--text-muted); text-align: center; padding: 48px 0;`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-small);
`;

const Th = styled.th`
  text-align: ${(p) => p.align || "left"};
  padding: 8px 12px;
  color: var(--text-muted);
  font-weight: 500;
  border-bottom: 1px solid var(--border);
`;

const Tr = styled.tr`
  background: ${(p) => p.$bg || "transparent"};
  &:hover { background: rgba(255,255,255,0.03); }
`;

const Td = styled.td`
  padding: 10px 12px;
  color: ${(p) => p.$muted ? "var(--text-muted)" : "var(--text-secondary)"};
  font-family: ${(p) => p.$mono ? "var(--font-data)" : "inherit"};
  text-align: ${(p) => p.align || "left"};
  border-bottom: 1px solid rgba(29,74,107,0.3);
  white-space: nowrap;
`;

const SeverityBadge = styled.span`
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: var(--font-tiny);
  font-weight: 600;
  color: ${(p) => p.$color};
  border: 1px solid ${(p) => p.$color};
`;

export default AssessmentPage;
