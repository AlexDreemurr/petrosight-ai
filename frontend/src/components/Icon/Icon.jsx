/**
 * Icon - 图标统一封装组件
 *
 * 所在页面：SideBar（导航图标）及其他需要图标的场景
 * Props：
 *   id (string) - 图标标识符，必填。
 *                 可选值：Languages / user / overview / analysis / history / assessment /
 *                 layers / grid / back / close / gas / thermal / device / behavior /
 *                 sensor / camera / drone / alert
 *   color (string) - 图标颜色，可选，默认继承
 *   size (number) - 图标尺寸（px），可选，默认 24
 *   strokeWidth (number) - 描边宽度，可选
 * 依赖接口：无
 * 注意：传入不存在的 id 会抛出 Error
 */
import React from "react";
import styled from "styled-components";
import { ChevronDown, Menu, X } from "react-feather";
import {
  Languages,
  User,
  Map,
  BarChart2,
  History,
  ShieldCheck,
  Layers,
  Grid3x3,
  ChevronLeft,
  Wind,
  Thermometer,
  Cpu,
  UserX,
  RadioTower,
  Camera,
  Plane,
  AlertTriangle,
  Upload,
  ScanLine,
  Video,
} from "lucide-react";

const icons = {
  Languages,
  user: User,
  overview: Map,
  analysis: BarChart2,
  history: History,
  assessment: ShieldCheck,
  layers: Layers,
  grid: Grid3x3,
  back: ChevronLeft,
  close: X,
  gas: Wind,
  thermal: Thermometer,
  device: Cpu,
  behavior: UserX,
  sensor: RadioTower,
  camera: Camera,
  drone: Plane,
  alert: AlertTriangle,
  upload: Upload,
  scan: ScanLine,
  video: Video,
};

const Icon = ({ id, color, size, strokeWidth, ...delegated }) => {
  const Component = icons[id];

  if (!Component) {
    throw new Error(`No icon found for ID: ${id}`);
  }

  return (
    <Wrapper strokeWidth={strokeWidth} {...delegated}>
      <Component color={color} size={size} />
    </Wrapper>
  );
};

const Wrapper = styled.div`
  & > svg {
    display: block;
    stroke-width: ${(p) =>
      p.strokeWidth !== undefined ? p.strokeWidth + "px" : undefined};
  }
`;

export default Icon;
