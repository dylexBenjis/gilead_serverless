"use client"

import { useEffect, useMemo, useState } from "react"
import { MapPin, Search } from "lucide-react"
import { PortalTopbar } from "@/components/portal-topbar"
import Image from "next/image"
import { usePortal } from "@/components/portal-store"
import { describeReliability, reliabilityByWorker, reliabilityTone } from "@/lib/reliability"

function initials(firstName?: string, lastName?: string) {
  const f = firstName?.[0] ?? ""
  const l = lastName?.[0] ?? ""
  return (f + l).toUpperCase() || "?"
}

// "Online now" / "Last seen 5m ago" / "Last seen yesterday, 14:03" / "Last seen 3 Nov, 09:12"
// last_changed is when the worker's state last flipped, so for an offline worker it's when they left.
function lastSeenLabel(status?: string, timestamp?: number | null) {
  if (status === "online") return "Online now"
  if (!timestamp) return "Never seen in the app"
  const mins = Math.floor((Date.now() - timestamp) / 60000)
  if (mins < 1) return "Last seen just now"
  if (mins < 60) return `Last seen ${mins}m ago`
  const d = new Date(timestamp)
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  const startOfToday = new Date().setHours(0, 0, 0, 0)
  if (timestamp >= startOfToday) return `Last seen today, ${time}`
  if (timestamp >= startOfToday - 86400000) return `Last seen yesterday, ${time}`
  return `Last seen ${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}, ${time}`
}

const PRESENCE_REFRESH_MS = 30_000

