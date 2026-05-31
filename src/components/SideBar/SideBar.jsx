import React from "react";
import { NavLink } from "react-router";
import styled from "styled-components";
import Icon from "../Icon/Icon";

const NAV_ITEMS = [
  { to: "/", label: "厂区总览", iconId: "overview" },
  { to: "/analysis", label: "数据分析", iconId: "analysis" },
  { to: "/history", label: "历史日志", iconId: "history" },
  { to: "/assessment", label: "状态评估", iconId: "assessment" },
];

function SideBar() {
  return (
    <Nav>
      {NAV_ITEMS.map(({ to, label, iconId }) => (
        <StyledNavLink key={to} to={to} end={to === "/"}>
          <Icon id={iconId} size={18} />
          <span>{label}</span>
        </StyledNavLink>
      ))}
    </Nav>
  );
}

const Nav = styled.nav`
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px 8px;
  width: 160px;
  min-height: 100%;
  background-color: var(--bg-surface);
  border-right: 1px solid var(--border);
  flex-shrink: 0;
`;

const StyledNavLink = styled(NavLink)`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  text-decoration: none;
  color: var(--text-muted);
  transition: background 0.15s, color 0.15s;

  span {
    font-size: var(--font-default);
    font-weight: 500;
  }

  &:hover {
    background: rgba(255, 255, 255, 0.05);
    color: var(--text-secondary);
  }

  &.active {
    background: rgba(29, 158, 117, 0.15);
    color: var(--color-primary);
  }
`;

export default SideBar;
