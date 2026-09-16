'use client'

import { useEffect, useRef } from 'react'

/**
 * TradingViewWidget — primitive d'embed pour tous les widgets TradingView
 * gratuits (calendrier économique, ticker tape, market overview, timeline
 * news, symbol overview, etc.).
 *
 * Pattern TradingView : un `<div>` container + un `<script>` async qui
 * charge le widget, avec la config en JSON dans le innerHTML du script
 * (leur convention bizarre mais officielle). On injecte le tout via
 * useEffect côté client, avec cleanup au unmount pour éviter les
 * duplications sur re-render.
 *
 * `configKey` est un identifiant stable de la config passée — utilisé
 * comme dep useEffect pour éviter les re-injections inutiles. Passer
 * une string simple (ex "calendar-today") plutôt que la config brute
 * (comparaison par référence, se déclenche à chaque render sinon).
 */

interface Props {
  /** URL du script TradingView (ex "https://s3.tradingview.com/external-embedding/embed-widget-events.js"). */
  scriptSrc: string
  /** Config JSON du widget (voir doc TradingView par type de widget). */
  config: Record<string, unknown>
  /** Clé stable pour éviter les re-injections (ex "calendar-today"). */
  configKey: string
  /** Hauteur du container (px ou "100%"). Défaut 400px. */
  height?: number | string
  /** Classe additionnelle sur le wrapper. */
  className?: string
}

export default function TradingViewWidget({
  scriptSrc,
  config,
  configKey,
  height = 400,
  className,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Reset : supprime tout script précédent + le widget déjà rendu.
    container.innerHTML = '<div class="tradingview-widget-container__widget"></div>'

    const script = document.createElement('script')
    script.src = scriptSrc
    script.async = true
    script.type = 'text/javascript'
    // Convention TradingView : la config est le innerHTML du script tag.
    script.innerHTML = JSON.stringify(config)
    container.appendChild(script)

    return () => {
      if (container) container.innerHTML = ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptSrc, configKey])

  return (
    <div
      ref={containerRef}
      className={`tradingview-widget-container ${className ?? ''}`}
      style={{ height, width: '100%' }}
    >
      <div className="tradingview-widget-container__widget"></div>
    </div>
  )
}
