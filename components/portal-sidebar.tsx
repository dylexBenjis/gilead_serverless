import {
  LayoutDashboard,
  ListChecks,
  CalendarPlus,
  Users,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { GileadMark } from "./ui/gilead-logo"

export type Page = "dashboard" | "shifts" | "post-shift" | "workers"

const NAV: { id: Page; icon: typeof LayoutDashboard; label: string }[] = [
  { id: "dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { id: "shifts", icon: ListChecks, label: "Manage Shifts" },
  { id: "post-shift", icon: CalendarPlus, label: "Post Shift" },
  { id: "workers", icon: Users, label: "Workers" },
]

export function PortalSidebar({
  page,
  setPage,
  collapsed,
  setCollapsed,
  user
}: {
  page: Page
  setPage: (p: Page) => void
  collapsed: boolean
  setCollapsed: (v: boolean) => void
  user:any
}) {
 
  const logout =()=>{
    window.location.href='/auth/logout'
  }

  return (
    <aside
      className={cn(
        "flex h-dvh shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-300",
        collapsed ? "w-[72px]" : "w-64",
      )}
    >
      {/* Logo */}
      <div className="flex min-h-[72px] items-center gap-3 border-b border-sidebar-border px-4">
        <GileadMark size={36} />
        {!collapsed && (
          <div className="leading-tight">
            <p className="font-display text-sm font-extrabold tracking-wide">GILEAD</p>
            <p className="text-[10px] font-semibold tracking-[0.18em] text-sidebar-accent">
              ADMIN PORTAL
            </p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-1 p-3">
        {NAV.map(({ id, icon: Icon, label }) => {
          const active = page === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => setPage(id)}
              title={collapsed ? label : undefined}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                collapsed && "justify-center",
                active
                  ? "bg-sidebar-accent text-primary-foreground"
                  : "text-sidebar-muted hover:bg-white/5 hover:text-sidebar-foreground",
              )}
            >
              <Icon size={19} className="shrink-0" />
              {!collapsed && <span className="truncate">{label}</span>}
            </button>
          )
        })}
      </nav>

      {/* Account */}
      <div className="border-t border-sidebar-border p-3">
        <div
          className={cn(
            "flex items-center gap-3 rounded-xl px-2 py-2",
            collapsed && "justify-center",
          )}
        >
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-sm font-bold text-primary-foreground">
            {user?.name
              ? user.name.split(" ").map((n) => n[0]).join("")
              : "A"}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-semibold">{user?.name ?? "Admin"}</p>
              <p className="truncate text-[11px] text-sidebar-muted">{user?.email}</p>
            </div>
          )}
          {!collapsed && (
            <button
              type="button"
              onClick={logout}
              title="Sign out"
              className="rounded-lg p-1.5 text-sidebar-muted transition-colors hover:bg-white/5 hover:text-sidebar-foreground"
            >
              <LogOut size={17} />
              <span className="sr-only">Sign out</span>
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            "mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-sidebar-muted transition-colors hover:bg-white/5 hover:text-sidebar-foreground",
            collapsed && "justify-center",
          )}
        >
          {collapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  )
}
