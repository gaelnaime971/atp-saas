import type { Metadata } from 'next'
import MarketsPlaceholder from '@/components/terminal/MarketsPlaceholder'

export const metadata: Metadata = { title: 'Saisonnalité · Marchés · ATP' }

export default function SaisonnalitePage() {
  return (
    <MarketsPlaceholder
      group={"Analyse"}
      title={"Saisonnalité"}
      subtitle={"Ce que font les indices US, mois par mois."}
      description={"Le comportement moyen du S&P 500 mois par mois, le cycle présidentiel (2026 est une année de mi-mandat) et ta propre saisonnalité tirée de ton journal."}
      sources={"Shiller, ton journal ATP"}
    />
  )
}
