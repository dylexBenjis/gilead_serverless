"use client"

import { useMemo } from "react"
import {
  Area,
  AreaChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  ArrowUpRight,
  Plus,
  TrendingDown,
  TrendingUp,
  Users,
  CalendarCheck,
  PoundSterling,
  Clock,
} from "lucide-react"
import { usePortal } from "@/components/portal-store"
import { PortalTopbar } from "@/components/portal-topbar"
import type { Page } from "@/components/portal-sidebar"
import type { ShiftProps } from "@/app/schemas/shift_schema"

const CATEGORY_COLORS: Record<string, string> = {
  Warehouse: "var(--chart-1)",
  Hospitality: "var(--chart-2)",
  Security: "var(--chart-3)",
  Events: "var(--chart-4)",
  Healthcare: "var(--chart-5)",
  Driving: "var(--chart-3)",
  Cleaning: "var(--chart-4)",
  Admin: "var(--muted-foreground)",
}

const STATUSES: ShiftProps["status"][] = ["active", "completed", "incomplete", "cancelled"]

const STATUS_META: Record<ShiftProps["status"], { dot: string; badge: string }> = {
  active: { dot: "bg-primary", badge: "border-primary/30 bg-primary/10 text-primary" },
  completed: {
    dot: "bg-[var(--chart-3)]",
    badge: "border-[var(--chart-3)]/30 bg-[var(--chart-3)]/10 text-[var(--chart-3)]",
  },
  incomplete: { dot: "bg-amber-500", badge: "border-amber-500/30 bg-amber-500/10 text-amber-600" },
  cancelled: {
    dot: "bg-destructive",
    badge: "border-destructive/30 bg-destructive/10 text-destructive",
  },
}

function formatDate(dateString?: string) {
  if (!dateString) return "—"
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return dateString
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" })
}

