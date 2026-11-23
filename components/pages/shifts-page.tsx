"use client"

import { useEffect, useMemo, useState } from "react"
import { Ban, FileSpreadsheet, MapPin, Pencil, Plus, Search, Trash2, UserCog, X, Users } from "lucide-react"
import { usePortal } from "@/components/portal-store"
import { PortalTopbar } from "@/components/portal-topbar"
import type { Page } from "@/components/portal-sidebar"
import type { ShiftProps } from "@/app/schemas/shift_schema"
import { AssignWorkersModal } from "@/components/assign-workers-modal"
import { TimesheetModal } from "@/components/timesheet-modal"
import { attended } from "@/lib/reliability"

const STATUS_OPTIONS = ["All", "active", "completed", "incomplete", "cancelled"]

const STATUS_BADGE: Record<string, string> = {
  active: "border-primary/30 bg-primary/10 text-primary",
  completed: "border-[var(--chart-3)]/30 bg-[var(--chart-3)]/10 text-[var(--chart-3)]",
  incomplete: "border-amber-500/30 bg-amber-500/10 text-amber-600",
  cancelled: "border-destructive/30 bg-destructive/10 text-destructive",
}

// "2/3 attended" once a shift has closed (attendance is recorded per worker when it closes)
function attendedLabel(s: ShiftProps) {
  const approved = s.approvedEmployee ?? []
  if (s.status === "active" || approved.length === 0) return null
  return `${approved.filter((e) => attended(e)).length}/${approved.length} attended`
}

