import { PortalProvider } from "@/components/portal-store"
import { PortalShell } from "@/components/portal-shell"

export default function Home() {
  return (
    <PortalProvider>
      <PortalShell />
    </PortalProvider>
  )
}
