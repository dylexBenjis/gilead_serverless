"use client"

import { Bell, Search } from "lucide-react"

export function PortalTopbar({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  action?: React.ReactNode
}) {
  return (
    <header className="sticky top-0 z-10 flex flex-wrap items-center gap-4 border-b border-border bg-background/80 px-5 py-4 backdrop-blur md:px-8">
      <div className="min-w-0 flex-1">
        <h1 className="font-display text-xl font-bold text-foreground md:text-2xl">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-0.5 truncate text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>

      <div className="hidden items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 md:flex">
        <Search size={16} className="text-muted-foreground" />
        <input
          type="search"
          placeholder="Search…"
          className="w-40 bg-transparent text-sm outline-none placeholder:text-muted-foreground lg:w-56"
          aria-label="Search"
        />
      </div>

      <button
        type="button"
        className="relative rounded-xl border border-border bg-card p-2.5 text-muted-foreground transition-colors hover:text-foreground"
        aria-label="Notifications"
      >
        <Bell size={18} />
        <span className="absolute right-2 top-2 size-2 rounded-full bg-destructive" />
      </button>

      {action}
    </header>
  )
}
