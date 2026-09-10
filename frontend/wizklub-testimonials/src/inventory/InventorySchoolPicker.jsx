import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Loader2, Package } from 'lucide-react'
import { api as teacherApi } from '../api/client'
import { useInventoryBridge } from './InventoryAuthBridge'
import { ROUTES } from '@inventory/utils/routes'
import { formatSchoolDisplayName } from '@inventory/utils/schoolName'

const EMPTY_SCHOOLS_MESSAGE = 'No schools linked to this instructor account.'

export default function InventorySchoolPicker() {
  const navigate = useNavigate()
  const { completeInstructorSchoolSelection, user } = useInventoryBridge()
  const [schools, setSchools] = useState([])
  const [instructorName, setInstructorName] = useState('')
  const [loading, setLoading] = useState(true)
  const [selectingCode, setSelectingCode] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (user?.role === 'School' && user?.token) {
      navigate(ROUTES.school.root, { replace: true })
    }
  }, [user, navigate])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const result = await teacherApi.listInventorySchools()
        if (cancelled) return
        if (!result.ok) {
          const message = result.error || 'Failed to load schools'
          if (message === EMPTY_SCHOOLS_MESSAGE) {
            setSchools([])
          } else {
            setError(message)
          }
          return
        }
        setSchools(result.schools || [])
        setInstructorName(result.instructorName || '')
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to load schools')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [])

  const handleSelect = async (school) => {
    if (!school.hasInventory) return
    setSelectingCode(school.schoolCode)
    setError('')
    try {
      await completeInstructorSchoolSelection(school.schoolCode)
      navigate(ROUTES.school.root)
    } catch (err) {
      setError(err.message || 'Could not open this school')
    } finally {
      setSelectingCode('')
    }
  }

  return (
    <div className="inventory-embed-shell flex relative overflow-hidden flex-1">
      <div className="flex-1 flex flex-col py-10 px-4 sm:px-8 relative z-10 max-w-3xl mx-auto w-full">
        <div className="glass-login-card">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-primary to-brand-orange-light flex items-center justify-center text-white shadow-glow-orange">
              <Package size={28} strokeWidth={2} />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-brand-primary">Kit inventory</p>
              <h1 className="text-2xl font-extrabold text-brand-deep">Select a school</h1>
              {instructorName && (
                <p className="text-sm text-slate-500 mt-0.5">Signed in as {instructorName}</p>
              )}
            </div>
          </div>

          <p className="text-sm text-slate-600 mb-6">
            Choose a school to manage dispatches, warehouse stock, and monthly audits. Uses the same instructor login as Teachers Portal.
          </p>

          {error && (
            <div className="mb-4 p-3 bg-error-50/80 text-error-700 text-sm font-medium rounded-xl border border-error-200">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500 gap-3">
              <Loader2 className="animate-spin text-brand-primary" size={32} />
              <p className="text-sm font-medium">Loading your schools…</p>
            </div>
          ) : schools.length === 0 ? (
            <div className="inventory-empty-state" role="status">
              <p>{EMPTY_SCHOOLS_MESSAGE}</p>
              <p className="inventory-empty-state__hint">
                Schools assigned to your teacher account in WizKlub will appear here once they are registered in inventory.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {schools.map((school) => {
                const isSelecting = selectingCode === school.schoolCode
                const disabled = !school.hasInventory || Boolean(selectingCode)

                return (
                  <button
                    key={school.schoolId}
                    type="button"
                    disabled={disabled}
                    onClick={() => handleSelect(school)}
                    className={`w-full text-left rounded-xl border p-4 transition-all ${
                      school.hasInventory
                        ? 'border-slate-200 bg-white hover:border-brand-primary/40 hover:shadow-md'
                        : 'border-slate-100 bg-slate-50 opacity-75 cursor-not-allowed'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary">
                          <Building2 size={22} />
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 truncate">
                            {formatSchoolDisplayName(school.name)}
                          </p>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-xs">
                            {school.srCode && (
                              <span className="inline-flex items-center gap-1 font-mono text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                <span className="font-semibold text-slate-500">SR Code:</span>
                                <span className="font-bold text-slate-900">{school.srCode}</span>
                              </span>
                            )}
                            {(school.wizklubSchoolId || school.schoolId) && (
                              <span className="inline-flex items-center gap-1 font-mono text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                <span className="font-semibold text-slate-500">School ID:</span>
                                <span className="font-bold text-slate-900">{school.wizklubSchoolId || school.schoolId}</span>
                              </span>
                            )}
                          </div>
                          {!school.hasInventory && (
                            <p className="text-xs text-amber-700 mt-1.5 font-medium">
                              Not registered in inventory — contact admin to add this school.
                            </p>
                          )}
                        </div>
                      </div>
                      {school.hasInventory && (
                        <span className="text-xs font-semibold text-brand-primary shrink-0">
                          {isSelecting ? 'Opening…' : 'Open →'}
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
