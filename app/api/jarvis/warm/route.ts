import { NextResponse } from 'next/server'
import { requireJarvisAccessFast } from '@/lib/jarvis/access'
import { prepareContext, buildMomentPayload } from '@/lib/jarvis/brain'
import { getCurrentJokerContext } from '@/lib/jarvis/joker'
import { peekQuota } from '@/lib/ai/quota'

export const runtime = 'nodejs'

/**
 * Préchauffage Jarvis — appelé par la page /jarvis à l'ouverture
 * puis toutes les 4 minutes tant qu'elle reste ouverte.
 *
 * Objectifs :
 *   1. Réveiller l'instance Vercel (cold start) avant la 1re
 *      interaction utilisateur.
 *   2. Peupler les caches module-level (stats 30 min, routine
 *      5 min, profile 30 min) pour que le 1er échange réel démarre
 *      déjà en cache hit.
 *
 * Contraintes :
 *   - Même gate que les autres routes Jarvis
 *     (JARVIS_ENABLED + JARVIS_ALLOWED_EMAILS). 404 sinon.
 *   - ZÉRO appel IA (ni Groq ni ElevenLabs).
 *   - ZÉRO incrément de quota : on n'appelle PAS checkAndCount.
 *     Ce n'est pas un échange, c'est de la plomberie.
 */
export async function POST(request: Request) {
  const t_start = performance.now()
  try {
    const auth = await requireJarvisAccessFast()
    if (auth instanceof Response) return auth
    const { userId, email } = auth

    // Préchauffe le cache contexte + lit le compteur du jour en //
    const [ctx, counter] = await Promise.all([
      prepareContext(userId, email),
      // isAdmin pas encore connu : passe false (peekQuota ne décide
      // rien, elle lit) ; on surclasse après avec le vrai isAdmin.
      peekQuota(userId, 'jarvis', false),
    ])
    const callsLimit = ctx.isAdmin ? -1 : counter.callsLimit
    const total = Math.round(performance.now() - t_start)

    // 3G — Payload moment pour que la page affiche le bon état au
    // chargement, avant tout échange.
    const jokerCtx = getCurrentJokerContext(ctx.events, ctx.now)
    const trades = ctx.events.filter(e => e.type === 'trade')
    const sessionState = {
      tradesCount: trades.length,
      rSum: null as number | null,
      usdSum: 0,
    }
    return NextResponse.json({
      ok: true,
      cacheHits: ctx.cacheHits,
      callsToday: counter.callsToday,
      callsLimit,
      casquette: ctx.casquette.casquette,
      ms: total,
      session: { state: sessionState, joker: { step: jokerCtx.step } },
      moment: buildMomentPayload(ctx),
    })
  } catch (err) {
    console.error('[jarvis-warm]', err)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}

// Alias GET en lecture (utile pour un simple ping manuel)
export async function GET(request: Request) {
  return POST(request)
}
