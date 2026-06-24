'use client';

import { earlyInvestorImageUrl } from '@/lib/api';
import type { EarlyInvestorPlotPin } from './hex-map.types';

/**
 * Right-side detail panel for an Early Investor plot — the EI counterpart to
 * HexPanel. Plots are a separate ERC-721 sale (EarlyInvestorValidator), so this
 * is deliberately simpler than the Genesis hex panel: identity, location, price,
 * what's included, and a Reserve CTA that hands off to the shared checkout.
 */

const VIOLET = '#a855f7';
const VIOLET_LIGHT = '#c084fc';

interface Props {
  plot: EarlyInvestorPlotPin;
  onReserveClick?: (plot: EarlyInvestorPlotPin) => void;
  onClose?: () => void;
}

export function EarlyInvestorPanel({ plot, onReserveClick, onClose }: Props) {
  const status = plot.status ?? 'available';
  const isAvailable = status === 'available';
  const location =
    Number.isFinite(plot.lat) && Number.isFinite(plot.lng)
      ? `${plot.lat.toFixed(4)}, ${plot.lng.toFixed(4)}`
      : '';

  return (
    <aside
      role="dialog"
      aria-label={`Early Investor plot · ${plot.name}`}
      style={{
        width: 380,
        maxHeight: '90vh',
        overflowY: 'auto',
        background: '#0f0a16',
        color: '#e8e8e8',
        border: `1px solid ${VIOLET}33`,
        borderRadius: 6,
        padding: 24,
        fontFamily: 'var(--font-sans, "Inter Tight", system-ui, sans-serif)',
        fontSize: 14,
        lineHeight: 1.55,
        position: 'relative',
      }}
    >
      {onClose && (
        <button
          onClick={onClose}
          aria-label="Close panel"
          style={{
            position: 'absolute', top: 12, right: 12,
            background: 'transparent', border: 'none',
            color: '#888', cursor: 'pointer', fontSize: 20,
          }}
        >
          ×
        </button>
      )}

      {/* Header */}
      <header style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
          <h2 style={{ fontFamily: 'var(--font-serif, "Fraunces", serif)', fontSize: 24, fontWeight: 400, margin: 0 }}>
            {plot.name}
          </h2>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Badge color={VIOLET_LIGHT}>Early Investor</Badge>
          <Badge color={isAvailable ? '#22c55e' : '#9ca3af'}>{status}</Badge>
        </div>
      </header>

      {/* License NFT artwork */}
      <Section title="License NFT">
        <div style={{
          borderRadius: 8, overflow: 'hidden', border: `1px solid ${VIOLET}22`,
          marginBottom: 12, background: '#0d0518', aspectRatio: '2 / 3', lineHeight: 0,
        }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={earlyInvestorImageUrl(plot.plotId)}
            alt={`Early Investor Plot ${plot.name}`}
            style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover' }}
            loading="lazy"
          />
        </div>
      </Section>

      {/* Location */}
      <Section title="Location">
        {plot.h3Index && <Field label="Map cell (H3 res-4)"><code style={{ fontFamily: 'monospace', fontSize: 11 }}>{plot.h3Index}</code></Field>}
        {location && <Field label="Coordinates"><code style={{ fontFamily: 'monospace', fontSize: 11 }}>{location}</code></Field>}
        <Field label="Plot id"><code style={{ fontFamily: 'monospace', fontSize: 11 }}>{plot.plotId}</code></Field>
        <p style={{ fontSize: 11, color: '#6b6477', marginTop: 8 }}>
          Bespoke early-investor location — settled on Base as a Malama Early Investor Plot (separate from the Genesis 200 hex pool).
        </p>
      </Section>

      {/* Pricing */}
      <Section title="Pricing">
        <Field label="Entry">$2,000 USDC</Field>
        <Field label="MLMA / plot">125,000</Field>
      </Section>

      {/* What's included */}
      <Section title="What's included">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {[
            'Malama Early Investor Plot NFT (Base ERC-721) for this location',
            'Cardano CIP-68 reference token minted server-side as a verification mirror',
            'Early-investor allocation in the Malama network buildout',
          ].map((item, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <span style={{ color: VIOLET_LIGHT, fontSize: 14, lineHeight: '1.4', flexShrink: 0 }}>•</span>
              <span style={{ color: '#fff', fontSize: 13, lineHeight: 1.45 }}>{item}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* CTA */}
      <div style={{ marginTop: 24 }}>
        {isAvailable ? (
          <button
            onClick={() => onReserveClick?.(plot)}
            style={{
              width: '100%', padding: '14px 20px', background: VIOLET, color: '#0f0f0f',
              border: 'none', borderRadius: 4, fontFamily: 'var(--font-mono, monospace)',
              fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em',
              cursor: 'pointer',
            }}
          >
            Reserve this plot · $2,000
          </button>
        ) : (
          <div style={{
            padding: '14px 20px', background: '#1f1a26', borderRadius: 4, textAlign: 'center',
            fontFamily: 'var(--font-mono, monospace)', fontSize: 12, color: '#c4b5d8',
            textTransform: 'uppercase', letterSpacing: '0.12em',
          }}>
            {status} · no longer available
          </div>
        )}
      </div>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 24, paddingBottom: 20, borderBottom: '1px dashed #2a2336' }}>
      <h3 style={{
        fontFamily: 'var(--font-mono, monospace)', fontSize: 10, textTransform: 'uppercase',
        letterSpacing: '0.15em', color: '#8b7aa5', margin: '0 0 12px 0', fontWeight: 500,
      }}>
        {title}
      </h3>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
      <span style={{ color: '#8b7aa5' }}>{label}</span>
      <span style={{ color: '#e8e8e8', textAlign: 'right', maxWidth: '60%' }}>{children}</span>
    </div>
  );
}

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{
      background: `${color}18`, color, border: `1px solid ${color}40`, borderRadius: 999,
      padding: '4px 10px', fontFamily: 'var(--font-mono, monospace)', fontSize: 10,
      textTransform: 'uppercase', letterSpacing: '0.12em',
    }}>
      {children}
    </span>
  );
}
