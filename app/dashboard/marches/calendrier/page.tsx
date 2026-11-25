import type { Metadata } from 'next'
import MarketsPlaceholder from '@/components/terminal/MarketsPlaceholder'

export const metadata: Metadata = { title: 'Calendrier éco · Marchés · ATP' }

export default function CalendrierPage() {
  return (
    <MarketsPlaceholder
      group={"Agenda"}
      title={"Calendrier éco"}
      subtitle={"Les publications qui font bouger NQ et YM."}
      description={"Publications officielles US avec heure, impact et chiffre publié, FOMC et discours des gouverneurs, adjudications à 10 et 30 ans, résultats des plus grosses pondérations du Nasdaq-100 et du Dow, et les fenêtres ATP ±15 min."}
      sources={"BLS, BEA, Census, DOL, Fed, Trésor"}
    />
  )
}