export function ShiftsPage({
  setPage,
  onEdit,
}: {
  user: any
  setPage: (p: Page) => void
  onEdit: (shift: ShiftProps) => void
}) {
  const { shifts, loading, error, deleteShift, updateShift } = usePortal()
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState("All")
  const [deleteTarget, setDeleteTarget] = useState<ShiftProps | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [assignTarget, setAssignTarget] = useState<ShiftProps | null>(null)
  const [cancelTarget, setCancelTarget] = useState<ShiftProps | null>(null)
  const [showTimesheet, setShowTimesheet] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [employees, setEmployees] = useState<any[]>([])

  useEffect(() => {
    fetch("/api/get_employees")
      .then((res) => res.json())
      .then((data) => setEmployees(data.employees ?? []))
      .catch((err) => console.error("Error fetching employees:", err))
  }, [])

  // Keep the open modal's shift in sync as shifts refresh (e.g. right after
  // assigning someone, so the "filled" count updates live).
  const liveAssignTarget = assignTarget ? shifts.find((s) => s.id === assignTarget.id) ?? assignTarget : null

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return shifts.filter((s) => {
      const matchesStatus = status === "All" || s.status === status
      const matchesSearch =
        !q ||
        [s.client, s.shiftLocation, s.shiftPostCode, s.category, s.id]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(q))
      return matchesStatus && matchesSearch
    })
  }, [shifts, search, status])

  async function confirmDelete() {
    if (!deleteTarget?.id) return
    setDeleting(true)
    try {
      await deleteShift(deleteTarget.id)
      setDeleteTarget(null)
    } catch (err) {
      console.error(err)
    } finally {
      setDeleting(false)
    }
  }

  async function confirmCancel() {
    if (!cancelTarget?.id) return
    setCancelling(true)
    setCancelError(null)
    try {
      await updateShift({ ...cancelTarget, status: "cancelled" })
      setCancelTarget(null)
    } catch (err: any) {
      setCancelError(err?.message ?? "Couldn't cancel the shift")
    } finally {
      setCancelling(false)
    }
  }

  return (
    <>
      <PortalTopbar
        title="Manage Shifts"
        subtitle={`${shifts.length} shift${shifts.length !== 1 ? "s" : ""} total`}
        action={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowTimesheet(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
            >
              <FileSpreadsheet size={16} /> Timesheets
            </button>
            <button
              type="button"
              onClick={() => setPage("post-shift")}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Plus size={16} /> Post Shift
            </button>
          </div>
        }
      />

      <div className="flex flex-col gap-5 p-5 md:p-8">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-3">
          <div className="flex min-w-56 flex-1 items-center gap-2 rounded-xl border border-input bg-background px-3 py-2">
            <Search size={16} className="text-muted-foreground" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search client, location, post code or ID…"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              aria-label="Search shifts"
            />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-xl border border-input bg-background px-3 py-2 text-sm capitalize outline-none focus:border-ring"
            aria-label="Filter by status"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s} className="capitalize">
                {s}
              </option>
            ))}
          </select>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                  {["Shift", "Location", "Date & Time", "Pay", "Workers", "Status", ""].map((h) => (
                    <th key={h} className="px-4 py-3 font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((s) => (
                  <tr key={s.id} className="transition-colors hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <p className="text-xs font-bold text-foreground">{s.client || "Untitled"}</p>
                      <p className="text-xs text-muted-foreground">{s.category}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin size={11} /> {s.shiftLocation}, {s.shiftPostCode}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-foreground">{s.shiftDate}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.clockIn} - {s.clockOut}
                      </p>
                    </td>
                    <td className="px-4 py-3 font-semibold text-foreground">£{(s.shiftPay ?? 0).toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1.5 text-foreground">
                        <Users size={14} className="text-muted-foreground" />
                        {s.approvedEmployee?.length ?? 0}/{s.number_of_needed_employee}
                      </span>
                      {(s.appliedEmployee?.length ?? 0) > 0 && (
                        <span className="text-[11px] text-muted-foreground">
                          {s.appliedEmployee!.length} applied
                        </span>
                      )}
                      {(s.withdrawals?.length ?? 0) > 0 && (
                        <span className="block text-[11px] font-semibold text-amber-600">
                          {s.withdrawals!.length} withdrew
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${STATUS_BADGE[s.status] ?? ""}`}
                      >
                        {s.status}
                      </span>
                      {attendedLabel(s) && (
                        <p className="mt-1 text-[11px] text-muted-foreground">{attendedLabel(s)}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setAssignTarget(s)}
                          className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-primary/12 hover:text-primary"
                          aria-label={`Assign workers to ${s.id}`}
                          title="Assign workers"
                        >
                          <UserCog size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => onEdit(s)}
                          className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-primary/12 hover:text-primary"
                          aria-label={`Edit ${s.id}`}
                        >
                          <Pencil size={15} />
                        </button>
                        {s.status === "active" && (
                          <button
                            type="button"
                            onClick={() => {
                              setCancelError(null)
                              setCancelTarget(s)
                            }}
                            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-destructive/12 hover:text-destructive"
                            aria-label={`Cancel ${s.id}`}
                            title="Cancel shift"
                          >
                            <Ban size={15} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(s)}
                          className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-destructive/12 hover:text-destructive"
                          aria-label={`Delete ${s.id}`}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!loading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-16 text-center text-sm text-muted-foreground">
                      {error ? error : shifts.length === 0 ? "No shifts posted yet." : "No shifts match your filters."}
                    </td>
                  </tr>
                )}
                {loading && (
                  <tr>
                    <td colSpan={7} className="px-4 py-16 text-center text-sm text-muted-foreground">
                      Loading shifts…
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Assign workers */}
      {liveAssignTarget && (
        <AssignWorkersModal
          shift={liveAssignTarget}
          employees={employees}
          onClose={() => setAssignTarget(null)}
        />
      )}

      {showTimesheet && <TimesheetModal onClose={() => setShowTimesheet(false)} />}

      {/* Cancel confirm */}
      {cancelTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-title"
          onClick={() => !cancelling && setCancelTarget(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex size-11 items-center justify-center rounded-xl bg-destructive/12 text-destructive">
              <Ban size={20} />
            </div>
            <h3 id="cancel-title" className="font-display font-bold text-foreground">
              Cancel this shift?
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {cancelTarget.client || "This shift"} on {cancelTarget.shiftDate}, {cancelTarget.clockIn}–{cancelTarget.clockOut}.
              {(cancelTarget.approvedEmployee?.length ?? 0) + (cancelTarget.appliedEmployee?.length ?? 0) > 0
                ? " Assigned workers and applicants get a notification that they don't need to attend."
                : ""}{" "}
              Anyone already clocked in is clocked out now. This can&apos;t be undone.
            </p>
            {cancelError && (
              <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">{cancelError}</p>
            )}
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setCancelTarget(null)}
                disabled={cancelling}
                className="flex-1 rounded-xl border border-border py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
              >
                Keep shift
              </button>
              <button
                type="button"
                onClick={confirmCancel}
                disabled={cancelling}
                className="flex-1 rounded-xl bg-destructive py-2.5 text-sm font-semibold text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-60"
              >
                {cancelling ? "Cancelling…" : "Cancel shift"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-title"
          onClick={() => !deleting && setDeleteTarget(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between">
              <div className="flex size-11 items-center justify-center rounded-xl bg-destructive/12 text-destructive">
                <Trash2 size={20} />
              </div>
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-lg p-1 text-muted-foreground hover:text-foreground"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <h3 id="delete-title" className="font-display font-bold text-foreground">
              Delete this shift?
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {deleteTarget.client || "This shift"} at {deleteTarget.shiftLocation}. This action cannot be undone.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="flex-1 rounded-xl border border-border py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className="flex-1 rounded-xl bg-destructive py-2.5 text-sm font-semibold text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-60"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
