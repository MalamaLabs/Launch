'use client';

/**
 * Additive review route for the new Hex Explorer module.
 *
 * Mounts apps/web/src/explorer/components/{HexMap, HexPanel} for visual
 * review. The existing /app/map route is unchanged and still uses the
 * legacy MapPageClient. To compare implementations, visit:
 *
 *   /map        → existing MapPageClient
 *   /explorer   → new HexMap + HexPanel (this file)
 */

import { useEffect, useMemo, useRef, useState, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';

import { latLngToCell } from 'h3-js';

import { HexPanel } from '@/explorer/components/HexPanel';
import { EarlyInvestorPanel } from '@/explorer/components/EarlyInvestorPanel';
import { REGION_DESTINATIONS, type HexStatus } from '@/explorer/components/hex-map.constants';
import { API_BASE, listEarlyInvestorPlots } from '@/lib/api';
import { loadGenesisManifest } from '@/lib/genesis-manifest';
import type { HexMapHandle } from '@/explorer/components/HexMap';
import type {
  EarlyInvestorPlotPin,
  LandCellSet,
  Phase1Hex,
  Phase1Manifest,
} from '@/explorer/components/hex-map.types';

const PLOT_H3_RESOLUTION = 4; // canonical license size for plot grid context

// HexMap pulls in mapbox-gl which is browser-only; load it client-side only.
const HexMap = dynamic(
  () => import('@/explorer/components/HexMap').then((m) => m.HexMap),
  { ssr: false, loading: () => <MapLoading /> },
);

// useSearchParams requires a Suspense boundary in Next.js App Router
export default function ExplorerPage() {
  return (
    <Suspense fallback={<MapLoading />}>
      <ExplorerPageInner />
    </Suspense>
  );
}

function ExplorerPageInner() {
  const searchParams = useSearchParams();
  const hexParam = searchParams.get('hex');

  const [selected, setSelected] = useState<Phase1Hex | null>(null);
  const [selectedPlot, setSelectedPlot] = useState<EarlyInvestorPlotPin | null>(null);
  const [activeRegion, setActiveRegion] = useState<string>(REGION_DESTINATIONS[0].name);
  const [manifest, setManifest] = useState<Phase1Manifest | null>(null);
  const [plots, setPlots] = useState<EarlyInvestorPlotPin[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'map' | 'list'>('map');
  const [listFilter, setListFilter] = useState<string>('all');
  const [userHexIds, setUserHexIds] = useState<string[]>([]);
  const [hexParamHandled, setHexParamHandled] = useState(false);
  const mapRef = useRef<HexMapHandle | null>(null);
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';
  const isPlaceholder =
    token === 'pk.your_token_here' || token === 'pk.your_mapbox_token_here';

  // Load the live Genesis hex catalog
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const built = await loadGenesisManifest();
        if (!cancelled) setManifest(built);
      } catch (e) {
        if (!cancelled) setLoadError(String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load Early Investor plots as an optional violet overlay (best-effort).
  useEffect(() => {
    let cancelled = false;
    listEarlyInvestorPlots()
      .then((res) => {
        if (cancelled) return;
        const pins = (res.plots ?? [])
          .filter((p) => typeof p.lat === 'number' && typeof p.lng === 'number')
          .map<EarlyInvestorPlotPin>((p) => ({
            plotId: p.plotId,
            name: p.name,
            lat: p.lat as number,
            lng: p.lng as number,
            h3Index: p.h3Index ?? latLngToCell(p.lat as number, p.lng as number, PLOT_H3_RESOLUTION),
            status: p.status,
          }));
        setPlots(pins);
      })
      .catch(() => { /* overlay is best-effort */ });
    return () => { cancelled = true; };
  }, []);

  // Fetch the logged-in user's owned hex IDs so we can colour them yellow
  useEffect(() => {
    fetch('/api/user', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { account?: { hexIds?: string[] } } | null) => {
        if (d?.account?.hexIds?.length) setUserHexIds(d.account.hexIds);
      })
      .catch(() => {});
  }, []);

  // Overlay user-owned hexes with 'reserved-user' status (yellow)
  const enrichedManifest = useMemo<Phase1Manifest | null>(() => {
    if (!manifest) return null;
    if (!userHexIds.length) return manifest;
    return {
      ...manifest,
      hexes: manifest.hexes.map((h) =>
        userHexIds.includes(h.h3Index)
          ? { ...h, status: 'reserved-user' as HexStatus }
          : h,
      ),
    };
  }, [manifest, userHexIds]);

  // When ?hex=HEXID is present, fly to it and select it once map + manifest are ready
  useEffect(() => {
    if (!enrichedManifest || !hexParam || hexParamHandled) return;
    const hex = enrichedManifest.hexes.find((h) => h.h3Index === hexParam);
    if (!hex) return;
    setSelected(hex);
    setHexParamHandled(true);
    setTimeout(() => {
      mapRef.current?.flyTo([hex.centroidLng, hex.centroidLat], 8);
    }, 800);
  }, [enrichedManifest, hexParam, hexParamHandled]);

  if (!token || isPlaceholder) {
    return <MissingToken isPlaceholder={isPlaceholder} />;
  }
  if (loadError) {
    return <LoadError message={loadError} />;
  }
  if (!enrichedManifest) {
    return <MapLoading />;
  }

  const handleRegionClick = (regionName: string) => {
    const dest = REGION_DESTINATIONS.find((r) => r.name === regionName);
    if (!dest) return;
    setActiveRegion(regionName);
    mapRef.current?.flyTo(dest.center, dest.zoom);
  };

  const hexLinks = {
    erc721MetadataUrl: selected ? `${API_BASE}/hexes/token-uri/by-hex/${selected.h3Index}` : '',
    cardanoReferenceNftUrl: null,
    purchaseAgreementUrl: '/legal/hex-node-purchase',
    termsAndConditionsUrl: '/legal/terms',
    tokenRewardsRiskUrl: '/legal/token-rewards-risk',
    zoneClassificationDocUrl: '/docs/data-demand-score-methodology',
    dataDemandScoreDocUrl: '/docs/data-demand-score-methodology',
    pricingMethodologyDocUrl: '/docs/pricing',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: 'calc(100vh - 4rem)', background: '#0f0f0f' }}>
      {/* ── Top toolbar ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', borderBottom: '1px solid #1f1f1f', background: '#0f0f0f', flexShrink: 0, zIndex: 20 }}>
        <ReviewBanner inline />
        <div style={{ display: 'flex', gap: 4 }}>
          {/* View toggle */}
          {(['map', 'list'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              style={{
                padding: '6px 14px',
                borderRadius: 4,
                border: 'none',
                background: viewMode === mode ? '#c4f061' : '#1a1a1a',
                color: viewMode === mode ? '#0f0f0f' : '#888',
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: 11,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                cursor: 'pointer',
              }}
            >
              {mode === 'map' ? '⬡ Map' : '≡ List'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content area ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {viewMode === 'map' ? (
          <>
            <div style={{ flex: 1, position: 'relative' }}>
              <HexMap
                ref={mapRef}
                accessToken={token}
                manifest={enrichedManifest}
                landCells={{} as { r1?: LandCellSet; r3?: LandCellSet; r5?: LandCellSet }}
                onHexClick={({ hex }) => { setSelectedPlot(null); setSelected(hex); }}
                earlyInvestorPlots={plots}
                onPlotClick={({ plot }) => { setSelected(null); setSelectedPlot(plot); }}
              />
              <RegionJumpBar activeRegion={activeRegion} onSelect={handleRegionClick} />
            </div>
            {selected && (
              <div style={{ flexShrink: 0, padding: 16, overflowY: 'auto' }}>
                <HexPanel
                  hex={selected}
                  links={hexLinks}
                  onReserveClick={(hex) => { window.location.href = `/presale?hex=${hex.h3Index}`; }}
                  onClose={() => setSelected(null)}
                />
              </div>
            )}
            {selectedPlot && (
              <div style={{ flexShrink: 0, padding: 16, overflowY: 'auto' }}>
                <EarlyInvestorPanel
                  plot={selectedPlot}
                  onReserveClick={(plot) => { window.location.href = `/presale?hex=${plot.plotId}`; }}
                  onClose={() => setSelectedPlot(null)}
                />
              </div>
            )}
          </>
        ) : (
          <HexListView
            manifest={enrichedManifest}
            selected={selected}
            filter={listFilter}
            onFilterChange={setListFilter}
            onSelect={(hex) => setSelected(hex)}
            onDeselect={() => setSelected(null)}
            links={hexLinks}
            onReserve={(hex) => { window.location.href = `/presale?hex=${hex.h3Index}`; }}
          />
        )}
      </div>
    </div>
  );
}

function MapLoading() {
  return (
    <div style={{ display: 'grid', placeItems: 'center', width: '100%', height: 'calc(100vh - 4rem)', color: '#888', fontFamily: 'monospace', fontSize: 13, background: '#0f0f0f' }}>
      Loading hex catalog…
    </div>
  );
}

function LoadError({ message }: { message: string }) {
  return (
    <div style={{ padding: 40, color: '#e8e8e8', fontFamily: 'system-ui', maxWidth: 720, margin: '40px auto' }}>
      <h1 style={{ fontFamily: 'serif', fontSize: 24, marginBottom: 12 }}>
        Could not load the Genesis hex catalog
      </h1>
      <pre style={{ background: '#1f1f1f', padding: 12, borderRadius: 4, color: '#fda4a4', fontSize: 12, overflowX: 'auto' }}>
        {message}
      </pre>
      <p style={{ color: '#888', fontSize: 13, marginTop: 12 }}>
        The explorer pulls the Genesis hex catalog from <code>dagwelldev-api /hexes/geojson</code>,
        with a local <code>/api/hexes</code> fallback during region migrations.
      </p>
    </div>
  );
}

function RegionJumpBar({
  activeRegion,
  onSelect,
}: {
  activeRegion: string;
  onSelect: (name: string) => void;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: 4,
        background: 'rgba(15,15,15,0.92)',
        border: '1px solid #2a2a2a',
        borderRadius: 999,
        padding: 4,
        boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
        zIndex: 10,
      }}
    >
      {REGION_DESTINATIONS.map((r) => {
        const isActive = r.name === activeRegion;
        return (
          <button
            key={r.name}
            onClick={() => onSelect(r.name)}
            style={{
              padding: '8px 14px',
              borderRadius: 999,
              border: 'none',
              background: isActive ? '#c4f061' : 'transparent',
              color: isActive ? '#0f0f0f' : '#c8c8c8',
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: 11,
              fontWeight: isActive ? 600 : 500,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              cursor: 'pointer',
              transition: 'all 120ms ease',
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                (e.currentTarget as HTMLButtonElement).style.background = '#1f1f1f';
                (e.currentTarget as HTMLButtonElement).style.color = '#fff';
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                (e.currentTarget as HTMLButtonElement).style.color = '#c8c8c8';
              }
            }}
          >
            {r.name}
          </button>
        );
      })}
    </div>
  );
}

function ReviewBanner({ inline = false }: { inline?: boolean }) {
  const text = 'Genesis Explorer · H3 Res 4 · 200 hexes · 5 regions';
  if (inline) {
    return (
      <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#c4f061', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
        {text}
      </span>
    );
  }
  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        left: 12,
        background: 'rgba(15,15,15,0.85)',
        border: '1px solid #2a2a2a',
        borderRadius: 4,
        padding: '10px 14px',
        fontFamily: 'monospace',
        fontSize: 11,
        color: '#c4f061',
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        zIndex: 10,
      }}
    >
      {text}
    </div>
  );
}

