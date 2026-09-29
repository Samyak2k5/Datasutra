import { useEffect, useState } from "react";
import { disableGoogleAutoSelect } from "./googleIdentity";
import api from "../services/api";

import { AuthContext } from "./context";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    const clear = () => { setUser(null); setError(null); setLoading(false); };
    window.addEventListener("datasutra:unauthorized", clear);
    async function hydrate() {
      setLoading(true);
      setError(null);
      const sessionToken = api.getToken();
      if (!sessionToken) {
        api.setCurrentUser(null);
        clear();
        return;
      }
      try {
        const response = await api.getMe();
        if (active && api.getToken() === sessionToken) {
          if (!response?.data?.user?.id) throw new Error("The server returned an invalid user profile.");
          api.setCurrentUser(response.data.user);
          setUser(response.data.user);
        }
      } catch (err) {
        if (active && api.getToken() === sessionToken && err.status !== 401) setError(err.message);
      } finally {
        if (active && api.getToken() === sessionToken) setLoading(false);
      }
    }
    hydrate();
    return () => { active = false; window.removeEventListener("datasutra:unauthorized", clear); };
  }, [attempt]);

  const authenticate = async (method, credentials) => {
    const response = await api[method](credentials);
    if (!response?.data?.user?.id || !response.data.accessToken) {
      throw new Error("The server returned an incomplete authentication response.");
    }
    setUser(response.data.user);
    setError(null);
    setLoading(false);
  };
  const updateProfile = async fields => {
    const sessionToken = api.getToken();
    const response = await api.updateProfile(fields);
    if (api.getToken() !== sessionToken) throw new Error('Your session changed. Please log in again.');
    if (!response?.data?.user?.id) throw new Error('The server returned an invalid profile.');
    api.setCurrentUser(response.data.user);
    setUser(response.data.user);
    return response.data.user;
  };
  const logout = () => {
    disableGoogleAutoSelect();
    api.setToken(null);
    api.setCurrentUser(null);
    setUser(null);
    setError(null);
  };
  const initials = user?.name?.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "";
  return <AuthContext.Provider value={{ user, initials, loading, error,
    updateProfile, retry: () => setAttempt(value => value + 1), logout,
    googleLogin: credentials => authenticate("googleLogin", credentials),
    login: credentials => authenticate("login", credentials),
    register: credentials => authenticate("register", credentials)
  }}>{children}</AuthContext.Provider>;
}
