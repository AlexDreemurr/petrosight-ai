/**
 * UserPage - 用户中心（/user）
 *
 * 内容：
 *   1) 个人信息 + 修改密码 + 退出登录（所有登录用户）
 *   2) 用户管理：列表 / 新建 / 改角色 / 启用禁用 / 删除（仅管理员）
 * 依赖接口：/api/auth/change-password、/api/auth/users（增删改查）
 */
import React from "react";
import styled from "styled-components";
import { useAuth, ROLE_LABEL } from "../../../auth/AuthContext";
import {
  changePassword,
  listUsers,
  createUser,
  updateUser,
  deleteUser,
} from "../../../api";

const ROLES = ["viewer", "operator", "admin"];

function UserPage() {
  const { user, logout, isAdmin } = useAuth();

  return (
    <Page>
      <h2>用户中心</h2>
      <ProfileCard user={user} onLogout={logout} />
      {isAdmin && <UserAdmin currentId={user.id} />}
    </Page>
  );
}

// ── 个人信息 + 修改密码 ──────────────────────────────────────────────────
function ProfileCard({ user, onLogout }) {
  const [oldPw, setOldPw] = React.useState("");
  const [newPw, setNewPw] = React.useState("");
  const [msg, setMsg] = React.useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setMsg(null);
    try {
      await changePassword(oldPw, newPw);
      setMsg({ ok: true, text: "密码已修改" });
      setOldPw("");
      setNewPw("");
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    }
  };

  return (
    <Card>
      <CardTitle>个人信息</CardTitle>
      <Info>
        <Row>
          <K>用户名</K>
          <V>{user.username}</V>
        </Row>
        <Row>
          <K>姓名</K>
          <V>{user.name || "—"}</V>
        </Row>
        <Row>
          <K>角色</K>
          <V>
            <RoleBadge data-role={user.role}>{ROLE_LABEL[user.role]}</RoleBadge>
          </V>
        </Row>
      </Info>

      <Divider />
      <CardTitle>修改密码</CardTitle>
      <Form onSubmit={submit}>
        <Input
          type="password"
          placeholder="原密码"
          value={oldPw}
          onChange={(e) => setOldPw(e.target.value)}
        />
        <Input
          type="password"
          placeholder="新密码（≥6 位）"
          value={newPw}
          onChange={(e) => setNewPw(e.target.value)}
        />
        <Btn type="submit" disabled={!oldPw || newPw.length < 6}>
          保存
        </Btn>
      </Form>
      {msg && <Msg data-ok={msg.ok}>{msg.text}</Msg>}

      <Divider />
      <DangerBtn onClick={onLogout}>退出登录</DangerBtn>
    </Card>
  );
}

