import type { Metadata } from 'next'
import MarketsPlaceholder from '@/components/terminal/MarketsPlaceholder'

export const metadata: Metadata = { title: 'Sentiment de risque · Marchés · ATP' }

export default function SentimentPage() {
  return (
    <MarketsPlaceholder
      group={"Positionnement"}
      title={"Sentiment de risque"}
      subtitle={"Appétit ou aversion pour le risque, en un score."}
      description={"Un score de 0 à 100 bâti sur 7 composantes publiques : stress financier, risque de marché, crédit, taux réel 10 ans, liquidité de la Fed, courbe 10 ans − 2 ans et positionnement des institutionnels sur ES et NQ."}
      sources={"FRED, CFTC"}
    />
  )
}
