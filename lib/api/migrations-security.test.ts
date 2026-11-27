import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const read = (f: string) => readFileSync(path.resolve(__dirname, '../../supabase/migrations', f), 'utf8')

describe('migration invitations (limite d’essais)', () => {
  const sql = read('20261126000002_invitations_attempts.sql')
  it('ajoute les 2 colonnes, sans casser les invitations existantes', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS failed_attempts integer NOT NULL DEFAULT 0/)
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS locked_until timestamptz/)
  })
})

describe('migration profils (rôles)', () => {
  const sql = read('20261126000003_profiles_role_hardening.sql')
  const fn = sql.slice(sql.indexOf('FUNCTION public.handle_new_user'), sql.indexOf('FUNCTION public.protect_profile_privileged_columns'))
  it('handle_new_user ne lit plus le rôle fourni par l’utilisateur', () => {
    expect(fn).not.toMatch(/raw_user_meta_data->>'role'/)
    expect(fn).toMatch(/'trader'/)
  })
  it('protège role et whop_subscription_active contre un membre connecté', () => {
    expect(sql).toMatch(/new\.role IS DISTINCT FROM old\.role/)
    expect(sql).toMatch(/new\.whop_subscription_active IS DISTINCT FROM old\.whop_subscription_active/)
    expect(sql).toMatch(/BEFORE UPDATE ON public\.profiles/)
    expect(sql).toMatch(/DROP TRIGGER IF EXISTS protect_profile_privileged_columns/)
  })
})

describe('migration accès manuel', () => {
  const sql = read('20261126000004_manual_access.sql')
  const prev = read('20261126000003_profiles_role_hardening.sql')
  const guarded = (s: string) => [...s.matchAll(/new\.(\w+) IS DISTINCT FROM old\.\1/g)].map(m => m[1])

  it('ajoute les 2 colonnes, relançable', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS manual_access boolean NOT NULL DEFAULT false/)
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS manual_access_until date/)
  })
  it('n’initialise qu’au premier passage : invitation utilisée, sans lien Whop, jamais l’admin', () => {
    expect(sql).toMatch(/first_run := NOT EXISTS/)
    expect(sql).toMatch(/IF first_run THEN[\s\S]*UPDATE public\.profiles/)
    expect(sql).toMatch(/whop_user_id IS NULL/)
    expect(sql).toMatch(/i\.used_at IS NOT NULL/)
    expect(sql).toMatch(/coalesce\(p\.role, ''\) <> 'admin'/)
  })
  it('le déclencheur garde toutes les colonnes protégées et ajoute les 2 nouvelles', () => {
    expect(guarded(sql)).toEqual([...guarded(prev), 'manual_access', 'manual_access_until'])
    expect(sql).toMatch(/BEFORE UPDATE ON public\.profiles/)
  })
  it('se termine par le tableau de vérification', () => {
    expect(sql.trim()).toMatch(/SELECT verification, valeur FROM lignes ORDER BY ordre;$/)
    expect(sql).toMatch(/perdraient l''accès avec la nouvelle règle/)
  })
})

