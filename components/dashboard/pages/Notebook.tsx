'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

// ── Types ──────────────────────────────────────────────────────────────────────

type BlockType = 'text' | 'h2' | 'h3' | 'bullet' | 'todo' | 'divider' | 'quote' | 'callout'

interface Block {
  id: string
  type: BlockType
  content: string
  checked?: boolean
}

interface NotebookPage {
  id: string
  trader_id: string
  title: string
  icon: string
  blocks: Block[]
  created_at: string
  updated_at: string
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function emptyBlock(): Block {
  return { id: uid(), type: 'text', content: '' }
}

function wordCount(title: string, blocks: Block[]): number {
  const all = [title, ...blocks.map(b => b.content)].join(' ')
  const words = all.trim().split(/\s+/).filter(Boolean)
  return words.length
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
  })
}

function snippet(blocks: Block[]): string {
  const text = blocks.filter(b => b.type !== 'divider').map(b => b.content).join(' ')
  return text.length > 60 ? text.slice(0, 60) + '...' : text || 'Page vide'
}

// ── Slash command menu items ───────────────────────────────────────────────────

const PAGE_ICONS: string[] = [
  '📝', '📊', '📈', '📉', '🎯', '🧠', '💡', '🔥',
  '⚡', '💰', '📋', '✅', '❌', '⭐', '🏆', '💎',
  '📅', '🕐', '🎓', '📌', '🔑', '💬', '📢', '🛡️',
  '🚀', '🌙', '☀️', '🌊', '🏝️', '🎯', '🧩', '📖',
]

const SLASH_ITEMS: { type: BlockType; label: string; icon: string; desc: string }[] = [
  { type: 'text', label: 'Texte', icon: 'Aa', desc: 'Paragraphe simple' },
  { type: 'h2', label: 'Titre H2', icon: 'H2', desc: 'Grand titre de section' },
  { type: 'h3', label: 'Titre H3', icon: 'H3', desc: 'Sous-titre' },
  { type: 'bullet', label: 'Liste', icon: '•', desc: 'Liste a puces' },
  { type: 'todo', label: 'Todo', icon: '☐', desc: 'Case a cocher' },
  { type: 'divider', label: 'Separateur', icon: '—', desc: 'Ligne horizontale' },
  { type: 'quote', label: 'Citation', icon: '❝', desc: 'Bloc de citation' },
  { type: 'callout', label: 'Callout', icon: '💡', desc: 'Bloc info avec icône' },
]

// ── Component ──────────────────────────────────────────────────────────────────

