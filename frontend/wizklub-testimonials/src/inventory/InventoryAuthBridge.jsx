import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AuthContext as InventoryAuthContext } from '@inventory/context/AuthContext'
import { api as teacherApi } from '../api/client'

const INVENTORY_SESSION_KEY = 'userInfo'

function readInventoryUser() {
  try {
    const raw = sessionStorage.getItem(INVENTORY_SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function persistInventoryUser(userData) {
  if (userData) {
    sessionStorage.setItem(INVENTORY_SESSION_KEY, JSON.stringify(userData))
  } else {
    sessionStorage.removeItem(INVENTORY_SESSION_KEY)
  }
}

export function InventoryAuthBridge({ children }) {
  const navigate = useNavigate()
  const [user, setUser] = useState(() => readInventoryUser())
  const [loading, setLoading] = useState(false)
  const userRef = useRef(user)

  useEffect(() => {
    userRef.current = user
  }, [user])

  const applyUser = useCallback((userData) => {
    userRef.current = userData
    setUser(userData)
    persistInventoryUser(userData)
  }, [])

  const clearSession = useCallback(() => {
    userRef.current = null
    setUser(null)
    persistInventoryUser(null)
  }, [])

  const completeInstructorSchoolSelection = useCallback(async (schoolCode) => {
    const result = await teacherApi.selectInventorySchool(schoolCode)
    if (!result.ok) {
      throw new Error(result.error || 'Could not open school inventory.')
    }
    const userData = {
      _id: result._id,
      name: result.name,
      email: result.email,
      role: result.role,
      schoolCode: result.schoolCode,
      srCode: result.srCode || result.schoolCode,
      wizklubSchoolId: result.wizklubSchoolId || null,
      loginType: result.loginType || 'instructor',
      instructorName: result.instructorName,
      token: result.token,
    }
    applyUser(userData)
    return userData
  }, [applyUser])

  const logout = useCallback(() => {
    clearSession()
    navigate('/select', { replace: true })
  }, [clearSession, navigate])

  const switchInstructorSchool = useCallback(() => {
    clearSession()
    navigate('/select', { replace: true })
  }, [clearSession, navigate])

  const value = useMemo(() => ({
    user,
    loading,
    login: async () => { throw new Error('Use Teachers Portal login') },
    loginAdmin: async () => { throw new Error('Not available') },
    loginSchool: async () => { throw new Error('Use Teachers Portal login') },
    loginInstructor: async () => { throw new Error('Use Teachers Portal login') },
    completeInstructorSchoolSelection,
    switchInstructorSchool,
    refreshAdminSession: async () => null,
    logout,
  }), [user, loading, completeInstructorSchoolSelection, switchInstructorSchool, logout])

  return (
    <InventoryAuthContext.Provider value={value}>
      {children}
    </InventoryAuthContext.Provider>
  )
}

export function useInventoryBridge() {
  return useContext(InventoryAuthContext)
}
