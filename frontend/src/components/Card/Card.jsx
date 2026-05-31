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