function Kpi({
  label,
  value,
  sub,
  trend,
  up,
  icon: Icon,
}: {
  label: string
  value: string
  sub: string
  trend?: string
  up: boolean
  icon: typeof Users
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <div className="flex size-9 items-center justify-center rounded-xl bg-primary/12 text-primary">
          <Icon size={17} />
        </div>
      </div>
      <p className="font-display text-3xl font-bold text-foreground">{value}</p>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{sub}</span>
        {trend && (
          <span
            className={`inline-flex items-center gap-1 text-xs font-semibold ${
              up ? "text-primary" : "text-destructive"
            }`}
          >
            {up ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
            {trend}
          </span>
        )}
      </div>
    </div>
  )
}

export function DashboardPage({ setPage }: { setPage: (p: Page) => void }) {
  const { shifts, loading } = usePortal()

  const stats = useMemo(() => {
    const totalNeeded = shifts.reduce((a, s) => a + (s.number_of_needed_employee ?? 0), 0)
    const totalFilled = shifts.reduce((a, s) => a + (s.approvedEmployee?.length ?? 0), 0)
    const openCount = shifts.filter(
      (s) => s.status === "active" && (s.approvedEmployee?.length ?? 0) < (s.number_of_needed_employee ?? 0),
    ).length
    const fillRate = totalNeeded ? Math.round((totalFilled / totalNeeded) * 100) : 0
    const avgPay = shifts.length
      ? shifts.reduce((a, s) => a + (s.hourlyRate ?? 0), 0) / shifts.length
      : 0
    return { totalFilled, openCount, fillRate, avgPay }
  }, [shifts])

  const statusCounts = useMemo(() => {
    const map = new Map<ShiftProps["status"], number>()
    STATUSES.forEach((s) => map.set(s, 0))
    shifts.forEach((s) => map.set(s.status, (map.get(s.status) ?? 0) + 1))
    return map
  }, [shifts])

  const categoryData = useMemo(() => {
    const map = new Map<string, number>()
    shifts.forEach((s) => map.set(s.category || "Uncategorized", (map.get(s.category || "Uncategorized") ?? 0) + 1))
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
  }, [shifts])

  const weeklyData = useMemo(() => {
    const map = new Map<string, { week: string; posted: number; filled: number }>()
    shifts.forEach((s) => {
      const key = s.yearWeek || "Unknown"
      const entry = map.get(key) ?? { week: key.replace(/^\d{4}-/, ""), posted: 0, filled: 0 }
      entry.posted += s.number_of_needed_employee ?? 0
      entry.filled += s.approvedEmployee?.length ?? 0
      map.set(key, entry)
    })
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-7)
      .map(([, v]) => v)
  }, [shifts])

  const recent = useMemo(
    () =>
      [...shifts]
        .sort((a, b) => (b.shiftDate || "").localeCompare(a.shiftDate || ""))
        .slice(0, 5),
    [shifts],
  )

  return (
    <>
      <PortalTopbar
        title="Dashboard"
        subtitle="Operations overview"
        action={
          <button
            type="button"
            onClick={() => setPage("post-shift")}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus size={16} /> Post Shift
          </button>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center py-24 text-sm text-muted-foreground">
          Loading dashboard…
        </div>
      ) : shifts.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
          <p className="text-sm text-muted-foreground">No shifts posted yet.</p>
          <button
            type="button"
            onClick={() => setPage("post-shift")}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus size={16} /> Post your first shift
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-6 p-5 md:p-8">
          {/* KPIs */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Total Shifts" value={String(shifts.length)} sub="all time" up icon={CalendarCheck} />
            <Kpi
              label="Positions Filled"
              value={String(stats.totalFilled)}
              sub={`${stats.fillRate}% fill rate`}
              up
              icon={Users}
            />
            <Kpi label="Open Shifts" value={String(stats.openCount)} sub="awaiting workers" up={false} icon={Clock} />
            <Kpi
              label="Avg. Pay / hr"
              value={`£${stats.avgPay.toFixed(2)}`}
              sub="across all shifts"
              up
              icon={PoundSterling}
            />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="rounded-2xl border border-border bg-card p-5 lg:col-span-2">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="font-display font-bold text-foreground">Positions Posted vs Filled</h2>
                  <p className="text-xs text-muted-foreground">By week</p>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <span className="size-2.5 rounded-full bg-[var(--chart-2)]" /> Posted
                  </span>
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <span className="size-2.5 rounded-full bg-primary" /> Filled
                  </span>
                </div>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={weeklyData} margin={{ left: -20, right: 8, top: 8 }}>
                    <defs>
                      <linearGradient id="gPosted" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gFilled" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="week" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 12,
                        border: "1px solid var(--border)",
                        background: "var(--card)",
                        fontSize: 12,
                      }}
                    />
                    <Area type="monotone" dataKey="posted" stroke="var(--chart-2)" strokeWidth={2} fill="url(#gPosted)" />
                    <Area type="monotone" dataKey="filled" stroke="var(--primary)" strokeWidth={2} fill="url(#gFilled)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5">
              <h2 className="font-display font-bold text-foreground">By Category</h2>
              <p className="text-xs text-muted-foreground">Shift distribution</p>
              <div className="mx-auto h-44 w-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={categoryData} dataKey="value" nameKey="name" innerRadius={48} outerRadius={72} paddingAngle={2}>
                      {categoryData.map((c) => (
                        <Cell key={c.name} fill={CATEGORY_COLORS[c.name] ?? "var(--muted-foreground)"} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        borderRadius: 12,
                        border: "1px solid var(--border)",
                        background: "var(--card)",
                        fontSize: 12,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 flex flex-col gap-2">
                {categoryData.map((c) => (
                  <div key={c.name} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <span
                        className="size-2.5 rounded-full"
                        style={{ background: CATEGORY_COLORS[c.name] ?? "var(--muted-foreground)" }}
                      />
                      {c.name}
                    </span>
                    <span className="font-semibold text-foreground">{c.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Status + recent */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="rounded-2xl border border-border bg-card p-5">
              <h2 className="font-display font-bold text-foreground">Shift Status</h2>
              <p className="mb-4 text-xs text-muted-foreground">Breakdown across the pipeline</p>
              <div className="flex flex-col gap-3">
                {STATUSES.map((s) => {
                  const count = statusCounts.get(s) ?? 0
                  const pct = shifts.length ? Math.round((count / shifts.length) * 100) : 0
                  return (
                    <div key={s}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 capitalize text-foreground">
                          <span className={`size-2.5 rounded-full ${STATUS_META[s].dot}`} />
                          {s}
                        </span>
                        <span className="font-semibold text-muted-foreground">{count}</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div className={`h-full rounded-full ${STATUS_META[s].dot}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5 lg:col-span-2">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-display font-bold text-foreground">Recent Shifts</h2>
                <button
                  type="button"
                  onClick={() => setPage("shifts")}
                  className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
                >
                  View all <ArrowUpRight size={14} />
                </button>
              </div>
              <div className="flex flex-col divide-y divide-border">
                {recent.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">{s.client || "Untitled shift"}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {s.shiftLocation} · {formatDate(s.shiftDate)}
                      </p>
                    </div>
                    <span className="hidden text-sm font-semibold text-foreground sm:block">
                      £{(s.shiftPay ?? 0).toFixed(2)}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${STATUS_META[s.status].badge}`}
                    >
                      {s.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
