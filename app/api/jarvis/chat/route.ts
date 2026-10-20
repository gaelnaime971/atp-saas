import { NextResponse, after } from 'next/server'
import { GROQ_TEXT_MODEL } from '@/lib/ai/groq-models'
import {
  checkAndCount,
  recordUsage,
  buildQuotaResponse,
  buildProviderErrorResponse,
} from '@/lib/ai/quota'
import { requireJarvisAccessFast, isTesterEmail } from '@/lib/jarvis/access'
import type { Casquette } from '@/lib/jarvis/casquette'

const VALID_CASQUETTES = new Set<Casquette>([
  'marché-fermé', 'hors-session', 'MANAGER', 'ANALYSTE', 'TRADER', 'COMPTABLE',
])
import {
  prepareContext, runBrain, detectDetailRequested,
  snapshotSession, buildSessionDirective, buildAntiRepetitionAddendum,
  type ChatMessage, type SessionEventRow,
} from '@/lib/jarvis/brain'
import { detectTradeEvent } from '@/lib/jarvis/event-detection'
import { insertTrade, insertRuleTriggered, insertJokerState } from '@/lib/jarvis/session-write'
import { getMarketBlock, needsMarketContext } from '@/lib/jarvis/market-context'
import { advanceJokerState, getCurrentJokerContext, JOKER_ANNOUNCE } from '@/lib/jarvis/joker'

export const runtime = 'nodejs'

interface RequestBody {
  messages: ChatMessage[]
  /** Testeurs : force une casquette côté client (ex: TRADER à 22h
   *  pour tester les règles de session). Ignoré si l'utilisateur
   *  n'est pas dans JARVIS_TESTERS. */
  forceCasquette?: string
}

