'use client'

import type { Message } from '@/lib/types'

interface MessageBubbleProps {
  message: Message
  isMine: boolean
}

export default function MessageBubble({ message, isMine }: MessageBubbleProps) {
  const time = new Date(message.created_at).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div style={{ alignSelf: isMine ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
      {message.image_url && (
        <a href={message.image_url} target="_blank" rel="noopener noreferrer">
          <img
            src={message.image_url}
            alt="Image"
            style={{
              maxWidth: 220,
              borderRadius: 8,
              marginBottom: message.content ? 4 : 0,
              display: 'block',
            }}
          />
        </a>
      )}
      {message.content && (
        <div
          style={{
            background: isMine ? 'var(--green)' : 'var(--bg3)',
            border: isMine ? 'none' : '1px solid var(--border)',
            borderRadius: isMine ? '10px 10px 2px 10px' : '10px 10px 10px 2px',
            padding: '8px 11px',
            fontSize: 12,
            color: isMine ? '#0f1117' : 'var(--text)',
            lineHeight: 1.5,
            wordBreak: 'break-word',
          }}
        >
          {message.content}
        </div>
      )}
      <div
        style={{
          fontSize: 10,
          color: 'var(--text3)',
          marginTop: 3,
          textAlign: isMine ? 'right' : 'left',
          fontFamily: "'DM Mono', monospace",
        }}
      >
        {time}
      </div>
    </div>
  )
}
