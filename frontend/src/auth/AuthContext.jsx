/**
 * AuthContext - 全局登录态
 *
 * 职责：持有当前用户与 token，提供 login / logout，并在启动时用本地 token
 *       拉取当前用户（校验是否仍有效）。token 落在 localStorage（见 api.js）。
 * 用法：
 *   const { user, ready, login, logout, isAdmin, hasRole } = useAuth();
 */
import React from "react";
import {
  login as apiLogin,
  getMe,
  getToken,
  setToken,
} from "../api";

const ROLE_LEVEL = { viewer: 1, operator: 2, admin: 3 };

const AuthContext = React.createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = React.useState(null);
  const [ready, setReady] = React.useState(false); // 启动校验是否完成

  // 启动：若本地有 token，拉取当前用户验证有效性
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      if (getToken()) {
        try {
          const me = await getMe();
          if (!cancelled) setUser(me);
        } catch {
          setToken(null);
        }
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 监听 api.js 抛出的 401 事件 → 强制登出
  React.useEffect(() => {
    const onLogout = () => {
      setToken(null);
      setUser(null);
    };
    window.addEventListener("auth:logout", onLogout);
    return () => window.removeEventListener("auth:logout", onLogout);
  }, []);

  const login = React.useCallback(async (username, password) => {
    const { token, user: u } = await apiLogin(username, password);
    setToken(token);
    setUser(u);
    return u;
  }, []);

  const logout = React.useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  const hasRole = React.useCallback(
    (minRole) =>
      !!user && (ROLE_LEVEL[user.role] || 0) >= (ROLE_LEVEL[minRole] || 99),
    [user]
  );

  const value = React.useMemo(
    () => ({
      user,
      ready,
      login,
      logout,
      hasRole,
      isAdmin: !!user && user.role === "admin",
      setUser,
    }),
    [user, ready, login, logout, hasRole]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth 必须在 AuthProvider 内使用");
  return ctx;
}

// 角色中文标签（多处复用）
export const ROLE_LABEL = {
  admin: "管理员",
  operator: "操作员",
  viewer: "访客",
};