export async function POST(request: Request) {
  const t_start = performance.now()
  const timings: Record<string, number> = {}
  try {
    const auth = await requireJarvisAccessFast()
    if (auth instanceof Response) return auth
    const { userId, email } = auth
    timings.auth = Math.round(performance.now() - t_start)

    const body = (await request.json()) as RequestBody
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return NextResponse.json({ error: 'messages requis' }, { status: 400 })
    }

    const t_ctxStart = performance.now()
    const ctx = await prepareContext(userId, email)
    timings.context = Math.round(performance.now() - t_ctxStart)

    // 3F-CORRECTIF — forceCasquette (testeurs uniquement). Permet de
    // simuler la session TRADER à n'importe quelle heure pour tester
    // le moteur de règles / Joker. Ignoré silencieusement sinon.
    if (body.forceCasquette && isTesterEmail(email)) {
      const fc = body.forceCasquette as Casquette
      if (VALID_CASQUETTES.has(fc)) {
        ctx.casquette.casquette = fc
      }
    }

    const lastUser = [...body.messages].reverse().find(m => m.role === 'user')?.content ?? ''
    const detailRequested = detectDetailRequested(lastUser)

    // ─── Détection event déterministe AVANT cerveau ───
    const detection = detectTradeEvent(lastUser)
    let notedEvent: SessionEventRow | null = null
    if (detection.kind === 'trade') {
      try {
        notedEvent = await insertTrade(userId, detection.trade)
        ctx.events.push(notedEvent)
      } catch (err) {
        console.error('[jarvis-chat] insertTrade failed', err)
      }
    }
    const tradeJustAdded = notedEvent !== null
    const snapshot = snapshotSession(ctx.events, ctx.rules, { tradeJustAdded })
    const riskAlreadyAsked = body.messages.some(m =>
      m.role === 'assistant' && /risque\s+par\s+trade/i.test(m.content))
    const tradeUsdOnly = detection.kind === 'trade'
      && detection.trade.result_r == null
      && detection.trade.result_usd != null
    const priorAssistantText = body.messages
      .filter(m => m.role === 'assistant').map(m => m.content).join(' ')
    const riskHint = detection.kind === 'trade' ? detection.trade.risk_per_trade_hint ?? null : null
    const directive = buildSessionDirective(
      detection.kind, snapshot, ctx.rules, tradeUsdOnly, riskAlreadyAsked,
      { riskHint, priorAssistantText },
    )
    const antiRep = buildAntiRepetitionAddendum(body.messages, lastUser)
    if (directive.triggered.length > 0) {
      after(async () => {
        for (const t of directive.triggered) {
          try { await insertRuleTriggered(userId, t.key, t.config) } catch (err) {
            console.error('[jarvis-chat] insertRuleTriggered failed', { key: t.key, err })
          }
        }
      })
    }

    // 3F.5 — Mode Joker (idem voice)
    const jokerCtxBefore = getCurrentJokerContext(ctx.events)
    const jokerTransition = (notedEvent && jokerCtxBefore.step !== 'inactive')
      ? { next: 'inactive' as const, cancelled: true, outOfOrder: false, reachedReady: false }
      : advanceJokerState(jokerCtxBefore, lastUser)
    let jokerAnnounce: string | null = null
    let jokerOutOfOrder = false
    if (jokerTransition.next !== jokerCtxBefore.step) {
      try {
        const inserted = await insertJokerState(userId, jokerTransition.next)
        ctx.events.push(inserted)
      } catch (err) {
        console.error('[jarvis-chat] insertJokerState failed', err)
      }
      // 3F-CORRECTIF : chaque transition a sa propre annonce officielle
      // (armé / M1 / M5 / prêt), pas uniquement "ready".
      jokerAnnounce = JOKER_ANNOUNCE[jokerTransition.next]
    }
    if ('outOfOrder' in jokerTransition && jokerTransition.outOfOrder) jokerOutOfOrder = true

    // 3F-bis : bloc marché seulement si question macro/actualité
    let marketBlock: string | null = null
    if (needsMarketContext(lastUser)) {
      try { marketBlock = await getMarketBlock() } catch { marketBlock = null }
    }

    let jokerAddendum: string | null = null
    if (jokerAnnounce) {
      const canInvite = jokerTransition.next === 'ready'
      jokerAddendum = `MODE JOKER — Commence TA réponse par EXACTEMENT ces mots (reproduis à l'identique, caractère par caractère, PREMIÈRE lettre comprise, les guillemets ne font pas partie du texte) :

«${jokerAnnounce}»

Puis au plus UNE phrase courte qui prolonge le propos. Interdits : ${canInvite ? 'pas de signal, pas de niveau, pas de "tu peux cliquer"' : 'ne JAMAIS inviter à entrer, ne JAMAIS donner de signal ni de niveau, ne JAMAIS sauter d\'étape'}.`
    } else if (jokerOutOfOrder) {
      jokerAddendum = `MODE JOKER — Le trader a mentionné une étape plus avancée que l'étape courante. Relève-le avec douceur en UNE phrase : rappelle qu'il faut d'abord valider le CHoCH M1 avant le M5.`
    }

    const extraParts = [jokerAddendum, directive.systemAddendum, antiRep, marketBlock].filter(Boolean) as string[]
    const extraSystem = extraParts.length > 0 ? extraParts.join('\n\n') : undefined

    // Quota en parallèle de l'appel Groq cerveau. Si refus, on jette
    // le résultat Groq et on retourne 429.
    const t_runStart = performance.now()
    const quotaPromise = checkAndCount(userId, 'jarvis', ctx.isAdmin)
    const brainPromise = runBrain(ctx, body.messages, {
      format: 'text',
      casquette: ctx.casquette.casquette,
      detailRequested,
      extraSystem,
      mandatoryOpening: directive.announce ?? jokerAnnounce,
    })
    const [quota, brainOutcome] = await Promise.all([quotaPromise, brainPromise])

    if (!quota.allowed) return buildQuotaResponse(quota)
    if (!brainOutcome.ok) return brainOutcome.response

    timings.quota = Math.round((performance.now() - t_runStart) - brainOutcome.groqMs)
    if (timings.quota < 0) timings.quota = 0
    timings.groq = brainOutcome.groqMs

    if (brainOutcome.usage) {
      const usage = brainOutcome.usage
      after(async () => {
        await recordUsage(userId, 'jarvis', {
          tokensIn: usage.prompt_tokens ?? 0,
          tokensOut: usage.completion_tokens ?? 0,
          model: brainOutcome.model, // 3F-ter : provider/model réel
        })
      })
    }

    timings.total = Math.round(performance.now() - t_start)

    return NextResponse.json({
      reply: brainOutcome.reply,
      casquette: brainOutcome.casquette,
      callsToday: quota.callsToday,
      callsLimit: quota.callsLimit,
      timings,
      cacheHits: ctx.cacheHits,
      brain: { provider: brainOutcome.provider, model: brainOutcome.model },
      session: {
        state: {
          tradesCount: snapshot.state.tradesCount,
          rSum: snapshot.state.rSum,
          usdSum: snapshot.state.usdSum,
        },
        notedEvent,
        triggered: directive.triggered.map(t => ({ key: t.key, message: t.message, config: t.config })),
        detection: detection.kind,
        joker: { step: jokerTransition.next, outOfOrder: jokerOutOfOrder },
      },
    })
  } catch (err) {
    return buildProviderErrorResponse({ route: '/api/jarvis/chat', model: GROQ_TEXT_MODEL, detail: err })
  }
}
