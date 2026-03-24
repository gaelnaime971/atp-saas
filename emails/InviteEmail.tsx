import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'

interface InviteEmailProps {
  full_name: string
  code: string
  plan_type: string
  inviteUrl: string
}

export default function InviteEmail({ full_name, code, plan_type, inviteUrl }: InviteEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Votre code d&apos;accès ATP Coaching : {code}</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header */}
          <Section style={header}>
            <Text style={logo}>ATP</Text>
            <Text style={logoSub}>COACHING</Text>
          </Section>

          {/* Content */}
          <Section style={content}>
            <Heading style={h1}>Bienvenue, {full_name} 👋</Heading>

            <Text style={text}>
              Vous avez été invité(e) à rejoindre la plateforme <strong>ATP Coaching</strong>.
            </Text>
            <Text style={text}>
              Votre plan : <strong style={{ color: '#22c55e' }}>{plan_type}</strong>
            </Text>
            <Text style={text}>
              Utilisez le code ci-dessous pour activer votre compte sur{' '}
              <a href={inviteUrl} style={{ color: '#22c55e', textDecoration: 'underline' }}>{inviteUrl.replace(/^https?:\/\//, '')}</a>
            </Text>

            {/* Code block */}
            <Section style={codeContainer}>
              <Text style={codeLabel}>VOTRE CODE D&apos;ACCÈS</Text>
              <Text style={codeText}>{code}</Text>
              <Text style={codeHint}>Valable 7 jours — ne partagez pas ce code</Text>
            </Section>

            <Hr style={hr} />

            <Text style={footer}>
              ATP Coaching — Plateforme de gestion et de suivi pour traders
            </Text>
            <Text style={footerSmall}>
              Si vous n&apos;avez pas demandé cet accès, ignorez cet email.
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
  maxWidth: '520px',
  padding: '20px 0 48px',
}

const header = {
  backgroundColor: '#161b27',
  padding: '24px 40px',
  borderRadius: '12px 12px 0 0',
  borderBottom: '1px solid rgba(255,255,255,0.07)',
  textAlign: 'center' as const,
}

const logo = {
  color: '#22c55e',
  fontSize: '28px',
  fontWeight: '700',
  margin: '0',
  letterSpacing: '4px',
}

const logoSub = {
  color: '#a0aec0',
  fontSize: '10px',
  fontWeight: '500',
  margin: '0',
  letterSpacing: '6px',
}

const content = {
  backgroundColor: '#161b27',
  padding: '32px 40px',
  borderRadius: '0 0 12px 12px',
}

const h1 = {
  color: '#e8edf5',
  fontSize: '22px',
  fontWeight: '600',
  margin: '0 0 20px',
}

const text = {
  color: '#a0aec0',
  fontSize: '14px',
  lineHeight: '22px',
  margin: '0 0 10px',
}

const codeContainer = {
  backgroundColor: '#0f1117',
  border: '1px solid rgba(34,197,94,0.25)',
  borderRadius: '12px',
  padding: '24px',
  textAlign: 'center' as const,
  margin: '24px 0',
}

const codeLabel = {
  color: '#5a6a82',
  fontSize: '10px',
  fontWeight: '600',
  letterSpacing: '3px',
  margin: '0 0 12px',
}

const codeText = {
  color: '#22c55e',
  fontSize: '48px',
  fontWeight: '700',
  fontFamily: "'DM Mono', 'Courier New', monospace",
  letterSpacing: '12px',
  margin: '0 0 12px',
}

const codeHint = {
  color: '#5a6a82',
  fontSize: '11px',
  margin: '0',
}

const hr = {
  borderColor: 'rgba(255,255,255,0.07)',
  margin: '24px 0 16px',
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
