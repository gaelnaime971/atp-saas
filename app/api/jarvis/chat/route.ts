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
  stripAnnouncement, applyGoldenRuleGuard, applyJokerCodeFaitFoiGuard,
  buildMomentPayload,
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
      // 3F-CORRECTIF-2 — L'annonce est placée en tête par le CODE.
      // On INTERDIT au cerveau de la redire (y compris entre « »).
      jokerAddendum = `MODE JOKER — L'annonce officielle est placée en tête de réponse par le serveur, PAS par toi. NE la répète JAMAIS, NE la cite pas entre guillemets « », NE la paraphrase pas. Contente-toi d'écrire UNE phrase courte qui prolonge le propos. Interdits : ${canInvite ? 'pas de signal, pas de niveau, pas de "tu peux cliquer"' : 'ne JAMAIS inviter à entrer, ne JAMAIS donner de signal ni de niveau, ne JAMAIS sauter d\'étape'}.`
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
    })
    const [quota, brainOutcome] = await Promise.all([quotaPromise, brainPromise])

    if (!quota.allowed) return buildQuotaResponse(quota)
    if (!brainOutcome.ok) return brainOutcome.response

    // 3F-CORRECTIF-2 — Le CODE place l'annonce officielle en tête.
    // On strip toute reprise dans la sortie du modèle (répétitions,
    // guillemets « »), puis on préfixe.
    const announcement = directive.announce ?? jokerAnnounce
    let brainBody = stripAnnouncement(brainOutcome.reply, announcement)

    // 3F-CORRECTIF-3 — Garde-fou règle d'or : retire toute phrase du
    // cerveau qui pousse à entrer, exécuter ou dimensionner. S'applique
    // sur le corps post-strip (jamais sur l'annonce officielle).
    const guard = applyGoldenRuleGuard(brainBody)
    if (guard.removed.length > 0) {
      console.warn('[jarvis-guard]', {
        route: '/api/jarvis/chat', userId,
        removed: guard.removed.map(r => ({ label: r.label, len: r.sentence.length })),
      })
    }
    brainBody = guard.text

    // 3F-CORRECTIF-4 — Le CODE fait foi côté sortie : retire les
    // phrases qui affirment une étape Joker validée alors que l'état
    // enregistré ne la couvre pas.
    const jokerGuard = applyJokerCodeFaitFoiGuard(brainBody, jokerTransition.next)
    if (jokerGuard.removed.length > 0) {
      console.warn('[jarvis-guard]', {
        route: '/api/jarvis/chat', userId, step: jokerTransition.next,
        removed: jokerGuard.removed.map(r => ({ label: r.label, len: r.sentence.length })),
      })
    }
    brainBody = jokerGuard.text

    // 3F-CORRECTIF-3 — Si Joker actif, on coupe le brainBody à UNE
    // phrase max (le code dit déjà l'annonce, pas besoin d'épilogue).
    const jokerActive = jokerTransition.next !== 'inactive'
    if (jokerActive && announcement) {
      const firstSent = brainBody.match(/^.*?[.!?…](?=\s|$)/)
      if (firstSent) brainBody = firstSent[0]
    }

    let finalReply = announcement
      ? (brainBody ? `${announcement} ${brainBody}` : announcement)
      : (brainBody || 'Je reste à ton écoute.')

    // 3F-CORRECTIF-3 — Joker actif → longueur TRADER (texte : 400 car,
    // voix : 250 car), quelle que soit la casquette ambiante.
    if (jokerActive) {
      const CAP = 400
      if (finalReply.length > CAP) {
        const slice = finalReply.slice(0, CAP)
        const lastPunct = Math.max(
          slice.lastIndexOf('.'), slice.lastIndexOf('!'),
          slice.lastIndexOf('?'), slice.lastIndexOf('…'),
        )
        finalReply = lastPunct > 60 ? slice.slice(0, lastPunct + 1).trim() : slice.trim() + '…'
      }
    }

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
      reply: finalReply,
      casquette: brainOutcome.casquette,
      callsToday: quota.callsToday,
      callsLimit: quota.callsLimit,
      timings,
      cacheHits: ctx.cacheHits,
      brain: { provider: brainOutcome.provider, model: brainOutcome.model, fallbackCause: brainOutcome.fallbackCause },
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
      moment: buildMomentPayload(ctx),
    })
  } catch (err) {
    return buildProviderErrorResponse({ route: '/api/jarvis/chat', model: GROQ_TEXT_MODEL, detail: err })
  }
}
