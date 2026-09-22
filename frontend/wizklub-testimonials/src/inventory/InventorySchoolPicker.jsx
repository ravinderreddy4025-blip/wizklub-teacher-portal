import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, ChevronRight, Loader2, Package } from 'lucide-react'
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
      await completeInstructorSchoolSelection(
        school.srCode || school.wizklubSchoolId || school.schoolCode,
      )
      navigate(ROUTES.school.root)
    } catch (err) {
      setError(err.message || 'Could not open this school')
    } finally {
      setSelectingCode('')
    }
  }

  return (
    <div className="inventory-embed-shell flex relative overflow-hidden flex-1">
      <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-8 sm:px-8">
        <div className="mb-6 flex items-center gap-4">
          <span className="inv-choice__art bg-wk-peach text-wk-orange-text" aria-hidden>
            <Package size={26} strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-wk-orange-text">Kit inventory</p>
            <h1 className="inv-page-title">Select a school</h1>
            {instructorName && (
              <p className="mt-0.5 text-sm text-wk-body">Signed in as {instructorName}</p>
            )}
          </div>
        </div>

        <p className="mb-6 text-sm text-wk-body">
          Choose a school to manage dispatches, warehouse stock, and monthly audits. Uses the same instructor login as Teachers Portal.
        </p>

        {error && (
          <div className="inv-auth-alert mb-4" role="alert">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-wk-body" role="status">
            <Loader2 className="animate-spin text-wk-orange-text" size={32} aria-hidden />
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
          <div className="flex flex-col gap-3">
            {schools.map((school) => {
              const isSelecting = selectingCode === school.schoolCode
              const disabled = !school.hasInventory || Boolean(selectingCode)

              return (
                <button
                  key={school.schoolId}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleSelect(school)}
                  className="inv-choice group"
                >
                  <span
                    className={`inv-choice__art ${school.hasInventory ? 'bg-wk-peach text-wk-orange-text' : 'bg-white text-wk-muted'}`}
                    aria-hidden
                  >
                    <Building2 size={24} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="inv-choice__name truncate">{formatSchoolDisplayName(school.name)}</span>
                    <span className="inv-choice__meta flex flex-wrap gap-x-3">
                      {school.srCode && (
                        <span>SR code: <span className="font-mono text-wk-ink">{school.srCode}</span></span>
                      )}
                      {(school.wizklubSchoolId || school.schoolId) && (
                        <span>School ID: <span className="font-mono text-wk-ink">{school.wizklubSchoolId || school.schoolId}</span></span>
                      )}
                    </span>
                    {!school.hasInventory && (
                      <span className="mt-1 text-[13px] font-medium text-warning-700">
                        Not registered in inventory — contact admin to add this school.
                      </span>
                    )}
                  </span>
                  {school.hasInventory && (
                    <span className="inv-choice__go">
                      {isSelecting ? 'Opening…' : 'Open'}
                      {!isSelecting && <ChevronRight size={18} aria-hidden />}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