// ── Hex List View ─────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  'available':        '#22c55e',
  'reserved':         '#ef4444',
  'reserved-founding':'#ef4444',
  'reserved-user':    '#eab308',
  'activated':        '#c4f061',
  'upcoming':         '#4ade80',
  'future-phase':     '#2a2a2a',
  'restricted':       '#2a2a2a',
};

const ZONE_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  'urban-core': { bg: '#0a2010', color: '#c4f061', border: '#1a4020' },
  'urban':      { bg: '#0a1a30', color: '#60a5fa', border: '#1a3060' },
  'suburban':   { bg: '#1a1a0a', color: '#e0d060', border: '#3a3a10' },
  'rural':      { bg: '#1a0a00', color: '#f0a040', border: '#3a2010' },
  'remote':     { bg: '#1a1a1a', color: '#888',    border: '#2a2a2a' },
};

function HexListView({
  manifest,
  selected,
  filter,
  onFilterChange,
  onSelect,
  onDeselect,
  links,
  onReserve,
}: {
  manifest: Phase1Manifest;
  selected: Phase1Hex | null;
  filter: string;
  onFilterChange: (f: string) => void;
  onSelect: (hex: Phase1Hex) => void;
  onDeselect: () => void;
  links: Parameters<typeof HexPanel>[0]['links'];
  onReserve: (hex: Phase1Hex) => void;
}) {
  const STATUS_FILTERS = ['all', 'available', 'reserved'];
  const ZONE_FILTERS = ['urban-core', 'urban', 'suburban', 'rural', 'remote'];

  // Filter logic: status-based OR zone-based
  const filtered = manifest.hexes.filter((h) => {
    if (filter === 'all') return true;
    if (STATUS_FILTERS.includes(filter)) {
      if (filter === 'reserved') return h.status === 'reserved' || h.status === 'reserved-founding';
      return h.status === filter;
    }
    return h.zoneClassification === filter;
  });

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden', height: '100%' }}>
      {/* ── Table ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Filter bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '8px 16px', borderBottom: '1px solid #1a1a1a', background: '#0a0a0a', flexShrink: 0, flexWrap: 'wrap' }}>
          {/* Status group */}
          <span style={{ color: '#333', fontFamily: 'monospace', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: 4 }}>Status</span>
          {STATUS_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => onFilterChange(f)}
              style={{
                padding: '3px 10px',
                borderRadius: 3,
                border: 'none',
                background: filter === f ? '#1f1f1f' : 'transparent',
                color: filter === f ? '#e8e8e8' : '#555',
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: 10,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                cursor: 'pointer',
                borderBottom: filter === f ? '2px solid #c4f061' : '2px solid transparent',
              }}
            >
              {f === 'all' ? `All (${manifest.hexes.length})` : f}
            </button>
          ))}
          {/* Zone group */}
          <span style={{ color: '#333', fontFamily: 'monospace', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', marginLeft: 12, marginRight: 4 }}>Zone</span>
          {ZONE_FILTERS.map((f) => {
            const zs = ZONE_STYLES[f];
            return (
              <button
                key={f}
                onClick={() => onFilterChange(f)}
                style={{
                  padding: '3px 10px',
                  borderRadius: 3,
                  border: 'none',
                  background: filter === f ? (zs?.bg ?? '#1f1f1f') : 'transparent',
                  color: filter === f ? (zs?.color ?? '#e8e8e8') : '#555',
                  fontFamily: 'var(--font-mono, monospace)',
                  fontSize: 10,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  cursor: 'pointer',
                  borderBottom: filter === f ? `2px solid ${zs?.color ?? '#c4f061'}` : '2px solid transparent',
                }}
              >
                {f.replace('-', ' ')}
              </button>
            );
          })}

          <span style={{ marginLeft: 'auto', color: '#444', fontFamily: 'monospace', fontSize: 11, alignSelf: 'center' }}>
            {filtered.length} / {manifest.hexes.length}
          </span>
        </div>

        {/* Column headers */}
        <div style={{ display: 'grid', gridTemplateColumns: '3.5rem 1fr 1fr 1fr 5rem 5rem 5.5rem', gap: 0, padding: '8px 16px', borderBottom: '1px solid #1a1a1a', background: '#0a0a0a', flexShrink: 0 }}>
          {['ID', 'H3 Cell', 'Region', 'Zone', '×Multi', 'Score', 'Water %'].map((h) => (
            <span key={h} style={{ fontFamily: 'monospace', fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</span>
          ))}
        </div>

        {/* Rows */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {filtered.map((hex) => {
            const isSelected = selected?.h3Index === hex.h3Index;
            const zone = hex.zoneClassification;
            const zoneStyle = ZONE_STYLES[zone ?? 'remote'] ?? ZONE_STYLES.remote;
            const water = hex.waterCoveragePercent;
            const waterColor = water == null ? '#444'
              : water === 0 ? '#3a3a3a'
              : water < 20 ? '#4a7a6a'
              : water < 60 ? '#3b82f6'
              : '#60a5fa';
            return (
              <div
                key={hex.h3Index}
                onClick={() => onSelect(hex)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '3.5rem 1fr 1fr 1fr 5rem 5rem 5.5rem',
                  gap: 0,
                  padding: '11px 16px',
                  borderBottom: '1px solid #111',
                  background: isSelected ? '#1a2a0a' : 'transparent',
                  cursor: 'pointer',
                  transition: 'background 80ms',
                  borderLeft: `2px solid ${isSelected ? '#c4f061' : STATUS_COLORS[hex.status] ?? '#1a1a1a'}`,
                  alignItems: 'center',
                }}
                onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = '#141414'; }}
                onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
              >
                {/* ID */}
                <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#555' }}>
                  {String(hex.nodeNumber).padStart(3, '0')}
                </span>

                {/* H3 Cell */}
                <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#999', letterSpacing: '-0.01em' }}>
                  {hex.h3Index}
                </span>

                {/* Region */}
                <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#c8c8c8', paddingRight: 8 }}>
                  {hex.region ?? '—'}
                </span>

                {/* Zone Classification */}
                <span style={{ display: 'flex', alignItems: 'center' }}>
                  {zone ? (
                    <span style={{
                      display: 'inline-block',
                      padding: '2px 7px',
                      borderRadius: 3,
                      fontSize: 10,
                      fontFamily: 'monospace',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      background: zoneStyle.bg,
                      color: zoneStyle.color,
                      border: `1px solid ${zoneStyle.border}`,
                      whiteSpace: 'nowrap',
                    }}>
                      {zone.replace('-', ' ')}
                    </span>
                  ) : (
                    <span style={{ color: '#444', fontFamily: 'monospace', fontSize: 11 }}>—</span>
                  )}
                </span>

                {/* Geographic Multiplier */}
                <span style={{ fontFamily: 'monospace', fontSize: 12, color: zoneStyle.color, fontWeight: 600 }}>
                  {hex.geographicMultiplier != null ? `${hex.geographicMultiplier.toFixed(2)}×` : '—'}
                </span>

                {/* Data Demand Score */}
                <span style={{ fontFamily: 'monospace', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
                  {hex.dataDemandScore != null ? (
                    <>
                      <span style={{ color: '#c4f061', fontWeight: 600 }}>{hex.dataDemandScore}</span>
                      <span style={{ color: '#444', fontSize: 10 }}>/100</span>
                    </>
                  ) : '—'}
                </span>

                {/* Water Coverage */}
                <span style={{ fontFamily: 'monospace', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
                  {water != null ? (
                    <>
                      <span style={{ color: waterColor, fontWeight: water > 0 ? 600 : 400 }}>
                        {water === 0 ? '0%' : `${water}%`}
                      </span>
                      {water > 30 && (
                        <span style={{ fontSize: 9, color: '#3b82f6', fontFamily: 'monospace', textTransform: 'uppercase' }}>
                          coastal
                        </span>
                      )}
                    </>
                  ) : '—'}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Detail panel — slides in as a fixed-width right column ── */}
      {selected && (
        <div style={{
          flexShrink: 0,
          width: 360,
          borderLeft: '1px solid #1a1a1a',
          background: '#0c0c0c',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <HexPanel
              hex={selected}
              links={links}
              onReserveClick={onReserve}
              onClose={onDeselect}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function MissingToken({ isPlaceholder = false }: { isPlaceholder?: boolean }) {
  return (
    <div style={{ padding: 40, color: '#e8e8e8', fontFamily: 'system-ui', maxWidth: 720, margin: '40px auto' }}>
      <h1 style={{ fontFamily: 'serif', fontSize: 28, marginBottom: 16 }}>
        {isPlaceholder
          ? 'NEXT_PUBLIC_MAPBOX_TOKEN is still the placeholder'
          : 'NEXT_PUBLIC_MAPBOX_TOKEN is not set'}
      </h1>
      <p style={{ color: '#c8c8c8', lineHeight: 1.6 }}>
        {isPlaceholder ? (
          <>
            Your{' '}
            <code style={{ background: '#1f1f1f', padding: '2px 6px', borderRadius: 3 }}>
              apps/web/.env.local
            </code>{' '}
            has the placeholder value. Replace it with a real Mapbox token:
          </>
        ) : (
          <>
            The Hex Explorer needs a Mapbox token to render the basemap. Add this to
            <code style={{ background: '#1f1f1f', padding: '2px 6px', borderRadius: 3, marginLeft: 4 }}>
              apps/web/.env.local
            </code>
            :
          </>
        )}
      </p>
      <pre style={{ background: '#1f1f1f', padding: 16, borderRadius: 4, marginTop: 12, color: '#c4f061', fontSize: 13 }}>
NEXT_PUBLIC_MAPBOX_TOKEN=pk.eyJ1Ijo...your_real_token...
      </pre>
      <p style={{ color: '#888', fontSize: 13, marginTop: 12 }}>
        Get a token at{' '}
        <a href="https://account.mapbox.com/access-tokens/" style={{ color: '#c4f061' }}>
          mapbox.com/account/access-tokens
        </a>
        , then restart the dev server (
        <code style={{ background: '#1f1f1f', padding: '2px 6px', borderRadius: 3 }}>
          kill the process · npm run dev
        </code>
        ).
      </p>
    </div>
  );
}
