'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

interface Trade {
  time: string
  inst: string
  side: string
  pnl: number
  r: number
  status: string
}

interface Level {
  v: number
  t: string
}

const pad = (n: number) => String(n).padStart(2, '0')
const DAYS = ['DIMANCHE', 'LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI']
const MONTHS = ['JANV', 'FÉVR', 'MARS', 'AVRIL', 'MAI', 'JUIN', 'JUIL', 'AOÛT', 'SEPT', 'OCT', 'NOV', 'DÉC']

const RULES = [
  { n: '01', t: 'SL fixe 25 pts ATP', s: "Défini avant l'entrée. Jamais élargi." },
  { n: '02', t: 'Risque 0.2–0.4% max', s: 'Sizing calculé. Zéro trade sans calcul.' },
  { n: '03', t: '3 SL = pause 30 min', s: 'Arrêt immédiat. Pas de revanche.' },
  { n: '04', t: 'Pas de revenge trading', s: 'Une perte = opportunité ratée, pas une dette.' },
  { n: '05', t: 'News HIGH = sizing ÷2', s: '30 min avant/après. Ou on passe.' },
  { n: '06', t: '+40 pts = bonne session', s: 'Objectif atteint → on ferme tout.' },
]

const CHK_ITEMS = [
  'Calendrier éco vérifié',
  'Niveaux clés identifiés',
  "Sizing calculé avant d'entrer",
  'Daily loss max défini',
  'Mindset stable — pas de stress',
  'Plan de session écrit (A + B)',
  'Environnement de travail prêt',
]

const QUOTES = [
  { t: '"Le marché récompense la patience et punit l\'impatience."', a: '— Jesse Livermore' },
  { t: '"Protège ton capital. C\'est ton seul outil de travail."', a: '— Paul Tudor Jones' },
  { t: '"Ne confondez pas le talent avec un marché haussier."', a: '— Nassim Taleb' },
  { t: '"La première règle : ne jamais perdre d\'argent."', a: '— Warren Buffett' },
  { t: '"Le trading c\'est 20% méthode, 80% psychologie."', a: '— Van Tharp' },
  { t: '"Les pertes font partie du jeu. Le revenge trading non."', a: '— ATP · Gaël' },
  { t: '"Ce n\'est pas le marché qui te bat, c\'est toi-même."', a: '— Mark Douglas' },
  { t: '"Les amateurs se concentrent sur les gains. Les pros gèrent le risque."', a: '— Larry Hite' },
  { t: '"Un bon trader est un bon perdant."', a: '— Mark Weinstein' },
  { t: '"Le secret du trading : couper les pertes, laisser courir les gains."', a: '— David Ricardo' },
  { t: '"Le marché peut rester irrationnel plus longtemps que vous ne pouvez rester solvable."', a: '— John M. Keynes' },
  { t: '"Plan your trade, trade your plan."', a: '— Linda Raschke' },
  { t: '"La discipline, c\'est de faire ce qui est difficile quand personne ne regarde."', a: '— ATP · Gaël' },
  { t: '"Si tu ne sais pas qui tu es, le marché te le rappellera."', a: '— Alexander Elder' },
  { t: '"Les marchés sont un mécanisme pour transférer l\'argent des impatients aux patients."', a: '— Warren Buffett' },
  { t: '"Le meilleur trade est celui que tu ne prends pas."', a: '— ATP · Gaël' },
  { t: '"Ta routine pré-marché détermine 80% de ta session."', a: '— ATP · Gaël' },
  { t: '"Le journal de trading est ton meilleur mentor."', a: '— Brett Steenbarger' },
  { t: '"Les opportunités reviennent. Le capital perdu, non."', a: '— ATP · Gaël' },
  { t: '"Ce qui sépare les pros des amateurs : la régularité."', a: '— Ray Dalio' },
  { t: '"Trade ce que tu vois, pas ce que tu crois."', a: '— Al Brooks' },
  { t: '"Le but n\'est pas d\'avoir raison. Le but est de gagner de l\'argent."', a: '— George Soros' },
  { t: '"Ton edge n\'existe que si tu l\'appliques avec discipline."', a: '— ATP · Gaël' },
  { t: '"Chaque perte est une leçon si tu la documentes."', a: '— ATP · Gaël' },
]

const BSEQ = [
  { p: 'INSPIRER', c: 4, cl: 'inhale' },
  { p: 'RETENIR', c: 4, cl: 'hold' },
  { p: 'EXPIRER', c: 6, cl: 'exhale' },
  { p: 'PAUSE', c: 2, cl: '' },
]

const LEVEL_COLORS: Record<string, string> = { RES: '#ff3355', SUP: '#00ff88', OB: '#ffaa00', FVG: '#00aaff' }

