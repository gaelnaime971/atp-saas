import type { Metadata } from 'next'
import MarketsPlaceholder from '@/components/terminal/MarketsPlaceholder'

export const metadata: Metadata = { title: 'Sessions & horaires · Marchés · ATP' }

export default function SessionsPage() {
  return (
    <MarketsPlaceholder
      group={"Global"}
      title={"Sessions & horaires"}
      subtitle={"Asie, Londres, New York, à ton heure."}
      description={"Les sessions et leurs chevauchements, les échéances trimestrielles, le roll NQ et YM, les OPEX mensuelles, les jours fériés et les clôtures anticipées."}
      sources={"calendriers officiels des places de marché"}
    />
  )
}
