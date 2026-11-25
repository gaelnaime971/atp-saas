import type { Metadata } from 'next'
import MarketsPlaceholder from '@/components/terminal/MarketsPlaceholder'

export const metadata: Metadata = { title: 'COT · Marchés · ATP' }

export default function CotPage() {
  return (
    <MarketsPlaceholder
      group={"Positionnement"}
      title={"COT"}
      subtitle={"Qui est acheteur, qui est vendeur."}
      description={"Le positionnement hebdomadaire des spéculateurs, des institutionnels et des banques sur NQ, YM, ES et ZN."}
      sources={"CFTC"}
    />
  )
}