export default function Notebook() {
  const supabase = createClient()

  // State
  const [userId, setUserId] = useState<string | null>(null)
  const [pages, setPages] = useState<NotebookPage[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [pageIcon, setPageIcon] = useState('📝')
  const [showIconPicker, setShowIconPicker] = useState(false)
  const [blocks, setBlocks] = useState<Block[]>([emptyBlock()])
  const [loading, setLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'idle'>('idle')
  const [search, setSearch] = useState('')
  const [slashMenu, setSlashMenu] = useState<{ blockId: string; top: number; left: number } | null>(null)
  const [slashFilter, setSlashFilter] = useState('')
  const [slashIndex, setSlashIndex] = useState(0)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  // Refs
  const blockRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const titleRef = useRef<HTMLDivElement | null>(null)
  const slashMenuRef = useRef<HTMLDivElement | null>(null)

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchPages = useCallback(async (uid: string) => {
    const { data } = await supabase
      .from('notebook_pages')
      .select('*')
      .eq('trader_id', uid)
      .order('updated_at', { ascending: false })
    if (data) setPages(data as NotebookPage[])
  }, [])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)
      await fetchPages(user.id)
      setLoading(false)
    }
    init()
  }, [])

  // Load active page data when activeId changes
  useEffect(() => {
    const page = pages.find(p => p.id === activeId)
    if (page) {
      setTitle(page.title)
      setPageIcon(page.icon || '📝')
      setBlocks(page.blocks.length > 0 ? page.blocks : [emptyBlock()])
    }
  }, [activeId])

  // ── Auto-save ──────────────────────────────────────────────────────────────

  const scheduleSave = useCallback(() => {
    if (!activeId || !userId) return
    setSaveStatus('saving')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      const now = new Date().toISOString()
      await supabase
        .from('notebook_pages')
        .update({ title, icon: pageIcon, blocks, updated_at: now })
        .eq('id', activeId)

      setPages(prev =>
        prev.map(p => p.id === activeId ? { ...p, title, icon: pageIcon, blocks, updated_at: now } : p)
          .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      )
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2000)
    }, 1500)
  }, [activeId, userId, title, pageIcon, blocks])

  // Trigger auto-save on edits
  useEffect(() => {
    if (activeId) scheduleSave()
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [title, blocks])

  // ── Page operations ────────────────────────────────────────────────────────

  async function createPage() {
    if (!userId) return
    const newBlock = emptyBlock()
    const { data, error } = await supabase
      .from('notebook_pages')
      .insert({ trader_id: userId, title: '', icon: '📝', blocks: [newBlock] })
      .select()
      .single()
    if (data && !error) {
      const page = { ...data, icon: data.icon || '📝' } as NotebookPage
      setPages(prev => [page, ...prev])
      setActiveId(page.id)
      setTitle('')
      setPageIcon('📝')
      setBlocks([newBlock])
      // Focus the title after render
      setTimeout(() => titleRef.current?.focus(), 50)
    }
  }

  async function deletePage(pageId: string) {
    await supabase.from('notebook_pages').delete().eq('id', pageId)
    setPages(prev => prev.filter(p => p.id !== pageId))
    if (activeId === pageId) {
      setActiveId(null)
      setTitle('')
      setBlocks([emptyBlock()])
    }
  }

  // ── Block operations ───────────────────────────────────────────────────────

  const blocksRef = useRef(blocks)
  blocksRef.current = blocks

  function updateBlock(id: string, updates: Partial<Block>) {
    if ('content' in updates) {
      // Content-only updates: update ref silently, debounce state update
      blocksRef.current = blocksRef.current.map(b => b.id === id ? { ...b, ...updates } : b)
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        setBlocks([...blocksRef.current])
      }, 1500)
    } else {
      // Non-content updates (checked, type): update state immediately
      setBlocks(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b))
    }
  }

  function insertBlockAfter(afterId: string, type: BlockType = 'text') {
    const newBlock: Block = { id: uid(), type, content: '' }
    setBlocks(prev => {
      const idx = prev.findIndex(b => b.id === afterId)
      const next = [...prev]
      next.splice(idx + 1, 0, newBlock)
      return next
    })
    setTimeout(() => {
      const el = blockRefs.current[newBlock.id]
      if (el) el.focus()
    }, 20)
    return newBlock.id
  }

  function deleteBlock(id: string) {
    setBlocks(prev => {
      if (prev.length <= 1) return prev
      const idx = prev.findIndex(b => b.id === id)
      const next = prev.filter(b => b.id !== id)
      // Focus previous block
      const focusIdx = Math.max(0, idx - 1)
      setTimeout(() => {
        const el = blockRefs.current[next[focusIdx]?.id]
        if (el) {
          el.focus()
          // Move cursor to end
          const range = document.createRange()
          const sel = window.getSelection()
          if (el.childNodes.length > 0) {
            range.selectNodeContents(el)
            range.collapse(false)
          } else {
            range.setStart(el, 0)
          }
          sel?.removeAllRanges()
          sel?.addRange(range)
        }
      }, 20)
      return next
    })
  }

  // ── Slash menu ─────────────────────────────────────────────────────────────

  function openSlashMenu(blockId: string) {
    const el = blockRefs.current[blockId]
    if (!el) return
    const rect = el.getBoundingClientRect()
    const editorArea = el.closest('[data-editor]')
    const editorRect = editorArea?.getBoundingClientRect()
    setSlashMenu({
      blockId,
      top: rect.bottom - (editorRect?.top ?? 0) + 4,
      left: rect.left - (editorRect?.left ?? 0),
    })
    setSlashFilter('')
    setSlashIndex(0)
  }

  function closeSlashMenu() {
    setSlashMenu(null)
    setSlashFilter('')
    setSlashIndex(0)
  }

  function applySlashCommand(type: BlockType) {
    if (!slashMenu) return
    const blockId = slashMenu.blockId
    if (type === 'divider') {
      updateBlock(blockId, { type: 'divider', content: '' })
      insertBlockAfter(blockId)
    } else {
      updateBlock(blockId, { type, content: '' })
      setTimeout(() => blockRefs.current[blockId]?.focus(), 20)
    }
    closeSlashMenu()
  }

  const filteredSlash = SLASH_ITEMS.filter(item =>
    item.label.toLowerCase().includes(slashFilter.toLowerCase())
  )

  // Close slash menu on outside click
  useEffect(() => {
    if (!slashMenu) return
    function handleClick(e: MouseEvent) {
      if (slashMenuRef.current && !slashMenuRef.current.contains(e.target as Node)) {
        closeSlashMenu()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [slashMenu])

  // ── Block key handling ─────────────────────────────────────────────────────

  function handleBlockKeyDown(e: React.KeyboardEvent<HTMLDivElement>, block: Block) {
    // Slash menu keyboard navigation
    if (slashMenu && slashMenu.blockId === block.id) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSlashIndex(i => Math.min(i + 1, filteredSlash.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSlashIndex(i => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        if (filteredSlash[slashIndex]) applySlashCommand(filteredSlash[slashIndex].type)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        closeSlashMenu()
        return
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      closeSlashMenu()
      insertBlockAfter(block.id, block.type === 'bullet' ? 'bullet' : block.type === 'todo' ? 'todo' : block.type === 'callout' ? 'text' : 'text')
    }

    if (e.key === 'Backspace' && block.content === '' && blocks.length > 1) {
      e.preventDefault()
      closeSlashMenu()
      deleteBlock(block.id)
    }
  }

  function handleBlockInput(e: React.FormEvent<HTMLDivElement>, block: Block) {
    const text = (e.target as HTMLDivElement).textContent ?? ''

    // Slash command detection
    if (text === '/') {
      openSlashMenu(block.id)
      updateBlock(block.id, { content: text })
      return
    }

    if (slashMenu && slashMenu.blockId === block.id) {
      if (text.startsWith('/')) {
        setSlashFilter(text.slice(1))
        setSlashIndex(0)
        updateBlock(block.id, { content: text })
        return
      } else {
        closeSlashMenu()
      }
    }

    updateBlock(block.id, { content: text })
  }

  // ── Filter sidebar ─────────────────────────────────────────────────────────

  const filteredPages = pages.filter(p => {
    if (!search) return true
    const q = search.toLowerCase()
    return p.title.toLowerCase().includes(q) || snippet(p.blocks).toLowerCase().includes(q)
  })

  // ── Render helpers ─────────────────────────────────────────────────────────

  const activePage = pages.find(p => p.id === activeId)

  function blockStyle(type: BlockType): React.CSSProperties {
    const base: React.CSSProperties = {
      outline: 'none',
      width: '100%',
      color: 'var(--text)',
      lineHeight: 1.7,
      minHeight: 28,
    }
    switch (type) {
      case 'h2':
        return { ...base, fontSize: 24, fontWeight: 700, marginTop: 16, marginBottom: 4 }
      case 'h3':
        return { ...base, fontSize: 19, fontWeight: 600, marginTop: 12, marginBottom: 2 }
      case 'quote':
        return {
          ...base,
          borderLeft: '3px solid var(--green)',
          paddingLeft: 16,
          color: 'var(--text2)',
          fontStyle: 'italic',
        }
      case 'bullet':
        return { ...base }
      case 'todo':
        return { ...base }
      case 'callout':
        return { ...base }
      default:
        return base
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text3)' }}>
        Chargement...
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: 'var(--bg)' }}>
      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <div
        style={{
          width: sidebarCollapsed ? 48 : 220,
          minWidth: sidebarCollapsed ? 48 : 220,
          background: 'var(--bg2)',
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          transition: 'width 0.2s, min-width 0.2s',
        }}
      >
        {/* Sidebar header */}
        <div
          style={{
            padding: sidebarCollapsed ? '12px 8px' : '12px 14px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            justifyContent: sidebarCollapsed ? 'center' : 'space-between',
          }}
        >
          {!sidebarCollapsed && (
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', letterSpacing: 0.5, textTransform: 'uppercase' }}>
              Mon cahier
            </span>
          )}
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={createPage}
              title="Nouvelle page"
              style={{
                background: 'var(--green)',
                color: '#000',
                border: 'none',
                borderRadius: 6,
                width: 26,
                height: 26,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                fontSize: 16,
                fontWeight: 700,
              }}
            >
              +
            </button>
            <button
              onClick={() => setSidebarCollapsed(c => !c)}
              title={sidebarCollapsed ? 'Ouvrir' : 'Fermer'}
              style={{
                background: 'none',
                color: 'var(--text3)',
                border: 'none',
                borderRadius: 6,
                width: 26,
                height: 26,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              {sidebarCollapsed ? '›' : '‹'}
            </button>
          </div>
        </div>

        {!sidebarCollapsed && (
          <>
            {/* Search */}
            <div style={{ padding: '8px 10px' }}>
              <input
                type="text"
                placeholder="Rechercher..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  width: '100%',
                  padding: '6px 10px',
                  fontSize: 12,
                  background: 'var(--bg3)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  color: 'var(--text)',
                  outline: 'none',
                }}
              />
            </div>

            {/* Pages list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '4px 6px' }}>
              {filteredPages.length === 0 && (
                <div style={{ padding: '20px 10px', textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>
                  {pages.length === 0 ? 'Aucune page. Cliquez + pour commencer.' : 'Aucun resultat.'}
                </div>
              )}
              {filteredPages.map(page => (
                <div
                  key={page.id}
                  onClick={() => setActiveId(page.id)}
                  style={{
                    padding: '10px 10px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    background: page.id === activeId ? 'var(--bg3)' : 'transparent',
                    marginBottom: 2,
                    position: 'relative',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => {
                    if (page.id !== activeId) (e.currentTarget as HTMLDivElement).style.background = 'var(--bg3)'
                    const del = e.currentTarget.querySelector('[data-del]') as HTMLElement
                    if (del) del.style.opacity = '1'
                  }}
                  onMouseLeave={e => {
                    if (page.id !== activeId) (e.currentTarget as HTMLDivElement).style.background = 'transparent'
                    const del = e.currentTarget.querySelector('[data-del]') as HTMLElement
                    if (del) del.style.opacity = '0'
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 15 }}>{page.icon || '📝'}</span>
                    {page.title || 'Sans titre'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {snippet(page.blocks)}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 3, opacity: 0.7 }}>
                    {shortDate(page.updated_at)}
                  </div>
                  {/* Delete button */}
                  <button
                    data-del
                    onClick={e => { e.stopPropagation(); deletePage(page.id) }}
                    title="Supprimer"
                    style={{
                      position: 'absolute',
                      top: 8,
                      right: 8,
                      background: 'none',
                      border: 'none',
                      color: 'var(--text3)',
                      cursor: 'pointer',
                      fontSize: 14,
                      opacity: 0,
                      transition: 'opacity 0.15s, color 0.15s',
                      padding: 2,
                      lineHeight: 1,
                    }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--text3)')}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Editor area ──────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!activeId ? (
          /* Empty state */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, color: 'var(--text3)' }}>
            <div style={{ fontSize: 48, opacity: 0.3 }}>📓</div>
            <div style={{ fontSize: 15 }}>Selectionnez une page ou creez-en une nouvelle</div>
            <button
              onClick={createPage}
              style={{
                padding: '8px 20px',
                background: 'var(--green)',
                color: '#000',
                border: 'none',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              + Nouvelle page
            </button>
          </div>
        ) : (
          <>
            {/* Toolbar */}
            <div
              style={{
                padding: '8px 24px',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: 12,
                color: 'var(--text3)',
                background: 'var(--bg)',
                flexShrink: 0,
              }}
            >
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                {activePage && (
                  <span>{formatDate(activePage.created_at)}</span>
                )}
                <span style={{ opacity: 0.5 }}>|</span>
                <span>{wordCount(title, blocks)} mots</span>
              </div>
              <div>
                {saveStatus === 'saving' && (
                  <span style={{ color: 'var(--text3)' }}>Enregistrement...</span>
                )}
                {saveStatus === 'saved' && (
                  <span style={{ color: 'var(--green)' }}>Sauvegarde</span>
                )}
              </div>
            </div>

            {/* Editor content */}
            <div
              data-editor
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '32px 48px',
                position: 'relative',
                maxWidth: 800,
                margin: '0 auto',
                width: '100%',
              }}
            >
              {/* Icon + Title */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 24, position: 'relative' }}>
                <button
                  onClick={() => setShowIconPicker(!showIconPicker)}
                  title="Changer l'icône"
                  style={{
                    fontSize: 36, background: 'none', border: 'none', cursor: 'pointer',
                    padding: '4px 2px', borderRadius: 6, transition: 'background 0.12s',
                    lineHeight: 1,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg3)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  {pageIcon}
                </button>
                {showIconPicker && (
                  <div style={{
                    position: 'absolute', top: 52, left: 0, zIndex: 50,
                    background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10,
                    padding: 12, display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 4,
                    boxShadow: '0 8px 32px rgba(0,0,0,0.5)', width: 280,
                  }}>
                    {PAGE_ICONS.map(emoji => (
                      <button
                        key={emoji}
                        onClick={() => { setPageIcon(emoji); setShowIconPicker(false) }}
                        style={{
                          fontSize: 20, background: 'none', border: 'none', cursor: 'pointer',
                          padding: 6, borderRadius: 6, transition: 'background 0.1s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg3)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
                <div
                  ref={titleRef}
                  contentEditable
                  suppressContentEditableWarning
                  data-placeholder="Sans titre"
                  onInput={e => {
                    const text = (e.target as HTMLDivElement).textContent ?? ''
                    setTitle(text)
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      const firstBlock = blocks[0]
                      if (firstBlock) {
                        blockRefs.current[firstBlock.id]?.focus()
                      }
                    }
                  }}
                  style={{
                    flex: 1, fontSize: 32, fontWeight: 700, color: 'var(--text)',
                    outline: 'none', minHeight: 42, lineHeight: 1.3,
                  }}
                >
                  {title}
                </div>
              </div>

              {/* Empty title placeholder via CSS-in-JS trick */}
              <style>{`
                [data-placeholder]:empty::before {
                  content: attr(data-placeholder);
                  color: var(--text3);
                  pointer-events: none;
                }
              `}</style>

              {/* Blocks */}
              {blocks.map((block, idx) => (
                <div
                  key={block.id}
                  style={{
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 0,
                    marginBottom: block.type === 'divider' ? 8 : 2,
                    group: 'block',
                  } as React.CSSProperties}
                  onMouseEnter={e => {
                    const handle = e.currentTarget.querySelector('[data-handle]') as HTMLElement
                    const del = e.currentTarget.querySelector('[data-block-del]') as HTMLElement
                    if (handle) handle.style.opacity = '1'
                    if (del) del.style.opacity = '1'
                  }}
                  onMouseLeave={e => {
                    const handle = e.currentTarget.querySelector('[data-handle]') as HTMLElement
                    const del = e.currentTarget.querySelector('[data-block-del]') as HTMLElement
                    if (handle) handle.style.opacity = '0'
                    if (del) del.style.opacity = '0'
                  }}
                >
                  {/* Drag handle (visual only) */}
                  <div
                    data-handle
                    style={{
                      width: 20,
                      minWidth: 20,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: 0,
                      transition: 'opacity 0.15s',
                      cursor: 'grab',
                      color: 'var(--text3)',
                      fontSize: 11,
                      paddingTop: block.type === 'h2' ? 20 : block.type === 'h3' ? 16 : 4,
                      userSelect: 'none',
                    }}
                  >
                    ⠿
                  </div>

                  {/* Bullet prefix */}
                  {block.type === 'bullet' && (
                    <div style={{ width: 20, minWidth: 20, textAlign: 'center', color: 'var(--text3)', lineHeight: '28px', fontSize: 18, userSelect: 'none' }}>
                      •
                    </div>
                  )}

                  {/* Todo checkbox */}
                  {block.type === 'todo' && (
                    <div
                      onClick={() => updateBlock(block.id, { checked: !block.checked })}
                      style={{
                        width: 20,
                        minWidth: 20,
                        height: 20,
                        marginTop: 4,
                        marginRight: 6,
                        border: `2px solid ${block.checked ? 'var(--green)' : 'var(--text3)'}`,
                        borderRadius: 4,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        background: block.checked ? 'var(--green)' : 'transparent',
                        transition: 'all 0.15s',
                        flexShrink: 0,
                      }}
                    >
                      {block.checked && (
                        <span style={{ color: '#000', fontSize: 12, fontWeight: 700, lineHeight: 1 }}>✓</span>
                      )}
                    </div>
                  )}

                  {/* Divider */}
                  {block.type === 'divider' ? (
                    <div style={{ flex: 1, padding: '12px 0' }}>
                      <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: 0 }} />
                    </div>
                  ) : block.type === 'callout' ? (
                    /* Callout block */
                    <div style={{
                      flex: 1, display: 'flex', gap: 10, padding: '12px 14px',
                      background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)',
                      borderRadius: 8,
                    }}>
                      <span style={{ fontSize: 20, lineHeight: 1.4, flexShrink: 0, cursor: 'default' }}>💡</span>
                      <div
                        ref={el => { blockRefs.current[block.id] = el }}
                        contentEditable
                        suppressContentEditableWarning
                        data-placeholder="Écris une note importante..."
                        onInput={e => handleBlockInput(e, block)}
                        onKeyDown={e => handleBlockKeyDown(e, block)}
                        dangerouslySetInnerHTML={{ __html: block.content }}
                        style={{ ...blockStyle(block.type), flex: 1 }}
                      />
                    </div>
                  ) : (
                    /* Editable content */
                    <div
                      ref={el => { blockRefs.current[block.id] = el }}
                      contentEditable
                      suppressContentEditableWarning
                      data-placeholder={
                        idx === 0 && blocks.length === 1 && block.content === ''
                          ? "Tapez '/' pour les commandes..."
                          : block.type === 'quote' ? 'Citation...' : ''
                      }
                      onInput={e => handleBlockInput(e, block)}
                      onKeyDown={e => handleBlockKeyDown(e, block)}
                      dangerouslySetInnerHTML={{ __html: block.content }}
                      style={{
                        ...blockStyle(block.type),
                        flex: 1,
                        textDecoration: block.type === 'todo' && block.checked ? 'line-through' : 'none',
                        opacity: block.type === 'todo' && block.checked ? 0.5 : 1,
                      }}
                    />
                  )}

                  {/* Delete block button */}
                  {blocks.length > 1 && (
                    <button
                      data-block-del
                      onClick={() => deleteBlock(block.id)}
                      title="Supprimer le bloc"
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text3)',
                        cursor: 'pointer',
                        fontSize: 12,
                        opacity: 0,
                        transition: 'opacity 0.15s, color 0.15s',
                        padding: '4px 4px',
                        lineHeight: 1,
                        flexShrink: 0,
                      }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'var(--text3)')}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}

              {/* ── Slash command menu ──────────────────────────────────── */}
              {slashMenu && filteredSlash.length > 0 && (
                <div
                  ref={slashMenuRef}
                  style={{
                    position: 'absolute',
                    top: slashMenu.top,
                    left: slashMenu.left + 20,
                    background: 'var(--bg2)',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    padding: '6px 0',
                    minWidth: 220,
                    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                    zIndex: 100,
                    overflow: 'hidden',
                  }}
                >
                  <div style={{ padding: '6px 14px 8px', fontSize: 11, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Blocs
                  </div>
                  {filteredSlash.map((item, i) => (
                    <div
                      key={item.type}
                      onMouseDown={e => { e.preventDefault(); applySlashCommand(item.type) }}
                      onMouseEnter={() => setSlashIndex(i)}
                      style={{
                        padding: '8px 14px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        background: i === slashIndex ? 'var(--bg3)' : 'transparent',
                        transition: 'background 0.1s',
                      }}
                    >
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 6,
                          background: 'var(--bg)',
                          border: '1px solid var(--border)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 14,
                          fontWeight: 600,
                          color: 'var(--text2)',
                          flexShrink: 0,
                        }}
                      >
                        {item.icon}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{item.label}</div>
                        <div style={{ fontSize: 11, color: 'var(--text3)' }}>{item.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
