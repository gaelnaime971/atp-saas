import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildProspectAlertEmail, escapeHtml } from '@/lib/email/prospect-alert'

// Routes /api/prospects/* : 5 routes réservées à l'admin + le POST public
// des landings. Tout est simulé : session Supabase, client service role
// (lectures/écritures enregistrées), Resend et fetch. Aucun e-mail réel,
// aucune écriture réelle en base.

const session = vi.hoisted(() => ({ user: null as null | { id: string }, role: 'trader' }))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: session.user } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { role: session.role } }),
          single: async () => ({ data: { role: session.role } }),
        }),
      }),
    }),
  }),
}))

// Client service role : chaque appel est enregistré, toute chaîne se
// résout sur { data: [], error: null }.
const db = vi.hoisted(() => ({
  calls: [] as string[],
  journal: 'ok' as 'ok' | 'error' | 'throw',
}))
vi.mock('@supabase/supabase-js', () => {
  const chain = (table: string): unknown => new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === 'then') {
        if (table === 'email_broadcasts' && db.journal === 'throw') {
          return (_res: unknown, rej: (e: unknown) => void) => rej(new Error('fetch failed'))
        }
        const error = table === 'email_broadcasts' && db.journal === 'error'
          ? { code: '23514', message: 'violates check constraint' } : null
        return (res: (v: unknown) => void) => res({ data: [], error, count: 0 })
      }
      return () => { db.calls.push(`${table}.${String(prop)}`); return chain(table) }
    },
  })
  return { createClient: () => ({ from: (table: string) => { db.calls.push(`${table}.from`); return chain(table) } }) }
})

const resend = vi.hoisted(() => ({ send: vi.fn() }))
vi.mock('resend', () => ({
  Resend: function Resend() { return { emails: { send: resend.send } } },
}))

const routes = {
  broadcast: (await import('@/app/api/prospects/email-broadcast/route')).POST,
  closing: (await import('@/app/api/prospects/send-closing-email/route')).POST,
  welcome: (await import('@/app/api/prospects/send-welcome-email/route')).POST,
  reminder: (await import('@/app/api/prospects/send-payment-reminder-email/route')).POST,
  import: (await import('@/app/api/prospects/import/route')).POST,
}
const publicPost = (await import('@/app/api/prospects/route')).POST

const post = (body: unknown) => new Request('http://localhost/api/prospects/x', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
})

let fetchSpy: ReturnType<typeof vi.fn>
const writes = () => db.calls.filter(c => /\.(insert|update|upsert|delete)$/.test(c))

