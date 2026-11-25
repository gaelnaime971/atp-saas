import type { Metadata } from 'next'
import MarketsPlaceholder from '@/components/terminal/MarketsPlaceholder'

export const metadata: Metadata = { title: 'Vue d\'ensemble · Marchés · ATP' }

export default function OverviewPage() {
  return (
    <MarketsPlaceholder
      group={"Global"}
      title={"Vue d'ensemble"}
      subtitle={"L'essentiel des marchés en un écran."}
      description={"Les sessions du jour à ton heure, les prochaines publications, le positionnement et le sentiment de risque, rassemblés ici au fil des étapes."}
    />
  )
}
