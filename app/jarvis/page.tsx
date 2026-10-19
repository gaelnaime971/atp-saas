import { notFound } from 'next/navigation'
import { Oxanium, Manrope } from 'next/font/google'
import { checkJarvisAccess } from '@/lib/jarvis/access'
import JarvisVoiceInterface from '@/components/jarvis/JarvisVoiceInterface'

const oxanium = Oxanium({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-oxanium',
  display: 'swap',
})
const manrope = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-manrope',
  display: 'swap',
})

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Jarvis',
  robots: { index: false, follow: false },
}

/**
 * Page cachée — 404 pour tout compte hors JARVIS_ALLOWED_EMAILS ou
 * si JARVIS_ENABLED !== 'true'. Même gate côté API /api/jarvis/*.
 */
export default async function JarvisPage() {
  const access = await checkJarvisAccess()
  if (!access) notFound()
  return (
    <div className={`${oxanium.variable} ${manrope.variable}`}>
      <JarvisVoiceInterface email={access.user.email} />
    </div>
  )
}
