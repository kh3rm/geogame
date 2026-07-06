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

export function getCreature(id) {
  return CREATURES[id] ?? CREATURES.mossblip;
}
