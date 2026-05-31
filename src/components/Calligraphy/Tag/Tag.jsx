import React from "react";
import styled from "styled-components";

function Tag({ children }) {
  return <Wrapper>{children}</Wrapper>;
}
const Wrapper = styled.p`
  font-size: var(--font-small);
  font-weight: 500;
`;
export default Tag;
