export const CREATURES = {
  mossblip: {
    id: 'mossblip',
    name: 'Mossblip',
    rarity: 'Common',
    color: 0x83e6a1,
    accent: 0xd5ffe6,
    shadow: 0x092016,
    description: 'A shy little forest puff that appears when the scanner hums softly.',
  },
  spriggle: {
    id: 'spriggle',
    name: 'Spriggle',
    rarity: 'Uncommon',
    color: 0xf5cb6b,
    accent: 0xfff2b7,
    shadow: 0x251a05,
    description: 'A jumpy seedling critter that hides in flickering signal patches.',
  },
  lumifin: {
    id: 'lumifin',
    name: 'Lumifin',
    rarity: 'Rare',
    color: 0x7cc9ff,
    accent: 0xe4f7ff,
    shadow: 0x061b2e,
    description: 'A tiny river-light creature that swims through scanner portals.',
  },
};

export function getCreature(id) {
  return CREATURES[id] ?? CREATURES.mossblip;
}