export default function SessionLive({ onExit }: { onExit?: () => void }) {
  // Boot
  const [booted, setBooted] = useState(false)
  useEffect(() => { const t = setTimeout(() => setBooted(true), 2600); return () => clearTimeout(t) }, [])

  // Clock
  const [clock, setClock] = useState('--:--:--')
  const [dateLine, setDateLine] = useState('—')
  const [mktOpen, setMktOpen] = useState(false)
  const sessionStart = useRef(new Date())
  const [sessionTimer, setSessionTimer] = useState('00:00:00')

  // Mental
  const [mental, setMental] = useState(5)
  const mentalLabel = mental <= 3 ? '⚠ TILT — NE PAS TRADER' : mental <= 6 ? '◈ NEUTRE — TRADER AVEC PRUDENCE' : '◆ FOCUS — PRÊT À OPÉRER'
  const mentalCls = mental <= 3 ? 'ms-t' : mental <= 6 ? 'ms-n' : 'ms-f'
  const mentalBadge = mental <= 3 ? 'TILT' : mental <= 6 ? 'NEUTRE' : 'FOCUS'

  // Breath
  const [breathOn, setBreathOn] = useState(false)
  const breathStep = useRef(0)
  const breathTick = useRef(0)
  const [breathPhase, setBreathPhase] = useState('INSPIRER — 4s')
  const [breathNum, setBreathNum] = useState(4)
  const [breathClass, setBreathClass] = useState('')

  // Checklist
  const [checks, setChecks] = useState<boolean[]>(new Array(CHK_ITEMS.length).fill(false))
  const checksDone = checks.filter(Boolean).length

  // Trades
  const [trades, setTrades] = useState<Trade[]>([])
  const [pnlHist, setPnlHist] = useState<number[]>([0])
  const [consec, setConsec] = useState(0)
  const [pauseOn, setPauseOn] = useState(false)
  const [pauseSec, setPauseSec] = useState(0)

  // Trade input
  const [iInst, setIInst] = useState('YM')
  const [iSide, setISide] = useState('LONG')
  const [iPnl, setIPnl] = useState('')
  const [iR, setIR] = useState('')

  // Note
  const [note, setNote] = useState('')

  // Levels
  const [levels, setLevels] = useState<Level[]>([])
  const [lvlInp, setLvlInp] = useState('')
  const [lvlType, setLvlType] = useState('RES')

  // Calculator
  const [cCap, setCCap] = useState('10000')
  const [cRisk, setCRisk] = useState('0.3')
  const [cSl, setCSl] = useState('25')
  const [cInst, setCInst] = useState('0.5')
  const [calcResult, setCalcResult] = useState('')

  // Prices
  const [prices, setPrices] = useState<Record<string, { price: number; chg: number; pct: number; up: boolean; closes: number[] }>>({})

  // Chart analysis
  const [chartLoading, setChartLoading] = useState(false)
  const [chartResult, setChartResult] = useState<{ tendance?: string; structure?: string; niveaux?: Array<{ type: string; prix: string; description: string }>; confluences?: string[]; premium_discount?: string; liquidity?: string; biais?: string; analyse?: string } | null>(null)
  const [chartPreview, setChartPreview] = useState<string | null>(null)

  // AI
  const [aiLoading, setAiLoading] = useState(false)
  const [aiCards, setAiCards] = useState<Array<{ headline: string; signal: string; impact: string; analyse: string; instruments: string[] }>>([])
  const [aiSummary, setAiSummary] = useState('')
  const [aiTime, setAiTime] = useState('')
  const [aiInput, setAiInput] = useState('')

  // Quotes — pick random shuffled set
  const quotesRef = useRef((() => {
    const shuffled = [...QUOTES].sort(() => Math.random() - 0.5)
    return shuffled
  })())


  // Clock tick
  useEffect(() => {
    const iv = setInterval(() => {
      const now = new Date()
      setClock(`${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`)
      setDateLine(`${DAYS[now.getDay()]} ${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`)
      const h = now.getHours() + now.getMinutes() / 60
      const wd = now.getDay() >= 1 && now.getDay() <= 5
      setMktOpen(wd && h >= 15.5 && h < 22)
      const d = Math.floor((now.getTime() - sessionStart.current.getTime()) / 1000)
      setSessionTimer(`${pad(Math.floor(d / 3600))}:${pad(Math.floor((d % 3600) / 60))}:${pad(d % 60)}`)
    }, 1000)
    return () => clearInterval(iv)
  }, [])

  // Pause timer
  useEffect(() => {
    if (!pauseOn || pauseSec <= 0) return
    const iv = setInterval(() => {
      setPauseSec(prev => {
        if (prev <= 1) { setPauseOn(false); setConsec(0); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(iv)
  }, [pauseOn, pauseSec])

  // Breath
  useEffect(() => {
    if (!breathOn) return
    const iv = setInterval(() => {
      const s = BSEQ[breathStep.current]
      const remaining = s.c - breathTick.current
      setBreathPhase(`${s.p} — ${s.c}s`)
      setBreathNum(remaining)
      if (breathTick.current === 0) setBreathClass(s.cl)
      breathTick.current++
      if (breathTick.current >= s.c) {
        breathTick.current = 0
        breathStep.current = (breathStep.current + 1) % BSEQ.length
      }
    }, 1000)
    return () => clearInterval(iv)
  }, [breathOn])

  // Fetch prices
  const fetchPrices = useCallback(async () => {
    const insts = [{ sym: 'YM=F', id: 'ym' }, { sym: 'NQ=F', id: 'nq' }, { sym: 'ES=F', id: 'es' }]
    const newPrices: typeof prices = {}
    for (const inst of insts) {
      try {
        const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${inst.sym}?interval=1m&range=1d`)
        const data = await r.json()
        const q = data?.chart?.result?.[0]
        if (!q) continue
        const meta = q.meta
        const price = meta.regularMarketPrice
        const prev = meta.previousClose || meta.chartPreviousClose
        const chg = price - prev
        const pct = (chg / prev) * 100
        const closes = (q.indicators?.quote?.[0]?.close || []).filter(Boolean) as number[]
        newPrices[inst.id] = { price, chg, pct, up: chg >= 0, closes }
      } catch { /* ignore */ }
    }
    setPrices(prev => ({ ...prev, ...newPrices }))
  }, [])

  useEffect(() => {
    if (!booted) return
    fetchPrices()
    const iv = setInterval(fetchPrices, 60000)
    return () => clearInterval(iv)
  }, [booted, fetchPrices])

  // Calc risk
  const doCalc = useCallback(() => {
    const cap = parseFloat(cCap) || 10000
    const rp = parseFloat(cRisk) || 0.3
    const sl = parseFloat(cSl) || 25
    const pv = parseFloat(cInst) || 0.5
    const ra = cap * rp / 100
    const cts = Math.floor(ra / (sl * pv))
    const ar = cts * sl * pv
    setCalcResult(`RISQUE MAX: ${ra.toFixed(2)}€ | CONTRATS: ${cts} | RISQUE RÉEL: ${ar.toFixed(2)}€ | TP25→ +${(cts * 25 * pv).toFixed(2)}€ | TP50→ +${(cts * 50 * pv).toFixed(2)}€`)
  }, [cCap, cRisk, cSl, cInst])

  useEffect(() => { doCalc() }, [doCalc])

  // Log trade
  const logTrade = () => {
    const pnl = parseFloat(iPnl) || 0
    const r = parseFloat(iR) || 0
    const now = new Date()
    const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
    const newTrade: Trade = { time, inst: iInst, side: iSide, pnl, r, status: pnl >= 0 ? 'WIN' : 'LOSS' }
    const newTrades = [...trades, newTrade]
    setTrades(newTrades)
    setIPnl('')
    setIR('')
    const newConsec = pnl < 0 ? consec + 1 : 0
    setConsec(newConsec)
    if (newConsec >= 3) { setPauseSec(1800); setPauseOn(true) }
    const totalPnl = newTrades.reduce((s, t) => s + t.pnl, 0)
    setPnlHist(prev => [...prev, totalPnl])
  }

  // Computed stats
  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0)
  const totalR = trades.reduce((s, t) => s + t.r, 0)
  const wins = trades.filter(t => t.pnl >= 0).length
  const losses = trades.length - wins
  const winPct = trades.length > 0 ? Math.round((wins / trades.length) * 100) : 0
  const bestTrade = trades.length > 0 ? Math.max(...trades.map(t => t.pnl)) : 0
  const worstTrade = trades.length > 0 ? Math.min(...trades.map(t => t.pnl)) : 0
  const avgPnl = trades.length > 0 ? totalPnl / trades.length : 0
  const rMax = trades.length > 0 ? Math.max(...trades.map(t => t.r)) : 0
  const grossWin = trades.filter(t => t.pnl > 0).reduce((s, t) => s + t.pnl, 0)
  const grossLoss = Math.abs(trades.filter(t => t.pnl < 0).reduce((s, t) => s + t.pnl, 0))
  const pf = grossLoss > 0 ? (grossWin / grossLoss).toFixed(2) : trades.length > 0 ? '∞' : '—'
  const dailyLoss = Math.abs(Math.min(totalPnl, 0))
  const dailyObj = Math.max(totalPnl, 0)

  // Discipline score
  const discScore = (() => {
    let s = Math.round((checksDone / CHK_ITEMS.length) * 60)
    if (trades.length > 0) s += Math.round((wins / trades.length) * 30)
    s += consec === 0 ? 10 : consec < 3 ? 5 : 0
    return Math.min(100, s)
  })()

  // Sparkline
  const sparkPoints = (() => {
    if (pnlHist.length < 2) return '0,45 400,45'
    const mn = Math.min(...pnlHist)
    const mx = Math.max(...pnlHist)
    const rng = mx - mn || 1
    return pnlHist.map((v, i) => {
      const x = (i / (pnlHist.length - 1)) * 400
      const y = 90 - ((v - mn) / rng * 80 + 5)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    }).join(' ')
  })()

  // AI
  const analyzeNews = async () => {
    setAiLoading(true)
    setAiCards([])
    setAiSummary('')
    const ctx = `Session: ${trades.length} trades, P&L ${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}€`
    const prompt = aiInput.trim()
      ? `Tu es un trader senior sur futures US (YM, NQ, ES). Analyse ces news pour la session de trading.\n\nNEWS: ${aiInput}\nContexte: ${ctx}\n\nRéponds UNIQUEMENT en JSON valide avec cette structure exacte:\n{"items":[{"headline":"titre court","signal":"BULLISH ou BEARISH ou NEUTRE","impact":"FORT ou MODÉRÉ ou FAIBLE","analyse":"2 phrases concises et actionnables","instruments":["YM","NQ"]}],"summary":"biais global + conseil pour la session US en 1-2 phrases"}`
      : `Tu es un trader senior sur futures US.\nDate: ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}. Contexte: ${ctx}\n\nDonne 3 facteurs macro à surveiller pour la session US aujourd'hui.\n\nRéponds UNIQUEMENT en JSON valide avec cette structure exacte:\n{"items":[{"headline":"facteur","signal":"BULLISH ou BEARISH ou NEUTRE","impact":"FORT ou MODÉRÉ ou FAIBLE","analyse":"explication actionnable","instruments":["YM","NQ"]}],"summary":"conseil général pour la session en 1-2 phrases"}`
    try {
      const r = await fetch('/api/ai-news', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }) })
      const data = await r.json()
      if (data.error) {
        setAiSummary(`Erreur API: ${typeof data.error === 'string' ? data.error : JSON.stringify(data.error)}`)
        setAiLoading(false)
        return
      }
      let raw = data.text || ''
      if (!raw) {
        setAiSummary('Aucune réponse reçue de l\'API')
        setAiLoading(false)
        return
      }
      // Strip markdown code blocks if present
      raw = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
      let parsedCards: typeof aiCards = []
      let parsedSummary = ''
      try {
        const full = JSON.parse(raw)
        if (full.items && Array.isArray(full.items)) parsedCards = full.items
        else if (Array.isArray(full)) parsedCards = full
        if (full.summary) parsedSummary = full.summary
      } catch {
        try {
          const am = raw.match(/\[[\s\S]*?\]/)
          if (am) parsedCards = JSON.parse(am[0])
        } catch { /* ignore */ }
        try {
          const sm = raw.match(/"summary"\s*:\s*"([^"]+)"/)
          if (sm) parsedSummary = sm[1]
        } catch { /* ignore */ }
      }
      if (parsedCards.length > 0) setAiCards(parsedCards)
      if (parsedSummary.trim()) setAiSummary(parsedSummary.trim())
      if (parsedCards.length === 0 && !parsedSummary.trim()) setAiSummary(raw.substring(0, 300))
      const now = new Date()
      setAiTime(`ANALYSÉ ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`)
    } catch (err) {
      setAiSummary(`Erreur: ${err instanceof Error ? err.message : 'connexion échouée'}`)
    }
    setAiLoading(false)
  }

  // Chart analysis
  const handleChartUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const base64 = ev.target?.result as string
      setChartPreview(base64)
      setChartLoading(true)
      setChartResult(null)
      try {
        const r = await fetch('/api/ai-chart', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64 }),
        })
        const data = await r.json()
        if (data.error) {
          setChartResult({ analyse: `Erreur: ${typeof data.error === 'string' ? data.error : JSON.stringify(data.error)}` })
          setChartLoading(false)
          return
        }
        let raw = (data.text || '').replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
        try {
          setChartResult(JSON.parse(raw))
        } catch {
          setChartResult({ analyse: raw.substring(0, 400) })
        }
      } catch (err) {
        setChartResult({ analyse: `Erreur: ${err instanceof Error ? err.message : 'connexion échouée'}` })
      }
      setChartLoading(false)
    }
    reader.readAsDataURL(file)
  }

  // End session
  const endSession = () => {
    const d = Math.floor((new Date().getTime() - sessionStart.current.getTime()) / 1000)
    alert(`═══ BILAN SESSION ATP ═══\n\nDurée: ${pad(Math.floor(d / 3600))}h${pad(Math.floor((d % 3600) / 60))}m\nTrades: ${trades.length} (${wins}W / ${losses}L)\nP&L: ${(totalPnl >= 0 ? '+' : '') + totalPnl.toFixed(2)}€\nR∑: ${(totalR >= 0 ? '+' : '') + totalR.toFixed(1)}R\n\n═══════════════════\nBonne fin de session.`)
    onExit?.()
  }

  // Add level
  const addLevel = () => {
    const v = parseFloat(lvlInp)
    if (!v) return
    setLevels(prev => [...prev, { v, t: lvlType }].sort((a, b) => b.v - a.v))
    setLvlInp('')
  }



  // Boot screen
  if (!booted) {
    return (
      <div style={S.boot}>
        <style>{STYLES}</style>
        <div style={S.blogo}>ATP</div>
        <div style={S.bsub}>TERMINAL SESSION — ALPHA TRADING PRO</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 320, marginBottom: 18 }}>
          {['INIT SYSTÈME...', 'CHARGEMENT RÈGLES ATP...', 'CONNEXION MARCHÉS CME...', 'CALCULATEUR RISQUE...', 'ASSISTANT IA CONNECTÉ...'].map((line, i) => (
            <div key={i} className="bline" style={{ animationDelay: `${0.1 + i * 0.3}s` }}>{line} <span style={{ color: 'var(--g)' }}>[OK]</span></div>
          ))}
          <div className="bline" style={{ animationDelay: '1.6s', color: 'var(--g)' }}>▸ BONNE SESSION. RESTE DISCIPLINÉ.</div>
        </div>
        <div style={S.bbarW}><div className="bbar" /></div>
      </div>
    )
  }

  return (
    <>
      <style>{STYLES}</style>
      <div className="gbg" />
      <div className="glow gl-tl" />
      <div className="glow gl-br" />

      <div className="terminal">
        {/* TOPBAR */}
        <div className="topbar">
          <div className="tb-seg" style={{ minWidth: 130 }}>
            <span className="tb-logo">ATP</span><span className="tb-lbl">TERMINAL</span>
          </div>
          <div className="tb-seg">
            <div className={`sp ${mktOpen ? 'sp-o' : 'sp-c'}`}>
              <div className={`sdot ${mktOpen ? 'sdot-g' : 'sdot-r'}`} />
              <span>{mktOpen ? 'MARCHÉ OUVERT' : 'MARCHÉ FERMÉ'}</span>
            </div>
          </div>
          <div className="ticker-wrap">
            <iframe title="ticker" src="https://s.tradingview.com/embed-widget/ticker-tape/?locale=fr#%7B%22symbols%22%3A%5B%7B%22proName%22%3A%22FOREXCOM%3ASPXUSD%22%2C%22title%22%3A%22SPX%22%7D%2C%7B%22proName%22%3A%22FX%3AEURUSD%22%2C%22title%22%3A%22EUR%2FUSD%22%7D%2C%7B%22proName%22%3A%22BITSTAMP%3ABTCUSD%22%2C%22title%22%3A%22BTC%22%7D%2C%7B%22proName%22%3A%22BITSTAMP%3AETHUSD%22%2C%22title%22%3A%22ETH%22%7D%2C%7B%22proName%22%3A%22CMCMARKETS%3AGOLD%22%2C%22title%22%3A%22GOLD%22%7D%2C%7B%22proName%22%3A%22TVC%3AVIX%22%2C%22title%22%3A%22VIX%22%7D%2C%7B%22proName%22%3A%22NASDAQ%3ANVDA%22%2C%22title%22%3A%22NVDA%22%7D%5D%2C%22showSymbolLogo%22%3Afalse%2C%22isTransparent%22%3Atrue%2C%22displayMode%22%3A%22compact%22%2C%22colorTheme%22%3A%22dark%22%7D" style={{ width: '100%', height: '100%', border: 'none' }} />
          </div>
          <div className="tb-seg clk-seg" style={{ minWidth: 150, textAlign: 'center', borderLeft: '1px solid var(--border)' }}>
            <div className="clk">{clock}</div>
            <div className="clk-d">{dateLine}</div>
          </div>
          <div className="tb-seg sess-seg" style={{ borderLeft: '1px solid var(--border)', gap: 8, padding: '0 14px' }}>
            <span className="ss-lbl">SESSION</span>
            <span className="ss-t">{sessionTimer}</span>
          </div>
        </div>

        {/* MAIN 6 COLS */}
        <div className="main">

          {/* COL1: MENTAL + BREATH */}
          <div className="col">
            <div className="ph"><span className="ph-t">ÉTAT MENTAL</span><span className="ph-b">{mentalBadge}</span></div>
            <div className="blk">
              <div className="blt">ÉVALUER AVANT DE TRADER</div>
              <div className="mgrid">
                {Array.from({ length: 10 }, (_, i) => {
                  const v = i + 1
                  const cls = v <= mental ? (mental <= 3 ? 'tilt' : mental <= 6 ? 'neu' : 'foc') : ''
                  return <div key={i} className={`mc ${cls}`} onClick={() => setMental(v)} />
                })}
              </div>
              <div className="ms-labs"><span>TILT</span><span>NEUTRE</span><span>FOCUS</span></div>
              <div className={`mstate ${mentalCls}`}>{mentalLabel}</div>
            </div>

            <div className="ph"><span className="ph-t">RESPIRATION 4-4-6</span></div>
            <div className="blk">
              <div className="bvis">
                <div className="bring-w">
                  <div className={`bring ${breathClass}`}><span className="bnum">{breathNum}</span></div>
                </div>
                <div className="bphase">{breathPhase}</div>
              </div>
              <button className="bbtn" onClick={() => {
                if (breathOn) { setBreathOn(false); breathStep.current = 0; breathTick.current = 0; setBreathClass(''); setBreathPhase('INSPIRER — 4s'); setBreathNum(4) }
                else setBreathOn(true)
              }}>{breathOn ? '■ ARRÊTER' : '▸ DÉMARRER PROTOCOLE'}</button>
            </div>

            {pauseOn && (
              <div className="blk">
                <div className="palert show">
                  <div className="pa-t">⚠ PAUSE OBLIGATOIRE</div>
                  <div className="pa-tm">{`${pad(Math.floor(pauseSec / 60))}:${pad(pauseSec % 60)}`}</div>
                  <div className="pa-tx">3 pertes consécutives.<br />Attends. Respire. Règle n°3.</div>
                </div>
              </div>
            )}

            <div className="ph"><span className="ph-t">CITATIONS</span><span className="ph-b">{quotesRef.current.length}</span></div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '6px 12px' }}>
              {quotesRef.current.map((q, i) => (
                <div key={i} style={{ padding: '8px 0', borderBottom: i < quotesRef.current.length - 1 ? '1px solid var(--vdim)' : 'none' }}>
                  <div className="qt">{q.t}</div>
                  <div className="qa">{q.a}</div>
                </div>
              ))}
            </div>
          </div>

          {/* COL2: CHECKLIST + DISCIPLINE + RULES */}
          <div className="col">
            <div className="ph"><span className="ph-t">CHECKLIST PRÉ-SESSION</span><span className="ph-b">{checksDone}/{CHK_ITEMS.length}</span></div>
            <div className="blk">
              <div className="cpbar"><div className="cpfill" style={{ width: `${Math.round((checksDone / CHK_ITEMS.length) * 100)}%` }} /></div>
              <div className="cplbls"><span>PROGRESSION</span><span>{checksDone}/{CHK_ITEMS.length}</span></div>
              {CHK_ITEMS.map((item, i) => (
                <div key={i} className={`chkrow ${checks[i] ? 'done' : ''}`} onClick={() => setChecks(prev => { const n = [...prev]; n[i] = !n[i]; return n })}>
                  <div className="chkbox">{checks[i] ? '✓' : ''}</div>
                  <span className="chklbl">{item}</span>
                </div>
              ))}
            </div>

            <div className="ph"><span className="ph-t">SCORE DISCIPLINE</span></div>
            <div className="blk">
              <div className="dring-wrap">
                <svg className="dring-svg" viewBox="0 0 58 58">
                  <circle className="dr-track" cx="29" cy="29" r="25" />
                  <circle className="dr-fill" cx="29" cy="29" r="25" style={{ strokeDashoffset: 157 - (discScore / 100) * 157 }} />
                </svg>
                <div className={`ds-num ${discScore >= 70 ? 'sc-g' : discScore >= 40 ? 'sc-a' : 'sc-r'}`}>{discScore}%</div>
                <div className="ds-lbl">SCORE DISCIPLINE</div>
              </div>
            </div>

            <div className="ph"><span className="ph-t">RÈGLES ATP</span></div>
            <div className="blk">
              {RULES.map(r => (
                <div key={r.n} className="rrow">
                  <span className="rn">{r.n}</span>
                  <div className="rb"><strong>{r.t}</strong><small>{r.s}</small></div>
                </div>
              ))}
            </div>

            <div className="ph"><span className="ph-t">BLOOMBERG LIVE</span><span className="ph-b">TV</span></div>
            <div style={{ flex: 1, minHeight: 180 }}>
              <iframe title="bloomberg" src="https://www.youtube.com/embed/iEpJwprxDdk?autoplay=1&mute=1" allow="autoplay; encrypted-media" style={{ width: '100%', height: '100%', border: 'none' }} />
            </div>
          </div>

          {/* COL3: P&L + TRADES + NOTE */}
          <div className="col" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="pnlhero">
              <div className="pnl-glow" />
              <div className={`pnl-amt ${totalPnl > 0 ? 'pv-p' : totalPnl < 0 ? 'pv-n' : 'pv-z'}`}>
                {(totalPnl >= 0 ? '+' : '')}{totalPnl.toFixed(2)} €
              </div>
              <div className="pnl-meta">
                <div className="pm">TRADES <span>{trades.length}</span></div>
                <div className="pm">W/L <span>{wins}/{losses}</span></div>
                <div className="pm">WIN% <span>{trades.length > 0 ? winPct + '%' : '—'}</span></div>
                <div className="pm">R∑ <span>{(totalR >= 0 ? '+' : '')}{totalR.toFixed(1)}R</span></div>
                <div className="pm">BEST <span>{trades.length > 0 ? '+' + bestTrade.toFixed(2) + '€' : '—'}</span></div>
              </div>
            </div>

            <div className="spk-wrap">
              <div className="spk-lbl">// COURBE P&L SESSION</div>
              <svg className="spk-svg" viewBox="0 0 400 90" preserveAspectRatio="none">
                <defs><linearGradient id="spg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#00ff88" stopOpacity="0.12" /><stop offset="100%" stopColor="#00ff88" stopOpacity="0" /></linearGradient></defs>
                <polyline fill="none" stroke={totalPnl >= 0 ? '#00ff88' : '#ff3355'} strokeWidth="1.5" points={sparkPoints} strokeLinejoin="round" filter="drop-shadow(0 0 2px rgba(0,255,136,0.4))" />
                <polygon fill="url(#spg)" points={`0,90 ${sparkPoints} 400,90`} />
              </svg>
            </div>

            <div className="risk-wrap">
              <div className="rsk-row">
                <div>
                  <div className="ri-lbl"><span>DAILY LOSS</span><span>{dailyLoss.toFixed(0)}€</span></div>
                  <div className="ri-bar"><div className="ri-f ri-loss" style={{ width: `${Math.min((dailyLoss / 500) * 100, 100)}%` }} /></div>
                  <div className="ri-vals"><span>0</span><span>500€ MAX</span></div>
                </div>
                <div>
                  <div className="ri-lbl"><span>OBJECTIF</span><span>{dailyObj.toFixed(0)}€</span></div>
                  <div className="ri-bar"><div className="ri-f ri-obj" style={{ width: `${Math.min((dailyObj / 300) * 100, 100)}%` }} /></div>
                  <div className="ri-vals"><span>0</span><span>300€</span></div>
                </div>
              </div>
            </div>

            <div className="ph" style={{ position: 'sticky', top: 0, zIndex: 5 }}>
              <span className="ph-t">JOURNAL SESSION</span><span className="ph-b">{trades.length} TRADE{trades.length > 1 ? 'S' : ''}</span>
            </div>
            <div className="tlh"><span>HEURE</span><span>INST</span><span>SENS</span><span>P&L</span><span>R</span><span>STAT</span></div>
            <div className="tlscroll">
              {trades.length === 0 ? (
                <div className="tl-empty">// EN ATTENTE — AUCUN TRADE</div>
              ) : [...trades].reverse().map((t, i) => (
                <div key={i} className="trow">
                  <span className="tc-t">{t.time}</span>
                  <span className="tc-i">{t.inst}</span>
                  <span className={t.side === 'LONG' ? 'tc-l' : 'tc-s'}>{t.side}</span>
                  <span className={t.pnl >= 0 ? 'tc-pp' : 'tc-pn'}>{(t.pnl >= 0 ? '+' : '') + t.pnl.toFixed(2)}€</span>
                  <span className={t.r >= 0 ? 'tc-rp' : 'tc-rn'}>{(t.r >= 0 ? '+' : '') + t.r.toFixed(1)}R</span>
                  <span className={t.pnl >= 0 ? 'tc-pp' : 'tc-pn'}>{t.status}</span>
                </div>
              ))}
            </div>

            <div className="addtrade">
              <select className="tsel" value={iInst} onChange={e => setIInst(e.target.value)} style={{ width: 52 }}>
                {['YM', 'NQ', 'ES', 'MYM', 'MNQ'].map(s => <option key={s}>{s}</option>)}
              </select>
              <select className="tsel" value={iSide} onChange={e => setISide(e.target.value)} style={{ width: 58 }}>
                <option>LONG</option><option>SHORT</option>
              </select>
              <input className="tinp" type="number" placeholder="P&L €" value={iPnl} onChange={e => setIPnl(e.target.value)} style={{ flex: 1 }} />
              <input className="tinp" type="number" placeholder="R" value={iR} onChange={e => setIR(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') logTrade() }} style={{ width: 48 }} />
              <button className="logbtn" onClick={logTrade}>LOG ▸</button>
            </div>

            <div className="note-area">
              <div className="blt" style={{ marginBottom: 5 }}>NOTE SESSION</div>
              <textarea className="note-ta" value={note} onChange={e => setNote(e.target.value)} placeholder="Observations, setup, erreurs..." />
            </div>
          </div>

          {/* COL4: STATS + OBJECTIFS + AI */}
          <div className="col">
            <div className="ph"><span className="ph-t">STATS SESSION</span></div>
            <div className="blk">
              <div className="sgrid">
                <div className="sc"><div className="sclbl">MEILLEUR</div><div className="scval sc-g">{trades.length > 0 ? '+' + bestTrade.toFixed(2) + '€' : '—'}</div></div>
                <div className="sc"><div className="sclbl">PIRE</div><div className="scval sc-r">{trades.length > 0 ? worstTrade.toFixed(2) + '€' : '—'}</div></div>
                <div className="sc"><div className="sclbl">MOYENNE</div><div className="scval sc-w">{trades.length > 0 ? (avgPnl >= 0 ? '+' : '') + avgPnl.toFixed(2) + '€' : '—'}</div></div>
                <div className="sc"><div className="sclbl">R MAX</div><div className="scval sc-g">{trades.length > 0 ? '+' + rMax.toFixed(1) + 'R' : '—'}</div></div>
                <div className="sc"><div className="sclbl">PROFIT FACTOR</div><div className="scval sc-w">{pf}</div></div>
                <div className="sc">
                  <div className="sclbl">PERTES CONSEC.</div>
                  <div className="scval sc-a">{consec}</div>
                  <div className="cdots">
                    {[0, 1, 2].map(i => <div key={i} className={`cd ${i < consec ? 'loss' : ''}`} />)}
                  </div>
                </div>
              </div>
            </div>

            <div className="ph"><span className="ph-t">OBJECTIFS SESSION</span></div>
            <div className="blk" style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {dailyObj >= 300 && (
                <div className="obj-reach show">
                  <div className="or-t">✓ OBJECTIF ATTEINT</div>
                  <div className="or-s">+300€ — bonne session, tu peux t&apos;arrêter.</div>
                </div>
              )}
              <div className="objcard">
                <div className="och"><span className="ocl">P&L OBJECTIF</span><span className="ocv sc-g">{dailyObj.toFixed(0)} / 300€</span></div>
                <div className="obar"><div className="obfill" style={{ width: `${Math.min(Math.round((dailyObj / 300) * 100), 100)}%` }} /></div>
                <div className="opct">{Math.min(Math.round((dailyObj / 300) * 100), 100)}%</div>
              </div>
              <div className="objcard">
                <div className="och"><span className="ocl">DAILY LOSS MAX</span><span className="ocv sc-r">{dailyLoss.toFixed(0)} / 500€</span></div>
                <div className="obar"><div className="obfill" style={{ background: 'linear-gradient(90deg,#cc2200,var(--red))', width: `${Math.min(Math.round((dailyLoss / 500) * 100), 100)}%` }} /></div>
                <div className="opct">{Math.min(Math.round((dailyLoss / 500) * 100), 100)}%</div>
              </div>
              <div className="objcard">
                <div className="och"><span className="ocl">CHECKLIST</span><span className="ocv sc-g">{checksDone} / {CHK_ITEMS.length}</span></div>
                <div className="obar"><div className="obfill" style={{ width: `${Math.round((checksDone / CHK_ITEMS.length) * 100)}%` }} /></div>
                <div className="opct">{Math.round((checksDone / CHK_ITEMS.length) * 100)}%</div>
              </div>
            </div>

            <div className="ph"><span className="ph-t">ASSISTANT NEWS IA</span><span className="ph-b">GPT</span></div>
            <div className="blk" style={{ flex: 1 }}>
              <button className="aibtn" onClick={analyzeNews} disabled={aiLoading}>
                <div className="aidot" />ANALYSER NEWS MAINTENANT
              </button>
              <input className="aiinp" placeholder="Colle une headline → Enter" value={aiInput} onChange={e => setAiInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') analyzeNews() }} />
              <div className="aihint">// ex: NFP +178K · FOMC hawkish · CPI 3.2%</div>
              <div className="aicards">
                {aiLoading && <div className="aiload"><div className="aispin" />ANALYSE EN COURS...</div>}
                {aiCards.map((c, i) => {
                  const cc = c.signal === 'BULLISH' ? 'ai-bull' : c.signal === 'BEARISH' ? 'ai-bear' : 'ai-neu'
                  const sc = c.signal === 'BULLISH' ? 'sig-g' : c.signal === 'BEARISH' ? 'sig-r' : 'sig-a'
                  const ic = c.signal === 'BULLISH' ? '▲' : c.signal === 'BEARISH' ? '▼' : '◈'
                  return (
                    <div key={i} className={`aicard ${cc}`}>
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 3 }}>
                        <span className={`aisig ${sc}`}>{ic} {c.signal}</span>
                        <span className="aiimpact">{c.impact}</span>
                      </div>
                      <div className="aihl">{c.headline}</div>
                      <div className="aian">{c.analyse}</div>
                      <div className="aitags">{(c.instruments || []).map(ins => <span key={ins} className="aitag">{ins}</span>)}</div>
                    </div>
                  )
                })}
                {aiSummary && (
                  <div className="aisum">
                    <div className="aisumlbl">// BIAIS SESSION</div>
                    <div className="aisumtxt">{aiSummary}</div>
                  </div>
                )}
                {aiTime && <div className="aits">{aiTime}</div>}
              </div>
            </div>

            <div className="blk">
              <button className="endbtn" onClick={endSession}>■ FIN DE SESSION</button>
            </div>
          </div>

          {/* COL5: INSTRUMENTS + LEVELS + CALC */}
          <div className="col">
            <div className="ph"><span className="ph-t">NIVEAUX CLÉS</span><span className="ph-b">{levels.length}</span></div>
            <div className="blk">
              <div style={{ display: 'flex', gap: 5, marginBottom: 7 }}>
                <input className="tinp" placeholder="Prix ex: 42500" value={lvlInp} onChange={e => setLvlInp(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addLevel() }} style={{ flex: 1, fontSize: 10 }} />
                <select className="tsel" value={lvlType} onChange={e => setLvlType(e.target.value)} style={{ width: 52, fontSize: 10 }}>
                  <option>RES</option><option>SUP</option><option>OB</option><option>FVG</option>
                </select>
                <button className="logbtn" onClick={addLevel} style={{ padding: '5px 9px' }}>+</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {levels.map((lv, i) => (
                  <div key={i} className="lvlrow">
                    <span style={{ color: LEVEL_COLORS[lv.t] || '#fff', fontSize: 8, fontWeight: 700, letterSpacing: '0.1em' }}>{lv.t}</span>
                    <span style={{ fontFamily: 'var(--orb)', fontSize: 11 }}>{lv.v.toLocaleString('fr-FR')}</span>
                    <button className="lvlbtn" onClick={() => setLevels(prev => prev.filter((_, j) => j !== i))}>✕</button>
                  </div>
                ))}
              </div>
            </div>

            <div className="ph"><span className="ph-t">CALCULATEUR RISQUE</span></div>
            <div className="blk">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginBottom: 7 }}>
                <div><div className="blt" style={{ marginBottom: 2 }}>CAPITAL €</div><input className="tinp" type="number" value={cCap} onChange={e => setCCap(e.target.value)} style={{ width: '100%', fontSize: 10 }} /></div>
                <div><div className="blt" style={{ marginBottom: 2 }}>RISQUE %</div><input className="tinp" type="number" value={cRisk} onChange={e => setCRisk(e.target.value)} step="0.1" style={{ width: '100%', fontSize: 10 }} /></div>
                <div><div className="blt" style={{ marginBottom: 2 }}>SL (pts)</div><input className="tinp" type="number" value={cSl} onChange={e => setCSl(e.target.value)} style={{ width: '100%', fontSize: 10 }} /></div>
                <div><div className="blt" style={{ marginBottom: 2 }}>INSTRUMENT</div>
                  <select className="tsel" value={cInst} onChange={e => setCInst(e.target.value)} style={{ width: '100%', fontSize: 10 }}>
                    <option value="5">YM ($5/pt)</option>
                    <option value="0.5">MYM ($0.5/pt)</option>
                    <option value="20">NQ ($20/pt)</option>
                    <option value="2">MNQ ($2/pt)</option>
                    <option value="50">ES ($50/pt)</option>
                    <option value="5">MES ($5/pt)</option>
                    <option value="100">GC ($100/pt)</option>
                    <option value="10">MGC ($10/pt)</option>
                  </select>
                </div>
              </div>
              <button className="bbtn" onClick={doCalc} style={{ marginBottom: 7 }}>CALCULER ▸</button>
              <div className="calc-res">{calcResult || '// Remplis les champs et calcule'}</div>
            </div>

            <div className="ph"><span className="ph-t">ANALYSE CHART IA</span><span className="ph-b">VISION</span></div>
            <div className="blk" style={{ flex: 1 }}>
              <label className="aibtn" style={{ cursor: 'pointer' }}>
                <div className="aidot" />UPLOAD UN GRAPHE
                <input type="file" accept="image/*" onChange={handleChartUpload} style={{ display: 'none' }} />
              </label>

              {chartPreview && (
                <div style={{ marginTop: 8, borderRadius: 4, overflow: 'hidden', border: '1px solid var(--border)' }}>
                  <img src={chartPreview} alt="Chart" style={{ width: '100%', display: 'block', maxHeight: 140, objectFit: 'cover' }} />
                </div>
              )}

              {chartLoading && (
                <div className="aiload"><div className="aispin" />ANALYSE DU GRAPHE EN COURS...</div>
              )}

              {chartResult && !chartLoading && (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {/* Tendance + Biais */}
                  {(chartResult.tendance || chartResult.biais) && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      {chartResult.tendance && (
                        <div style={{
                          padding: '4px 10px', borderRadius: 2, fontSize: 10, fontFamily: 'var(--orb)', fontWeight: 700, letterSpacing: '0.1em',
                          background: chartResult.tendance.includes('HAUSS') ? 'rgba(0,255,136,0.07)' : chartResult.tendance.includes('BAISS') ? 'rgba(255,51,85,0.07)' : 'rgba(255,170,0,0.07)',
                          border: `1px solid ${chartResult.tendance.includes('HAUSS') ? 'rgba(0,255,136,0.22)' : chartResult.tendance.includes('BAISS') ? 'rgba(255,51,85,0.22)' : 'rgba(255,170,0,0.22)'}`,
                          color: chartResult.tendance.includes('HAUSS') ? 'var(--g)' : chartResult.tendance.includes('BAISS') ? 'var(--red)' : 'var(--amber)',
                        }}>
                          TENDANCE: {chartResult.tendance}
                        </div>
                      )}
                      {chartResult.biais && (
                        <div style={{
                          padding: '4px 10px', borderRadius: 2, fontSize: 10, fontFamily: 'var(--orb)', fontWeight: 700, letterSpacing: '0.1em',
                          background: chartResult.biais === 'LONG' ? 'rgba(0,255,136,0.07)' : chartResult.biais === 'SHORT' ? 'rgba(255,51,85,0.07)' : 'rgba(255,170,0,0.07)',
                          border: `1px solid ${chartResult.biais === 'LONG' ? 'rgba(0,255,136,0.22)' : chartResult.biais === 'SHORT' ? 'rgba(255,51,85,0.22)' : 'rgba(255,170,0,0.22)'}`,
                          color: chartResult.biais === 'LONG' ? 'var(--g)' : chartResult.biais === 'SHORT' ? 'var(--red)' : 'var(--amber)',
                        }}>
                          BIAIS: {chartResult.biais}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Niveaux clés */}
                  {chartResult.niveaux && chartResult.niveaux.length > 0 && (
                    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 2, padding: '8px 10px' }}>
                      <div style={{ fontSize: 8, letterSpacing: '0.14em', color: 'var(--muted)', marginBottom: 6 }}>// NIVEAUX IDENTIFIÉS</div>
                      {chartResult.niveaux.map((n, i) => (
                        <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', padding: '4px 0', borderBottom: i < chartResult.niveaux!.length - 1 ? '1px solid var(--vdim)' : 'none' }}>
                          <span style={{
                            fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', flexShrink: 0, padding: '1px 5px', borderRadius: 2,
                            color: LEVEL_COLORS[n.type] || 'var(--g)',
                            background: `${LEVEL_COLORS[n.type] || 'var(--g)'}15`,
                            border: `1px solid ${LEVEL_COLORS[n.type] || 'var(--g)'}33`,
                          }}>{n.type}</span>
                          <span style={{ fontSize: 11, fontFamily: 'var(--orb)', fontWeight: 700, color: 'var(--text)', flexShrink: 0 }}>{n.prix}</span>
                          <span style={{ fontSize: 10, color: 'var(--muted)', lineHeight: 1.4 }}>{n.description}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Structure */}
                  {chartResult.structure && (
                    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 2, padding: '8px 10px' }}>
                      <div style={{ fontSize: 8, letterSpacing: '0.14em', color: 'var(--muted)', marginBottom: 4 }}>// STRUCTURE DE MARCHÉ</div>
                      <div style={{ fontSize: 11, color: 'var(--text)', lineHeight: 1.6 }}>{chartResult.structure}</div>
                    </div>
                  )}

                  {/* Premium/Discount + Liquidity */}
                  {(chartResult.premium_discount || chartResult.liquidity) && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      {chartResult.premium_discount && (
                        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 2, padding: '8px 10px' }}>
                          <div style={{ fontSize: 8, letterSpacing: '0.14em', color: 'var(--amber)', marginBottom: 4 }}>// PREMIUM / DISCOUNT</div>
                          <div style={{ fontSize: 10, color: 'var(--text)', lineHeight: 1.5 }}>{chartResult.premium_discount}</div>
                        </div>
                      )}
                      {chartResult.liquidity && (
                        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 2, padding: '8px 10px' }}>
                          <div style={{ fontSize: 8, letterSpacing: '0.14em', color: 'var(--red)', marginBottom: 4 }}>// LIQUIDITÉ</div>
                          <div style={{ fontSize: 10, color: 'var(--text)', lineHeight: 1.5 }}>{chartResult.liquidity}</div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Confluences */}
                  {chartResult.confluences && chartResult.confluences.length > 0 && (
                    <div style={{ background: 'rgba(0,255,136,0.04)', border: '1px solid rgba(0,255,136,0.15)', borderRadius: 2, padding: '8px 10px' }}>
                      <div style={{ fontSize: 8, letterSpacing: '0.14em', color: 'var(--g)', marginBottom: 4 }}>// CONFLUENCES</div>
                      {chartResult.confluences.map((c, i) => (
                        <div key={i} style={{ fontSize: 11, color: 'var(--text)', lineHeight: 1.6 }}>• {c}</div>
                      ))}
                    </div>
                  )}

                  {/* Analyse */}
                  {chartResult.analyse && (
                    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 2, padding: '8px 10px' }}>
                      <div style={{ fontSize: 8, letterSpacing: '0.14em', color: 'var(--muted)', marginBottom: 4 }}>// ANALYSE</div>
                      <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.65 }}>{chartResult.analyse}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* COL6: TV WIDGETS */}
          <div className="col tvcol">
            <div className="ph" style={{ flexShrink: 0 }}><span className="ph-t">CALENDRIER ÉCONOMIQUE</span><span className="ph-b">TV LIVE</span></div>
            <div className="tvwrap" style={{ flex: 1.15 }}>
              <iframe title="eco-cal" src="https://www.tradingview.com/embed-widget/events/?locale=fr_FR#%7B%22colorTheme%22%3A%22dark%22%2C%22isTransparent%22%3Atrue%2C%22width%22%3A%22100%25%22%2C%22height%22%3A%22100%25%22%2C%22importanceFilter%22%3A%22-1%2C0%2C1%22%2C%22countryFilter%22%3A%22us%2Ceu%22%7D" allowTransparency={true} style={{ border: 'none', overflow: 'hidden' }} />
            </div>
            <div className="tvdiv" />
            <div className="ph" style={{ flexShrink: 0 }}><span className="ph-t">MARCHÉS MONDIAUX</span><span className="ph-b">LIVE</span></div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(() => {
                const now = new Date()
                const utcH = now.getUTCHours() + now.getUTCMinutes() / 60
                const wd = now.getUTCDay() >= 1 && now.getUTCDay() <= 5
                const markets = [
                  { name: 'TOKYO', flag: '🇯🇵', hours: 'TSE 00:00–06:00 UTC', open: wd && utcH >= 0 && utcH < 6, sub: 'Nikkei 225 · TOPIX' },
                  { name: 'SHANGHAI', flag: '🇨🇳', hours: 'SSE 01:30–07:00 UTC', open: wd && utcH >= 1.5 && utcH < 7, sub: 'CSI 300 · Hang Seng' },
                  { name: 'SYDNEY', flag: '🇦🇺', hours: 'ASX 00:00–06:00 UTC', open: wd && utcH >= 0 && utcH < 6, sub: 'ASX 200' },
                  { name: 'LONDON', flag: '🇬🇧', hours: 'LSE 08:00–16:30 UTC', open: wd && utcH >= 8 && utcH < 16.5, sub: 'FTSE 100 · DAX' },
                  { name: 'FRANCFORT', flag: '🇩🇪', hours: 'XETRA 07:00–15:30 UTC', open: wd && utcH >= 7 && utcH < 15.5, sub: 'DAX 40 · EUROSTOXX' },
                  { name: 'NEW YORK', flag: '🇺🇸', hours: 'NYSE 13:30–20:00 UTC', open: wd && utcH >= 13.5 && utcH < 20, sub: 'ES · NQ · YM' },
                  { name: 'CME FUTURES', flag: '📊', hours: 'CME 22:00–21:00 UTC', open: wd || (now.getUTCDay() === 0 && utcH >= 22), sub: 'Futures 23h/24' },
                ]
                return markets.map(m => (
                  <div key={m.name} className="instcard" style={{ padding: '8px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 16 }}>{m.flag}</span>
                        <div>
                          <div style={{ fontFamily: 'var(--orb)', fontSize: 10, fontWeight: 700, color: 'var(--text)', letterSpacing: '0.05em' }}>{m.name}</div>
                          <div style={{ fontSize: 8, color: 'var(--muted)', marginTop: 1 }}>{m.sub}</div>
                        </div>
                      </div>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 2, fontSize: 8, fontWeight: 700, letterSpacing: '0.14em',
                        background: m.open ? 'rgba(0,255,136,0.08)' : 'rgba(255,51,85,0.08)',
                        border: `1px solid ${m.open ? 'rgba(0,255,136,0.22)' : 'rgba(255,51,85,0.22)'}`,
                        color: m.open ? 'var(--g)' : 'var(--red)',
                      }}>
                        <div style={{ width: 5, height: 5, borderRadius: '50%', background: m.open ? 'var(--g)' : 'var(--red)', boxShadow: `0 0 6px ${m.open ? 'var(--g)' : 'var(--red)'}`, animation: m.open ? 'blink 1.4s ease infinite' : 'none' }} />
                        {m.open ? 'OUVERT' : 'FERMÉ'}
                      </div>
                    </div>
                    <div style={{ fontSize: 7, color: 'var(--muted)', marginTop: 4, letterSpacing: '0.06em' }}>{m.hours}</div>
                  </div>
                ))
              })()}
            </div>
          </div>
        </div>

        {/* STATUS BAR */}
        <div className="sbar">
          <div className="sbi"><div className="sbdot sb-g" /><span>SYSTÈME OK</span></div>
          <div className="sbsep" />
          <div className="sbi"><span>RISQUE/TRADE:</span><span className="sbv">0.3%</span></div>
          <div className="sbsep" />
          <div className="sbi"><span>RÈGLE 3SL:</span><span className="sbv sc-g">ACTIVE</span></div>
          <div className="sbsep" />
          <div className="sbi"><span>TRADES:</span><span className="sbv">{trades.length}</span></div>
          <div className="sbsep" />
          <div className="sbi"><span>P&L:</span><span className="sbv">{(totalPnl >= 0 ? '+' : '')}{totalPnl.toFixed(2)}€</span></div>
          <div className="sbsep" />
          <div className="sbi" style={{ marginLeft: 'auto' }}><span className="sbv">ATP TERMINAL v4.0 © 2026</span></div>
        </div>
      </div>
    </>
  )
}

