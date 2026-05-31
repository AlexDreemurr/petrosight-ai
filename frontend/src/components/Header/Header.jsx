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
