import type { ReactNode } from 'react'
import type { Viewport } from 'next'

// Mobile : même réglage que app/dashboard/layout.tsx (marges de sécurité
// iPhone gérées par AppShell avec env(safe-area-inset-*)).
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' }

export default function AdminDashboardLayout({ children }: { children: ReactNode }) {
  return children
}
