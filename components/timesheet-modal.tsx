"use client"

import { useState } from "react"
import { Download, FileSpreadsheet, X } from "lucide-react"

// "YYYY-MM-DD" in local time
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

// Monday–Sunday of last week, the usual payroll period
function lastWeek() {
  const monday = new Date()
  monday.setHours(12, 0, 0, 0)
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) - 7)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return { from: iso(monday), to: iso(sunday) }
}

export function TimesheetModal({ onClose }: { onClose: () => void }) {
  const [{ from, to }, setRange] = useState(lastWeek)
  const valid = !!from && !!to && from <= to

  // a plain link: the browser downloads the CSV using the admin's session cookie
  const href = (view?: "summary") =>
    `/api/timesheet?from=${from}&to=${to}${view ? `&view=${view}` : ""}`

  const input = "w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
  const button =
    "inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors"

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="timesheet-title"
      onClick={onClose}
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary/12 text-primary">
            <FileSpreadsheet size={20} />
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-muted-foreground hover:text-foreground" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <h3 id="timesheet-title" className="font-display font-bold text-foreground">
          Download timesheets
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Hours worked and pay for closed shifts in this period, as a CSV for Excel or payroll.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="text-xs font-semibold text-muted-foreground">
            From
            <input type="date" value={from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} className={`${input} mt-1`} />
          </label>
          <label className="text-xs font-semibold text-muted-foreground">
            To
            <input type="date" value={to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} className={`${input} mt-1`} />
          </label>
        </div>
        {!valid && <p className="mt-2 text-xs font-medium text-destructive">Pick a start date on or before the end date.</p>}

        <div className="mt-5 flex gap-3">
          <a
            href={valid ? href("summary") : undefined}
            aria-disabled={!valid}
            className={`${button} border border-border text-foreground hover:bg-muted ${valid ? "" : "pointer-events-none opacity-50"}`}
          >
            <Download size={15} /> Totals per worker
          </a>
          <a
            href={valid ? href() : undefined}
            aria-disabled={!valid}
            className={`${button} bg-primary text-primary-foreground hover:bg-primary/90 ${valid ? "" : "pointer-events-none opacity-50"}`}
          >
            <Download size={15} /> Every shift
          </a>
        </div>
      </div>
    </div>
  )
}
