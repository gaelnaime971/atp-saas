/**
 * Résolution des tokens sémantiques pour Chart.js.
 *
 * POURQUOI : Chart.js dessine sur un <canvas> HTML5 qui ne parse PAS
 * les CSS variables (contexte de dessin natif, pas DOM stylé). Passer
 * `borderColor: 'var(--color-profit)'` à un dataset Chart.js fait
 * fallback en noir. Ce helper résout les tokens côté client via
 * getComputedStyle une seule fois, à réappeler à chaque render (le
 * coût est négligeable, quelques getPropertyValue).
 *
 * Usage :
 *   const t = chartTokens()
 *   <Line data={{ datasets: [{
 *     borderColor: t.profit,
 *     backgroundColor: (ctx) => {
 *       const { chart } = ctx
 *       if (!chart.chartArea) return undefined
 *       return verticalGradient(chart.ctx, chart.chartArea, t.profitRgb, [[0, 0.25], [1, 0]])
 *     },
 *   }]}}>
 */

export interface ChartTokens {
  profit:     string   // "#22c55e"
  profitRgb:  string   // "34, 197, 94"
  loss:       string
  lossRgb:    string
  warn:       string
  warnRgb:    string
  text3:      string   // couleur des ticks/labels axes
  fontData:   string   // "var(--font-dm-mono), ui-monospace, ..."
  gridColor:  string   // couleur uniforme des lignes de grille (discret)
}

const FALLBACK: ChartTokens = {
  profit:    '#22c55e',
  profitRgb: '34, 197, 94',
  loss:      '#ef4444',
  lossRgb:   '239, 68, 68',
  warn:      '#f59e0b',
  warnRgb:   '245, 158, 11',
  text3:     '#52525b',
  fontData:  "'DM Mono', ui-monospace, monospace",
  gridColor: 'rgba(255, 255, 255, 0.04)',
}

/**
 * Résout les tokens sémantiques CSS via getComputedStyle. Retourne un
 * fallback en dur si exécuté côté serveur (typeof window === 'undefined').
 */
export function chartTokens(): ChartTokens {
  if (typeof window === 'undefined') return FALLBACK
  const s = getComputedStyle(document.documentElement)
  const get = (name: string, fallback: string) => {
    const v = s.getPropertyValue(name).trim()
    return v || fallback
  }
  return {
    profit:    get('--color-profit',      FALLBACK.profit),
    profitRgb: get('--color-profit-rgb',  FALLBACK.profitRgb),
    loss:      get('--color-loss',        FALLBACK.loss),
    lossRgb:   get('--color-loss-rgb',    FALLBACK.lossRgb),
    warn:      get('--color-warn',        FALLBACK.warn),
    warnRgb:   get('--color-warn-rgb',    FALLBACK.warnRgb),
    text3:     get('--color-text-3',      FALLBACK.text3),
    fontData:  get('--font-data',         FALLBACK.fontData),
    gridColor: FALLBACK.gridColor,
  }
}

/**
 * Fabrique un CanvasGradient vertical (top → bottom) pour Chart.js.
 *
 * @param ctx      Contexte 2D du canvas (chart.ctx dans les callbacks).
 * @param area     Zone de dessin (chart.chartArea). Peut être null au
 *                 premier render — l'appelant doit checker.
 * @param rgbTuple Triplet "R, G, B" (ex "34, 197, 94"). Vient de chartTokens().
 * @param stops    Liste de [position 0→1, alpha 0→1]. Ex : [[0, 0.25], [1, 0]]
 *                 = dégradé 25% opaque en haut → transparent en bas.
 */
export function verticalGradient(
  ctx: CanvasRenderingContext2D,
  area: { top: number; bottom: number },
  rgbTuple: string,
  stops: Array<[number, number]>,
): CanvasGradient {
  const g = ctx.createLinearGradient(0, area.top, 0, area.bottom)
  for (const [pos, alpha] of stops) {
    g.addColorStop(pos, `rgba(${rgbTuple}, ${alpha})`)
  }
  return g
}

/**
 * Helper spécifique aux barres : renvoie une fonction Chart.js qui produit
 * un gradient vertical par barre, teinté selon le signe de la valeur.
 * profit si v > 0, loss si v < 0, warn si v === 0.
 *
 * Usage :
 *   backgroundColor: barGradientByValue(t)
 */
export function barGradientByValue(t: ChartTokens) {
  return (ctx: { chart: { ctx: CanvasRenderingContext2D; chartArea: { top: number; bottom: number } | null }; parsed: { y: number | null } }) => {
    const { chart, parsed } = ctx
    if (!chart.chartArea) return `rgba(${t.profitRgb}, 0.7)`  // fallback avant premier layout
    const v = parsed.y ?? 0
    const rgb = v > 0 ? t.profitRgb : v < 0 ? t.lossRgb : t.warnRgb
    // Gradient plus opaque en haut (0.9), plus doux en bas (0.5).
    return verticalGradient(chart.ctx, chart.chartArea, rgb, [[0, 0.9], [1, 0.5]])
  }
}
