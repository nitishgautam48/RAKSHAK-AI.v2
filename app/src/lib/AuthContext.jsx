import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, setAuthToken, getAuthToken } from './api';
import { connectSocket, disconnectSocket } from './socket';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) { setLoading(false); return; }
    api.get('/api/auth/me')
      .then((u) => { setUser(u); connectSocket(); })
      .catch(() => setAuthToken(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback((token, userInfo) => {
    setAuthToken(token);
    setUser(userInfo);
    connectSocket();
  }, []);

  const logout = useCallback(() => {
    setAuthToken(null);
    setUser(null);
    disconnectSocket();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
