/**
 * App - 应用根组件，定义全局布局和前端路由
 *
 * 所在页面：应用入口，所有页面的父容器
 * 布局结构：顶部 Header + 左侧 SideBar + 右侧 Main 内容区
 * 路由：
 *   /            → OverViewPage（厂区总览）
 *   /analysis    → AnalysisPage（数据分析）
 *   /history     → HistoryPage（历史日志）
 *   /assessment  → AssessmentPage（状态评估）
 */
import { BrowserRouter, Routes, Route } from "react-router";
import styled from "styled-components";
import GlobalStyles from "./GlobalStyles";
import Header from "./components/Header/Header";
import SideBar from "./components/SideBar/SideBar";
import OverViewPage from "./components/pages/OverView/OverViewPage";
import AnalysisPage from "./components/pages/Analysis/AnalysisPage";
import HistoryPage from "./components/pages/History/HistoryPage";
import AssessmentPage from "./components/pages/Assessment/AssessmentPage";

function App() {
  return (
    <BrowserRouter>
      <GlobalStyles />
      <AppShell>
        <Header />
        <Body>
          <SideBar />
          <Main>
            <Routes>
              <Route path="/" element={<OverViewPage />} />
              <Route path="/analysis" element={<AnalysisPage />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route path="/assessment" element={<AssessmentPage />} />
            </Routes>
          </Main>
        </Body>
      </AppShell>
    </BrowserRouter>
  );
}

const AppShell = styled.div`
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
`;

const Body = styled.div`
  display: flex;
  flex: 1;
  overflow: hidden;
`;

const Main = styled.main`
  flex: 1;
  overflow-y: auto;
  padding: 24px;
`;

export default App;
