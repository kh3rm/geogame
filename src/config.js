export const APP_VERSION = '0.6.0';

export const DEFAULT_CENTER = {
  // Umeå, Sweden: a neutral default for a Swedish test map.
  lat: 63.8258,
  lng: 20.2630,
  zoom: 14,
};

export const ENCOUNTER_RADIUS_M = 65;

export const DEFAULT_SPAWNS = [
  {
    id: 'umea-river-mossblip',
    creatureId: 'mossblip',
    label: 'Glitter vid älven',
    lat: 63.8253,
    lng: 20.2639,
    radiusM: 75,
    source: 'demo',
  },
  {
    id: 'umea-park-spriggle',
    creatureId: 'spriggle',
    label: 'Prassel i parken',
    lat: 63.8270,
    lng: 20.2575,
    radiusM: 70,
    source: 'demo',
  },
  {
    id: 'umea-bridge-lumifin',
    creatureId: 'lumifin',
    label: 'Skimmer vid bron',
    lat: 63.8239,
    lng: 20.2705,
    radiusM: 80,
    source: 'demo',
  },
];

export const TILE_LAYER = {
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19,
};
