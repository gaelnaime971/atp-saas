'use client'

import { useState } from 'react'
import Card from '@/components/ui/Card'

interface Analysis {
  verdict_general: string
  forces: string[]
  faiblesses: string[]
  patterns_detectes: string[]
  actions_concretes: string[]
  discipline_note_sur_10: number
  psychologie_note_sur_10: number
  methode_note_sur_10: number
  message_motivant: string
}

interface Stats {
  sessions_count: number
  backtests_count: number
  total_pnl: number
  win_rate: number
  profit_factor: string | number
}

export default function AnalyseIA() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null)

  const generate = async () => {
    setLoading(true)
    setError('')
    setAnalysis(null)
    try {
      const r = await fetch('/api/ai-coach-analysis', { method: 'POST' })
      const data = await r.json()
      if (data.error) {
        setError(data.error)
        setLoading(false)
        return
      }
      // Strip markdown wrappers
      let raw = (data.analysis || '').replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
      const firstBrace = raw.indexOf('{')
      const lastBrace = raw.lastIndexOf('}')
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        raw = raw.substring(firstBrace, lastBrace + 1)
      }
      try {
        setAnalysis(JSON.parse(raw))
      } catch {
        setError('Réponse de l\'IA invalide. Réessaie.')
      }
      setStats(data.stats || null)
      setGeneratedAt(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de connexion')
    }
    setLoading(false)
  }

  const NoteCircle = ({ note, label, color }: { note: number; label: string; color: string }) => (
    <div style={{ textAlign: 'center', padding: '20px 16px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 12 }}>
      <div style={{ position: 'relative', width: 80, height: 80, margin: '0 auto 8px' }}>
        <svg width="80" height="80" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="40" cy="40" r="34" fill="none" stroke="var(--bg2)" strokeWidth="6" />
          <circle
            cx="40" cy="40" r="34" fill="none" stroke={color} strokeWidth="6"
            strokeDasharray={`${(note / 10) * 213.6} 213.6`}
            strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 1s ease' }}
          />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color, lineHeight: 1 }}>{note}</div>
          <div style={{ fontSize: 9, color: 'var(--text3)', marginTop: 2 }}>/ 10</div>
        </div>
      </div>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
    </div>
  )

  const Section = ({ title, items, color, icon }: { title: string; items: string[]; color: string; icon: string }) => (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span style={{ fontSize: 20 }}>{icon}</span>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{title}</h3>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map((item, i) => (
          <div key={i} style={{
            display: 'flex', gap: 12, padding: '12px 14px', borderRadius: 10,
            background: `${color}10`, border: `1px solid ${color}30`,
          }}>
            <div style={{
              width: 24, height: 24, borderRadius: '50%', background: color, color: '#000',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              fontSize: 12, fontWeight: 800,
            }}>{i + 1}</div>
            <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6, flex: 1 }}>{item}</div>
          </div>
        ))}
      </div>
    </Card>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>🧠</span> Analyse IA
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text3)', margin: '6px 0 0 0', lineHeight: 1.5 }}>
            Diagnostic de tes performances sur les 30 derniers jours basé sur tes sessions, notes et backtests.
          </p>
        </div>
        <button
          onClick={generate}
          disabled={loading}
          style={{
            padding: '12px 24px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: loading ? 'default' : 'pointer',
            background: loading ? 'var(--bg2)' : 'var(--green)', color: loading ? 'var(--text3)' : '#09090b', border: 'none',
            transition: 'all 0.2s', whiteSpace: 'nowrap',
          }}
        >
          {loading ? '⏳ Analyse en cours...' : analysis ? '🔄 Regénérer' : '✨ Lancer l\'analyse'}
        </button>
      </div>

      {/* Empty state */}
      {!analysis && !loading && !error && (
        <Card>
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontSize: 56, marginBottom: 20 }}>🧠</div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>Prêt pour ton diagnostic ?</h3>
            <p style={{ fontSize: 13, color: 'var(--text3)', maxWidth: 480, margin: '0 auto', lineHeight: 1.6 }}>
              L&apos;IA va analyser <strong style={{ color: 'var(--text)' }}>toutes tes sessions, notes techniques, notes psychologiques et backtests</strong> des 30 derniers jours pour te sortir un diagnostic complet : forces, faiblesses, patterns récurrents et actions concrètes.
            </p>
            <div style={{ marginTop: 24, display: 'inline-flex', gap: 16, padding: '12px 20px', background: 'var(--bg3)', borderRadius: 10, border: '1px solid var(--border)', fontSize: 11, color: 'var(--text3)' }}>
              <span>⚡ ~10 sec</span>
              <span>·</span>
              <span>🔒 Données privées</span>
              <span>·</span>
              <span>🎯 Coach trading senior</span>
            </div>
          </div>
        </Card>
      )}

      {/* Error */}
      {error && (
        <Card style={{ border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.06)' }}>
          <div style={{ fontSize: 13, color: '#ef4444', lineHeight: 1.6 }}>
            <strong>Erreur :</strong> {error}
          </div>
        </Card>
      )}

      {/* Loading state */}
      {loading && (
        <Card>
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ display: 'inline-block', width: 40, height: 40, border: '3px solid var(--bg3)', borderTopColor: 'var(--green)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <p style={{ fontSize: 14, color: 'var(--text2)', marginTop: 16, fontWeight: 500 }}>L&apos;IA analyse tes performances...</p>
            <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>Quelques secondes — ne ferme pas la page</p>
          </div>
        </Card>
      )}

      {/* Results */}
      {analysis && (
        <>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

          {/* Verdict */}
          <Card style={{ border: '1px solid rgba(34,197,94,0.25)', background: 'linear-gradient(135deg, rgba(34,197,94,0.06), transparent)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 22 }}>
                💬
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', color: 'var(--green)', textTransform: 'uppercase', marginBottom: 4 }}>Verdict général</div>
                <p style={{ fontSize: 15, color: 'var(--text)', lineHeight: 1.7, margin: 0 }}>{analysis.verdict_general}</p>
              </div>
            </div>
          </Card>

          {/* Stats + Notes */}
          <div style={{ display: 'grid', gridTemplateColumns: stats ? '1fr 1fr 1fr' : '1fr 1fr 1fr', gap: 12 }}>
            <NoteCircle note={analysis.discipline_note_sur_10} label="Discipline" color={analysis.discipline_note_sur_10 >= 7 ? '#22c55e' : analysis.discipline_note_sur_10 >= 5 ? '#f59e0b' : '#ef4444'} />
            <NoteCircle note={analysis.psychologie_note_sur_10} label="Psychologie" color={analysis.psychologie_note_sur_10 >= 7 ? '#22c55e' : analysis.psychologie_note_sur_10 >= 5 ? '#f59e0b' : '#ef4444'} />
            <NoteCircle note={analysis.methode_note_sur_10} label="Méthode" color={analysis.methode_note_sur_10 >= 7 ? '#22c55e' : analysis.methode_note_sur_10 >= 5 ? '#f59e0b' : '#ef4444'} />
          </div>

          {stats && (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', padding: '12px 16px', background: 'var(--bg3)', borderRadius: 10, border: '1px solid var(--border)' }}>
              {[
                { lbl: 'Sessions', val: stats.sessions_count },
                { lbl: 'Backtests', val: stats.backtests_count },
                { lbl: 'P&L', val: `${stats.total_pnl >= 0 ? '+' : ''}${Number(stats.total_pnl).toFixed(0)} €`, color: stats.total_pnl >= 0 ? '#22c55e' : '#ef4444' },
                { lbl: 'Win rate', val: `${stats.win_rate}%` },
                { lbl: 'Profit factor', val: stats.profit_factor },
              ].map(s => (
                <div key={s.lbl} style={{ fontSize: 11, color: 'var(--text3)' }}>
                  {s.lbl}: <span style={{ color: s.color || 'var(--text)', fontWeight: 700, fontFamily: 'monospace' }}>{s.val}</span>
                </div>
              ))}
            </div>
          )}

          {/* 3-column sections */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
            <Section title="Tes forces" items={analysis.forces} color="#22c55e" icon="✅" />
            <Section title="Tes faiblesses" items={analysis.faiblesses} color="#ef4444" icon="⚠️" />
            <Section title="Patterns détectés" items={analysis.patterns_detectes} color="#f59e0b" icon="🔍" />
          </div>

          {/* Actions */}
          <Section title="Actions concrètes pour cette semaine" items={analysis.actions_concretes} color="#3b82f6" icon="🎯" />

          {/* Motivational */}
          <Card style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.08), rgba(34,197,94,0.02))', border: '1px solid rgba(34,197,94,0.25)', textAlign: 'center', padding: 24 }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🚀</div>
            <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--green)', lineHeight: 1.6, margin: 0, fontStyle: 'italic' }}>
              &ldquo;{analysis.message_motivant}&rdquo;
            </p>
          </Card>

          {generatedAt && (
            <div style={{ textAlign: 'center', fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>
              Analyse générée le {generatedAt.toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · IA Llama 3.3 via Groq
            </div>
          )}
        </>
      )}
    </div>
  )
}
