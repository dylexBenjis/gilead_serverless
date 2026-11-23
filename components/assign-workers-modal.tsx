"use client"

import { useState } from "react"
import { Check, Clock, Loader2, UserMinus, UserPlus, X } from "lucide-react"
import { attended, describeReliability, reliabilityByWorker, reliabilityTone } from "@/lib/reliability"
import { usePortal } from "./portal-store"
import type { ShiftProps } from "@/app/schemas/shift_schema"
import Image from "next/image"

type Employee = {
  id: string
  firstName?: string
  lastName?: string
  role?: string
  photoURL?: string
}

function nameFor(employee: Employee | undefined, uid: string) {
  if (!employee) return uid
  const name = `${employee.firstName ?? ""} ${employee.lastName ?? ""}`.trim()
  return name || uid
}

function initialsFor(employee: Employee | undefined) {
  const f = employee?.firstName?.[0] ?? ""
  const l = employee?.lastName?.[0] ?? ""
  return (f + l).toUpperCase() || "?"
}

export function AssignWorkersModal({
  shift,
  employees,
  onClose,
}: {
  shift: ShiftProps
  employees: Employee[]
  onClose: () => void
}) {
  const { assignWorker, adjustHours, shifts } = usePortal()
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adjusting, setAdjusting] = useState<string | null>(null) // worker whose hours form is open

  const reliability = reliabilityByWorker(shifts)
  // applicants plus anyone assigned (normally the same people)
  const applied = [...new Set([...(shift.appliedEmployee ?? []), ...(shift.approvedEmployee ?? []).map((e) => e.id)])]
  const withdrawals = shift.withdrawals ?? []
  const approved = shift.approvedEmployee ?? []
  const needed = shift.number_of_needed_employee ?? 0
  const isFull = approved.length >= needed
  const isOpen = shift.status === "active" // closed or cancelled shifts keep their workers as a record

  const employeeById = new Map(employees.map((e) => [e.id, e]))

  async function handle(workerId: string, action: "approve" | "unassign") {
    console.log(`Assigning worker ${workerId} to shift ${shift.id} with action ${action}`)
    if (!shift.id) return;

    setPending(workerId)
    setError(null)
    console.log(`Handling worker ${workerId} with action ${action}`)
    try {
      await assignWorker(shift.id, workerId, action)
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong")
    } finally {
      setPending(null)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-border px-6 py-4">
          <div>
            <h3 className="font-display font-bold text-foreground">
              {shift.client || "Shift"} · {shift.category}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {shift.shiftDate} · {shift.clockIn}-{shift.clockOut} · {approved.length}/{needed} filled
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {error && (
            <p className="mb-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">{error}</p>
          )}

          {applied.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No one has applied to this shift yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {applied.map((uid) => {
                const employee = employeeById.get(uid)
                const entry = approved.find((e) => e.id === uid)
                const isAssigned = !!entry
                const isPending = pending === uid
                return (
                  <div key={uid} className="rounded-xl border border-border">
                  <div className="flex items-center gap-3 p-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold text-primary">
                      {employee?.photoURL ? (
                                            <Image src={employee.photoURL} alt="" width={48} height={48} className="size-full rounded-full object-cover" />
                                          ) : (
                                            initialsFor(employee)
                                          )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">{nameFor(employee, uid)}</p>
                      <p className="truncate text-xs text-muted-foreground">{employee?.role ?? "Worker"}</p>
                      <p className={`truncate text-[11px] ${reliabilityTone(reliability.get(uid))}`}>
                        {describeReliability(reliability.get(uid))}
                      </p>
                      <ClockLine label="In" at={entry?.userClockIn} location={entry?.userClockInLocation} />
                      <ClockLine label="Out" at={entry?.userClockOut} location={entry?.userClockOutLocation} />
                      {entry?.autoClockOut && (
                        <p className="text-[11px] text-amber-600">Didn&apos;t clock out: clocked out automatically</p>
                      )}
                      {entry?.adjusted && (
                        <p className="text-[11px] text-muted-foreground">
                          Hours adjusted by {entry.adjusted.by}: {entry.adjusted.note}
                        </p>
                      )}
                      {entry?.userTotalWorkTime != null && (entry.userClockOut || entry.adjusted) && (
                        <p className="text-[11px] text-muted-foreground">
                          Worked {Math.floor(entry.userTotalWorkTime / 60)}h {String(entry.userTotalWorkTime % 60).padStart(2, "0")}m
                        </p>
                      )}
                    </div>
                    {!isOpen ? (
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        <AttendanceBadge entry={entry} status={shift.status} />
                        {entry && (
                          <button
                            type="button"
                            onClick={() => setAdjusting(adjusting === uid ? null : uid)}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
                          >
                            <Clock size={11} /> Adjust hours
                          </button>
                        )}
                      </div>
                    ) : isAssigned ? (
                      <button
                        type="button"
                        onClick={() => handle(uid, "unassign")}
                        disabled={isPending}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
                      >
                        {isPending ? <Loader2 size={13} className="animate-spin" /> : <UserMinus size={13} />}
                        Remove
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handle(uid, "approve")}
                        disabled={isPending || isFull}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                      >
                        {isPending ? <Loader2 size={13} className="animate-spin" /> : <UserPlus size={13} />}
                        {isFull ? "Full" : "Assign"}
                      </button>
                    )}
                  </div>
                  {adjusting === uid && entry && shift.id && (
                    <AdjustHoursForm
                      current={entry.userTotalWorkTime ?? 0}
                      onCancel={() => setAdjusting(null)}
                      onSave={async (minutes, note) => {
                        await adjustHours(shift.id!, uid, minutes, note)
                        setAdjusting(null)
                      }}
                    />
                  )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {withdrawals.length > 0 && (
          <div className="border-t border-border px-6 py-3">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Withdrew</p>
            {withdrawals.map((w) => (
              <p key={`${w.id}-${w.at}`} className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{nameFor(employeeById.get(w.id), w.id)}</span>
                {" · "}
                {w.wasAssigned ? "dropped out after being assigned" : "withdrew their application"}
                {" · "}
                {new Date(w.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </p>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-border px-6 py-3">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {!isOpen ? (
              <span className="capitalize">Shift {shift.status}: workers can no longer be changed</span>
            ) : (
              isFull && (
                <>
                  <Check size={13} className="text-primary" /> Shift fully staffed
                </>
              )
            )}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

// What happened for this worker once the shift closed
function AttendanceBadge({ entry, status }: { entry?: ShiftProps["approvedEmployee"][number]; status: ShiftProps["status"] }) {
  const [label, cls] = !entry
    ? ["Not assigned", "bg-muted text-muted-foreground"]
    : attended(entry)
      ? ["Completed", "bg-[var(--chart-3)]/10 text-[var(--chart-3)]"]
      : status === "cancelled"
        ? ["Cancelled", "bg-destructive/10 text-destructive"]
        : ["Incomplete", "bg-amber-500/10 text-amber-600"]
  return <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${cls}`}>{label}</span>
}

// "In 09:02 · 45 m from site" — red when the recorded spot was outside the clock-in radius.
const SITE_RADIUS_M = 200

function ClockLine({
  label,
  at,
  location,
}: {
  label: string
  at?: string
  location?: { lat: number; lng: number; accuracy: number; distanceM?: number }
}) {
  if (!at) return null
  const time = new Date(at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  const d = location?.distanceM
  const where =
    d == null
      ? location
        ? "location recorded"
        : "no location"
      : `${d < 1000 ? `${d} m` : `${(d / 1609.344).toFixed(1)} mi`} from site`
  const far = d != null && d > SITE_RADIUS_M
  return (
    <p className={`truncate text-[11px] ${far ? "font-semibold text-destructive" : "text-muted-foreground"}`}>
      {label} {time} · {where}
      {location && (
        <>
          {" · "}
          <a
            href={`https://www.google.com/maps?q=${location.lat},${location.lng}`}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
          >
            map
          </a>
        </>
      )}
    </p>
  )
}

// Set the paid hours for one worker on a closed shift, with a reason
function AdjustHoursForm({
  current,
  onSave,
  onCancel,
}: {
  current: number
  onSave: (minutes: number, note: string) => Promise<void>
  onCancel: () => void
}) {
  const [hours, setHours] = useState(String(Math.floor(current / 60)))
  const [mins, setMins] = useState(String(current % 60))
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const h = Number(hours)
  const m = Number(mins)
  const valid =
    Number.isInteger(h) && Number.isInteger(m) && h >= 0 && h <= 24 && m >= 0 && m < 60 && h * 60 + m <= 1440 && note.trim().length >= 3

  async function save() {
    if (!valid) return
    setSaving(true)
    setError(null)
    try {
      await onSave(h * 60 + m, note.trim())
    } catch (err: any) {
      setError(err?.message ?? "Couldn't save")
    } finally {
      setSaving(false)
    }
  }

  const input = "rounded-lg border border-input bg-background px-2 py-1.5 text-sm outline-none focus:border-ring"
  return (
    <div className="flex flex-col gap-2 border-t border-border bg-muted/30 p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">Paid hours</span>
        <input type="number" min={0} max={24} value={hours} onChange={(e) => setHours(e.target.value)} className={`${input} w-16`} aria-label="Hours" />
        h
        <input type="number" min={0} max={59} value={mins} onChange={(e) => setMins(e.target.value)} className={`${input} w-16`} aria-label="Minutes" />
        m
        <span className="text-[11px]">(0 = incomplete)</span>
      </div>
      <input
        type="text"
        value={note}
        maxLength={200}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Reason, e.g. phone died, confirmed with site manager"
        className={input}
        aria-label="Reason for the change"
      />
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={saving} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted">
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!valid || saving}
          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save and notify worker"}
        </button>
      </div>
    </div>
  )
}
