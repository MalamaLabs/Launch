import type { HexStatus } from './hex-map.constants';

/**
 * Shape of a single hex in the Phase 1 manifest.
 *
 * Cross-chain identifier: `nodeNumber` (1-200) is the public/marketing
 * identifier. `h3Index` is the cross-chain primary key used in both the
 * Cardano CIP-0068 asset_name and the Base ERC-721 tokenId mapping.
 */
export interface Phase1Hex {
  nodeNumber: number;
  h3Index: string;
  h3Resolution: number;
  status: HexStatus;
  operator: string | null;
  region: string;
  country: string;
  administrativeArea: string | null;
  locality: string | null;
  postalCode: string | null;
  centroidLat: number;
  centroidLng: number;
  zoneClassification:
    | 'urban-core'
    | 'urban'
    | 'suburban'
    | 'rural'
    | 'remote'
    | null;
  geographicMultiplier: number | null; // 0.90 · 1.00 · 1.15 · 1.35 · 1.60 (urban-core → remote)
  dataDemandScore: number | null; // 0-100
  waterCoveragePercent: number | null; // 0-100 — % of cell area over ocean/lake
  listingReferenceUsd: number;
  genesisReserveUsd: number;
  notes?: string;
}

export interface Phase1Manifest {
  schemaVersion: string;
  manifestName: string;
  h3Resolution: number;
  totalCells: number;
  soldOrReserved: number;
  externalAvailable: number;
  lastUpdated: string;
  wavesPolicy: string;
  regions: string[];
  statusVocabulary: Record<HexStatus, string>;
  hexes: Phase1Hex[];
}

export interface LandCellSet {
  schemaVersion: string;
  resolution: number;
  generatedAt: string;
  count: number;
  cells: string[]; // H3 indexes
}

export interface HexClickEvent {
  hex: Phase1Hex;
  screenX: number;
  screenY: number;
}

/**
 * A bespoke Early Investor plot rendered as an overlay on the Genesis map.
 * Unlike a Phase1Hex these are arbitrary geographic points (a separate
 * ERC-721 sale), so the unique sale key is `plotId`, not `h3Index`. The
 * `h3Index` is the containing res-4 cell, used only to draw a license-sized
 * hex outline so the plot "fits" the grid visually. Distinct plots can share
 * an h3Index — render markers at the exact lat/lng to keep them selectable.
 */
export interface EarlyInvestorPlotPin {
  plotId: string;
  name: string;
  plotNumber?: number; // stable sale number shown as #NNN
  lat: number;
  lng: number;
  h3Index?: string | null;
  status?: string; // 'available' | 'sold' | 'bound' | 'reserved'
}

export interface PlotClickEvent {
  plot: EarlyInvestorPlotPin;
  screenX: number;
  screenY: number;
}
