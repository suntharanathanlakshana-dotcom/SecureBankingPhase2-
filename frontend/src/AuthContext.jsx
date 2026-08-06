import { createContext, useContext, useEffect, useState } from "react";
import { api } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!api.getToken()) {
      setLoading(false);
      return;
    }
    api
      .get("/auth/me")
      .then((d) => setUser(d.user))
      .catch(() => api.clearToken())
      .finally(() => setLoading(false));
  }, []);

  function login(token, user) {
    api.setToken(token);
    setUser(user);
  }
  function logout() {
    api.clearToken();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