beforeEach(() => {
  session.user = null
  session.role = 'trader'
  db.calls = []
  db.journal = 'ok'
  resend.send.mockReset()
  resend.send.mockResolvedValue({ data: { id: 'email_test' }, error: null })
  fetchSpy = vi.fn(async () => new Response('{}', { status: 200 }))
  vi.stubGlobal('fetch', fetchSpy)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// Corps qui, sans verrou, déclencheraient un envoi ou une écriture.
const attack = {
  broadcast: { subject: 'x', html: '<b>x</b>', testMode: true, testEmail: 'victime@example.com' },
  closing: { recipient_email: 'victime@example.com', test_mode: true, test_email: 'victime@example.com' },
  welcome: { amount: '1', date_paiement: '2026-11-26', reference: 'R', test_mode: true, test_email: 'victime@example.com' },
  reminder: { recipient_email: 'victime@example.com', test_mode: true, test_email: 'victime@example.com' },
  import: { prospects: [{ email: 'faux@example.com', prenom: 'F' }], source: 'x' },
}
type RouteKey = keyof typeof routes
const keys = Object.keys(routes) as RouteKey[]

describe.each(keys)('/api/prospects/%s — verrou admin', key => {
  it('sans session → 401, aucun envoi, aucune écriture', async () => {
    const r = await routes[key](post(attack[key]))
    expect(r.status).toBe(401)
    expect(resend.send).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(db.calls).toEqual([])
  })

  it('membre non admin → 403, aucun envoi, aucune écriture', async () => {
    session.user = { id: 'trader-1' }
    const r = await routes[key](post(attack[key]))
    expect(r.status).toBe(403)
    expect(resend.send).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(db.calls).toEqual([])
  })

  it('admin → passe le verrou', async () => {
    session.user = { id: 'admin-1' }
    session.role = 'admin'
    const r = await routes[key](post({}))
    expect([401, 403]).not.toContain(r.status)
  })
})

describe('admin → fonctionne (envois simulés)', () => {
  beforeEach(() => { session.user = { id: 'admin-1' }; session.role = 'admin' })

  it('email-broadcast en mode test : 200, un envoi simulé à l’adresse de test', async () => {
    const r = await routes.broadcast(post({ subject: 'Sujet', html: '<p>Bonjour</p>', testMode: true, testEmail: 'moi@example.com' }))
    expect(r.status).toBe(200)
    expect(resend.send).toHaveBeenCalledTimes(1)
    expect(resend.send.mock.calls[0][0].to).toBe('moi@example.com')
  })
  it('import : 200, insertion simulée', async () => {
    const r = await routes.import(post({ prospects: [{ email: 'nouveau@example.com', prenom: 'N', nom: 'P' }], source: 'csv' }))
    expect(r.status).toBe(200)
    expect(writes()).toContain('prospects.insert')
  })
  it('send-welcome-email : les variables du modèle sont échappées', async () => {
    await routes.welcome(post({ recipient_prenom: '<img src=x onerror=1>', amount: '$& 997', date_paiement: '2026-11-26', reference: 'R"><b>', test_mode: true, test_email: 'moi@example.com' }))
    const html = resend.send.mock.calls[0][0].html as string
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('R"><b>')
    expect(html).toContain('$&amp; 997')
  })
  it('send-welcome-email en mode test : 200, un envoi simulé', async () => {
    const r = await routes.welcome(post({ amount: '997', date_paiement: '2026-11-26', reference: 'REF-1', test_mode: true, test_email: 'moi@example.com' }))
    expect(r.status).toBe(200)
    expect(resend.send).toHaveBeenCalledTimes(1)
  })
})

describe('journal des e-mails : un échec ne bloque pas l’envoi', () => {
  beforeEach(() => { session.user = { id: 'admin-1' }; session.role = 'admin' })

  it('send-welcome-email hors test, journal refusé → 200, e-mail envoyé, erreur loggée', async () => {
    db.journal = 'error'
    const r = await routes.welcome(post({ recipient_email: 'client@example.com', amount: '997', date_paiement: '2026-11-26', reference: 'R' }))
    expect(r.status).toBe(200)
    expect(resend.send).toHaveBeenCalledTimes(1)
    expect(db.calls).toContain('email_broadcasts.insert')
    const logged = (console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls.map(c => String(c[0]))
    expect(logged.some(m => m.includes('[email-journal] send-welcome-email') && m.includes('welcome'))).toBe(true)
  })
  it('email-broadcast, journal en exception → 200 quand même (plus de 500 après envoi)', async () => {
    db.journal = 'throw'
    const r = await routes.broadcast(post({ subject: 'S', html: '<p>x</p>', testMode: true, testEmail: 'moi@example.com' }))
    expect(r.status).toBe(200)
    expect(resend.send).toHaveBeenCalledTimes(1)
  })
})

describe('/api/prospects (POST public des landings)', () => {
  const form = {
    prenom: '<img src=x onerror=alert(1)>', nom: 'Dupont</td><a href="https://evil.example">clic</a>',
    email: 'jean@example.com', whatsapp: '+590 690 12 34 56', experience: 'debutant', objectif: 'vivre',
    source: '"><script>x</script>',
  }

  it('reste public : sans session → 200, prospect inséré, alerte envoyée (simulée)', async () => {
    process.env.RESEND_API_KEY = 'test-key'
    const r = await publicPost(post(form))
    expect(r.status).toBe(200)
    expect(writes()).toContain('prospects.insert')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.resend.com/emails')
    const html = JSON.parse(String(init.body)).html as string
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('evil.example">clic')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    delete process.env.RESEND_API_KEY
  })
  it('champs requis manquants → 400, rien inséré ni envoyé', async () => {
    const r = await publicPost(post({ prenom: 'A' }))
    expect(r.status).toBe(400)
    expect(writes()).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('buildProspectAlertEmail', () => {
  it('échappe tous les champs saisis', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;')
    const { html } = buildProspectAlertEmail({
      prenom: '<b>P</b>', nom: '<i>N</i>', email: '<e@x>', whatsapp: '<w>', experience: '<x>', objectif: '<o>', source: '<s>',
    })
    for (const raw of ['<b>P', '<i>N', '<e@x>', '<w>', '<x>', '<o>', '<s>']) expect(html).not.toContain(raw)
  })
  it('garde les libellés connus et un lien WhatsApp en chiffres seuls', () => {
    const { html } = buildProspectAlertEmail({
      prenom: 'Jean', nom: 'Dupont', email: 'j@x.fr', whatsapp: '+590 690 12 34 56" onclick="x', experience: 'confirme', objectif: 'propfirm',
    })
    expect(html).toContain('+ de 2 ans')
    expect(html).toContain('Prop firm')
    expect(html).toContain('href="https://wa.me/590690123456"')
  })
  it('sujet sur une seule ligne', () => {
    const { subject } = buildProspectAlertEmail({ prenom: 'A\r\nBcc: x@y', nom: 'B', email: '', whatsapp: '', experience: '', objectif: '' })
    expect(subject).not.toMatch(/[\r\n]/)
  })
})
