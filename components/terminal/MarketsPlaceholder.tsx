import PageHeader from '@/components/ui/PageHeader'
import EmptyState from '@/components/ui/EmptyState'

/**
 * Écran Marchés pas encore construit (étape 1 : menu seul). Chaque page
 * dit ce qui arrive et d'où viendront les données. Zéro donnée affichée.
 */
export interface MarketsPlaceholderProps {
  group: string
  title: string
  subtitle: string
  description: string
  sources?: string
}

export default function MarketsPlaceholder({ group, title, subtitle, description, sources }: MarketsPlaceholderProps) {
  return (
    <div className="flex flex-col gap-6" style={{ maxWidth: '72rem' }}>
      <PageHeader breadcrumb={<>Marchés · {group}</>} title={title} subtitle={subtitle} />
      <EmptyState
        variant="dashed"
        title="Écran en préparation"
        description={
          <>
            {description}
            {sources && (
              <span style={{ display: 'block', marginTop: '0.75rem', color: 'var(--color-text-3)', fontSize: 'var(--text-label)' }}>
                Sources prévues : {sources}
              </span>
            )}
          </>
        }
      />
    </div>
  )
}
