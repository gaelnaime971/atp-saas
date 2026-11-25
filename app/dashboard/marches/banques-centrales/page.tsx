import type { Metadata } from 'next'
import MarketsPlaceholder from '@/components/terminal/MarketsPlaceholder'

export const metadata: Metadata = { title: 'Banques centrales · Marchés · ATP' }

export default function BanquesCentralesPage() {
  return (
    <MarketsPlaceholder
      group={"Agenda"}
      title={"Banques centrales"}
      subtitle={"Fed, BCE, BoJ."}
      description={"Taux directeurs, dernière décision et prochaine réunion d'après les sources officielles, avec les probabilités implicites pour la Fed."}
      sources={"Fed, BCE, BoJ, Fed d'Atlanta (Market Probability Tracker)"}
    />
  )
}
