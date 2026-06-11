/**
 * LoginPage - 登录页（未登录时全屏显示，替代整个应用）
 *
 * Props：无（通过 useAuth().login 完成登录，成功后 App 自动切换到主界面）
 * 依赖接口：POST /api/auth/login（封装于 useAuth）
 */
import React from "react";
import styled from "styled-components";
import { useAuth } from "../../../auth/AuthContext";

// 开发调试账号（常驻显示，方便其他开发人员登录；上线前移除本块）
const DEV_ACCOUNT = {
  username: "系统管理员",
  password: "we-f0@dbdjwjcnw",
  roleLabel: "系统管理员",
};

function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const fillDev = () => {
    setUsername(DEV_ACCOUNT.username);
    setPassword(DEV_ACCOUNT.password);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(username.trim(), password);
      // 成功后无需跳转：App 监听到 user 变化会自动渲染主界面
    } catch (err) {
      setError(err.message || "登录失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Shell>
      <Card onSubmit={submit}>
        <Brand>
          <Logo>PS</Logo>
          <div>
            <Title>PetroSight</Title>
            <Sub>石化厂智能监测系统</Sub>
          </div>
        </Brand>

        <Field>
          <Label>用户名</Label>
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            placeholder="请输入用户名"
            autoFocus
          />
        </Field>
        <Field>
          <Label>密码</Label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            placeholder="请输入密码"
          />
        </Field>

        {error && <ErrorMsg>{error}</ErrorMsg>}

        <Submit type="submit" disabled={loading || !username || !password}>
          {loading ? "登录中…" : "登 录"}
        </Submit>

        <DevBox>
          <DevHead>
            <DevTag>开发账号</DevTag>
            <FillBtn type="button" onClick={fillDev}>
              一键填入
            </FillBtn>
          </DevHead>
          <DevRow>
            <DevK>用户名</DevK>
            <DevV>{DEV_ACCOUNT.username}</DevV>
          </DevRow>
          <DevRow>
            <DevK>密码</DevK>
            <DevV>{DEV_ACCOUNT.password}</DevV>
          </DevRow>
          <DevRow>
            <DevK>角色</DevK>
            <DevV>{DEV_ACCOUNT.roleLabel}</DevV>
          </DevRow>
          <DevNote>仅供开发调试使用，上线前请移除此提示。</DevNote>
        </DevBox>
      </Card>
    </Shell>
  );
}

const Shell = styled.div`
  height: 100vh;
  display: grid;
  place-items: center;
  background: radial-gradient(
    circle at 50% 30%,
    #0c1626 0%,
    var(--bg-base) 75%
  );
`;

const Card = styled.form`
  width: min(380px, calc(100vw - 32px));
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 32px 28px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-default);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
`;

const Brand = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
`;

const Logo = styled.div`
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 10px;
  background: var(--color-primary);
  color: #fff;
  font-weight: 600;
  font-size: 18px;
`;

const Title = styled.div`
  font-size: var(--font-h2);
  font-weight: 600;
  color: var(--text-primary);
`;

const Sub = styled.div`
  font-size: var(--font-small);
  color: var(--text-muted);
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const Label = styled.label`
  font-size: var(--font-small);
  color: var(--text-secondary);
`;

const Input = styled.input`
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg-base);
  color: var(--text-primary);
  font-size: var(--font-default);

  &:focus {
    outline: none;
    border-color: var(--color-primary);
  }
`;

const ErrorMsg = styled.div`
  font-size: var(--font-small);
  color: var(--color-danger);
`;

const Submit = styled.button`
  margin-top: 4px;
  padding: 11px;
  border: none;
  border-radius: 8px;
  background: var(--color-primary);
  color: #fff;
  font-size: var(--font-default);
  font-weight: 500;
  letter-spacing: 2px;
  cursor: pointer;

  &:hover:not(:disabled) {
    opacity: 0.9;
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const DevBox = styled.div`
  margin-top: 4px;
  padding: 12px 14px;
  border: 1px dashed var(--color-warning);
  border-radius: 8px;
  background: rgba(239, 159, 39, 0.08);
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const DevHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 2px;
`;

const DevTag = styled.span`
  font-size: var(--font-small);
  font-weight: 600;
  color: var(--color-warning);
`;

const FillBtn = styled.button`
  padding: 3px 10px;
  border: 1px solid var(--color-warning);
  border-radius: 999px;
  background: transparent;
  color: var(--color-warning);
  font-size: var(--font-tiny);
  font-weight: 500;
  cursor: pointer;

  &:hover {
    background: rgba(239, 159, 39, 0.15);
  }
`;

const DevRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: var(--font-small);
`;

const DevK = styled.span`
  width: 48px;
  color: var(--text-muted);
  flex-shrink: 0;
`;

const DevV = styled.span`
  font-family: var(--font-data);
  font-weight: 500;
  color: var(--text-primary);
  user-select: all;
`;

const DevNote = styled.div`
  margin-top: 2px;
  font-size: var(--font-tiny);
  color: var(--text-muted);
`;

export default LoginPage;
