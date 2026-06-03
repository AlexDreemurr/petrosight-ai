/**
 * Spinner - 通用加载占位组件
 *
 * 所在页面：任意需要等待异步数据的场景（如 OverViewPage）
 * Props：
 *   label (string) - 加载提示文字，可选，默认 "加载中..."
 *   size (number) - 圆环直径（px），可选，默认 32
 * 依赖接口：无
 */
import React from "react";
import styled from "styled-components";

function Spinner({ label = "加载中...", size = 32 }) {
  return (
    <Wrapper>
      <Ring style={{ width: size, height: size }} />
      {label && <Label>{label}</Label>}
    </Wrapper>
  );
}

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  width: 100%;
  height: 100%;
  min-height: 160px;
`;

const Ring = styled.span`
  border-radius: 50%;
  border: 3px solid var(--border);
  border-top-color: var(--color-primary);
  animation: spinner-rotate 0.8s linear infinite;

  @keyframes spinner-rotate {
    to {
      transform: rotate(360deg);
    }
  }
`;

const Label = styled.span`
  font-size: var(--font-small);
  color: var(--text-muted);
`;

export default Spinner;
