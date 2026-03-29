import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)' }}>

      {/* Header */}
      <header
        className="sticky top-0 z-50 flex items-center justify-between px-8 py-4 border-b"
        style={{ background: 'rgba(10,12,15,0.85)', borderColor: 'var(--border)', backdropFilter: 'blur(12px)' }}
      >
        <img src="/logo-atp.png" alt="Alpha Trading Pro" style={{ height: 32 }} />

        <Link
          href="/login"
          className="px-4 py-2 rounded-lg text-sm font-semibold transition-all"
          style={{ background: 'var(--green)', color: '#0f1117' }}
        >
          Connexion
        </Link>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-24 text-center">

        {/* Badge */}
        <div
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-xs font-medium mb-8"
          style={{ borderColor: 'rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.05)', color: '#22c55e' }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          Plateforme de coaching trading professionnelle
        </div>

        {/* Headline */}
        <h1
          className="text-5xl font-bold leading-tight tracking-tight max-w-3xl mb-6"
          style={{ color: 'var(--text)' }}
        >
          Gérez votre activité de{' '}
          <span className="text-green-400">coaching trading</span>{' '}
          au même endroit
        </h1>

        {/* Subheadline */}
        <p
          className="text-lg max-w-xl mb-12 leading-relaxed"
          style={{ color: 'var(--text2)' }}
        >
          Suivez vos performances, gérez vos comptes prop firm,
          progressez avec votre coach et atteignez vos objectifs
          de trading depuis votre espace personnel.
        </p>

        {/* CTA */}
        <div className="flex items-center gap-4 mb-20">
          <Link
            href="/login"
            className="px-6 py-3 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
            style={{ background: 'var(--green)', color: '#0f1117' }}
          >
            Accéder à mon espace →
          </Link>
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-3 gap-5 max-w-3xl w-full">
          {[
            {
              icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              ),
              title: 'Suivi des performances',
              desc: 'P&L, winrate, R-multiple — toutes les métriques essentielles par trader en temps réel.',
            },
            {
              icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              ),
              title: 'Sessions & calendrier',
              desc: 'Planifiez et gérez vos sessions de coaching, notes et objectifs par trader.',
            },
            {
              icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              ),
              title: 'Accès par invitation',
              desc: 'Invitez vos traders par code — chaque élève accède à son espace personnel sécurisé.',
            },
            {
              icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ),
              title: 'Gestion des revenus',
              desc: 'Suivez vos paiements et votre chiffre d\'affaires mensuel par élève et par offre.',
            },
            {
              icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              ),
              title: 'Bibliothèque de ressources',
              desc: 'Partagez vidéos, PDFs et documents pédagogiques avec l\'ensemble de vos traders.',
            },
            {
              icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              ),
              title: 'Journal & checklist',
              desc: 'Vos traders loggent chaque session, suivent leur checklist et tiennent un journal de trading.',
            },
          ].map(f => (
            <div
              key={f.title}
              className="text-left p-5 rounded-xl border transition-all hover:border-[rgba(255,255,255,0.12)]"
              style={{ background: 'var(--bg2)', borderColor: 'var(--border)' }}
            >
              <div className="w-9 h-9 rounded-lg bg-green-500/10 border border-green-500/15 flex items-center justify-center text-green-400 mb-4">
                {f.icon}
              </div>
              <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text)' }}>{f.title}</h3>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text3)' }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer
        className="border-t px-8 py-5 flex items-center justify-between"
        style={{ borderColor: 'var(--border)' }}
      >
        <p className="text-xs" style={{ color: 'var(--text3)' }}>
          © 2026 ATP Coaching — Tous droits réservés
        </p>
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
          <span className="text-xs" style={{ color: 'var(--text3)' }}>Plateforme opérationnelle</span>
        </div>
      </footer>

    </div>
  )
}
