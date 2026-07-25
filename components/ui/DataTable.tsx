'use client'

import { useMemo, useState, type ReactNode } from 'react'
import EmptyState from './EmptyState'

/**
 * DataTable — table de données standard admin + trader.
 *
 * Contrat ferme :
 * - Colonnes typées via un generic <Row>, l'appelant définit ses colonnes
 *   comme un tableau `Column<Row>[]`.
 * - `numeric: true` sur une colonne → alignement à droite auto + rendu
 *   mono tabulaire. Toutes les colonnes P&L, R, nombres devraient l'être.
 * - `sortable: true` sur une colonne active le tri au clic sur son header.
 *   L'appelant peut fournir `sortValue(row)` pour trier sur autre chose
 *   que ce qui est affiché (ex: tri sur ISO date, affichage humain).
 * - `empty` : rendu personnalisable (typiquement <EmptyState>) — état filtré
 *   ≠ état vide total ; c'est la responsabilité de l'appelant de choisir.
 * - `onRowClick` : ligne devient cliquable (curseur + hover) — sinon inerte.
 * - `loading` : rend des skeleton rows aux dimensions cohérentes.
 *
 * Pas de virtualisation à cette étape (contrainte).
 */

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface Column<Row> {
  /** Identifiant unique (utilisé comme clé + pour l'état de tri). */
  id: string
  /** Libellé affiché dans le header (string ou JSX). */
  header: ReactNode
  /** Rendu de la cellule pour une ligne donnée. */
  accessor: (row: Row) => ReactNode
  /**
   * Valeur utilisée pour trier cette colonne. Nécessaire uniquement si
   * `sortable` est true ET `accessor` renvoie du JSX (pas une string/number).
   * Ex: colonne "Date" affiche "15 mars 2026" mais trie sur l'ISO date.
   */
  sortValue?: (row: Row) => string | number
  /**
   * Force le tri d'une colonne `numeric` en ordre numérique même si l'accessor
   * renvoie du JSX. Rend la colonne cliquable pour toggle asc/desc.
   */
  sortable?: boolean
  /**
   * Marque la colonne comme numérique : alignement droit + font-data mono
   * tabular-nums. Utilisé pour P&L, R, %, compteurs.
   */
  numeric?: boolean
  /** Alignement manuel — override du calcul auto basé sur `numeric`. */
  align?: 'left' | 'right' | 'center'
  /** Largeur CSS (ex: "8rem", "20%", "auto"). */
  width?: string
  /** Classe additionnelle sur les cellules `<td>` de cette colonne. */
  cellClassName?: string
  /** Classe additionnelle sur le header `<th>` de cette colonne. */
  headerClassName?: string
}

export interface DataTableProps<Row> {
  /** Définition des colonnes (tableau, dans l'ordre d'affichage). */
  columns: Column<Row>[]
  /** Données. */
  rows: Row[]
  /** Extracteur de clé stable par ligne (pour React key). */
  rowKey: (row: Row) => string
  /** Ligne cliquable → callback + hover + cursor. */
  onRowClick?: (row: Row) => void
  /** Rendu de l'état vide (typiquement <EmptyState>). */
  empty?: ReactNode
  /** Nombre de skeleton rows à afficher pendant le chargement. */
  loading?: boolean
  /** Nombre de skeleton rows si loading (défaut 5). */
  loadingRows?: number
  /** Colonne triée initialement + direction. */
  defaultSort?: { columnId: string; dir: 'asc' | 'desc' }
  /** Classe additionnelle sur le wrapper. */
  className?: string
}

// ═══════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════

