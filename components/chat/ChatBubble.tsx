'use client'

interface ChatBubbleProps {
  unreadCount: number
  onClick: () => void
}

export default function ChatBubble({ unreadCount, onClick }: ChatBubbleProps) {
  return (
    <button
      onClick={onClick}
      style={{
        position: 'fixed',
        bottom: '1.5rem',
        right: '1.5rem',
        width: 52,
        height: 52,
        background: 'var(--green)',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        zIndex: 800,
        boxShadow: '0 4px 20px rgba(34,197,94,0.35)',
        border: 'none',
        transition: 'transform 0.2s',
      }}
      onMouseOver={(e) => (e.currentTarget.style.transform = 'scale(1.08)')}
      onMouseOut={(e) => (e.currentTarget.style.transform = 'scale(1)')}
    >
      <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
        <path
          d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"
          stroke="#09090b"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {unreadCount > 0 && (
        <div
          style={{
            position: 'absolute',
            top: -2,
            right: -2,
            minWidth: 18,
            height: 18,
            background: '#ef4444',
            borderRadius: 9,
            fontSize: 10,
            fontFamily: "'DM Mono', monospace",
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            padding: '0 4px',
          }}
        >
          {unreadCount > 99 ? '99+' : unreadCount}
        </div>
      )}
    </button>
  )
}