export function EmployeesPage() {
  const { shifts } = usePortal()
  const reliability = useMemo(() => reliabilityByWorker(shifts), [shifts])
  const [search, setSearch] = useState("")
  const [onlyActive, setOnlyActive] = useState(false)

  const [employees, setEmployees] = useState<any[]>([])
  const [employeesStatus, setEmployeesStatus] = useState<any[]>([])
  const [employeeOnlineStatus, setEmployeeOnlineStatus] = useState<any[]>([])
  const [merged, setMerged] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  // sign-in dates / online status are extras: if they fail the workers still show, with a note
  const [extrasError, setExtrasError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    setExtrasError(false)

    // null on failure; never waits more than 20 s, so the page can't stay on "Loading" forever
    async function fetchJson(url: string) {
      try {
        const response = await fetch(url, {
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(20_000),
        })
        if (response.status === 401) throw new Error("signed-out")
        if (!response.ok) throw new Error(`${url} failed (${response.status})`)
        return await response.json()
      } catch (error) {
        console.error(`Error fetching ${url}:`, error)
        if ((error as Error)?.message === "signed-out") return { signedOut: true }
        return null
      }
    }

    // each request fills in its part as soon as it arrives
    fetchJson("/api/get_employees").then((data) => {
      if (cancelled) return
      if (data?.employees) setEmployees(data.employees)
      else
        setLoadError(
          data?.signedOut
            ? "Your admin session has expired. Refresh the page and sign in again."
            : "Couldn't load workers. Check the server is running and try again.",
        )
      setLoading(false)
    })
    fetchJson("/api/get_employees_status").then((data) => {
      if (cancelled) return
      if (data?.employeesStatus) setEmployeesStatus(data.employeesStatus)
      else setExtrasError(true)
    })
    fetchJson("/api/get_user_online").then((data) => {
      if (cancelled) return
      if (data?.employeesOnlineStatus) setEmployeeOnlineStatus(data.employeesOnlineStatus)
      else setExtrasError(true)
    })

    // keep online / last seen current while the page is open
    const timer = setInterval(async () => {
      const onlineData = await fetchJson("/api/get_user_online")
      if (!cancelled && onlineData?.employeesOnlineStatus) setEmployeeOnlineStatus(onlineData.employeesOnlineStatus)
    }, PRESENCE_REFRESH_MS)

    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [reloadKey])

  // Merge employees (Firestore profile) + auth status + realtime presence
  useEffect(() => {
    const mergedEmployees = employees.map((employee) => {
      const status = employeesStatus.find((s) => s.uid === employee.id)
      const online = employeeOnlineStatus.find((o) => o.userId === employee.id)
      const { uid, ...statusRest } = status ?? {}
      const { userId, ...onlineRest } = online ?? {}
      return { ...employee, ...statusRest, ...onlineRest }
    })
    setMerged(mergedEmployees)
  }, [employees, employeesStatus, employeeOnlineStatus])

  const filtered = useMemo(() => {
    return merged.filter((w: any) => {
      const matchesSearch =
        !search ||
        `${w.firstName ?? ""} ${w.lastName ?? ""} ${w.role ?? ""} ${w.address ?? ""}`
          .toLowerCase()
          .includes(search.toLowerCase())
      const matchesActive = !onlyActive || w.status === "online"
      return matchesSearch && matchesActive
    })
  }, [merged, onlyActive, search])

  const onlineCount = merged.filter((w: any) => w.status === "online").length

  return (
    <>
      <PortalTopbar title="Workers" subtitle={`${employees.length} registered · ${onlineCount} online`} />

      <div className="flex flex-col gap-5 p-5 md:p-8">
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-3">
          <div className="flex min-w-56 flex-1 items-center gap-2 rounded-xl border border-input bg-background px-3 py-2">
            <Search size={16} className="text-muted-foreground" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, role or location…"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              aria-label="Search employees"
            />
          </div>
          <label className="flex items-center gap-2 rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={onlyActive}
              onChange={(e) => setOnlyActive(e.target.checked)}
              className="size-4 accent-[var(--primary)]"
            />
            Online only
          </label>
        </div>

        {extrasError && !loadError && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
            <span>Online status or sign-in dates couldn&apos;t be loaded, so they may be missing or out of date.</span>
            <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="font-semibold underline">
              Retry
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex h-full w-full items-center justify-center py-16">
            <p className="text-sm text-muted-foreground">Loading employees...</p>
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="text-sm text-muted-foreground">{loadError}</p>
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              Try again
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((w: any) => (
              <div key={w.id} className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
                <div className="flex items-center gap-3">
                  <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-sidebar text-sm font-bold text-sidebar-foreground">
                    {w.photoURL ? (
                      <Image src={w.photoURL} alt="" width={48} height={48} className="size-full rounded-full object-cover" />
                    ) : (
                      initials(w.firstName, w.lastName)
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-foreground">
                      {w.firstName || w.lastName ? `${w.firstName ?? ""} ${w.lastName ?? ""}` : "Unnamed worker"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{w.role ?? "employee"}</p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <MapPin size={13} /> {w.address || "No address on file"}
                  {w.postCode ? `, ${w.postCode}` : ""}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>Joined: {w.metadata?.creationTime ? new Date(w.metadata.creationTime).toLocaleDateString() : "N/A"}</span>
                  <span>Signed in: {w.metadata?.lastSignInTime ? new Date(w.metadata.lastSignInTime).toLocaleDateString() : "N/A"}</span>
                </div>

                <div className="grid grid-cols-2 gap-3 border-t border-border pt-4">
                  <p className="font-display text-xs text-muted-foreground">
                    Shifts completed: {w.pastShifts?.length ?? 0}
                  </p>
                  <p className="font-display text-xs text-muted-foreground">
                    Upcoming shifts: {w.nextShifts?.length ?? 0}
                  </p>
                  <p className={`col-span-2 font-display text-xs font-semibold ${reliabilityTone(reliability.get(w.id))}`}>
                    {describeReliability(reliability.get(w.id))}
                  </p>
                </div>

                <div className="flex items-center gap-3 border-t border-border pt-3 font-display text-xs text-muted-foreground">
                  <span className={w.status === "online" ? "font-semibold text-green-600" : undefined}>
                    {lastSeenLabel(w.status, w.last_changed)}
                  </span>
                  <span className="relative flex size-3">
                    {w.status === "online" ? (
                      <>
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                        <span className="relative inline-flex size-3 rounded-full bg-green-500" />
                      </>
                    ) : (
                      <>
                        <span className="absolute inline-flex h-full w-full rounded-full bg-zinc-400 opacity-75" />
                        <span className="relative inline-flex size-3 rounded-full bg-zinc-400" />
                      </>
                    )}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && !loadError && filtered.length === 0 && (
          <p className="py-16 text-center text-sm text-muted-foreground">No employees match your search.</p>
        )}
      </div>
    </>
  )
}
