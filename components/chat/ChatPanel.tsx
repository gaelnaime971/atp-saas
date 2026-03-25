'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useChat } from '@/lib/hooks/useChat'
import MessageBubble from './MessageBubble'
import dynamic from 'next/dynamic'

const EmojiPicker = dynamic(() => import('emoji-picker-react'), { ssr: false })

interface ChatPanelProps {
  currentUserId: string
  partnerId: string
  partnerName: string
  messagesHeight?: number
}

export default function ChatPanel({
  currentUserId,
  partnerId,
  partnerName,
  messagesHeight = 300,
}: ChatPanelProps) {
  const { messages, loading, sendMessage, markAsRead } = useChat(currentUserId, partnerId)
  const [text, setText] = useState('')
  const [showEmoji, setShowEmoji] = useState(false)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const supabase = useRef(createClient()).current

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Mark as read on mount and when new messages arrive
  useEffect(() => {
    markAsRead()
  }, [messages.length, markAsRead])

  const uploadImage = useCallback(
    async (file: File) => {
      setUploading(true)
      const ext = file.name.split('.').pop() || 'png'
      const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage.from('chat-images').upload(path, file)
      if (error) {
        setUploading(false)
        return
      }
      const { data } = supabase.storage.from('chat-images').getPublicUrl(path)
      setImageUrl(data.publicUrl)
      setImagePreview(URL.createObjectURL(file))
      setUploading(false)
    },
    [supabase]
  )

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          e.preventDefault()
          const file = item.getAsFile()
          if (file) uploadImage(file)
          return
        }
      }
    },
    [uploadImage]
  )

  const handleSend = async () => {
    if (!text.trim() && !imageUrl) return
    await sendMessage(text, imageUrl)
    setText('')
    setImagePreview(null)
    setImageUrl(null)
    setShowEmoji(false)
    textareaRef.current?.focus()
  }

  const clearImage = () => {
    setImagePreview(null)
    setImageUrl(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'var(--bg3)',
        }}
      >
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: '50%',
            background: 'rgba(34,197,94,0.1)',
            border: '1px solid rgba(34,197,94,0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 9,
            fontWeight: 700,
            color: 'var(--green)',
            fontFamily: "'DM Mono', monospace",
          }}
        >
          {partnerName
            .split(' ')
            .map((w) => w[0])
            .join('')
            .slice(0, 2)
            .toUpperCase()}
        </div>
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>
          {partnerName}
        </span>
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          minHeight: messagesHeight,
          maxHeight: messagesHeight,
        }}
      >
        {loading && (
          <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 11 }}>
            Chargement...
          </div>
        )}
        {!loading && messages.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 11, marginTop: 40 }}>
            Aucun message pour l&apos;instant
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} isMine={msg.sender_id === currentUserId} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Image preview */}
      {imagePreview && (
        <div style={{ padding: '4px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <img
            src={imagePreview}
            alt="preview"
            style={{ height: 40, borderRadius: 6, border: '1px solid var(--border)' }}
          />
          <button
            onClick={clearImage}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text3)',
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Emoji picker */}
      {showEmoji && (
        <div style={{ position: 'absolute', bottom: 60, right: 8, zIndex: 900 }}>
          <EmojiPicker
            onEmojiClick={(emojiData) => {
              setText((prev) => prev + emojiData.emoji)
              textareaRef.current?.focus()
            }}
            width={280}
            height={350}
            skinTonesDisabled
            searchDisabled={false}
            previewConfig={{ showPreview: false }}
          />
        </div>
      )}

      {/* Input bar */}
      <div
        style={{
          padding: '8px 10px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'flex-end',
          gap: 6,
          background: 'var(--bg2)',
        }}
      >
        {/* File upload */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) uploadImage(file)
            e.target.value = ''
          }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text3)',
            cursor: 'pointer',
            padding: 4,
            flexShrink: 0,
          }}
          title="Joindre une image"
        >
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24">
            <path
              d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        {/* Emoji toggle */}
        <button
          onClick={() => setShowEmoji(!showEmoji)}
          style={{
            background: 'none',
            border: 'none',
            color: showEmoji ? 'var(--green)' : 'var(--text3)',
            cursor: 'pointer',
            padding: 4,
            fontSize: 16,
            flexShrink: 0,
          }}
          title="Emojis"
        >
          😊
        </button>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={handlePaste}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          placeholder={`Message à ${partnerName}...`}
          rows={1}
          style={{
            flex: 1,
            background: 'var(--bg3)',
            border: '1px solid var(--border2)',
            borderRadius: 8,
            padding: '7px 10px',
            fontSize: 12,
            color: 'var(--text)',
            resize: 'none',
            minHeight: 34,
            maxHeight: 80,
            fontFamily: "'Outfit', sans-serif",
            outline: 'none',
            lineHeight: 1.4,
          }}
        />

        {/* Send */}
        <button
          onClick={handleSend}
          disabled={uploading || (!text.trim() && !imageUrl)}
          style={{
            background: 'var(--green)',
            border: 'none',
            borderRadius: 6,
            width: 30,
            height: 30,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            opacity: uploading || (!text.trim() && !imageUrl) ? 0.4 : 1,
            flexShrink: 0,
          }}
        >
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24">
            <path d="M22 2L11 13" stroke="#0f1117" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M22 2L15 22l-4-9-9-4 20-7z" stroke="#0f1117" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  )
}
