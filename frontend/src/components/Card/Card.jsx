/**
 * Card - 通用信息卡片容器
 *
 * 所在页面：可用于任意页面
 * Props：
 *   title (string | ReactNode) - 卡片标题，显示在内容上方，可选
 *   children (ReactNode) - 卡片主体内容，必填
 * 依赖接口：无
 */
import React from "react";
import styled from "styled-components";

function Card({ title, children }) {
  return (
    <Wrapper>
      <TitleWrapper>{title}</TitleWrapper>
      {children}
    </Wrapper>
  );
}

const Wrapper = styled.div`
  padding: 1rem;
  background-color: var(--bg-card-alpha);
  backdrop-filter: blur(12px);
  border-radius: var(--radius-default);
`;
const TitleWrapper = styled.h3``;
export default Card;
