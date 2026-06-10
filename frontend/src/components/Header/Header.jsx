/**
 * Header - 顶部导航栏：系统标题 + 当前用户 + 退出登录
 *
 * 所在页面：所有页面（固定在顶部，由 App.jsx 全局渲染，登录后才显示）
 * 依赖：useAuth（当前用户 / 登出）
 */
import React from "react";
import { useNavigate } from "react-router";
import styled from "styled-components";
import Icon from "../Icon/Icon";
import { useAuth, ROLE_LABEL } from "../../auth/AuthContext";

function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <Wrapper>
      <h2>PetroSight 石化厂智能监测系统</h2>

      {user && (
        <Right>
          <UserChip onClick={() => navigate("/user")} title="用户中心">
            <Avatar>
              <Icon id="user" size={14} />
            </Avatar>
            <Meta>
              <Name>{user.name || user.username}</Name>
              <Role data-role={user.role}>{ROLE_LABEL[user.role]}</Role>
            </Meta>
          </UserChip>
          <LogoutBtn onClick={logout} title="退出登录" aria-label="退出登录">
            <Icon id="logout" size={17} />
          </LogoutBtn>
        </Right>
      )}
    </Wrapper>
  );
}

const Wrapper = styled.div`
  /* 标题 h2 留在正常流中决定栏高（恢复原始高度）；右侧控件绝对定位不影响高度 */
  position: relative;
  padding: 1rem;
  background-color: var(--bg-card);
`;

const Right = styled.div`
  position: absolute;
  top: 50%;
  right: 1rem;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
`;

const UserChip = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 12px 3px 4px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--bg-base);
  cursor: pointer;

  &:hover {
    border-color: var(--text-muted);
  }
`;

const Avatar = styled.div`
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--color-primary);
  color: #fff;
`;

const Meta = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  line-height: 1.2;
`;

const Name = styled.span`
  font-size: var(--font-small);
  font-weight: 500;
  color: var(--text-primary);
`;

const Role = styled.span`
  font-size: var(--font-tiny);

  &[data-role="admin"] {
    color: var(--color-danger);
  }
  &[data-role="operator"] {
    color: var(--color-warning);
  }
  &[data-role="viewer"] {
    color: var(--text-muted);
  }
`;

const LogoutBtn = styled.button`
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-base);
  color: var(--text-muted);
  cursor: pointer;

  &:hover {
    color: var(--color-danger);
    border-color: var(--color-danger);
  }
`;

export default Header;