// ── 用户管理（管理员）────────────────────────────────────────────────────
function UserAdmin({ currentId }) {
  const [users, setUsers] = React.useState([]);
  const [error, setError] = React.useState("");
  const [form, setForm] = React.useState({
    username: "",
    password: "",
    name: "",
    role: "viewer",
  });

  const load = React.useCallback(async () => {
    try {
      setUsers(await listUsers());
    } catch (e) {
      setError(e.message);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const add = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await createUser(form);
      setForm({ username: "", password: "", name: "", role: "viewer" });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const patch = async (id, p) => {
    setError("");
    try {
      await updateUser(id, p);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async (id) => {
    if (!window.confirm("确定删除该用户？")) return;
    setError("");
    try {
      await deleteUser(id);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Card>
      <CardTitle>用户管理</CardTitle>
      <Hint>
        用户名是<strong>唯一登录标识</strong>，不可重复、创建后不建议更改；姓名仅作展示，可重复。
      </Hint>

      <AddForm onSubmit={add}>
        <Input
          placeholder="用户名（唯一）"
          value={form.username}
          onChange={(e) => setForm({ ...form, username: e.target.value })}
        />
        <Input
          placeholder="姓名"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <Input
          type="password"
          placeholder="密码（≥6 位）"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        <Select
          value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value })}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </Select>
        <Btn type="submit" disabled={!form.username || form.password.length < 6}>
          新建
        </Btn>
      </AddForm>

      {error && <Msg data-ok={false}>{error}</Msg>}

      <Table>
        <thead>
          <tr>
            <Th>用户名（唯一）</Th>
            <Th>姓名</Th>
            <Th>角色</Th>
            <Th>状态</Th>
            <Th>最近登录</Th>
            <Th>操作</Th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => {
            const self = u.id === currentId;
            return (
              <tr key={u.id}>
                <Td>{u.username}{self && <Self>（我）</Self>}</Td>
                <Td>{u.name || "—"}</Td>
                <Td>
                  <Select
                    value={u.role}
                    disabled={self}
                    onChange={(e) => patch(u.id, { role: e.target.value })}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </Select>
                </Td>
                <Td>
                  <StatusTag data-on={u.status === "active"}>
                    {u.status === "active" ? "启用" : "禁用"}
                  </StatusTag>
                </Td>
                <Td>{u.last_login_at ? u.last_login_at.slice(0, 19).replace("T", " ") : "—"}</Td>
                <Td>
                  {!self && (
                    <Actions>
                      <LinkBtn
                        onClick={() =>
                          patch(u.id, {
                            status: u.status === "active" ? "disabled" : "active",
                          })
                        }
                      >
                        {u.status === "active" ? "禁用" : "启用"}
                      </LinkBtn>
                      <LinkBtn data-danger onClick={() => remove(u.id)}>
                        删除
                      </LinkBtn>
                    </Actions>
                  )}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </Card>
  );
}

const Page = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 920px;
`;

const Card = styled.div`
  padding: 20px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-default);
`;

const CardTitle = styled.h3`
  font-size: var(--font-h3);
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 12px;
`;

const Hint = styled.p`
  margin: -4px 0 14px;
  font-size: var(--font-small);
  color: var(--text-muted);

  strong {
    color: var(--text-secondary);
    font-weight: 500;
  }
`;

const Info = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const Row = styled.div`
  display: flex;
  gap: 16px;
`;

const K = styled.span`
  width: 72px;
  color: var(--text-muted);
  font-size: var(--font-small);
`;

const V = styled.span`
  color: var(--text-primary);
  font-size: var(--font-default);
`;

const RoleBadge = styled.span`
  padding: 2px 10px;
  border-radius: 999px;
  font-size: var(--font-tiny);
  font-weight: 500;
  border: 1px solid;

  &[data-role="admin"] {
    color: var(--color-danger);
    border-color: var(--color-danger);
  }
  &[data-role="operator"] {
    color: var(--color-warning);
    border-color: var(--color-warning);
  }
  &[data-role="viewer"] {
    color: var(--text-secondary);
    border-color: var(--border);
  }
`;

const Divider = styled.div`
  height: 1px;
  background: var(--border);
  margin: 18px 0;
`;

const Form = styled.form`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`;

const AddForm = styled.form`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 14px;
`;

const Input = styled.input`
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg-base);
  color: var(--text-primary);
  font-size: var(--font-small);

  &:focus {
    outline: none;
    border-color: var(--color-primary);
  }
`;

const Select = styled.select`
  padding: 7px 10px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg-base);
  color: var(--text-primary);
  font-size: var(--font-small);
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const Btn = styled.button`
  padding: 8px 18px;
  border: none;
  border-radius: 8px;
  background: var(--color-primary);
  color: #fff;
  font-size: var(--font-small);
  font-weight: 500;
  cursor: pointer;

  &:hover:not(:disabled) {
    opacity: 0.9;
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const DangerBtn = styled.button`
  padding: 9px 20px;
  border: 1px solid var(--color-danger);
  border-radius: 8px;
  background: transparent;
  color: var(--color-danger);
  font-size: var(--font-small);
  font-weight: 500;
  cursor: pointer;

  &:hover {
    background: rgba(226, 75, 74, 0.1);
  }
`;

const Msg = styled.div`
  margin-top: 10px;
  font-size: var(--font-small);
  color: ${(p) => (p["data-ok"] ? "var(--color-primary)" : "var(--color-danger)")};
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-small);
`;

const Th = styled.th`
  text-align: left;
  padding: 8px;
  color: var(--text-muted);
  font-weight: 500;
  border-bottom: 1px solid var(--border);
`;

const Td = styled.td`
  padding: 8px;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border);
  vertical-align: middle;
`;

const Self = styled.span`
  color: var(--text-muted);
  font-size: var(--font-tiny);
`;

const StatusTag = styled.span`
  padding: 1px 8px;
  border-radius: 999px;
  font-size: var(--font-tiny);
  border: 1px solid;
  color: ${(p) => (p["data-on"] ? "var(--color-primary)" : "var(--text-muted)")};
  border-color: ${(p) => (p["data-on"] ? "var(--color-primary)" : "var(--border)")};
`;

const Actions = styled.div`
  display: flex;
  gap: 12px;
`;

const LinkBtn = styled.button`
  border: none;
  background: none;
  cursor: pointer;
  font-size: var(--font-small);
  color: ${(p) => (p["data-danger"] ? "var(--color-danger)" : "var(--color-secondary)")};

  &:hover {
    text-decoration: underline;
  }
`;

export default UserPage;
