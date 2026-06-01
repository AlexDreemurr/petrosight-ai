/**
 * OverallMap - 厂区平面地图展示组件
 *
 * 所在页面：OverViewPage（/）
 * Props：无
 * 功能：展示静态厂区平面图（/map_img/factory.png），
 *       后续扩展可叠加传感器位置打点
 * 依赖接口：无（当前为静态图片，传感器坐标数据预留通过 GET /api/sensors 获取）
 */
import React from "react";
import styled from "styled-components";

function OverallMap() {
  return (
    <Wrapper>
      <img src="/map_img/factory.png" />
    </Wrapper>
  );
}
const Wrapper = styled.div``;
export default OverallMap;
