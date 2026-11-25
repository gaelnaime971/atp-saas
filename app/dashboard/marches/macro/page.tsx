import type { Metadata } from 'next'
import MarketsPlaceholder from '@/components/terminal/MarketsPlaceholder'

export const metadata: Metadata = { title: 'Macro US · Marchés · ATP' }

export default function MacroPage() {
  return (
    <MarketsPlaceholder
      group={"Analyse"}
      title={"Macro US"}
      subtitle={"Les séries qui pilotent les indices US."}
      description={"Taux 2 et 10 ans, taux réel 10 ans, inflation attendue, liquidité de la Fed, inscriptions au chômage et GDPNow."}
      sources={"FRED, Fed d'Atlanta"}
    />
  )
}
