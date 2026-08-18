import React, { createContext, useState, useEffect, useRef, useCallback } from 'react';
import api from '../utils/api';

export const AuthContext = createContext();

const REFRESH_BUFFER_MS = 60 * 1000;

function persistUser(userData) {
  sessionStorage.setItem('userInfo', JSON.stringify(userData));
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const refreshTimerRef = useRef(null);
  const userRef = useRef(null);

  const clearRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  const applyUser = useCallback((userData) => {
    userRef.current = userData;
    setUser(userData);
    if (userData) {
      persistUser(userData);
    } else {
      sessionStorage.removeItem('userInfo');
    }
  }, []);

  const clearSession = useCallback(() => {
    clearRefreshTimer();
    userRef.current = null;
    setUser(null);
    sessionStorage.removeItem('userInfo');
    sessionStorage.removeItem('instructorSession');
    sessionStorage.removeItem('amSelectedDivisionId');
  }, [clearRefreshTimer]);

  const refreshAdminSession = useCallback(async () => {
    const current = userRef.current;
    if (!current || current.loginType !== 'wizklub') return null;
    if (!current.username || !current.wizklubRefreshToken) {
      clearSession();
      return null;
    }

    try {
      const response = await api.post('/auth/admin/refresh', {
        username: current.username,
        refreshToken: current.wizklubRefreshToken,
      });
      const nextUser = {
        ...current,
        ...response.data,
        loginType: 'wizklub',
      };
      applyUser(nextUser);
      return nextUser;
    } catch (error) {
      clearSession();
      throw error.response?.data?.message || error;
    }
  }, [applyUser, clearSession]);

  const scheduleAdminRefresh = useCallback((userData) => {
    clearRefreshTimer();
    if (!userData || userData.loginType !== 'wizklub' || !userData.wizklubExpiresAt) {
      return;
    }

    const delay = Math.max(
      Number(userData.wizklubExpiresAt) - Date.now() - REFRESH_BUFFER_MS,
      5 * 1000,
    );

    refreshTimerRef.current = setTimeout(() => {
      refreshAdminSession().catch(() => {});
    }, delay);
  }, [clearRefreshTimer, refreshAdminSession]);

  useEffect(() => {
    const storedUser = sessionStorage.getItem('userInfo');
    if (storedUser) {
      const parsed = JSON.parse(storedUser);
      userRef.current = parsed;
      setUser(parsed);
      if (
        parsed.loginType === 'wizklub'
        && parsed.wizklubExpiresAt
        && Number(parsed.wizklubExpiresAt) <= Date.now() + REFRESH_BUFFER_MS
      ) {
        refreshAdminSession().catch(() => {});
      } else {
        scheduleAdminRefresh(parsed);
      }
    }
    setLoading(false);

    return () => clearRefreshTimer();
  }, [clearRefreshTimer, refreshAdminSession, scheduleAdminRefresh]);

  useEffect(() => {
    scheduleAdminRefresh(user);
  }, [user, scheduleAdminRefresh]);

  const login = async (email, password) => {
    try {
      const response = await api.post('/auth/login', { email, password });
      applyUser(response.data);
      return response.data;
    } catch (error) {
      throw error.response?.data?.message || error;
    }
  };

  const loginAdmin = async (username, password) => {
    try {
      const response = await api.post('/auth/login/admin', { username, password });
      applyUser(response.data);
      return response.data;
    } catch (error) {
      throw error.response?.data?.message || error;
    }
  };

  const loginSchool = async (schoolCode, password) => {
    try {
      const response = await api.post('/auth/login/school', { schoolCode, password });
      sessionStorage.removeItem('instructorSession');
      applyUser(response.data);
      return response.data;
    } catch (error) {
      throw error.response?.data?.message || error;
    }
  };

  const loginInstructor = async (username, password) => {
    try {
      const response = await api.post('/auth/login/instructor', { username, password });
      sessionStorage.setItem('instructorSession', JSON.stringify(response.data));
      return response.data;
    } catch (error) {
      throw error.response?.data?.message || error;
    }
  };

  const completeInstructorSchoolSelection = async (schoolCode, instructorToken) => {
    try {
      const token = instructorToken
        || JSON.parse(sessionStorage.getItem('instructorSession') || '{}').instructorToken;
      const response = await api.post(
        '/auth/instructor/select-school',
        { schoolCode },
        { headers: { 'X-Instructor-Token': token } },
      );
      const userData = {
        ...response.data,
        instructorToken: token,
      };
      applyUser(userData);
      return userData;
    } catch (error) {
      throw error.response?.data?.message || error;
    }
  };

  const logout = async () => {
    const current = userRef.current;
    if (current?.loginType === 'wizklub' && current.wizklubAccessToken) {
      try {
        await api.post('/auth/admin/logout', {
          accessToken: current.wizklubAccessToken,
        });
      } catch {
        // Always clear local session even if remote logout fails.
      }
    }
    clearSession();
  };

  const switchInstructorSchool = () => {
    const stored = JSON.parse(sessionStorage.getItem('userInfo') || '{}');
    if (stored.instructorToken) {
      sessionStorage.setItem('instructorSession', JSON.stringify({
        instructorToken: stored.instructorToken,
        instructorName: stored.instructorName || stored.name,
      }));
    }
    clearRefreshTimer();
    userRef.current = null;
    setUser(null);
    sessionStorage.removeItem('userInfo');
  };

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      login,
      loginAdmin,
      loginSchool,
      loginInstructor,
      completeInstructorSchoolSelection,
      switchInstructorSchool,
      refreshAdminSession,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
};
