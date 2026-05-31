import React from "react";
import styled from "styled-components";

function Caption({ children }) {
  return <Wrapper>{children}</Wrapper>;
}
const Wrapper = styled.p`
  font-size: var(--font-tiny);
`;
export default Caption;
