import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
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
