"use client"

import { ShiftProps } from "@/app/schemas/shift_schema"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"

interface PortalContextValue {
  shifts: ShiftProps[]
  loading: boolean
  error: string | null
  refreshShifts: () => Promise<void>
  addShift: (shift: Omit<ShiftProps, "id">) => Promise<void>
  updateShift: (shift: ShiftProps) => Promise<void>
  deleteShift: (id: string) => Promise<void>
  assignWorker: (shiftId: string, workerId: string, action: "approve" | "unassign") => Promise<void>
  adjustHours: (shiftId: string, workerId: string, minutes: number, note: string) => Promise<void>
}

const PortalContext = createContext<PortalContextValue | null>(null)

export function PortalProvider({ children }: { children: ReactNode }) {
  const [shifts, setShifts] = useState<ShiftProps[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refreshShifts = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch("/api/get_shift")
      if (!response.ok) throw new Error("Failed to load shifts")
      const data = await response.json()
      setShifts(data.shifts ?? [])
    } catch (err: any) {
      console.error("Error fetching shifts:", err)
      setError(err?.message ?? "Failed to load shifts")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshShifts()
  }, [refreshShifts])

  const addShift = useCallback(
    async (shift: Omit<ShiftProps, "id">) => {
      const response = await fetch("/api/post_shift", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(shift),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error ?? "Failed to create shift")
      }
      await refreshShifts()
    },
    [refreshShifts],
  )

  const updateShift = useCallback(
    async (shift: ShiftProps) => {
      const response = await fetch("/api/post_shift", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(shift),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error ?? "Failed to update shift")
      }
      await refreshShifts()
    },
    [refreshShifts],
  )

  const deleteShift = useCallback(
    async (id: string) => {
      const response = await fetch(`/api/post_shift?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error ?? "Failed to delete shift")
      }
      setShifts((prev) => prev.filter((s) => s.id !== id))
    },
    [],
  )

  const assignWorker = useCallback(
    async (shiftId: string, workerId: string, action: "approve" | "unassign") => {
      console.log(`Assigning worker ${workerId} to shift ${shiftId} with action ${action}`)
      const response = await fetch("/api/assign_shift", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shiftId, workerId, action }),
      })
      console.log(`Response from assign_shift API:`, response)
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error ?? "Failed to update assignment")
      }
      await refreshShifts()
    },
    [refreshShifts],
  )

  // correct the hours a worker is paid for on a closed shift (0 = incomplete)
  const adjustHours = useCallback(
    async (shiftId: string, workerId: string, minutes: number, note: string) => {
      const response = await fetch("/api/adjust_hours", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shiftId, workerId, minutes, note }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error ?? "Failed to adjust hours")
      }
      await refreshShifts()
    },
    [refreshShifts],
  )

  const value = useMemo(
    () => ({ shifts, loading, error, refreshShifts, addShift, updateShift, deleteShift, assignWorker, adjustHours }),
    [shifts, loading, error, refreshShifts, addShift, updateShift, deleteShift, assignWorker, adjustHours],
  )

  return <PortalContext.Provider value={value}>{children}</PortalContext.Provider>
}

export function usePortal() {
  const ctx = useContext(PortalContext)
  if (!ctx) throw new Error("usePortal must be used within PortalProvider")
  return ctx
}

// Demo credentials are no longer used now that sign-in goes through Auth0,
// kept as named exports only in case other code still imports them.
export const DEMO_EMAIL = "admin@gilead.co"
export const DEMO_PASSWORD = "demo-password"
