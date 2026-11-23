'use client'
import { useEffect, useState } from "react"
import { PortalSidebar, type Page } from "@/components/portal-sidebar"
import { DashboardPage } from "@/components/pages/dashboard-page"
import { ShiftsPage } from "@/components/pages/shifts-page"
import { PostShiftPage } from "@/components/pages/post-shift-page"
import { EmployeesPage } from "@/components/pages/workers-page"
import { auth0 } from "@/lib/auth0"
import { useUser } from "@auth0/nextjs-auth0"
import { GileadLogo, GileadMark } from "./ui/gilead-logo"

export function PortalShell() {
  const {user, isLoading} = useUser()
  const [page, setPage] = useState<Page>("dashboard")
  const [collapsed, setCollapsed] = useState(false)
  const [editShift, setEditShift] = useState<any>(null)


  if(isLoading){
    return (<div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-zinc-950 text-white">

            <span className="text-2xl font-black tracking-widest text-white"><GileadMark size={50}/></span>
            <p className="mt-4 flex items-center gap-2 text-sm font-medium tracking-wide text-zinc-400">
              <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              Loading session...
            </p>
          </div>
    )
  }
  if(!user){
return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950 px-4 text-white">
      {/* Background glow effect */}
      <div className="absolute h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl" />

      {/* Auth Card */}
      <div className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-900/90 p-8 shadow-2xl backdrop-blur-xl">
        
        {/* Brand/Header */}
        <div className="mb-8 text-center">
          <div className="mb-3">
          <GileadLogo size={100}/></div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Welcome</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Sign in to your account
          </p>
        </div>

        {/* Buttons */}
        <div className="flex flex-col gap-3">
          {/* Sign Up (Primary CTA) */}
          {/* <a
            href="/auth/login?screen_hint=signup"
            className="flex w-full items-center justify-center rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white shadow-md shadow-indigo-600/20 transition-all hover:bg-indigo-500 active:scale-[0.98]"
          >
            Create Account
          </a> */}

          {/* Log In (Secondary CTA) */}
          <a
            href="/auth/login"
            className="flex w-full items-center justify-center rounded-xl border border-zinc-700/80 bg-zinc-800/50 py-3 text-sm font-semibold text-zinc-200 transition-all hover:border-zinc-600 hover:bg-zinc-800 hover:text-white active:scale-[0.98]"
          >
            Sign In
          </a>
        </div>

        {/* Footer note */}
        <p className="mt-6 text-center text-xs text-zinc-500">
          By continuing, you agree to our Terms of Service & Privacy Policy.
        </p>
      </div>
    </div>
  );
  }
  function goEdit(s: any) {
    setEditShift(s)
    setPage("post-shift")
  }

  function navigate(p: Page) {
    if (p !== "post-shift") setEditShift(null)
    setPage(p)
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <PortalSidebar
        page={page}
        setPage={navigate}
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        user={user}
      />
      <main className="flex-1 overflow-y-auto">
        {page === "dashboard" && <DashboardPage setPage={navigate} />}
        {page === "shifts" && <ShiftsPage setPage={navigate} user={user} onEdit={goEdit} />}
        {page === "post-shift" && (
          <PostShiftPage
            editShift={editShift}
            clearEdit={() => setEditShift(null)}
            setPage={navigate}
          />
        )}
        {page === "workers" && <EmployeesPage />}
      </main>
    </div>
  )
}
