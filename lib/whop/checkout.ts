/**
 * Lien de (ré)abonnement Whop ÉLITE PRO.
 *
 * NEXT_PUBLIC_WHOP_CHECKOUT_URL (déjà utilisée par /login et
 * /whop/subscription-required) ; à défaut, le lien de la page d'accueil
 * (app/page.tsx), pour que le bouton mène toujours quelque part.
 */
export const WHOP_CHECKOUT_FALLBACK = 'https://whop.com/elite-b6/elite-b6/'

export function whopCheckoutUrl(): string {
  return process.env.NEXT_PUBLIC_WHOP_CHECKOUT_URL || WHOP_CHECKOUT_FALLBACK
}
