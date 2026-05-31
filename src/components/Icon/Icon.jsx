import React from "react";
import styled from "styled-components";
import { ChevronDown, Menu, X } from "react-feather";
import { Languages, User, Map, BarChart2, History, ShieldCheck } from "lucide-react";

const icons = {
  Languages,
  user: User,
  overview: Map,
  analysis: BarChart2,
  history: History,
  assessment: ShieldCheck,
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
