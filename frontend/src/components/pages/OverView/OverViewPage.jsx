/**
 * OverViewPage - 厂区总览页面
 *
 * 所在页面：路由 /
 * Props：无
 * 功能：三区域布局——
 *   上方左：OverallMap（约 65% 宽，含综合预览/分区查询切换）
 *   上方右：AlertFeed（约 35% 宽，实时告警流 + 筛选）
 *   下方：StatusBox（横跨全宽，关键参数卡片）
 *   数据统一通过 useOverviewData 从后端拉取（与数据分析页同源）；
 *   加载中显示 Spinner，失败显示错误提示，无数据时给出引导。
 * 依赖接口：GET /api/records、GET /api/sensors（封装于 useOverviewData）
 */
import React from "react";
import styled from "styled-components";
import OverallMap from "../../OverallMap/OverallMap";
import AlertFeed from "../../AlertFeed/AlertFeed";
import StatusBox from "../../StatusBox/StatusBox";
import Spinner from "../../Spinner/Spinner";
import { useOverviewData } from "../../../hooks/useOverviewData";

function OverViewPage() {
  const { loading, error, alerts, zones, statusParams, reload } =
    useOverviewData();

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
        <Hint>
          <HintTitle>数据加载失败</HintTitle>
          <HintText>{error}</HintText>
          <HintText style={{ color: "var(--text-muted)" }}>
            请确认后端服务已启动（VITE_API_BASE）。
          </HintText>
          <RetryBtn onClick={reload}>重试</RetryBtn>
        </Hint>
      </Centered>
    );
  }

  const isEmpty = alerts.length === 0 && zones.length === 0;

  return (
    <Page>
      {isEmpty && (
        <Banner>
          当前数据库暂无传感器数据，请先在「数据分析」页上传 Excel 数据。下方为
          空状态展示。
        </Banner>
      )}
      <TopRow>
        <MapArea>
          <OverallMap alerts={alerts} zones={zones} />
        </MapArea>
        <FeedArea>
          <AlertFeed alerts={alerts} />
        </FeedArea>
      </TopRow>
      <StatusBox params={statusParams} />
    </Page>
  );
}

const Page = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
`;

// 地图 + 告警流占满当前可视高度（= Page 全高）；StatusBox 溢出到下方，需向下滚动查看。
const TopRow = styled.div`
  display: flex;
  gap: 16px;
  flex: 0 0 100%;
  min-height: 480px;

  @media (max-width: 1000px) {
    flex-direction: column;
    flex-basis: auto;
  }
`;

// 地图区按高度锁定正方形（宽 = 高），使卡片宽度恰好等于方形地图宽度，无左右留白。
const MapArea = styled.div`
  height: 100%;
  aspect-ratio: 1 / 1;
  flex: 0 0 auto;
  min-height: 480px;

  @media (max-width: 1000px) {
    aspect-ratio: auto;
    width: 100%;
    height: auto;
    min-height: 0;
  }
`;

// 告警流占据地图右侧的剩余宽度，并撑满可视高度。
const FeedArea = styled.div`
  flex: 1 1 auto;
  min-width: 0;
  min-height: 480px;
`;

const Centered = styled.div`
  display: grid;
  place-items: center;
  height: 100%;
  min-height: 400px;
`;

const Hint = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;
  padding: 24px;
`;

const HintTitle = styled.h3`
  font-size: var(--font-h2);
  color: var(--text-primary);
`;

const HintText = styled.p`
  font-size: var(--font-small);
  color: var(--text-secondary);
`;

const RetryBtn = styled.button`
  margin-top: 8px;
  padding: 8px 24px;
  background: var(--color-primary);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: var(--font-default);
  font-weight: 500;
  cursor: pointer;

  &:hover {
    opacity: 0.85;
  }
`;

const Banner = styled.div`
  padding: 10px 14px;
  border: 1px solid var(--color-warning);
  border-radius: 8px;
  background: rgba(239, 159, 39, 0.1);
  color: var(--text-secondary);
  font-size: var(--font-small);
`;

export default OverViewPage;
