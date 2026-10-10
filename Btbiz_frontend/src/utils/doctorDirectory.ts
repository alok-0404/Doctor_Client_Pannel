import { useEffect, useState } from 'react'

import { doctorDirectoryService, type DepartmentOption } from '../services/api'

let departmentsCache: DepartmentOption[] | null = null

export function useDepartments(): DepartmentOption[] {
  const [departments, setDepartments] = useState<DepartmentOption[]>(departmentsCache ?? [])

  useEffect(() => {
    if (departmentsCache) return
    let cancelled = false
    doctorDirectoryService
      .listDepartments()
      .then((list) => {
        departmentsCache = list
        if (!cancelled) setDepartments(list)
      })
      .catch(() => {
        /* department select falls back to an empty list */
      })
    return () => {
      cancelled = true
    }
  }, [])

  return departments
}

export function doctorInitials(name: string): string {
  const cleaned = name.replace(/^dr\.?\s+/i, '').trim()
  return (cleaned[0] ?? 'D').toUpperCase()
}

/** Server `message` from an axios error, else the fallback text. */
export function apiErrorMessage(err: unknown, fallback: string): string {
  const message = (err as { response?: { data?: { message?: unknown } } })?.response?.data?.message
  return typeof message === 'string' && message ? message : fallback
}
