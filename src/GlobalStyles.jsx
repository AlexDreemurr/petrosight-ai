import { createGlobalStyle } from "styled-components";

const GlobalStyles = createGlobalStyle`
  :root {
    /* 颜色配置 */
    --bg-base: #05080F; //#0A0E1A;
    --bg-surface: #080D18;

    --bg-card-rgb: 14, 22, 36; 
    --bg-card: rgb(var(--bg-card-rgb));
    --bg-card-alpha: rgba(var(--bg-card-rgb), 0.5);
    
    --text-primary: #E6F1FB;
    --text-secondary: #85B7EB;
    --text-muted: #4A6FA5;
    --border: #1D4A6B;

    --color-primary: #1D9E75;
    --color-secondary: #378ADD;
    --color-danger: #E24B4A;
    --color-warning: #EF9F27;

    /* 字体大小 */
    --font-giant: ${36 / 16}rem;
    --font-h1: ${24 / 16}rem;
    --font-h2: ${18 / 16}rem;
    --font-h3: ${15 / 16}rem;
    --font-default: ${14 / 16}rem;
    --font-small: ${12 / 16}rem;
    --font-tiny: ${11 / 16}rem;

    /* 字体选择 */
    --font-text: 'Space Grotesk', 'Noto Sans SC', sans-serif;     /* 正文 */
    --font-data: 'JetBrains Mono', 'Noto Sans SC', monospace;     /* 数据/坐标/代码 */
    
    /* 圆角 */
    --radius-default: 1rem;
 
  }
  *, *::before, *::after {
    box-sizing: border-box;
    padding: 0;
    margin: 0;

    font-family: var(--font-text);
    font-size: var(--font-default);
  }
  h1, h2, h3, h4, h5, h6 {
    color: var(--text-primary);
  }
  h3 {
    font-size: var(--font-h3);
    font-weight: 500;
  }
  h2 {
    font-size: var(--font-h2);
    font-weight: 500;
  }
  h1 {
    font-size: var(--font-h1);
    font-weight: 500;
  }
  p {
    color: var(--text-secondary);
  }
  body {
    background-color: var(--bg-base);
  }
`;

export default GlobalStyles;
