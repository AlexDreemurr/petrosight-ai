/**
 * Header - 顶部导航栏，展示系统标题
 *
 * 所在页面：所有页面（固定在顶部，由 App.jsx 全局渲染）
 * Props：无
 * 依赖接口：无
 */
import React from "react";
import styled from "styled-components";

function Header() {
  return (
    <Wrapper>
      <h2>PetroSight 石化厂智能监测系统</h2>
    </Wrapper>
  );
}

const Wrapper = styled.div`
  position: relative;
  top: 0;
  left: 0;
  right: 0;
  padding: 1rem;
  background-color: var(--bg-card);
`;
export default Header;