export default function DataTable<Row>({
  columns,
  rows,
  rowKey,
  onRowClick,
  empty,
  loading = false,
  loadingRows = 5,
  defaultSort,
  className = '',
}: DataTableProps<Row>) {
  const [sortId, setSortId] = useState<string | null>(defaultSort?.columnId ?? null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(defaultSort?.dir ?? 'asc')

  const sortedRows = useMemo(() => {
    if (!sortId) return rows
    const col = columns.find(c => c.id === sortId)
    if (!col || !col.sortable) return rows
    // Priorité au sortValue explicit, sinon on essaie accessor si c'est
    // string/number (accessor JSX = pas triable sans sortValue).
    const getVal = (r: Row): string | number => {
      if (col.sortValue) return col.sortValue(r)
      const a = col.accessor(r)
      if (typeof a === 'string' || typeof a === 'number') return a
      return ''
    }
    const dir = sortDir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const va = getVal(a)
      const vb = getVal(b)
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
      return String(va).localeCompare(String(vb), 'fr', { numeric: true }) * dir
    })
  }, [rows, sortId, sortDir, columns])

  function onHeaderClick(col: Column<Row>) {
    if (!col.sortable) return
    if (sortId === col.id) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortId(col.id)
      setSortDir('asc')
    }
  }

  const alignOf = (col: Column<Row>) => col.align ?? (col.numeric ? 'right' : 'left')

  // ─── Loading skeleton ─────────────────────────────────
  if (loading) {
    return (
      <div className={className}>
        <TableFrame>
          <thead>
            <TableHeadRow>
              {columns.map(col => (
                <th
                  key={col.id}
                  style={{ textAlign: alignOf(col), width: col.width }}
                  className={col.headerClassName}
                >
                  <HeaderInner>{col.header}</HeaderInner>
                </th>
              ))}
            </TableHeadRow>
          </thead>
          <tbody>
            {Array.from({ length: loadingRows }).map((_, i) => (
              <tr key={i} style={rowBaseStyle}>
                {columns.map(col => (
                  <td key={col.id} style={{ ...tdBaseStyle, textAlign: alignOf(col) }}>
                    <span
                      aria-hidden
                      className="animate-pulse motion-reduce:animate-none inline-block"
                      style={{
                        width: col.numeric ? '5ch' : '10ch',
                        height: '0.9em',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--color-surface-2)',
                        verticalAlign: 'middle',
                      }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </TableFrame>
      </div>
    )
  }

  // ─── Empty state ──────────────────────────────────────
  if (rows.length === 0) {
    return (
      <div className={className}>
        {empty ?? (
          <EmptyState
            title="Aucune donnée"
            description="La table n'a rien à afficher pour le moment."
          />
        )}
      </div>
    )
  }

  // ─── Populated table ──────────────────────────────────
  return (
    <div className={className}>
      <TableFrame>
        <thead>
          <TableHeadRow>
            {columns.map(col => {
              const active = sortId === col.id
              const cursor = col.sortable ? 'pointer' : 'default'
              const align = alignOf(col)
              return (
                <th
                  key={col.id}
                  onClick={() => onHeaderClick(col)}
                  style={{
                    textAlign: align,
                    width: col.width,
                    cursor,
                    userSelect: 'none',
                  }}
                  className={col.headerClassName}
                  aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  <HeaderInner align={align}>
                    <span>{col.header}</span>
                    {col.sortable && <SortIcon active={active} dir={sortDir} />}
                  </HeaderInner>
                </th>
              )
            })}
          </TableHeadRow>
        </thead>
        <tbody>
          {sortedRows.map((row, idx) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={onRowClick ? 'hover:bg-white/[.02]' : undefined}
              style={{
                ...rowBaseStyle,
                cursor: onRowClick ? 'pointer' : 'default',
                borderBottom: idx === sortedRows.length - 1
                  ? 'none'
                  : '1px solid var(--color-border-subtle)',
              }}
            >
              {columns.map(col => (
                <td
                  key={col.id}
                  style={{
                    ...tdBaseStyle,
                    textAlign: alignOf(col),
                    fontFamily: col.numeric ? 'var(--font-data)' : undefined,
                    fontVariantNumeric: col.numeric ? 'tabular-nums' : undefined,
                  }}
                  className={col.cellClassName}
                >
                  {col.accessor(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </TableFrame>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Sub-primitives (privées)
// ═══════════════════════════════════════════════════════════════

const rowBaseStyle: React.CSSProperties = {
  transition: 'background 0.12s ease',
}
const tdBaseStyle: React.CSSProperties = {
  padding: '0.75rem 1rem',
  fontSize: 'var(--text-body)',
  color: 'var(--color-text-2)',
  verticalAlign: 'middle',
}

function TableFrame({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--color-surface-1)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
      }}
    >
      <div style={{ overflowX: 'auto' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            borderSpacing: 0,
          }}
        >
          {children}
        </table>
      </div>
    </div>
  )
}

function TableHeadRow({ children }: { children: ReactNode }) {
  return <tr style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>{children}</tr>
}

function HeaderInner({ children, align = 'left' }: { children: ReactNode; align?: 'left' | 'right' | 'center' }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '0.75rem 1rem',
        justifyContent: align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start',
        fontFamily: 'var(--font-data)',
        fontSize: 'var(--text-label)',
        fontWeight: 500,
        letterSpacing: '0.10em',
        textTransform: 'uppercase',
        color: 'var(--color-text-3)',
      }}
    >
      {children}
    </div>
  )
}

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  const arrow = !active ? '↕' : dir === 'asc' ? '↑' : '↓'
  return (
    <span
      aria-hidden
      style={{
        fontSize: 10,
        color: active ? 'var(--color-accent)' : 'var(--color-text-3)',
        opacity: active ? 1 : 0.5,
      }}
    >
      {arrow}
    </span>
  )
}
