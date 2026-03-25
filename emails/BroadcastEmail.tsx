import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from '@react-email/components'

interface BroadcastEmailProps {
  subject: string
  message: string
  appUrl: string
}

export default function BroadcastEmail({ subject, message, appUrl }: BroadcastEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{subject}</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header */}
          <Section style={header}>
            <Img
              src={`${appUrl}/logo-atp-white.png`}
              alt="Alpha Trading Pro"
              height="28"
              style={{ margin: '0 auto' }}
            />
          </Section>

          {/* Content */}
          <Section style={content}>
            <Text style={h1}>{subject}</Text>
            {message.split('\n').map((line, i) => (
              <Text key={i} style={line.trim() === '' ? spacer : text}>
                {line || '\u00A0'}
              </Text>
            ))}
          </Section>

          {/* CTA */}
          <Section style={ctaSection}>
            <a href={`${appUrl}/login`} style={ctaButton}>
              Accéder à mon dashboard
            </a>
          </Section>

          {/* Footer */}
          <Section style={footerSection}>
            <Hr style={hr} />
            <Text style={footer}>
              Alpha Trading Pro — Coaching trading professionnel
            </Text>
            <Text style={footerSmall}>
              Vous recevez cet email car vous êtes membre du programme ATP Coaching.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

const main = {
  backgroundColor: '#0f1117',
  fontFamily: "'Outfit', Arial, sans-serif",
}

const container = {
  margin: '0 auto',
  maxWidth: '560px',
  padding: '20px 0 48px',
}

const header = {
  backgroundColor: '#161b27',
  padding: '24px 40px',
  borderRadius: '12px 12px 0 0',
  borderBottom: '1px solid rgba(255,255,255,0.07)',
  textAlign: 'center' as const,
}

const content = {
  backgroundColor: '#161b27',
  padding: '32px 40px 24px',
}

const h1 = {
  color: '#e8edf5',
  fontSize: '20px',
  fontWeight: '700' as const,
  margin: '0 0 24px',
  lineHeight: '1.4',
}

const text = {
  color: '#a0aec0',
  fontSize: '14px',
  lineHeight: '24px',
  margin: '0 0 4px',
}

const spacer = {
  color: '#a0aec0',
  fontSize: '14px',
  lineHeight: '12px',
  margin: '0',
}

const ctaSection = {
  backgroundColor: '#161b27',
  padding: '8px 40px 32px',
  textAlign: 'center' as const,
}

const ctaButton = {
  display: 'inline-block',
  backgroundColor: '#22c55e',
  color: '#0f1117',
  fontSize: '13px',
  fontWeight: '700' as const,
  padding: '12px 28px',
  borderRadius: '8px',
  textDecoration: 'none',
}

const footerSection = {
  backgroundColor: '#161b27',
  padding: '0 40px 24px',
  borderRadius: '0 0 12px 12px',
}

const hr = {
  borderColor: 'rgba(255,255,255,0.07)',
  margin: '0 0 16px',
}

const footer = {
  color: '#5a6a82',
  fontSize: '12px',
  lineHeight: '18px',
  margin: '0 0 6px',
  textAlign: 'center' as const,
}

const footerSmall = {
  color: '#4a5568',
  fontSize: '11px',
  margin: '0',
  textAlign: 'center' as const,
}
