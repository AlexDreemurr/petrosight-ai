/**
 * DevicePopup - 地图内的详情弹窗（告警详情 / 设备详情通用）
 *
 * 所在页面：OverViewPage（/）→ OverallMap（OverviewMode 与 ZoneMode 共用）
 * Props：
 *   data (object) - 告警事件对象或设备对象，必填
 *   onClose (function) - 关闭回调，必填
 * 功能：固定在地图区域内（绝对定位居中底部），展示标题、徽章、详情、
 *       传感器/设备 ID、当前值+单位、时间；右上角关闭按钮
 * 依赖接口：无
 * 数据兼容：
 *   - 告警对象含 severity/category/title/detail/sensor_id/value/unit/time
 *   - 设备对象含 status/type/name/id/value/unit/time
 */
import React from "react";
import styled from "styled-components";
import Icon from "../Icon/Icon";
import {
  severityColor,
  severityLabel,
  categoryLabel,
  statusColor,
  deviceIconId,
} from "../../data/mock";

function DevicePopup({ data, onClose }) {
  // 区分告警对象与设备对象
  const isAlert = "severity" in data;

  const color = isAlert ? severityColor[data.severity] : statusColor[data.status];
  const title = isAlert ? data.title : data.name;
  const idText = data.sensor_id || data.id;
  const iconId = deviceIconId[data.category] || deviceIconId[data.type] || "sensor";

  const statusText = isAlert
    ? severityLabel[data.severity]
    : { danger: "告警", warning: "预警", normal: "正常" }[data.status];

  return (
    <Wrapper>
      <Head>
        <HeadLeft>
          <IconBadge style={{ color, borderColor: color }}>
            <Icon id={iconId} size={18} />
          </IconBadge>
          <div>
            <Title>{title}</Title>
            <Badges>
              <Badge style={{ background: `${"var(--bg-base)"}`, color, borderColor: color }}>
                {statusText}
              </Badge>
              {isAlert && (
                <Badge style={{ color: "var(--text-secondary)", borderColor: "var(--border)" }}>
                  {categoryLabel[data.category]}
                </Badge>
              )}
            </Badges>
          </div>
        </HeadLeft>
        <CloseBtn onClick={onClose} aria-label="关闭">
          <Icon id="close" size={18} />
        </CloseBtn>
      </Head>

      {data.detail && <Detail>{data.detail}</Detail>}

      <Grid>
        <Field>
          <FieldLabel>设备编号</FieldLabel>
          <FieldValue>{idText}</FieldValue>
        </Field>
        <Field>
          <FieldLabel>当前读数</FieldLabel>
          <FieldValue style={{ color }}>
            {data.value}
            <Unit>{data.unit}</Unit>
          </FieldValue>
        </Field>
        {data.zone && (
          <Field>
            <FieldLabel>所属区域</FieldLabel>
            <FieldValue>{data.zone}</FieldValue>
          </Field>
        )}
        {data.time && (
          <Field>
            <FieldLabel>{isAlert ? "触发时间" : "最近上报"}</FieldLabel>
            <FieldValue>{data.time}</FieldValue>
          </Field>
        )}
      </Grid>
    </Wrapper>
  );
}

const Wrapper = styled.div`
  position: absolute;
  left: 50%;
  bottom: 16px;
  transform: translateX(-50%);
  width: min(420px, calc(100% - 32px));
  padding: 14px 16px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-default);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.5);
  z-index: 10;
`;

const Head = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
`;

const HeadLeft = styled.div`
  display: flex;
  gap: 10px;
  align-items: flex-start;
`;

const IconBadge = styled.div`
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  border: 1px solid;
  background: var(--bg-base);
  flex-shrink: 0;
`;

const Title = styled.div`
  font-size: var(--font-h3);
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 4px;
`;

const Badges = styled.div`
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
`;

const Badge = styled.span`
  font-size: var(--font-tiny);
  font-weight: 500;
  padding: 1px 7px;
  border-radius: 999px;
  border: 1px solid;
`;

const CloseBtn = styled.button`
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  flex-shrink: 0;

  &:hover {
    background: rgba(255, 255, 255, 0.06);
    color: var(--text-primary);
  }
`;

const Detail = styled.p`
  margin-top: 12px;
  font-size: var(--font-small);
  line-height: 1.6;
  color: var(--text-secondary);
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 16px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const FieldLabel = styled.span`
  font-size: var(--font-tiny);
  color: var(--text-muted);
`;

const FieldValue = styled.span`
  font-family: var(--font-data);
  font-size: var(--font-default);
  font-weight: 500;
  color: var(--text-primary);
`;

const Unit = styled.span`
  font-size: var(--font-tiny);
  color: var(--text-muted);
  margin-left: 3px;
`;

export default DevicePopup;
