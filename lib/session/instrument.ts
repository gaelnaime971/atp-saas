/** Instrument proposé par défaut si le membre n'a encore rien saisi. */
export const DEFAULT_INSTRUMENT = 'NQ'

/**
 * Instrument proposé dans « Saisie de session » : le dernier utilisé par
 * le membre s'il fait partie de la liste, sinon NQ.
 */
export function defaultInstrument(lastUsed: string | null | undefined, available: readonly string[]): string {
  const last = lastUsed?.trim().toUpperCase()
  if (last && available.includes(last)) return last
  return available.includes(DEFAULT_INSTRUMENT) ? DEFAULT_INSTRUMENT : available[0]
}
