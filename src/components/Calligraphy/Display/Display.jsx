import React from "react";
import styled from "styled-components";

function Display({ children }) {
  return <Wrapper>{children}</Wrapper>;
}
const Wrapper = styled.p`
  font-size: var(--font-giant);
  font-weight: 500;
`;
export default Display;
