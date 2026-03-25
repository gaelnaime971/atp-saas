'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Avatar from '@/components/ui/Avatar'

export type DashboardPage =
  | 'dashboard'
  | 'session'
  | 'stats'
  | 'checklist'
  | 'journal'
  | 'propfirm'
  | 'calculateur'
  | 'coaching'
  | 'progression'
  | 'ressources'
  | 'contrat'
  | 'bilan'
  | 'compte'

interface DashboardSidebarProps {
  activePage: DashboardPage
  onPageChange: (page: DashboardPage) => void
}

interface NavSection {
  label: string
  items: { id: DashboardPage; label: string; icon: React.ReactNode }[]
}

const sections: NavSection[] = [
  {
    label: 'Navigation',
    items: [
      {
        id: 'dashboard',
        label: 'Dashboard',
        icon: (
          <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
          </svg>
        ),
      },
      {
        id: 'session',
        label: 'Saisie de session',
        icon: (
          <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
          </svg>
        ),
      },
      {
        id: 'stats',
        label: 'Stats & Performance',
        icon: (
          <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        ),
      },
      {
        id: 'checklist',
        label: 'Checklist',
        icon: (
          <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
      },
      {
        id: 'journal',
        label: 'Journal',
        icon: (
          <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
          </svg>
        ),
      },
      {
        id: 'propfirm',
        label: 'Prop Firm',
        icon: (
          <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
          </svg>
        ),
      },
      {
        id: 'calculateur',
        label: 'Calculateur',
        icon: (
          <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 15.75V18m-7.5-6.75h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25v-.008zm2.498-6.75h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008v-.008zm2.504-6.75h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008v-.008zm1.5 1.5h.008v.008h-.008v-.008zm0-2.25h.008v.008h-.008v-.008zM8.25 6h7.5v2.25h-7.5V6zM6 6.75A.75.75 0 016.75 6h10.5a.75.75 0 01.75.75v10.5a.75.75 0 01-.75.75H6.75a.75.75 0 01-.75-.75V6.75z" />
          </svg>
        ),
      },
    ],
  },
  {
    label: 'Coaching',
    items: [
      {
        id: 'coaching',
        label: 'Sessions coaching',
        icon: (
          <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
          </svg>
        ),
      },
    ],
  },
  {
    label: 'ATP',
    items: [
      {
        id: 'progression',
        label: 'Ma progression',
        icon: (
          <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
          </svg>
        ),
      },
      {
        id: 'ressources',
        label: 'Ressources',
        icon: (
          <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
          </svg>
        ),
      },
      {
        id: 'bilan',
        label: 'Bilan compétences',
        icon: (
          <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
      },
      {
        id: 'contrat',
        label: 'Contrat',
        icon: (
          <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
        ),
      },
    ],
  },
  {
    label: 'Compte',
    items: [
      {
        id: 'compte',
        label: 'Mon compte',
        icon: (
          <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
          </svg>
        ),
      },
    ],
  },
]

export default function DashboardSidebar({ activePage, onPageChange }: DashboardSidebarProps) {
  const router = useRouter()
  const [userName, setUserName] = useState<string>('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    let userId: string | null = null

    const fetchProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      userId = user.id
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, avatar_url')
        .eq('id', user.id)
        .single()
      if (profile?.full_name) setUserName(profile.full_name)
      if (profile?.avatar_url) setAvatarUrl(profile.avatar_url)
    }
    fetchProfile()

    const handleAvatarUpdate = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail.userId === userId) setAvatarUrl(detail.url)
    }
    window.addEventListener('avatar-updated', handleAvatarUpdate)
    return () => window.removeEventListener('avatar-updated', handleAvatarUpdate)
  }, [])

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside
      className="fixed left-0 top-0 h-screen flex flex-col z-40"
      style={{
        width: 240,
        background: 'var(--bg2)',
        borderRight: '1px solid var(--border)',
      }}
    >
      {/* Logo */}
      <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
        <img src="/logo-atp.png" alt="Alpha Trading Pro" style={{ height: 32 }} />
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        {sections.map((section, idx) => (
          <div key={section.label} className={idx > 0 ? 'mt-5' : ''}>
            <p
              className="text-xs font-medium uppercase tracking-wider px-2 mb-3"
              style={{ color: 'var(--text3)' }}
            >
              {section.label}
            </p>
            <ul className="space-y-0.5">
              {section.items.map(item => {
                const isActive = activePage === item.id
                return (
                  <li key={item.id}>
                    <button
                      onClick={() => onPageChange(item.id)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150"
                      style={
                        isActive
                          ? {
                              background: 'rgba(74, 222, 128, 0.08)',
                              color: 'var(--green)',
                              borderLeft: '3px solid var(--green)',
                              paddingLeft: 9,
                            }
                          : {
                              color: 'var(--text2)',
                              borderLeft: '3px solid transparent',
                              paddingLeft: 9,
                            }
                      }
                    >
                      <span style={{ color: isActive ? 'var(--green)' : 'var(--text3)' }}>
                        {item.icon}
                      </span>
                      {item.label}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-3 pb-5 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
        {userName && (
          <div className="px-3 mb-3 flex items-center gap-3">
            <Avatar url={avatarUrl} name={userName} size={32} />
            <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{userName}</p>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150"
          style={{ color: 'var(--text3)' }}
          onMouseEnter={e => {
            e.currentTarget.style.color = '#f87171'
            e.currentTarget.style.background = 'rgba(248, 113, 113, 0.05)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.color = 'var(--text3)'
            e.currentTarget.style.background = 'transparent'
          }}
        >
          <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Deconnexion
        </button>
      </div>
    </aside>
  )
}
