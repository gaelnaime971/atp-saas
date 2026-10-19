import { notFound } from 'next/navigation'
import { checkJarvisAccess } from '@/lib/jarvis/access'
import JarvisPoc from '@/components/jarvis/JarvisPoc'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Jarvis — POC',
  robots: { index: false, follow: false },
}

/**
 * Page cachée (URL directe, absente de toute nav) — 404 pour tout
 * compte hors JARVIS_ALLOWED_EMAILS ou si JARVIS_ENABLED !== 'true'.
 * Même gate côté API /api/jarvis/chat.
 */
export default async function JarvisPage() {
  const access = await checkJarvisAccess()
  if (!access) notFound()
  return <JarvisPoc email={access.user.email} />
}
