import { buildQuery } from '../../api/map/client';

export type FieldKind = 'number' | 'select' | 'region-select';

export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldDef {
  name: string;
  location: 'path' | 'query';
  kind: FieldKind;
  required?: boolean;
  step?: string;
  placeholder?: string;
  options?: FieldOption[];
}

export interface EndpointDef {
  id: string;
  label: string;
  description: string;
  fields: FieldDef[];
  buildPath: (values: Record<string, string>) => string;
}

function numOrUndef(v: string | undefined): number | undefined {
  if (v == null || v === '') return undefined;
  const n = Number(v);
  return Number.isNaN(n) ? undefined : n;
}

const profileOptions: FieldOption[] = [
  { value: '', label: '(default: fastest)' },
  { value: 'fastest', label: 'fastest' },
  { value: 'high_sec_only', label: 'high_sec_only' },
  { value: 'low_sec_plus', label: 'low_sec_plus' },
];

export const ENDPOINTS: EndpointDef[] = [
  {
    id: 'regions',
    label: 'GET /regions',
    description: 'All EVE regions.',
    fields: [],
    buildPath: () => '/regions',
  },
  {
    id: 'constellations',
    label: 'GET /constellations',
    description: 'Constellations, optionally scoped to a region.',
    fields: [{ name: 'region_id', location: 'query', kind: 'region-select' }],
    buildPath: (v) => `/constellations${buildQuery({ region_id: numOrUndef(v.region_id) })}`,
  },
  {
    id: 'systems',
    label: 'GET /systems',
    description: 'Solar systems, optionally scoped to a region or constellation.',
    fields: [
      { name: 'region_id', location: 'query', kind: 'region-select' },
      { name: 'constellation_id', location: 'query', kind: 'number', placeholder: 'e.g. 20000001' },
    ],
    buildPath: (v) =>
      `/systems${buildQuery({ region_id: numOrUndef(v.region_id), constellation_id: numOrUndef(v.constellation_id) })}`,
  },
  {
    id: 'system',
    label: 'GET /systems/{system_id}',
    description: 'System detail. 404 if system_id is unknown.',
    fields: [{ name: 'system_id', location: 'path', kind: 'number', required: true, placeholder: 'e.g. 30000142' }],
    buildPath: (v) => `/systems/${v.system_id}`,
  },
  {
    id: 'stargates',
    label: 'GET /stargates',
    description: 'The jump graph: every stargate as a directed edge to its destination, with galactic jump distance.',
    fields: [
      { name: 'region_id', location: 'query', kind: 'region-select' },
      { name: 'constellation_id', location: 'query', kind: 'number' },
      { name: 'system_id', location: 'query', kind: 'number' },
    ],
    buildPath: (v) =>
      `/stargates${buildQuery({
        region_id: numOrUndef(v.region_id),
        constellation_id: numOrUndef(v.constellation_id),
        system_id: numOrUndef(v.system_id),
      })}`,
  },
  {
    id: 'stargate-distances',
    label: 'GET /systems/{system_id}/stargate-distances',
    description: 'Pairwise in-system distance between every stargate in this system.',
    fields: [{ name: 'system_id', location: 'path', kind: 'number', required: true, placeholder: 'e.g. 30000142' }],
    buildPath: (v) => `/systems/${v.system_id}/stargate-distances`,
  },
  {
    id: 'system-activity',
    label: 'GET /system-activity',
    description: 'Ship/pod/NPC kills and ship jumps in the last hour, per ESI.',
    fields: [
      { name: 'region_id', location: 'query', kind: 'region-select' },
      { name: 'constellation_id', location: 'query', kind: 'number' },
      { name: 'system_id', location: 'query', kind: 'number' },
    ],
    buildPath: (v) =>
      `/system-activity${buildQuery({
        region_id: numOrUndef(v.region_id),
        constellation_id: numOrUndef(v.constellation_id),
        system_id: numOrUndef(v.system_id),
      })}`,
  },
  {
    id: 'route',
    label: 'GET /route',
    description: 'Lowest-cost route between two systems, annotated with per-system activity and stations.',
    fields: [
      { name: 'source_system_id', location: 'query', kind: 'number', required: true, placeholder: 'e.g. 30000142' },
      { name: 'target_system_id', location: 'query', kind: 'number', required: true, placeholder: 'e.g. 30002187' },
      { name: 'warp_speed_au_s', location: 'query', kind: 'number', step: 'any', placeholder: 'default 3.0' },
      { name: 'profile', location: 'query', kind: 'select', options: profileOptions },
      { name: 'highsec_mult', location: 'query', kind: 'number', step: 'any', placeholder: 'overrides profile' },
      { name: 'lowsec_mult', location: 'query', kind: 'number', step: 'any', placeholder: 'overrides profile' },
      { name: 'nullsec_mult', location: 'query', kind: 'number', step: 'any', placeholder: 'overrides profile' },
    ],
    buildPath: (v) =>
      `/route${buildQuery({
        source_system_id: numOrUndef(v.source_system_id),
        target_system_id: numOrUndef(v.target_system_id),
        warp_speed_au_s: numOrUndef(v.warp_speed_au_s),
        profile: v.profile || undefined,
        highsec_mult: numOrUndef(v.highsec_mult),
        lowsec_mult: numOrUndef(v.lowsec_mult),
        nullsec_mult: numOrUndef(v.nullsec_mult),
      })}`,
  },
];
