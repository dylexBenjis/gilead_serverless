"use client"

import { useState } from "react"
import { Check, Plus, X } from "lucide-react"
import { PortalTopbar } from "@/components/portal-topbar"
import type { Page } from "@/components/portal-sidebar"
import { cn } from "@/lib/utils"
import type { ShiftProps } from "@/app/schemas/shift_schema"
import { usePortal } from "@/components/portal-store"

function Field({
  label,
  error,
  children,
  className,
}: {
  label: string
  error?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
      {error && <span className="text-xs font-medium text-destructive">{error}</span>}
    </label>
  )
}

const inputCls =
  "rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/25 placeholder:text-muted-foreground"

const CATEGORIES = ["Healthcare"]
const STATUS_VALUES: ShiftProps["status"][] = ["active", "completed", "cancelled"]
const STATUS_LABELS: Record<ShiftProps["status"], string> = {
  active: "Active",
  completed: "Completed: close it now (no-shows marked incomplete)",
  incomplete: "Incomplete",
  cancelled: "Cancelled: workers are told not to attend",
}

export function PostShiftPage({
  editShift,
  clearEdit,
  setPage,
}: {
  editShift: ShiftProps | null
  clearEdit: () => void
  setPage: (p: Page) => void
}) {
  const { addShift, updateShift } = usePortal()
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const [form, setForm] = useState({
    client: editShift?.client ?? "",
    location: editShift?.shiftLocation ?? "",
    postCode: editShift?.shiftPostCode ?? "",
    category: editShift?.category ?? CATEGORIES[0],
    date: editShift?.shiftDate ?? "",
    startTime: editShift?.clockIn ?? "",
    endTime: editShift?.clockOut ?? "",
    pay: editShift ? editShift.shiftPay : 0,
    needed: editShift ? editShift.number_of_needed_employee : 1,
    status: editShift?.status ?? "active",
    breaktime: editShift?.breakMinutes ?? 30,
    notes: editShift?.notes ?? "",
  })

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function validate() {
    const e: Record<string, string> = {}
    if (!form.client.trim()) e.client = "Client is required"
    if (!form.location.trim()) e.location = "Location is required"
    if (!form.date) e.date = "Date is required"
    if (!form.startTime) e.startTime = "Start time required"
    if (!form.endTime) e.endTime = "End time required"
    if (!form.pay || Number(form.pay) <= 0) e.pay = "Enter a valid pay rate"
    if (!form.needed || Number(form.needed) <= 0) e.needed = "Enter workers needed"
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function calculateTotalHours() {
  if (!form.startTime || !form.endTime) return 0
  const [sh, sm] = form.startTime.split(":").map(Number)
  const [eh, em] = form.endTime.split(":").map(Number)
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return 0

  const startM = sh * 60 + sm
  let endM = eh * 60 + em
  if (endM <= startM) endM += 24 * 60 // shift runs past midnight

  return Math.round(((endM - startM) / 60) * 100) / 100
}
  function calculateHourlyRate() {
    const totalHours = calculateTotalHours()
    if (totalHours === 0) return 0
    return Number((form.pay / totalHours).toFixed(2))
  }

  function calculateYearWeek(dateString: string) {
    const date = new Date(dateString)
    const year = date.getFullYear()
    const firstDayOfYear = new Date(year, 0, 1)
    const pastDaysOfYear = (date.valueOf() - firstDayOfYear.valueOf()) / 86400000
    const weekNumber = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7)
    return `${year}-W${String(weekNumber).padStart(2, "0")}`
  }

  function calculateYearMonth(dateString: string) {
    const date = new Date(dateString)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, "0")
    return `${year}-${month}`
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault()
    setSaveError(null)
    if (!validate()) return

    const base: Omit<ShiftProps, "id"> = {
      client: form.client.trim(),
      shiftLocation: form.location.trim(),
      shiftPostCode: form.postCode.trim(),
      category: form.category,
      shiftDate: form.date,
      clockIn: form.startTime,
      clockOut: form.endTime,
      regularHours: calculateTotalHours(),
      shiftPay: Number(Number(form.pay).toFixed(2)),
      number_of_needed_employee: Number(form.needed),
      status: form.status as ShiftProps["status"],
      breakMinutes: Number(form.breaktime),
      hourlyRate: calculateHourlyRate(),
      yearWeek: calculateYearWeek(form.date),
      yearMonth: calculateYearMonth(form.date),
      userId: editShift?.userId ?? [],
      appliedEmployee: editShift?.appliedEmployee ?? [],
      approvedEmployee: editShift?.approvedEmployee ?? [],
      notes: form.notes.trim(),
    }

    setSaving(true)
    try {
      if (editShift?.id) {
        await updateShift({ ...base, id: editShift.id })
      } else {
        await addShift(base)
      }
      clearEdit()
      setPage("shifts")
    } catch (err: any) {
      console.error("Error saving shift:", err)
      setSaveError(err?.message ?? "Failed to save shift")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PortalTopbar
        title={editShift ? `Edit Shift · ${editShift.id}` : "Post New Shift"}
        subtitle={editShift ? "Update the shift details below" : "Fill in the details to publish a new shift"}
      />

      <div className="p-5 md:p-8">
        <form
          onSubmit={handleSubmit}
          className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-border bg-card"
        >
          <div className="border-b border-border px-6 py-4">
            <h2 className="font-display font-bold text-foreground">Shift Details</h2>
          </div>

          <div className="grid grid-cols-1 gap-5 p-6 sm:grid-cols-2">
            <Field label="Client" error={errors.client}>
              <input
                className={inputCls}
                value={form.client}
                onChange={(e) => set("client", e.target.value)}
                placeholder="e.g. Amazon Fulfilment"
              />
            </Field>
            <Field label="Category">
              <select className={inputCls} value={form.category} onChange={(e) => set("category", e.target.value)}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Location" error={errors.location} className="sm:col-span-2">
              <input
                className={inputCls}
                value={form.location}
                onChange={(e) => set("location", e.target.value)}
                placeholder="e.g. Coventry, CV2"
              />
            </Field>
            <Field label="Post Code" error={errors.postCode} className="sm:col-span-2">
              <input
                className={inputCls}
                value={form.postCode}
                onChange={(e) => set("postCode", e.target.value)}
                placeholder="A12 3BC"
              />
            </Field>

            <Field label="Date" error={errors.date}>
              <input
                type="date"
                className={inputCls}
                value={form.date}
                onChange={(e) => set("date", e.target.value)}
              />
            </Field>

            <Field label="Start time" error={errors.startTime}>
              <input
                type="time"
                className={inputCls}
                value={form.startTime}
                onChange={(e) => set("startTime", e.target.value)}
              />
            </Field>
            <Field label="End time" error={errors.endTime}>
              <input
                type="time"
                className={inputCls}
                value={form.endTime}
                onChange={(e) => set("endTime", e.target.value)}
              />
            </Field>

            <Field label="Pay (£ / hour)" error={errors.pay}>
              <input
                type="number"
                step="0.01"
                min="0"
                className={inputCls}
                value={form.pay}
                onChange={(e) => set("pay", Number(e.target.value))}
                placeholder="13.50"
              />
            </Field>
            <Field label="Shift Total Hours (hr)">
              <div className={inputCls}>{calculateTotalHours()}</div>
            </Field>

            <Field label="Break time">
              <select
                className={inputCls}
                value={form.breaktime}
                onChange={(e) => set("breaktime", Number(e.target.value))}
              >
                {[20, 30, 60].map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes === 60 ? "1 hr" : `${minutes} mins`}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Workers needed" error={errors.needed}>
              <input
                type="number"
                min="1"
                className={inputCls}
                value={form.needed}
                onChange={(e) => set("needed", Number(e.target.value))}
                placeholder="1"
              />
            </Field>
            <Field label="Note" error={errors.notes} className="sm:col-span-2">
              <textarea
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                placeholder="Shift description"
                className={cn(inputCls, "min-h-24")}
              />
            </Field>

            {editShift && (
              <Field label="Status">
                {/* status only moves forward: an active shift can be closed or cancelled; a closed one is final */}
                <select
                  className={inputCls}
                  value={form.status}
                  onChange={(e) => set("status", e.target.value as ShiftProps["status"])}
                  disabled={editShift.status !== "active"}
                >
                  {(editShift.status === "active" ? STATUS_VALUES : [editShift.status]).map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
                {editShift.status !== "active" && (
                  <p className="mt-1 text-xs text-muted-foreground">This shift is closed, so its status can&apos;t change.</p>
                )}
              </Field>
            )}
          </div>

          {saveError && <p className="px-6 pb-2 text-sm font-medium text-destructive">{saveError}</p>}

          <div className="flex flex-col-reverse gap-3 border-t border-border px-6 py-4 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => {
                clearEdit()
                setPage("shifts")
              }}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
            >
              <X size={16} /> Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {saving ? (
                "Saving…"
              ) : editShift ? (
                <>
                  <Check size={16} /> Update Shift
                </>
              ) : (
                <>
                  <Plus size={16} /> Publish Shift
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
