import { notFound } from 'next/navigation'
import { Oxanium, Manrope } from 'next/font/google'
import { checkJarvisAccess } from '@/lib/jarvis/access'
import JarvisRulesForm from '@/components/jarvis/JarvisRulesForm'

const oxanium = Oxanium({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-oxanium', display: 'swap' })
const manrope = Manrope({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-manrope', display: 'swap' })

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Mes règles — Jarvis', robots: { index: false, follow: false } }

export default async function JarvisRulesPage() {
  const access = await checkJarvisAccess()
  if (!access) notFound()
  return (
    <div className={`${oxanium.variable} ${manrope.variable}`}>
      <JarvisRulesForm email={access.user.email} />
    </div>
  )
}