describe('migration has_dashboard_access (accès côté base)', () => {
  const sql = read('20261126000006_has_dashboard_access.sql')
  const fn = sql.slice(sql.indexOf('FUNCTION public.has_dashboard_access_for'), sql.indexOf('FUNCTION public.has_dashboard_access()'))

  it('applique la même règle que lib/access/member-access.ts', () => {
    expect(fn).toMatch(/p\.role = 'admin'/)
    expect(fn).toMatch(/p\.whop_subscription_active IS TRUE/)
    expect(fn).toMatch(/p\.manual_access IS TRUE/)
    expect(fn).toMatch(/p\.manual_access_until IS NULL/)
    expect(fn).toMatch(/p\.manual_access_until >= \(now\(\) AT TIME ZONE 'Europe\/Paris'\)::date/)
    expect(fn).toMatch(/coalesce\(\([\s\S]*\), false\)/) // pas de profil / pas de session → non
    expect(fn).toMatch(/SECURITY DEFINER/)
  })
  it('la variante par compte n’est pas exécutable par les comptes', () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.has_dashboard_access_for\(uuid\) FROM PUBLIC, anon, authenticated/)
  })
  it('chaque nouvelle règle de lecture passe par has_dashboard_access()', () => {
    const creates = [...sql.matchAll(/CREATE POLICY "[^"]+" ON [\w.]+\s+FOR SELECT USING \(([^;]+)\);/g)]
    expect(creates).toHaveLength(8)
    for (const c of creates) expect(c[1]).toContain('(SELECT public.has_dashboard_access())')
  })
  it('plus aucune lecture « tout compte connecté » ou « tout le monde » dans les migrations', () => {
    const dir = path.resolve(__dirname, '../../supabase/migrations')
    const live = new Map<string, string>()
    for (const f of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
      const s = readFileSync(path.join(dir, f), 'utf8').replace(/--[^\n]*/g, '')
      for (const m of s.matchAll(/\b(create|drop)\s+policy\s+(?:if\s+exists\s+)?"([^"]+)"\s+on\s+([\w.]+)([\s\S]*?);/gi)) {
        const key = `${m[3].toLowerCase().replace('public.', '')}|${m[2]}`
        if (m[1].toLowerCase() === 'drop') live.delete(key)
        else live.set(key, m[4])
      }
    }
    const open = [...live].filter(([, rest]) =>
      !/for\s+(insert|update|delete)\b/i.test(rest)
      && /using\s*\(\s*true\s*\)|auth\.uid\(\)\s+is\s+not\s+null|auth\.role\(\)\s*=\s*'authenticated'/i.test(rest))
    expect(open.map(([k]) => k)).toEqual([])
  })
})

describe('migration 0007 (règles créées à la main sur les créneaux)', () => {
  const sql = read('20261126000007_drop_manual_coaching_policies.sql')
  const prev = read('20261126000006_has_dashboard_access.sql')
  const verif = (s: string) => s.slice(s.indexOf('-- ─── Vérification'))

  it('supprime les 2 règles ouvertes, sans en créer', () => {
    expect(sql).toMatch(/DROP POLICY IF EXISTS "View active availability" ON public\.coaching_availability;/)
    expect(sql).toMatch(/DROP POLICY IF EXISTS "View overrides" ON public\.coaching_date_overrides;/)
    expect(sql).not.toMatch(/CREATE POLICY/)
  })
  it('relance exactement la vérification du script 0006', () => {
    expect(verif(sql)).toBe(verif(prev))
  })
})

describe('migration données Terminal (lot C)', () => {
  const sql = read('20261127000002_market_data.sql')
  const policies = [...sql.matchAll(/CREATE POLICY "[^"]+" ON public\.(\w+)\s+FOR (\w+) USING \(([^;]+)\);/g)]
  it('lecture des 3 tables de données réservée aux membres (has_dashboard_access)', () => {
    expect(policies.map(p => p[1]).sort()).toEqual(['market_cot_reports', 'market_series', 'market_series_observations'])
    for (const p of policies) {
      expect(p[2]).toBe('SELECT')
      expect(p[3]).toContain('(SELECT public.has_dashboard_access())')
    }
  })
  it('aucune règle d’écriture, aucune règle sur le journal', () => {
    expect(sql).not.toMatch(/FOR (INSERT|UPDATE|DELETE|ALL)/)
    expect(sql).not.toMatch(/ON public\.market_ingest_journal\s+FOR/)
    expect(sql).toMatch(/ALTER TABLE public\.market_ingest_journal\s+ENABLE ROW LEVEL SECURITY/)
  })
  it('relançable et sans destruction', () => {
    const code = sql.replace(/--[^\n]*/g, '')
    expect(code.match(/CREATE TABLE IF NOT EXISTS/g)).toHaveLength(4)
    expect(code).not.toMatch(/DROP TABLE|DELETE FROM|TRUNCATE/i)
  })
})
