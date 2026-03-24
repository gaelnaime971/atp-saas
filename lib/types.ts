export type Role = 'admin' | 'trader'

export interface Profile {
  id: string
  role: Role
  full_name: string | null
  email: string | null
  avatar_url: string | null
  plan_type: string | null
  propfirm_name: string | null
  created_at: string
}

export interface Invitation {
  id: string
  email: string
  code: string
  invited_by: string | null
  full_name: string | null
  plan_type: string | null
  propfirm_name: string | null
  expires_at: string
  used_at: string | null
  created_at: string
}

export interface TradingSession {
  id: string
  trader_id: string
  session_date: string
  pnl: number
  result: 'win' | 'loss' | 'breakeven' | null
  trades_count: number
  instrument: string | null
  setup: string | null
  notes: string | null
  created_at: string
}

export interface CoachingSession {
  id: string
  trader_id: string
  scheduled_at: string
  duration_minutes: number
  notes: string | null
  status: 'planned' | 'completed' | 'cancelled'
  created_at: string
}

export interface Revenue {
  id: string
  trader_id: string | null
  amount: number
  description: string | null
  payment_date: string
  created_at: string
}

export interface Resource {
  id: string
  title: string
  type: 'video' | 'pdf' | 'doc'
  url: string | null
  description: string | null
  created_by: string | null
  created_at: string
}

export interface JournalEntry {
  id: string
  trader_id: string
  entry_date: string
  content: string | null
  mood: 'great' | 'good' | 'neutral' | 'bad' | null
  created_at: string
}

export interface Objective {
  id: string
  trader_id: string
  title: string
  progress: number
  created_at: string
}

export interface TraderWithStats extends Profile {
  total_pnl?: number
  win_rate?: number
  session_count?: number
}

export interface InviteTraderPayload {
  email: string
  full_name: string
  plan_type: string
  propfirm_name?: string
}

export interface InviteEmailProps {
  full_name: string
  code: string
  plan_type: string
}
