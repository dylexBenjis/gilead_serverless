import type { ShiftProps } from "@/app/schemas/shift_schema"

type Entry = ShiftProps["approvedEmployee"][number]

// Did this worker work it? Matches the server's rule (app/api/_shift.ts attended()).
export function attended(e: Pick<Entry, "userClockIn" | "attendance"> | undefined) {
  if (!e) return false
  if (e.attendance) return e.attendance === "completed"
  return !!e.userClockIn
}

export type Reliability = {
  attended: number // closed shifts they worked
  incomplete: number // closed shifts they were assigned to and didn't work
  withdrew: number // dropped out after being assigned
  rate: number | null // attended ÷ (attended + incomplete + withdrew), null with no history
}

// A worker's record across all closed shifts. Cancelled shifts don't count against anyone.
export function reliabilityByWorker(shifts: ShiftProps[]) {
  const map = new Map<string, Reliability>()
  const get = (uid: string) => {
    let r = map.get(uid)
    if (!r) map.set(uid, (r = { attended: 0, incomplete: 0, withdrew: 0, rate: null }))
    return r
  }
  for (const s of shifts) {
    for (const w of s.withdrawals ?? []) if (w.wasAssigned) get(w.id).withdrew++
    if (s.status !== "completed" && s.status !== "incomplete") continue
    for (const e of s.approvedEmployee ?? []) {
      if (!e?.id) continue
      if (attended(e)) get(e.id).attended++
      else get(e.id).incomplete++
    }
  }
  for (const r of map.values()) {
    const total = r.attended + r.incomplete + r.withdrew
    r.rate = total ? Math.round((r.attended / total) * 100) : null
  }
  return map
}

// "92% · 11 worked · 1 incomplete · 0 withdrew"
export function describeReliability(r: Reliability | undefined) {
  if (!r || r.rate === null) return "No shift history yet"
  return `${r.rate}% reliable · ${r.attended} worked · ${r.incomplete} incomplete · ${r.withdrew} withdrew`
}

export function reliabilityTone(r: Reliability | undefined) {
  if (!r || r.rate === null) return "text-muted-foreground"
  if (r.rate >= 90) return "text-[var(--chart-3)]"
  if (r.rate >= 70) return "text-amber-600"
  return "text-destructive"
}