const S: Record<string, React.CSSProperties> = {
  boot: { position: 'fixed', inset: 0, zIndex: 20000, background: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' },
  blogo: { fontFamily: "'Orbitron',sans-serif", fontSize: 30, fontWeight: 900, color: '#00ff88', letterSpacing: '0.22em', textShadow: '0 0 40px rgba(0,255,136,0.6)', marginBottom: 8 },
  bsub: { fontSize: 8, letterSpacing: '0.28em', color: '#3a6b42', marginBottom: 26 },
  bbarW: { width: 280, height: 2, background: '#0a140a', borderRadius: 1, overflow: 'hidden' },
}

const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;700;800&family=Orbitron:wght@400;600;700;900&display=swap');
:root{--g:#00ff88;--g2:#00cc6a;--g3:rgba(0,255,136,0.1);--g4:rgba(0,255,136,0.05);--bg:#000;--bg1:#050905;--bg2:#080d08;--bg3:#0a100a;--border:rgba(0,255,136,0.15);--border2:rgba(0,255,136,0.35);--text:#d0f0d8;--muted:#3a6b42;--dim:#142014;--vdim:#0a140a;--red:#ff3355;--amber:#ffaa00;--mono:'JetBrains Mono',monospace;--orb:'Orbitron',sans-serif;}
.terminal{position:relative;z-index:1;width:100vw;height:100vh;display:grid;grid-template-rows:50px 1fr 26px;}
body::before,body::after{display:none !important;}
.gbg{position:fixed;inset:0;z-index:0;pointer-events:none;background-image:linear-gradient(rgba(0,255,136,0.02) 1px,transparent 1px),linear-gradient(90deg,rgba(0,255,136,0.02) 1px,transparent 1px);background-size:24px 24px;}
.glow{position:fixed;z-index:0;pointer-events:none;border-radius:50%;filter:blur(90px);}
.gl-tl{top:-200px;left:-200px;width:600px;height:600px;background:radial-gradient(circle,rgba(0,255,136,0.07),transparent 70%);animation:gp 6s ease-in-out infinite;}
.gl-br{bottom:-150px;right:-150px;width:450px;height:450px;background:radial-gradient(circle,rgba(0,255,136,0.04),transparent 70%);animation:gp 6s ease-in-out infinite 3s;}
@keyframes gp{0%,100%{opacity:1}50%{opacity:0.35}}
.topbar{display:flex;align-items:stretch;background:#000;border-bottom:1px solid var(--border);position:relative;overflow:hidden;}
.topbar::after{content:'';position:absolute;bottom:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,var(--g),transparent);opacity:0.4;}
.tb-seg{display:flex;align-items:center;padding:0 14px;border-right:1px solid var(--border);gap:8px;}
.tb-logo{font-family:var(--orb);font-size:14px;font-weight:900;color:var(--g);letter-spacing:0.18em;text-shadow:0 0 20px rgba(0,255,136,0.5);}
.tb-lbl{font-size:8px;letter-spacing:0.25em;color:var(--muted);}
.sp{display:flex;align-items:center;gap:5px;padding:3px 9px;border-radius:2px;font-size:8px;letter-spacing:0.18em;font-weight:700;}
.sp-o{background:rgba(0,255,136,0.08);border:1px solid rgba(0,255,136,0.22);color:var(--g);}
.sp-c{background:rgba(255,51,85,0.08);border:1px solid rgba(255,51,85,0.22);color:var(--red);}
.sdot{width:5px;height:5px;border-radius:50%;animation:blink 1.4s ease infinite;}
.sdot-g{background:var(--g);box-shadow:0 0 6px var(--g);}
.sdot-r{background:var(--red);box-shadow:0 0 6px var(--red);}
@keyframes blink{0%,100%{opacity:1}50%{opacity:0.15}}
.ticker-wrap{flex:1;overflow:hidden;display:flex;align-items:center;border-right:1px solid var(--border);}
.ticker-inner{display:flex;gap:0;animation:tScroll 35s linear infinite;white-space:nowrap;}
.ticker-inner:hover{animation-play-state:paused;}
@keyframes tScroll{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
.ti{display:flex;align-items:center;gap:7px;padding:0 18px;border-right:1px solid var(--dim);flex-shrink:0;}
.ti-sym{font-family:var(--orb);font-size:10px;font-weight:700;color:var(--text);letter-spacing:0.05em;}
.ti-price{font-family:var(--orb);font-size:12px;font-weight:900;}
.ti-chg{font-size:9px;font-weight:700;}
.ti-u{color:var(--g);}.ti-d{color:var(--red);}
.clk-seg{text-align:center;min-width:150px;padding:0 16px;border-left:1px solid var(--border);}
.clk{font-family:var(--orb);font-size:19px;font-weight:700;color:var(--g);letter-spacing:0.06em;text-shadow:0 0 15px rgba(0,255,136,0.3);}
.clk-d{font-size:8px;color:var(--muted);letter-spacing:0.1em;margin-top:1px;}
.sess-seg{gap:8px;padding:0 14px;}
.ss-lbl{font-size:7px;letter-spacing:0.2em;color:var(--muted);}
.ss-t{font-family:var(--orb);font-size:13px;font-weight:700;color:var(--amber);letter-spacing:0.06em;}
.main{display:grid;grid-template-columns:195px 210px 1fr 1fr 230px 265px;overflow:hidden;}
.col{border-right:1px solid var(--border);overflow-y:auto;display:flex;flex-direction:column;scrollbar-width:thin;scrollbar-color:var(--g2) transparent;}
.col:last-child{border-right:none;}
::-webkit-scrollbar{width:2px;}::-webkit-scrollbar-thumb{background:var(--g2);}
.ph{display:flex;align-items:center;justify-content:space-between;padding:7px 12px;border-bottom:1px solid var(--border);background:rgba(0,0,0,0.85);position:sticky;top:0;z-index:10;flex-shrink:0;}
.ph-t{font-size:8px;font-weight:700;letter-spacing:0.22em;color:var(--muted);display:flex;align-items:center;gap:5px;}
.ph-t::before{content:'▸';color:var(--g);font-size:7px;}
.ph-b{font-size:7px;letter-spacing:0.1em;padding:2px 6px;border-radius:2px;background:var(--g3);border:1px solid var(--border);color:var(--g);}
.blk{padding:10px 12px;border-bottom:1px solid var(--dim);flex-shrink:0;}
.blk:last-child{border-bottom:none;}
.blt{font-size:8px;letter-spacing:0.16em;color:var(--muted);margin-bottom:7px;display:flex;align-items:center;gap:5px;}
.blt::before{content:'//';color:var(--g);opacity:0.4;font-size:8px;}
.mgrid{display:grid;grid-template-columns:repeat(10,1fr);gap:2px;margin-bottom:5px;}
.mc{height:22px;border-radius:1px;cursor:pointer;border:1px solid var(--dim);background:transparent;transition:all 0.1s;}
.mc.tilt{background:var(--red);border-color:var(--red);box-shadow:0 0 6px rgba(255,51,85,0.35);}
.mc.neu{background:var(--amber);border-color:var(--amber);box-shadow:0 0 6px rgba(255,170,0,0.35);}
.mc.foc{background:var(--g);border-color:var(--g);box-shadow:0 0 6px rgba(0,255,136,0.35);}
.ms-labs{display:flex;justify-content:space-between;font-size:7px;color:var(--muted);margin-bottom:5px;}
.mstate{padding:6px 10px;border-radius:2px;text-align:center;font-family:var(--orb);font-size:9px;font-weight:700;letter-spacing:0.1em;transition:all 0.3s;margin-top:3px;}
.ms-t{background:rgba(255,51,85,0.07);border:1px solid rgba(255,51,85,0.22);color:var(--red);}
.ms-n{background:rgba(255,170,0,0.07);border:1px solid rgba(255,170,0,0.22);color:var(--amber);}
.ms-f{background:rgba(0,255,136,0.07);border:1px solid rgba(0,255,136,0.22);color:var(--g);}
.bvis{display:flex;flex-direction:column;align-items:center;padding:8px 0;}
.bring-w{width:70px;height:70px;position:relative;margin-bottom:7px;}
.bring{width:70px;height:70px;border-radius:50%;border:2px solid rgba(0,255,136,0.18);background:radial-gradient(circle,rgba(0,255,136,0.07),transparent 70%);display:flex;align-items:center;justify-content:center;transition:transform 0.3s,border-color 0.3s,box-shadow 0.3s;}
.bring.inhale{animation:bIn 4s ease-in-out forwards;}
.bring.hold{transform:scale(1.3);border-color:rgba(0,255,136,0.5);box-shadow:0 0 18px rgba(0,255,136,0.18);}
.bring.exhale{animation:bOut 6s ease-in-out forwards;}
@keyframes bIn{from{transform:scale(1);border-color:rgba(0,255,136,0.18);}to{transform:scale(1.3);border-color:rgba(0,255,136,0.5);box-shadow:0 0 18px rgba(0,255,136,0.18);}}
@keyframes bOut{from{transform:scale(1.3);}to{transform:scale(1);border-color:rgba(0,255,136,0.18);box-shadow:none;}}
.bnum{font-family:var(--orb);font-size:19px;font-weight:700;color:var(--g);}
.bphase{font-size:8px;letter-spacing:0.2em;color:var(--muted);text-align:center;margin-bottom:5px;}
.bbtn{width:100%;padding:6px;background:var(--g3);border:1px solid var(--border2);border-radius:2px;color:var(--g);font-family:var(--mono);font-size:9px;letter-spacing:0.14em;cursor:pointer;transition:all 0.15s;text-align:center;}
.bbtn:hover{background:rgba(0,255,136,0.14);}
.palert{padding:9px 12px;background:rgba(255,51,85,0.07);border:1px solid rgba(255,51,85,0.25);border-radius:2px;text-align:center;animation:ap 1.4s ease infinite;}
.palert.show{display:block;}
@keyframes ap{0%,100%{border-color:rgba(255,51,85,0.25)}50%{border-color:rgba(255,51,85,0.6)}}
.pa-t{font-family:var(--orb);font-size:9px;font-weight:700;color:var(--red);letter-spacing:0.1em;}
.pa-tm{font-family:var(--orb);font-size:20px;font-weight:900;color:var(--red);margin:3px 0;}
.pa-tx{font-size:8px;color:rgba(255,51,85,0.65);line-height:1.5;}
.qt{font-size:12px;color:rgba(208,240,216,0.6);line-height:1.7;font-style:italic;border-left:2px solid var(--g);padding-left:8px;margin-bottom:4px;}
.qa{font-size:10px;color:var(--muted);letter-spacing:0.08em;}
.cpbar{height:3px;background:var(--dim);border-radius:2px;overflow:hidden;margin-bottom:3px;}
.cpfill{height:100%;background:linear-gradient(90deg,var(--g2),var(--g));border-radius:2px;transition:width 0.4s;box-shadow:0 0 8px rgba(0,255,136,0.25);}
.cplbls{display:flex;justify-content:space-between;font-size:8px;color:var(--muted);margin-bottom:7px;}
.chkrow{display:flex;align-items:flex-start;gap:7px;padding:5px 0;border-bottom:1px solid var(--vdim);cursor:pointer;transition:all 0.1s;}
.chkrow:last-child{border-bottom:none;}
.chkrow:hover{padding-left:3px;}
.chkbox{width:13px;height:13px;border-radius:2px;border:1px solid var(--muted);flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:9px;transition:all 0.1s;margin-top:1px;}
.chkrow.done .chkbox{background:var(--g);border-color:var(--g);color:#000;}
.chkrow.done .chklbl{color:var(--muted);text-decoration:line-through;}
.chklbl{font-size:10px;color:var(--text);line-height:1.4;}
.dring-wrap{display:flex;flex-direction:column;align-items:center;padding:10px 0 6px;}
.dring-svg{width:58px;height:58px;transform:rotate(-90deg);}
.dr-track{fill:none;stroke:var(--dim);stroke-width:4;}
.dr-fill{fill:none;stroke:var(--g);stroke-width:4;stroke-linecap:round;stroke-dasharray:157;stroke-dashoffset:157;transition:stroke-dashoffset 0.8s ease;filter:drop-shadow(0 0 4px rgba(0,255,136,0.4));}
.ds-num{font-family:var(--orb);font-size:28px;font-weight:900;margin-top:5px;}
.ds-lbl{font-size:8px;letter-spacing:0.14em;color:var(--muted);margin-top:2px;}
.rrow{display:flex;gap:7px;padding:5px 0;border-bottom:1px solid var(--vdim);align-items:flex-start;}
.rrow:last-child{border-bottom:none;}
.rn{font-family:var(--orb);font-size:9px;font-weight:700;color:var(--g);flex-shrink:0;width:14px;}
.rb{font-size:9px;color:var(--text);line-height:1.45;}
.rb strong{color:var(--g);}
.rb small{color:var(--muted);font-size:8px;display:block;margin-top:1px;}
.pnlhero{padding:12px 16px;border-bottom:1px solid var(--border);background:linear-gradient(180deg,rgba(0,255,136,0.04),transparent);position:relative;overflow:hidden;flex-shrink:0;}
.pnlhero::before{content:'';position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,var(--g),transparent);opacity:0.45;}
.pnl-glow{position:absolute;top:-40px;right:-40px;width:160px;height:160px;background:radial-gradient(circle,rgba(0,255,136,0.07),transparent 70%);pointer-events:none;}
.pnl-amt{font-family:var(--orb);font-size:50px;font-weight:900;line-height:1;letter-spacing:-0.02em;transition:all 0.4s;}
.pv-p{color:var(--g);text-shadow:0 0 30px rgba(0,255,136,0.28);}
.pv-n{color:var(--red);text-shadow:0 0 30px rgba(255,51,85,0.28);}
.pv-z{color:var(--amber);}
.pnl-meta{display:flex;gap:12px;margin-top:7px;flex-wrap:wrap;}
.pm{font-size:8px;color:var(--muted);letter-spacing:0.05em;}
.pm span{color:var(--text);font-size:9px;}
.spk-wrap{padding:10px 16px;border-bottom:1px solid var(--dim);flex-shrink:0;}
.spk-lbl{font-size:7px;letter-spacing:0.15em;color:var(--muted);margin-bottom:3px;}
.spk-svg{width:100%;height:90px;}
.risk-wrap{padding:9px 16px;border-bottom:1px solid var(--dim);flex-shrink:0;}
.rsk-row{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
.ri-lbl{font-size:7px;letter-spacing:0.12em;color:var(--muted);margin-bottom:3px;display:flex;justify-content:space-between;}
.ri-bar{height:5px;background:var(--dim);border-radius:3px;overflow:hidden;margin-bottom:2px;}
.ri-f{height:100%;border-radius:3px;transition:width 0.5s;}
.ri-loss{background:linear-gradient(90deg,var(--g2),var(--amber),var(--red));}
.ri-obj{background:linear-gradient(90deg,var(--g2),var(--g));box-shadow:0 0 6px rgba(0,255,136,0.25);}
.ri-vals{display:flex;justify-content:space-between;font-size:8px;color:var(--muted);}
.ri-vals span{color:var(--text);}
.tlh{display:grid;grid-template-columns:50px 38px 44px 66px 44px 40px;padding:5px 16px;gap:4px;font-size:7px;letter-spacing:0.12em;color:var(--muted);border-bottom:1px solid var(--dim);background:rgba(0,0,0,0.6);flex-shrink:0;position:sticky;top:38px;z-index:5;}
.tl-empty{padding:18px 16px;text-align:center;font-size:9px;color:var(--dim);letter-spacing:0.1em;}
.tlscroll{flex:1;overflow-y:auto;min-height:80px;}
.trow{display:grid;grid-template-columns:50px 38px 44px 66px 44px 40px;padding:6px 16px;gap:4px;font-size:10px;border-bottom:1px solid var(--vdim);cursor:pointer;transition:background 0.1s;animation:rSlide 0.22s ease;}
@keyframes rSlide{from{opacity:0;transform:translateX(-6px)}to{opacity:1;transform:none}}
.trow:hover{background:var(--g4);}
.tc-t{color:var(--muted);font-size:8px;}.tc-i{color:var(--text);font-weight:700;}.tc-l{color:var(--g);}.tc-s{color:var(--red);}
.tc-pp{color:var(--g);}.tc-pn{color:var(--red);}.tc-rp{color:var(--g);font-weight:700;}.tc-rn{color:var(--red);font-weight:700;}
.addtrade{padding:7px 12px;border-top:1px solid var(--border);background:rgba(0,0,0,0.75);display:flex;gap:5px;align-items:center;flex-shrink:0;}
.tinp,.tsel{background:var(--bg3);border:1px solid var(--border);border-radius:2px;padding:5px 7px;font-family:var(--mono);font-size:10px;color:var(--text);outline:none;transition:border-color 0.12s;-webkit-appearance:none;}
.tinp:focus,.tsel:focus{border-color:var(--border2);}
.tinp::placeholder{color:var(--muted);}
.logbtn{padding:6px 11px;background:var(--g);border:none;border-radius:2px;color:#000;font-family:var(--mono);font-size:10px;font-weight:800;letter-spacing:0.1em;cursor:pointer;transition:all 0.12s;white-space:nowrap;}
.logbtn:hover{background:var(--g2);box-shadow:0 0 10px rgba(0,255,136,0.28);}
.note-area{flex:1;display:flex;flex-direction:column;padding:8px 12px;min-height:100px;}
.note-ta{flex:1;background:var(--bg2);border:1px solid var(--border);border-radius:2px;padding:8px 10px;font-family:var(--mono);font-size:10px;color:var(--text);outline:none;resize:none;line-height:1.65;min-height:80px;}
.note-ta:focus{border-color:var(--border2);}
.note-ta::placeholder{color:var(--muted);}
.sgrid{display:grid;grid-template-columns:1fr 1fr;gap:5px;}
.sc{background:var(--bg2);border:1px solid var(--border);border-radius:2px;padding:8px 10px;transition:border-color 0.15s;}
.sc:hover{border-color:var(--border2);}
.sclbl{font-size:7px;letter-spacing:0.14em;color:var(--muted);margin-bottom:3px;}
.scval{font-family:var(--orb);font-size:16px;font-weight:700;}
.sc-g{color:var(--g);}.sc-r{color:var(--red);}.sc-a{color:var(--amber);}.sc-w{color:var(--text);}
.cdots{display:flex;gap:3px;margin-top:5px;}
.cd{width:15px;height:15px;border-radius:2px;border:1px solid var(--dim);transition:all 0.2s;}
.cd.loss{background:var(--red);border-color:var(--red);box-shadow:0 0 5px rgba(255,51,85,0.35);animation:lf 0.35s ease;}
@keyframes lf{0%{transform:scale(1.3)}100%{transform:scale(1)}}
.objcard{background:var(--bg2);border:1px solid var(--border);border-radius:2px;padding:9px 10px;}
.och{display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;}
.ocl{font-size:8px;letter-spacing:0.1em;color:var(--muted);}
.ocv{font-family:var(--orb);font-size:13px;font-weight:700;}
.obar{height:7px;background:var(--dim);border-radius:4px;overflow:hidden;margin-bottom:2px;}
.obfill{height:100%;border-radius:4px;transition:width 0.6s;background:linear-gradient(90deg,var(--g2),var(--g));box-shadow:0 0 8px rgba(0,255,136,0.25);}
.opct{font-size:7px;color:var(--muted);text-align:right;}
.obj-reach{padding:8px 10px;border-radius:2px;background:rgba(0,255,136,0.06);border:1px solid rgba(0,255,136,0.25);text-align:center;}
.or-t{font-family:var(--orb);font-size:9px;font-weight:700;color:var(--g);letter-spacing:0.1em;}
.or-s{font-size:8px;color:rgba(0,255,136,0.65);margin-top:2px;}
.aibtn{width:100%;padding:8px 12px;background:linear-gradient(135deg,rgba(0,255,136,0.1),rgba(0,255,136,0.04));border:1px solid rgba(0,255,136,0.28);border-radius:2px;color:var(--g);font-family:var(--mono);font-size:10px;font-weight:700;letter-spacing:0.12em;cursor:pointer;transition:all 0.15s;display:flex;align-items:center;justify-content:center;gap:7px;}
.aibtn:hover{background:linear-gradient(135deg,rgba(0,255,136,0.18),rgba(0,255,136,0.07));box-shadow:0 0 14px rgba(0,255,136,0.14);}
.aibtn:disabled{opacity:0.4;cursor:default;}
.aidot{width:5px;height:5px;border-radius:50%;background:var(--g);box-shadow:0 0 5px var(--g);animation:blink 1.2s ease infinite;}
.aiinp{width:100%;margin-top:6px;background:var(--bg2);border:1px solid var(--border);border-radius:2px;padding:5px 9px;font-family:var(--mono);font-size:10px;color:var(--text);outline:none;}
.aiinp:focus{border-color:var(--border2);}
.aiinp::placeholder{color:var(--muted);}
.aihint{font-size:8px;color:var(--dim);letter-spacing:0.05em;margin-top:4px;line-height:1.5;}
.aicards{display:flex;flex-direction:column;gap:5px;margin-top:7px;}
.aicard{padding:8px 10px;border-radius:2px;border-left:2px solid;animation:rSlide 0.3s ease;}
.ai-bull{border-left-color:var(--g);background:rgba(0,255,136,0.04);}
.ai-bear{border-left-color:var(--red);background:rgba(255,51,85,0.04);}
.ai-neu{border-left-color:var(--amber);background:rgba(255,170,0,0.04);}
.aisig{font-family:var(--orb);font-size:10px;font-weight:700;letter-spacing:0.12em;}
.sig-g{color:var(--g);}.sig-r{color:var(--red);}.sig-a{color:var(--amber);}
.aiimpact{font-size:9px;color:var(--muted);padding:2px 7px;border-radius:2px;border:1px solid var(--dim);margin-left:6px;}
.aihl{font-size:11px;color:rgba(208,240,216,0.7);margin:4px 0 3px;line-height:1.5;font-weight:500;}
.aian{font-size:12px;color:var(--text);line-height:1.65;}
.aitags{display:flex;gap:3px;margin-top:4px;flex-wrap:wrap;}
.aitag{font-size:9px;padding:2px 7px;border-radius:2px;background:var(--g3);border:1px solid var(--border);color:var(--g);}
.aisum{padding:8px 10px;border-radius:2px;background:rgba(0,255,136,0.05);border:1px solid rgba(0,255,136,0.16);margin-top:4px;}
.aisumlbl{font-size:7px;letter-spacing:0.14em;color:var(--muted);margin-bottom:3px;}
.aisumtxt{font-size:12px;color:var(--text);line-height:1.65;}
.aits{font-size:7px;color:var(--dim);text-align:right;margin-top:4px;}
.aiload{display:flex;align-items:center;gap:7px;padding:10px;color:var(--muted);font-size:9px;letter-spacing:0.1em;}
.aispin{width:10px;height:10px;border:1.5px solid var(--dim);border-top-color:var(--g);border-radius:50%;animation:spin 0.7s linear infinite;}
@keyframes spin{to{transform:rotate(360deg)}}
.instcard{background:var(--bg2);border:1px solid var(--border);border-radius:2px;padding:9px 12px;transition:border-color 0.15s;}
.instcard:hover{border-color:var(--border2);}
.ihead{display:flex;align-items:center;justify-content:space-between;margin-bottom:3px;}
.isym{font-family:var(--orb);font-size:11px;font-weight:700;color:var(--text);letter-spacing:0.05em;}
.iload{font-size:7px;color:var(--muted);letter-spacing:0.1em;}
.iprice{font-family:var(--orb);font-size:17px;font-weight:900;}
.ichg{font-size:9px;font-weight:700;margin-top:1px;}
.iu{color:var(--g);}.id{color:var(--red);}
.imini{width:100%;height:26px;}
.lvlrow{display:flex;align-items:center;justify-content:space-between;padding:4px 8px;background:var(--bg2);border:1px solid var(--border);border-radius:2px;font-size:10px;}
.lvlbtn{background:none;border:none;color:var(--muted);cursor:pointer;font-size:10px;padding:0 2px;}
.calc-res{background:var(--bg2);border:1px solid var(--border);border-radius:2px;padding:8px 10px;font-size:9px;line-height:1.8;color:var(--muted);}
.tvcol{display:flex;flex-direction:column;}
.tvwrap{flex:1;overflow:hidden;min-height:0;}
.tvwrap iframe{width:100%;height:100%;border:none;}
.tvdiv{height:1px;background:var(--border);flex-shrink:0;}
.sbar{background:#000;border-top:1px solid var(--border);display:flex;align-items:center;padding:0 12px;gap:16px;font-size:8px;letter-spacing:0.1em;color:var(--muted);}
.sbi{display:flex;align-items:center;gap:4px;}
.sbdot{width:4px;height:4px;border-radius:50%;}
.sb-g{background:var(--g);box-shadow:0 0 4px var(--g);}
.sbv{color:var(--text);}
.sbsep{width:1px;height:11px;background:var(--dim);}
.endbtn{width:100%;padding:8px;background:rgba(255,51,85,0.07);border:1px solid rgba(255,51,85,0.18);border-radius:2px;color:rgba(255,51,85,0.75);font-family:var(--mono);font-size:9px;letter-spacing:0.15em;cursor:pointer;transition:all 0.15s;text-align:center;}
.endbtn:hover{background:rgba(255,51,85,0.13);border-color:rgba(255,51,85,0.4);}
.bline{font-size:10px;color:var(--muted);letter-spacing:0.07em;opacity:0;animation:fi 0.2s ease forwards;}
@keyframes fi{to{opacity:1}}
.bbar{height:100%;background:var(--g);width:0;box-shadow:0 0 10px var(--g);animation:bload 2.3s ease forwards;border-radius:1px;}
@keyframes bload{from{width:0}to{width:100%}}
`
