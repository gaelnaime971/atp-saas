/**
 * Tests de `fetchEliteProAccess`, `hasActiveEliteProMembership` et
 * `listActiveEliteProMemberships`.
 *
 * fetch est mocké globalement — zéro requête réseau réelle. Les
 * variables d'env sont posées en beforeEach + reset en afterEach pour
 * ne pas fuiter d'un test à l'autre.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  fetchEliteProAccess,
  hasActiveEliteProMembership,
  listActiveEliteProMemberships,
  fetchActiveEliteProMemberEmails,
  fetchEliteProPlans,
} from './client'

const WHOP_USER_ID = 'user_abc123'
const PRODUCT_ID = 'prod_ElitePro'
const COMPANY_ID = 'biz_Atp'
const API_KEY = 'apik_test'

function mockFetchResponse(body: unknown, init: {
  ok?: boolean
  status?: number
  headers?: Record<string, string>
} = {}): Response {
  const ok = init.ok ?? true
  const status = init.status ?? 200
  return {
    ok,
    status,
    headers: new Headers(init.headers ?? {}),
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  } as unknown as Response
}

function stubFetch(responses: Array<Response | Error>): ReturnType<typeof vi.fn> {
  const fn = vi.fn()
  for (const r of responses) {
    if (r instanceof Error) fn.mockRejectedValueOnce(r)
    else fn.mockResolvedValueOnce(r)
  }
  globalThis.fetch = fn as unknown as typeof fetch
  return fn
}

beforeEach(() => {
  process.env.WHOP_API_KEY = API_KEY
  process.env.WHOP_PRODUCT_ID = PRODUCT_ID
  process.env.WHOP_COMPANY_ID = COMPANY_ID
  delete process.env.WHOP_API_VERSION_DATE
})
afterEach(() => {
  vi.restoreAllMocks()
})

// ─── fetchEliteProAccess ─────────────────────────────────────────────

describe('fetchEliteProAccess — compose correctement la requête', () => {
  it('tape /api/v1/memberships avec les bons filtres + header Bearer + Api-Version-Date', async () => {
    const fetchMock = stubFetch([mockFetchResponse({ data: [], page_info: { has_next_page: false } })])
    await fetchEliteProAccess(WHOP_USER_ID)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('https://api.whop.com/api/v1/memberships')
    expect(url).toContain(`user_id=${WHOP_USER_ID}`)
    expect(url).toContain(`company_id=${COMPANY_ID}`)
    expect(url).toContain(encodeURIComponent(PRODUCT_ID))
    for (const s of ['active', 'trialing', 'completed', 'canceling', 'past_due']) {
      expect(url).toContain(`statuses%5B%5D=${s}`)
    }
    const headers = (init as RequestInit).headers as Record<string, string>
    expect(headers.Authorization).toBe(`Bearer ${API_KEY}`)
    expect(headers['Api-Version-Date']).toBeTruthy()
  })

  it('respecte WHOP_API_VERSION_DATE si posé', async () => {
    process.env.WHOP_API_VERSION_DATE = '2026-10-15'
    const fetchMock = stubFetch([mockFetchResponse({ data: [], page_info: { has_next_page: false } })])
    await fetchEliteProAccess(WHOP_USER_ID)
    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>
    expect(headers['Api-Version-Date']).toBe('2026-10-15')
  })
})

describe('fetchEliteProAccess — accès accordé (product.id ÉLITE PRO + status ∈ ACTIVE_STATUSES)', () => {
  it('status="active" → granted (reason=status)', async () => {
    stubFetch([mockFetchResponse({
      data: [{
        id: 'mem_1', status: 'active',
        product: { id: PRODUCT_ID }, user: { id: WHOP_USER_ID },
        member: { access_level: 'customer' },
      }],
      page_info: { has_next_page: false },
    })])
    const r = await fetchEliteProAccess(WHOP_USER_ID)
    expect(r.granted).toBe(true)
    expect(r.memberships[0].reasonValid).toBe('status')
    expect(r.pagesChecked).toBe(1)
  })

  it('status="trialing" (member.access_level=no_access n\'empêche rien) → granted', async () => {
    stubFetch([mockFetchResponse({
      data: [{
        id: 'mem_2', status: 'trialing',
        product: { id: PRODUCT_ID }, user: { id: WHOP_USER_ID },
        member: { access_level: 'no_access' },
      }],
      page_info: { has_next_page: false },
    })])
    const r = await fetchEliteProAccess(WHOP_USER_ID)
    expect(r.granted).toBe(true)
    expect(r.memberships[0].reasonValid).toBe('status')
  })

  it('status="past_due" acceptée (grâce)', async () => {
    stubFetch([mockFetchResponse({
      data: [{
        id: 'mem_3', status: 'past_due',
        product: { id: PRODUCT_ID }, user: { id: WHOP_USER_ID },
      }],
      page_info: { has_next_page: false },
    })])
    expect(await hasActiveEliteProMembership(WHOP_USER_ID)).toBe(true)
  })

  it('status="completed" + status="canceling" acceptés', async () => {
    stubFetch([mockFetchResponse({
      data: [{
        id: 'mem_completed', status: 'completed',
        product: { id: PRODUCT_ID }, user: { id: WHOP_USER_ID },
      }],
      page_info: { has_next_page: false },
    })])
    expect(await hasActiveEliteProMembership(WHOP_USER_ID)).toBe(true)

    stubFetch([mockFetchResponse({
      data: [{
        id: 'mem_canceling', status: 'canceling',
        product: { id: PRODUCT_ID }, user: { id: WHOP_USER_ID },
      }],
      page_info: { has_next_page: false },
    })])
    expect(await hasActiveEliteProMembership(WHOP_USER_ID)).toBe(true)
  })
})

describe('fetchEliteProAccess — accès refusé', () => {
  it('status="canceled" → NOT granted', async () => {
    stubFetch([mockFetchResponse({
      data: [{
        id: 'mem_5', status: 'canceled',
        product: { id: PRODUCT_ID }, user: { id: WHOP_USER_ID },
        member: { access_level: 'no_access' },
      }],
      page_info: { has_next_page: false },
    })])
    const r = await fetchEliteProAccess(WHOP_USER_ID)
    expect(r.granted).toBe(false)
    expect(r.memberships[0].reasonValid).toBeNull()
  })

  it('status="expired" → NOT granted', async () => {
    stubFetch([mockFetchResponse({
      data: [{
        id: 'mem_6', status: 'expired',
        product: { id: PRODUCT_ID }, user: { id: WHOP_USER_ID },
      }],
      page_info: { has_next_page: false },
    })])
    expect(await hasActiveEliteProMembership(WHOP_USER_ID)).toBe(false)
  })

  it('aucune membership du tout → NOT granted', async () => {
    stubFetch([mockFetchResponse({ data: [], page_info: { has_next_page: false } })])
    expect(await hasActiveEliteProMembership(WHOP_USER_ID)).toBe(false)
  })

  it('membership d\'un AUTRE produit → NOT granted (défense en profondeur)', async () => {
    stubFetch([mockFetchResponse({
      data: [{
        id: 'mem_other', status: 'active',
        product: { id: 'prod_OTHER' }, user: { id: WHOP_USER_ID },
        member: { access_level: 'customer' },
      }],
      page_info: { has_next_page: false },
    })])
    expect(await hasActiveEliteProMembership(WHOP_USER_ID)).toBe(false)
  })

  // ─── CAS CRITIQUE — défense en profondeur sur member.access_level ─────
  //
  // member.access_level est GLOBAL au membre (toutes offres du marchand).
  // Un ÉLITE PRO expiré ET un abonnement Discord actif → access_level=customer
  // alors que l'ÉLITE PRO est bel et bien expiré. Historiquement, la fonction
  // l'aurait accepté (reason='access_level'). Depuis le durcissement, status
  // est la SEULE source de vérité → refus.
  it('ÉLITE PRO expiré + member.access_level=customer (autre offre active) → REFUS', async () => {
    stubFetch([mockFetchResponse({
      data: [{
        id: 'mem_expired_but_customer',
        status: 'expired',
        product: { id: PRODUCT_ID },
        user: { id: WHOP_USER_ID },
        member: { access_level: 'customer' }, // ← piège
      }],
      page_info: { has_next_page: false },
    })])
    const r = await fetchEliteProAccess(WHOP_USER_ID)
    expect(r.granted).toBe(false)
    expect(r.memberships[0].reasonValid).toBeNull()
    expect(r.memberships[0].memberAccessLevel).toBe('customer')
    expect(r.memberships[0].status).toBe('expired')
  })

  it('ÉLITE PRO canceled + member.access_level=admin (team member autre produit) → REFUS', async () => {
    stubFetch([mockFetchResponse({
      data: [{
        id: 'mem_canceled_but_admin',
        status: 'canceled',
        product: { id: PRODUCT_ID },
        user: { id: WHOP_USER_ID },
        member: { access_level: 'admin' },
      }],
      page_info: { has_next_page: false },
    })])
    expect(await hasActiveEliteProMembership(WHOP_USER_ID)).toBe(false)
  })
})

describe('fetchEliteProAccess — pagination curseur', () => {
  it('plusieurs pages : parcourt jusqu\'à la valide, early-return', async () => {
    stubFetch([
      mockFetchResponse({
        data: [{
          id: 'mem_page1_canceled', status: 'canceled',
          product: { id: PRODUCT_ID }, user: { id: WHOP_USER_ID },
        }],
        page_info: { has_next_page: true, end_cursor: 'cursor_p2' },
      }),
      mockFetchResponse({
        data: [{
          id: 'mem_page2_active', status: 'active',
          product: { id: PRODUCT_ID }, user: { id: WHOP_USER_ID },
        }],
        page_info: { has_next_page: true, end_cursor: 'cursor_p3' },
      }),
    ])
    const r = await fetchEliteProAccess(WHOP_USER_ID)
    expect(r.granted).toBe(true)
    expect(r.pagesChecked).toBe(2)
    // 3e page JAMAIS appelée (early-return après la valide en page 2)
  })

  it('page_info sans end_cursor → arrêt propre', async () => {
    stubFetch([
      mockFetchResponse({ data: [], page_info: { has_next_page: true, end_cursor: null } }),
    ])
    const r = await fetchEliteProAccess(WHOP_USER_ID)
    expect(r.granted).toBe(false)
    expect(r.pagesChecked).toBe(1)
  })
})

describe('fetchEliteProAccess — fail-closed', () => {
  it('HTTP 403 → granted=false + errorMessage mentionne les permissions', async () => {
    stubFetch([mockFetchResponse({ error: 'forbidden' }, { ok: false, status: 403 })])
    const r = await fetchEliteProAccess(WHOP_USER_ID)
    expect(r.granted).toBe(false)
    expect(r.errorStatus).toBe(403)
    expect(r.errorMessage).toContain('permissions')
    expect(r.errorMessage).toContain('member:basic:read')
  })

  it('HTTP 401 → granted=false + errorMessage mentionne la clé refusée', async () => {
    stubFetch([mockFetchResponse({ error: 'unauthorized' }, { ok: false, status: 401 })])
    const r = await fetchEliteProAccess(WHOP_USER_ID)
    expect(r.granted).toBe(false)
    expect(r.errorStatus).toBe(401)
    expect(r.errorMessage).toContain('clé')
  })

  it('HTTP 500 → granted=false, errorStatus propagé', async () => {
    stubFetch([mockFetchResponse('internal', { ok: false, status: 500 })])
    const r = await fetchEliteProAccess(WHOP_USER_ID)
    expect(r.granted).toBe(false)
    expect(r.errorStatus).toBe(500)
  })

  it('erreur réseau → granted=false + errorStatus=0', async () => {
    stubFetch([new Error('ECONNRESET')])
    const r = await fetchEliteProAccess(WHOP_USER_ID)
    expect(r.granted).toBe(false)
    expect(r.errorStatus).toBe(0)
    expect(r.errorMessage).toContain('ECONNRESET')
  })

  it('JSON invalide → granted=false, errorMessage="JSON parse failed"', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true, status: 200,
      headers: new Headers(),
      json: async () => { throw new Error('invalid json') },
    }) as unknown as typeof fetch
    const r = await fetchEliteProAccess(WHOP_USER_ID)
    expect(r.granted).toBe(false)
    expect(r.errorMessage).toBe('JSON parse failed')
  })

  it('env manquante (WHOP_COMPANY_ID) → granted=false, pas d\'appel réseau', async () => {
    delete process.env.WHOP_COMPANY_ID
    const fetchMock = stubFetch([mockFetchResponse({ data: [] })])
    const r = await fetchEliteProAccess(WHOP_USER_ID)
    expect(r.granted).toBe(false)
    expect(r.errorMessage).toContain('WHOP_COMPANY_ID')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('fetchEliteProAccess — observabilité', () => {
  it('header Deprecation capturé', async () => {
    stubFetch([mockFetchResponse(
      { data: [], page_info: { has_next_page: false } },
      { headers: { deprecation: 'true' } },
    )])
    const r = await fetchEliteProAccess(WHOP_USER_ID)
    expect(r.deprecationHeader).toBe('true')
  })
})

// ─── listActiveEliteProMemberships ───────────────────────────────────
//
// Les payloads utilisent le FORMAT RÉEL de /api/v1/memberships, capturé
// le 23/11/2026 sur le compte prod et confirmé contre
// https://api.whop.com/api/v1/openapi.json. Points clés :
//   - user_id, product_id, plan_id, billing_period_days sont au
//     TOP-LEVEL (pas dans user.id / product.id).
//   - product est aussi présent en nested, mais le canonique est
//     product_id top-level.
//   - member est null côté lecture serveur (clé API).
//   - email n'est PAS dans /memberships (il faut /members).

function membershipFixture(overrides: Record<string, unknown>) {
  return {
    id: 'mem_FIXTURE',
    status: 'active',
    user_id: 'user_FIXTURE',
    product_id: PRODUCT_ID,
    plan_id: 'plan_mensuel',
    product: { id: PRODUCT_ID, title: 'ÉLITE PRO 🥷' },
    member: null,
    billing_period_days: 30,
    current_period_start: '2026-10-07T15:50:35.825Z',
    current_period_end: '2026-12-06T15:50:36.148Z',
    expires_at: null,
    cancel_at_period_end: false,
    canceled_at: null,
    created_at: '2026-10-07T15:50:35.825Z',
    ...overrides,
  }
}

describe('listActiveEliteProMemberships', () => {
  it('lit user_id, product_id et plan_id au TOP-LEVEL (format réel Whop)', async () => {
    stubFetch([mockFetchResponse({
      data: [membershipFixture({
        id: 'mem_tIoZQUFFNwp5Ks',
        user_id: 'user_FPoin0981uR4r',
        plan_id: 'plan_V6NwEJbBAI5a6',
      })],
      page_info: { has_next_page: false },
    })])
    const r = await listActiveEliteProMemberships()
    expect(r.memberships).toHaveLength(1)
    const m = r.memberships[0]
    expect(m.membershipId).toBe('mem_tIoZQUFFNwp5Ks')
    expect(m.whopUserId).toBe('user_FPoin0981uR4r')   // ← PAS `null`
    expect(m.planId).toBe('plan_V6NwEJbBAI5a6')
    expect(m.email).toBeNull()                        // enrichi côté route via /members
  })

  it('enrichit kind/renewsOrExpiresAt depuis le format réel', async () => {
    stubFetch([mockFetchResponse({
      data: [
        membershipFixture({ id: 'mem_sub', billing_period_days: 30, current_period_end: '2026-12-06T00:00:00Z' }),
        membershipFixture({
          id: 'mem_oneshot', billing_period_days: 0,
          current_period_end: null, expires_at: '2027-01-01T00:00:00Z', cancel_at_period_end: true,
        }),
      ],
      page_info: { has_next_page: false },
    })])
    const r = await listActiveEliteProMemberships()
    const sub = r.memberships.find(m => m.membershipId === 'mem_sub')!
    const one = r.memberships.find(m => m.membershipId === 'mem_oneshot')!
    expect(sub.kind).toBe('subscription')
    expect(sub.renewsOrExpiresAt).toBe('2026-12-06T00:00:00Z')
    expect(sub.cancelAtPeriodEnd).toBe(false)
    expect(one.kind).toBe('one_time')
    expect(one.renewsOrExpiresAt).toBe('2027-01-01T00:00:00Z')
    expect(one.cancelAtPeriodEnd).toBe(true)
  })

  it('ne pose PAS user_id, parcourt plusieurs pages via curseur', async () => {
    const fetchMock = stubFetch([
      mockFetchResponse({
        data: [
          membershipFixture({ id: 'mem_a', user_id: 'user_a' }),
          membershipFixture({ id: 'mem_b', status: 'trialing', user_id: 'user_b' }),
        ],
        page_info: { has_next_page: true, end_cursor: 'c2' },
      }),
      mockFetchResponse({
        data: [
          membershipFixture({ id: 'mem_c', status: 'past_due', user_id: 'user_c' }),
        ],
        page_info: { has_next_page: false },
      }),
    ])
    const r = await listActiveEliteProMemberships()
    expect(r.memberships).toHaveLength(3)
    expect(r.pagesChecked).toBe(2)
    expect(r.truncated).toBe(false)
    expect(fetchMock.mock.calls[0][0]).not.toContain('user_id=')
    expect(fetchMock.mock.calls[1][0]).toContain('after=c2')
  })

  it('exclut une membership d\'un autre produit (défense en profondeur)', async () => {
    stubFetch([mockFetchResponse({
      data: [
        membershipFixture({ id: 'mem_ok', user_id: 'u1' }),
        membershipFixture({ id: 'mem_bad', user_id: 'u2', product_id: 'prod_OTHER', product: { id: 'prod_OTHER' } }),
      ],
      page_info: { has_next_page: false },
    })])
    const r = await listActiveEliteProMemberships()
    expect(r.memberships).toHaveLength(1)
    expect(r.memberships[0].membershipId).toBe('mem_ok')
  })

  it('exclut une membership au status non-actif (défense en profondeur)', async () => {
    stubFetch([mockFetchResponse({
      data: [
        membershipFixture({ id: 'mem_ok', user_id: 'u1' }),
        membershipFixture({ id: 'mem_exp', user_id: 'u2', status: 'expired' }),
      ],
      page_info: { has_next_page: false },
    })])
    const r = await listActiveEliteProMemberships()
    expect(r.memberships).toHaveLength(1)
    expect(r.memberships[0].membershipId).toBe('mem_ok')
  })

  it('truncated=true quand on atteint le plafond maxPages', async () => {
    stubFetch([
      mockFetchResponse({
        data: [membershipFixture({ id: 'mem_1', user_id: 'u1' })],
        page_info: { has_next_page: true, end_cursor: 'c2' },
      }),
    ])
    const r = await listActiveEliteProMemberships({ maxPages: 1 })
    expect(r.pagesChecked).toBe(1)
    expect(r.truncated).toBe(true)
  })

  it('HTTP 403 → fail-closed avec errorStatus + errorMessage', async () => {
    stubFetch([mockFetchResponse({}, { ok: false, status: 403 })])
    const r = await listActiveEliteProMemberships()
    expect(r.memberships).toEqual([])
    expect(r.errorStatus).toBe(403)
    expect(r.errorMessage).toContain('permissions')
  })

  it('env manquante → errorMessage, pas d\'appel réseau', async () => {
    delete process.env.WHOP_COMPANY_ID
    const fetchMock = stubFetch([mockFetchResponse({ data: [] })])
    const r = await listActiveEliteProMemberships()
    expect(r.errorMessage).toContain('WHOP_COMPANY_ID')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

// ─── fetchActiveEliteProMemberEmails (/members) ─────────────────────

function memberFixture(overrides: Record<string, unknown>) {
  return {
    id: 'mber_FIXTURE',
    email: 'someone@example.com',
    access_level: 'customer',
    status: 'joined',
    user: { id: 'user_FIXTURE', username: 'someone' },
    ...overrides,
  }
}

describe('fetchActiveEliteProMemberEmails', () => {
  it('appelle /members avec product_ids + membership_status=active (singulier string)', async () => {
    const fetchMock = stubFetch([mockFetchResponse({
      data: [memberFixture({ id: 'mber_1', user: { id: 'user_1' }, email: 'User.ONE@X.com' })],
      page_info: { has_next_page: false },
    })])
    const r = await fetchActiveEliteProMemberEmails()
    expect(fetchMock.mock.calls[0][0]).toContain('/api/v1/members')
    expect(fetchMock.mock.calls[0][0]).toContain('membership_status=active')
    expect(fetchMock.mock.calls[0][0]).toContain(`product_ids%5B%5D=${PRODUCT_ID}`)
    // Email en lowercase, par user_id
    expect(r.emailsByUserId.get('user_1')).toBe('user.one@x.com')
    expect(r.emailsPermissionMissing).toBe(false)
  })

  it('pagination via curseur', async () => {
    stubFetch([
      mockFetchResponse({
        data: [memberFixture({ user: { id: 'user_a' }, email: 'a@x.com' })],
        page_info: { has_next_page: true, end_cursor: 'cp2' },
      }),
      mockFetchResponse({
        data: [memberFixture({ user: { id: 'user_b' }, email: 'b@x.com' })],
        page_info: { has_next_page: false },
      }),
    ])
    const r = await fetchActiveEliteProMemberEmails()
    expect(r.pagesChecked).toBe(2)
    expect(r.emailsByUserId.size).toBe(2)
    expect(r.emailsByUserId.get('user_a')).toBe('a@x.com')
    expect(r.emailsByUserId.get('user_b')).toBe('b@x.com')
  })

  it('emailsPermissionMissing=true quand /members renvoie des rangées sans email', async () => {
    stubFetch([mockFetchResponse({
      data: [
        memberFixture({ user: { id: 'user_1' }, email: null }),
        memberFixture({ user: { id: 'user_2' }, email: null }),
      ],
      page_info: { has_next_page: false },
    })])
    const r = await fetchActiveEliteProMemberEmails()
    expect(r.emailsByUserId.size).toBe(0)
    expect(r.emailsPermissionMissing).toBe(true)
  })

  it('HTTP 403 → fail-closed + errorMessage mentionne member:email:read', async () => {
    stubFetch([mockFetchResponse({}, { ok: false, status: 403 })])
    const r = await fetchActiveEliteProMemberEmails()
    expect(r.errorStatus).toBe(403)
    expect(r.errorMessage).toContain('member:email:read')
  })
})

// ─── fetchEliteProPlans (/plans) ─────────────────────────────────────

describe('fetchEliteProPlans', () => {
  it('dérive un nom lisible depuis billing_period quand title est null', async () => {
    stubFetch([mockFetchResponse({
      data: [
        { id: 'plan_mens', title: null, description: null, plan_type: 'renewal', billing_period: 30, renewal_price: 74.9, currency: 'eur' },
        { id: 'plan_sem', title: null, description: null, plan_type: 'renewal', billing_period: 180, renewal_price: 399, currency: 'eur' },
        { id: 'plan_an', title: null, description: null, plan_type: 'renewal', billing_period: 365, renewal_price: 749, currency: 'eur' },
      ],
    })])
    const r = await fetchEliteProPlans()
    expect(r.plansById.get('plan_mens')?.name).toBe('Mensuel')
    expect(r.plansById.get('plan_sem')?.name).toBe('Semestriel')
    expect(r.plansById.get('plan_an')?.name).toBe('Annuel')
    expect(r.plansById.get('plan_mens')?.kind).toBe('subscription')
  })

  it('utilise title si Whop l\'a défini', async () => {
    stubFetch([mockFetchResponse({
      data: [
        { id: 'plan_x', title: 'Pack Premium Spécial', plan_type: 'renewal', billing_period: 30 },
      ],
    })])
    const r = await fetchEliteProPlans()
    expect(r.plansById.get('plan_x')?.name).toBe('Pack Premium Spécial')
  })

  it('plan_type=one_time → kind=one_time', async () => {
    stubFetch([mockFetchResponse({
      data: [{ id: 'plan_oneshot', title: 'Achat unique', plan_type: 'one_time', billing_period: null }],
    })])
    const r = await fetchEliteProPlans()
    expect(r.plansById.get('plan_oneshot')?.kind).toBe('one_time')
  })

  it('HTTP error → map vide + errorStatus propagé', async () => {
    stubFetch([mockFetchResponse({}, { ok: false, status: 500 })])
    const r = await fetchEliteProPlans()
    expect(r.plansById.size).toBe(0)
    expect(r.errorStatus).toBe(500)
  })
})

// ─── Rapprochement : les 4 cas réels cités par l'utilisateur ─────────
//
// La preuve donnée en prod : les memberships de gael.naime,
// eugene.yoan, laurent.aymes, omega apparaissaient dans
// missingDashboardAccounts (whopUserId=null, email=null), ET leurs
// profils dans flagMismatches. Avec le fix top-level, chaque membership
// porte le bon user_id → match direct par whop_user_id, les deux listes
// se vident, matchedProfileIds compte 4.

describe('Rapprochement membership → profil (régression prod)', () => {
  it('gael / eugene / laurent / omega : user_id top-level permet le match 1:1', async () => {
    stubFetch([mockFetchResponse({
      data: [
        membershipFixture({ id: 'mem_utYdlu6WNnFGsI',   user_id: 'user_K9k1EGhrCSs0Y' }),
        membershipFixture({ id: 'mem_aEYAuRs8i7XG0C',   user_id: 'user_G0uY0Y6ivUahx' }),
        membershipFixture({ id: 'mem_PqRve0OUHrcpv8',   user_id: 'user_D2tWboMRbTuOJ' }),
        membershipFixture({ id: 'mem_UJktTTSWTIo7cb',   user_id: 'user_EXfKjY0oZKe7D' }),
      ],
      page_info: { has_next_page: false },
    })])
    const r = await listActiveEliteProMemberships()
    expect(r.memberships).toHaveLength(4)
    const ids = r.memberships.map(m => m.whopUserId).sort()
    expect(ids).toEqual([
      'user_D2tWboMRbTuOJ', // laurent.aymes
      'user_EXfKjY0oZKe7D', // omega
      'user_G0uY0Y6ivUahx', // eugene.yoan
      'user_K9k1EGhrCSs0Y', // gael.naime
    ])
    // Chaque membership doit avoir un user_id non-null → zéro regression
    expect(r.memberships.every(m => m.whopUserId !== null)).toBe(true)
  })
})
