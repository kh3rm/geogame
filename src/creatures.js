export const CUSTOM_CREATURES_KEY = 'customCreatures';
export const CREATURE_PACK_APP_ID = 'geocritter-creature-pack';
export const CREATURE_PACK_VERSION = 1;
export const DEFAULT_CREATURE_ID = 'mossblip';

export const CREATURES = {
  mossblip: {
    id: 'mossblip',
    name: 'Mossblip',
    rarity: 'Vanlig',
    color: 0x83e6a1,
    accent: 0xd5ffe6,
    shadow: 0x092016,
    description: 'En blyg liten skogsboll som dyker upp när skannern surrar mjukt.',
  },
  spriggle: {
    id: 'spriggle',
    name: 'Spriggle',
    rarity: 'Ovanlig',
    color: 0xf5cb6b,
    accent: 0xfff2b7,
    shadow: 0x251a05,
    description: 'En hoppig fröfigur som gömmer sig i flimrande signalfläckar.',
  },
  lumifin: {
    id: 'lumifin',
    name: 'Lumifin',
    rarity: 'Sällsynt',
    color: 0x7cc9ff,
    accent: 0xe4f7ff,
    shadow: 0x061b2e,
    description: 'En liten älvljusfigur som simmar genom skannerportaler.',
  },
};

const DEFAULT_COLORS = [
  { color: 0x83e6a1, accent: 0xd5ffe6, shadow: 0x092016 },
  { color: 0xf5cb6b, accent: 0xfff2b7, shadow: 0x251a05 },
  { color: 0x7cc9ff, accent: 0xe4f7ff, shadow: 0x061b2e },
  { color: 0xff9fc7, accent: 0xffd9ea, shadow: 0x2c0718 },
  { color: 0xb69cff, accent: 0xeee5ff, shadow: 0x130a2a },
  { color: 0x9ff6ce, accent: 0xe6fff4, shadow: 0x08241a },
];

function slugify(value, fallback = 'figur') {
  const slug = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 56);
  return slug || fallback;
}

function parseColor(value, fallback) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return fallback;
  const cleaned = value.trim().replace(/^#/, '').replace(/^0x/i, '');
  if (!/^[0-9a-f]{6}$/i.test(cleaned)) return fallback;
  return Number.parseInt(cleaned, 16);
}

function cleanString(value, fallback, maxLength) {
  const clean = String(value || '').trim().replace(/\s+/g, ' ');
  return (clean || fallback).slice(0, maxLength);
}

function safeImageReference(value) {
  const src = String(value || '').trim();
  if (!src) return '';
  if (src.startsWith('data:image/')) return src;
  if (/^(\.\/|\/|assets\/|https:\/\/|http:\/\/)/i.test(src)) return src;
  return '';
}

export function normalizeCreatureList(value) {
  const rawList = Array.isArray(value)
    ? value
    : Array.isArray(value?.creatures)
      ? value.creatures
      : Array.isArray(value?.characters)
        ? value.characters
        : [];

  const seen = new Set();
  return rawList
    .map((raw, index) => {
      if (!raw || typeof raw !== 'object') return null;
      const id = slugify(raw.id || raw.slug || raw.name, `figur-${index + 1}`);
      if (seen.has(id)) return null;
      seen.add(id);
      const palette = DEFAULT_COLORS[index % DEFAULT_COLORS.length];
      return {
        id,
        name: cleanString(raw.name || raw.title, `Figur ${index + 1}`, 72),
        rarity: cleanString(raw.rarity || raw.type || raw.group, 'Importerad', 36),
        description: cleanString(raw.description || raw.summary || raw.bio, 'En importerad figur från ett lokalt figurpaket.', 220),
        color: parseColor(raw.color, palette.color),
        accent: parseColor(raw.accent, palette.accent),
        shadow: parseColor(raw.shadow, palette.shadow),
        imageData: safeImageReference(raw.imageData || raw.dataUrl),
        imagePath: safeImageReference(raw.imagePath || raw.image || raw.src),
        imageUrl: safeImageReference(raw.imageUrl || raw.url),
        source: 'custom-pack',
      };
    })
    .filter(Boolean)
    .slice(0, 400);
}

export function buildCreatureCatalog(customCreatures = []) {
  const catalog = { ...CREATURES };
  for (const creature of normalizeCreatureList(customCreatures)) {
    catalog[creature.id] = creature;
  }
  return catalog;
}

export function getCreature(id, catalog = CREATURES) {
  return catalog[id] ?? catalog[DEFAULT_CREATURE_ID] ?? Object.values(catalog)[0] ?? CREATURES[DEFAULT_CREATURE_ID];
}

export function getCreatureImageSource(creature) {
  return creature?.imageData || creature?.imagePath || creature?.imageUrl || '';
}

export function makeCreaturePackTemplate() {
  return {
    app: CREATURE_PACK_APP_ID,
    packVersion: CREATURE_PACK_VERSION,
    title: 'Mitt figurpaket',
    notes: 'Lägg egna bildfiler i assets/creatures/ eller använd små data:image/... base64-bilder i imageData. Fältet imagePath kan till exempel vara ./assets/creatures/min-figur.png.',
    creatures: [
      {
        id: 'min-figur-1',
        name: 'Min figur',
        rarity: 'Vanlig',
        description: 'En kort, barnvänlig beskrivning som visas i samlingen.',
        imagePath: './assets/creatures/min-figur-1.png',
        color: '#83e6a1',
        accent: '#d5ffe6',
        shadow: '#092016',
      },
    ],
  };
}
