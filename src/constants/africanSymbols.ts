// Cultural & astrological symbols from countries and ethnic groups around the world

export interface AfricanSymbol {
  name: string;
  meaning: string;
  svg: string;
}

export interface SymbolGroup {
  id: string;
  country: string;
  flag: string;
  ethnicGroup: string;
  use: string;
  notes: string;
  description: string; // Brief explanation of the symbol system's origin and significance
  symbols: AfricanSymbol[];
}

// ---------------------------------------------------------------------------
// Icon system: every glyph is rendered on a soft gradient "badge" with a thin
// inner highlight ring and rounded line joins, so the whole set reads as one
// consistent, polished icon family instead of flat one-off shapes.
// ---------------------------------------------------------------------------

interface Theme {
  from: string;
  to: string;
  stroke: string;
}

const THEMES: Theme[] = [
  { from: '#FFF8E1', to: '#FFCC80', stroke: '#E65100' }, // amber
  { from: '#E8F5E9', to: '#81C784', stroke: '#1B5E20' }, // emerald
  { from: '#E3F2FD', to: '#64B5F6', stroke: '#0D47A1' }, // sapphire
  { from: '#FFEBEE', to: '#E57373', stroke: '#B71C1C' }, // ruby
  { from: '#F3E5F5', to: '#BA68C8', stroke: '#4A148C' }, // amethyst
  { from: '#FFFDE7', to: '#FFE082', stroke: '#F57F17' }, // gold
  { from: '#E0F2F1', to: '#4DB6AC', stroke: '#004D40' }, // teal
  { from: '#FBE9E7', to: '#FF8A65', stroke: '#BF360C' }, // coral
  { from: '#E8EAF6', to: '#7986CB', stroke: '#1A237E' }, // indigo
  { from: '#FCE4EC', to: '#F06292', stroke: '#880E4F' }, // rose
  { from: '#ECEFF1', to: '#90A4AE', stroke: '#263238' }, // slate
  { from: '#EFEBE9', to: '#A1887F', stroke: '#3E2723' }, // bronze
];

let badgeId = 0;

function badge(glyph: string, theme: Theme): string {
  const id = `sg${badgeId++}`;
  return `<svg width="44" height="44" viewBox="0 0 48 48"><defs><radialGradient id="${id}" cx="32%" cy="26%" r="80%"><stop offset="0%" stop-color="${theme.from}"/><stop offset="100%" stop-color="${theme.to}"/></radialGradient></defs><circle cx="24" cy="24" r="22" fill="url(#${id})" stroke="${theme.stroke}" stroke-width="2"/><circle cx="24" cy="24" r="18.5" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="1"/><g fill="none" stroke="${theme.stroke}" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">${glyph}</g></svg>`;
}

function themed(index: number): Theme {
  return THEMES[index % THEMES.length];
}

function westernZodiacGlyphSvg(glyph: string, theme: Theme): string {
  const id = `sg${badgeId++}`;
  return `<svg width="44" height="44" viewBox="0 0 48 48"><defs><radialGradient id="${id}" cx="32%" cy="26%" r="80%"><stop offset="0%" stop-color="${theme.from}"/><stop offset="100%" stop-color="${theme.to}"/></radialGradient></defs><circle cx="24" cy="24" r="22" fill="url(#${id})" stroke="${theme.stroke}" stroke-width="2"/><circle cx="24" cy="24" r="18.5" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="1"/><text x="24" y="32" text-anchor="middle" font-size="22" font-family="'Noto Sans Symbols 2','Segoe UI Symbol','Apple Symbols',sans-serif" fill="${theme.stroke}">${glyph}</text></svg>`;
}

export const AFRICAN_SYMBOL_GROUPS: SymbolGroup[] = [
  {
    id: 'ghana-adinkra',
    country: 'Ghana',
    flag: '🇬🇭',
    ethnicGroup: 'Akan',
    use: 'Proverbs, values, wisdom',
    notes: 'Over 400 years old, widely used across Ghana and diaspora',
    description: 'Adinkra symbols originated from the Akan people of Ghana over 400 years ago. These visual symbols represent concepts, proverbs, and aphorisms, traditionally printed on cloth for special occasions. Each symbol carries deep philosophical meaning passed down through generations.',
    symbols: [
      { name: 'Gye Nyame', meaning: 'Except for God. Symbol of the supremacy of God.', svg: badge('<path d="M24 10c-3 3-3 9 0 12s3 9 0 12"/><path d="M24 38c3-3 3-9 0-12s-3-9 0-12" transform="translate(0 0)"/><circle cx="24" cy="24" r="2.5" fill="currentColor"/>', themed(0)) },
      { name: 'Sankofa', meaning: 'Go back and get it. Symbol of learning from the past.', svg: badge('<path d="M31 24a7 7 0 1 1-4-6.3"/><path d="M23 29l6-5-6-5"/>', themed(1)) },
      { name: 'Duafe', meaning: 'Wooden comb. Symbol of beauty, cleanliness, feminine qualities.', svg: badge('<rect x="8" y="14" width="32" height="20" rx="10"/><rect x="18" y="8" width="12" height="10" rx="5"/><path d="M15 30v7M22 30v7M29 30v7"/>', themed(2)) },
      { name: 'Akoma', meaning: 'The heart. Symbol of patience and tolerance.', svg: badge('<path d="M24 36s-10-7.5-10-15a8 8 0 0 1 10-3.5A8 8 0 0 1 34 21c0 7.5-10 15-10 15z"/>', themed(3)) },
      { name: 'Adinkrahene', meaning: 'Chief of the adinkra symbols. Symbol of greatness, charisma, and leadership.', svg: badge('<circle cx="24" cy="24" r="13"/><circle cx="24" cy="24" r="6"/>', themed(4)) },
      { name: 'Dwennimmen', meaning: "Ram's horns. Symbol of humility together with strength.", svg: badge('<path d="M18 34c-7-6 4-20 12-13"/><path d="M30 34c7-6-4-20-12-13"/>', themed(5)) },
      { name: 'Aya', meaning: 'The fern. Symbol of endurance and resourcefulness.', svg: badge('<path d="M24 12v24"/><path d="M18 18l12 12"/><path d="M30 18l-12 12"/><ellipse cx="24" cy="24" rx="17" ry="9" stroke-width="1.75"/>', themed(6)) },
      { name: 'Nkyinkyim', meaning: 'Twisting. Symbol of initiative, dynamism, and versatility.', svg: badge('<path d="M13 34c11-22 22 2 22-22"/><circle cx="13" cy="34" r="2.5" fill="currentColor"/><circle cx="35" cy="12" r="2.5" fill="currentColor"/>', themed(7)) },
      { name: 'Eban', meaning: 'Fence. Symbol of love, safety, and security.', svg: badge('<rect x="10" y="10" width="28" height="28" rx="6"/><path d="M17 10v28M24 10v28M31 10v28"/>', themed(8)) },
      { name: 'Nyame Dua', meaning: "Tree of God. Symbol of God's presence and protection.", svg: badge('<path d="M24 40V24"/><path d="M24 24C15 24 12 16 12 12c6 0 12 3 12 12z"/><path d="M24 24c9 0 12-8 12-12-6 0-12 3-12 12z"/>', themed(9)) },
      { name: 'Fawohodie', meaning: 'Independence. Symbol of freedom and emancipation.', svg: badge('<path d="M14 34l10-20 10 20"/><path d="M18 26h12"/>', themed(10)) },
      { name: 'Bese Saka', meaning: 'Sack of cola nuts. Symbol of abundance, togetherness, and prosperity.', svg: badge('<circle cx="18" cy="18" r="6"/><circle cx="30" cy="18" r="6"/><circle cx="18" cy="30" r="6"/><circle cx="30" cy="30" r="6"/>', themed(11)) },
      { name: 'Akoben', meaning: 'War horn. Symbol of vigilance and the call to action.', svg: badge('<path d="M24 9l12 5v11c0 8-6 15-14 16-8-1-14-8-14-16V14z"/><path d="M24 15v18"/>', themed(12)) },
      { name: 'Adwo', meaning: 'Calm. Symbol of peace and quiet strength.', svg: badge('<path d="M8 20c4-4 8-4 12 0s8 4 12 0 8-4 12 0M8 28c4-4 8-4 12 0s8 4 12 0 8-4 12 0"/>', themed(13)) },
      { name: 'Mpatapo', meaning: 'Knot of reconciliation. Symbol of peacemaking and unity.', svg: badge('<path d="M24 24c1.5 0 3-1.3 3-3s-1.3-3-3-3-3 1.3-3 3c0 3 2 4.5 4.5 4.5s4.5-1.3 4.5-4.5-1.3-4.5-4.5-4.5-4.5 3-4.5 6c0 4.5 3 7.5 7.5 7.5"/>', themed(14)) },
      { name: 'Nyame Ye Ohene', meaning: 'God is king. Symbol of divine sovereignty.', svg: badge('<path d="M12 34h24l-2-14-7 6-7-10-7 10-7-6z"/>', themed(15)) },
      { name: 'Osram Ne Nsoromma', meaning: 'Moon and star. Symbol of faithfulness and harmony.', svg: badge('<path d="M28 10a15 15 0 1 0 0 28 12 12 0 0 1 0-28z"/>', themed(16)) },
    ]
  },
  {
    id: 'nigeria-nsibidi',
    country: 'Nigeria',
    flag: '🇳🇬',
    ethnicGroup: 'Ejagham, Igbo, Efik',
    use: 'Communication, rituals, love letters, justice symbols',
    notes: "One of Africa's oldest symbol systems (over 1,000 years old)",
    description: "Nsibidi is an ancient ideographic writing system from southeastern Nigeria, created by the Ejagham people. Dating back thousands of years, it was used by secret societies for communication and record-keeping, making it one of Africa's oldest indigenous writing systems.",
    symbols: [
      { name: 'Love', meaning: 'Symbol of love and affection. Used in love letters.', svg: badge('<path d="M24 34s-9-6.5-9-13a5.5 5.5 0 0 1 9-4.3A5.5 5.5 0 0 1 33 21c0 6.5-9 13-9 13z"/>', themed(9)) },
      { name: 'Unity', meaning: 'Symbol of coming together. Represents community bonds.', svg: badge('<circle cx="18" cy="20" r="4"/><circle cx="30" cy="20" r="4"/><circle cx="24" cy="31" r="4"/><path d="M18 20l6 11M30 20l-6 11"/>', themed(2)) },
      { name: 'Strength', meaning: 'Symbol of inner strength and resilience.', svg: badge('<path d="M16 24h16M24 16v16"/><circle cx="16" cy="24" r="2.5" fill="currentColor"/><circle cx="32" cy="24" r="2.5" fill="currentColor"/>', themed(7)) },
      { name: 'Wisdom', meaning: 'Symbol of knowledge and wisdom. Used by elders.', svg: badge('<circle cx="24" cy="24" r="15" stroke-width="1.75"/><circle cx="24" cy="24" r="9" stroke-width="1.75"/><circle cx="24" cy="24" r="3" fill="currentColor"/>', themed(4)) },
      { name: 'Journey', meaning: "Symbol of life's journey and progress.", svg: badge('<path d="M13 35L35 13"/><circle cx="13" cy="35" r="3" fill="currentColor"/><circle cx="35" cy="13" r="3" fill="currentColor"/>', themed(1)) },
      { name: 'Protection', meaning: 'Shield symbol. Represents protection from harm.', svg: badge('<path d="M24 8l14 6v10c0 8-6 15-14 16-8-1-14-8-14-16V14z"/><path d="M24 15v18"/><path d="M17 24h14"/>', themed(3)) },
      { name: 'Abundance', meaning: 'Symbol of prosperity and plenty.', svg: badge('<circle cx="18" cy="18" r="4.5" fill="currentColor" stroke="none"/><circle cx="30" cy="18" r="4.5" fill="currentColor" stroke="none"/><circle cx="24" cy="30" r="4.5" fill="currentColor" stroke="none"/>', themed(5)) },
      { name: 'Peace', meaning: 'Symbol of harmony and peaceful resolution.', svg: badge('<circle cx="24" cy="24" r="13" stroke-width="1.75"/><path d="M24 11v26M11 24h26"/>', themed(6)) },
      { name: 'Justice', meaning: 'Symbol of fairness and balanced judgment.', svg: badge('<path d="M24 10v28"/><path d="M12 18h24"/><path d="M12 18l-4 8h8l-4-8z"/><path d="M36 18l-4 8h8l-4-8z"/>', themed(8)) },
      { name: 'Secrecy', meaning: 'Symbol of hidden knowledge, guarded within secret societies.', svg: badge('<path d="M18 22a6 6 0 0 1 12 0v4"/><rect x="16" y="24" width="16" height="12" rx="2"/>', themed(0)) },
      { name: 'Ikenga', meaning: 'Shrine of personal strength. Symbol of achievement and willpower.', svg: badge('<path d="M17 32c-6-6-2-16 4-14M31 32c6-6 2-16-4-14"/><ellipse cx="24" cy="30" rx="6" ry="5"/>', themed(10)) },
      { name: 'Uli Pattern', meaning: 'Body and wall art. Symbol of beauty and identity.', svg: badge('<path d="M24 10l14 14-14 14-14-14z"/><path d="M24 18l6 6-6 6-6-6z"/>', themed(11)) },
      { name: 'Nsibidi', meaning: 'Ideographic script. Symbol of hidden knowledge and communication.', svg: badge('<path d="M11 15l6 6-6 6 6 6M37 15l-6 6 6 6-6 6"/><path d="M17 15l6 6-6 6 6 6"/>', themed(12)) },
      { name: 'Igbo Mbari', meaning: 'Sacred art house. Symbol of creation and devotion.', svg: badge('<path d="M24 10c-8 0-12 6-12 13s5 13 12 13 12-6 12-13-4-13-12-13z"/><circle cx="19" cy="21" r="1.8" fill="currentColor" stroke="none"/><circle cx="29" cy="21" r="1.8" fill="currentColor" stroke="none"/>', themed(13)) },
      { name: 'Efik Ekpe Leopard', meaning: 'Leopard society. Symbol of authority and secrecy.', svg: badge('<circle cx="24" cy="30" r="5"/><circle cx="16" cy="20" r="3"/><circle cx="24" cy="16" r="3"/><circle cx="32" cy="20" r="3"/>', themed(14)) },
    ]
  },
  {
    id: 'ethiopia-geez',
    country: 'Ethiopia',
    flag: '🇪🇹',
    ethnicGroup: 'Amhara, Tigray',
    use: 'Protection, religious texts, healing scrolls',
    notes: 'Ancient Christian mystical symbols drawn on parchment scrolls',
    description: "Ethiopian Ge'ez symbols are mystical protective signs rooted in ancient Ethiopian Christianity, one of the world's oldest Christian traditions. These sacred symbols appear on healing scrolls, religious manuscripts, and talismans, combining indigenous spiritual practices with Orthodox Christian iconography. They serve as powerful protective emblems believed to ward off evil and bring divine blessings.",
    symbols: [
      { name: 'Cross of Lalibela', meaning: 'Symbol of faith and divine protection.', svg: badge('<path d="M24 10v28M10 24h28"/><circle cx="24" cy="24" r="6"/>', themed(7)) },
      { name: 'Eye of Protection', meaning: 'Wards off evil spirits and negative energy.', svg: badge('<ellipse cx="24" cy="24" rx="16" ry="9"/><circle cx="24" cy="24" r="5" fill="currentColor" stroke="none"/>', themed(2)) },
      { name: 'Trinity Knot', meaning: 'Symbol of the Holy Trinity and divine unity.', svg: badge('<circle cx="24" cy="17" r="6"/><circle cx="17" cy="28" r="6"/><circle cx="31" cy="28" r="6"/>', themed(4)) },
      { name: 'Healing Hand', meaning: 'Symbol of healing power and divine intervention.', svg: badge('<path d="M24 12v24M17 19v17M31 19v17M20.5 15.5v20M27.5 15.5v20"/>', themed(1)) },
      { name: 'Wisdom Scroll', meaning: 'Symbol of ancient knowledge and wisdom.', svg: badge('<rect x="10" y="14" width="28" height="20" rx="4"/><circle cx="13" cy="24" r="2.5" fill="currentColor"/><circle cx="35" cy="24" r="2.5" fill="currentColor"/><path d="M17 20h14M17 24h14M17 28h14"/>', themed(8)) },
      { name: 'Solomonic Seal', meaning: "Interlaced star symbolizing King Solomon's wisdom and protection.", svg: badge('<path d="M24 9l4.6 8 9.2.9-6.8 6.2 1.9 9.1L24 28.8 15.1 33.2l1.9-9.1-6.8-6.2 9.2-.9z"/>', themed(5)) },
      { name: 'Meskel Flower', meaning: 'The Meskel daisy, symbol of the finding of the True Cross and new beginnings.', svg: badge('<circle cx="24" cy="24" r="4" fill="currentColor" stroke="none"/><path d="M24 20V11M24 28v9M20 24h-9M28 24h9M21 21l-6-6M27 21l6-6M21 27l-6 6M27 27l6 6"/>', themed(6)) },
      { name: "Coptic Cross", meaning: 'Ornate cross pattern representing eternal faith and continuity.', svg: badge('<path d="M24 9v30M14 19h20M14 29h20"/><circle cx="24" cy="19" r="3"/>', themed(3)) },
      { name: 'Ethiopian Lion', meaning: 'Lion of Judah. Symbol of royal strength and pride.', svg: badge('<circle cx="24" cy="30" r="5"/><circle cx="16" cy="20" r="3"/><circle cx="24" cy="16" r="3"/><circle cx="32" cy="20" r="3"/>', themed(8)) },
      { name: 'Lalibela Rose', meaning: 'Sacred flower. Symbol of devotion and renewal.', svg: badge('<path d="M24 38V16"/><path d="M24 16c-8 2-10 12-10 18M24 16c8 2 10 12 10 18"/>', themed(9)) },
      { name: 'Blue Nile', meaning: 'The river’s source. Symbol of life and origin.', svg: badge('<path d="M8 20c4-4 8-4 12 0s8 4 12 0 8-4 12 0M8 28c4-4 8-4 12 0s8 4 12 0 8-4 12 0"/>', themed(10)) },
      { name: 'Ethiopian Crown', meaning: 'Imperial crown. Symbol of majesty and heritage.', svg: badge('<path d="M12 34h24l-2-14-7 6-7-10-7 10-7-6z"/>', themed(11)) },
    ]
  },
  {
    id: 'yoruba-ifa',
    country: 'Benin / Nigeria',
    flag: '🇧🇯',
    ethnicGroup: 'Yoruba',
    use: 'Spiritual wisdom, proverbs, divination',
    notes: '256 Ifá symbols representing deep meaning',
    description: 'Ifá is an ancient Yoruba divination system containing 256 sacred symbols (Odù Ifá) that encode profound spiritual wisdom and philosophical teachings. Originating from the Yoruba people of West Africa, this complex system has been practiced for thousands of years by Babalawos (priests) to provide guidance, preserve oral history, and maintain cosmic balance. Each symbol represents intricate combinations of spiritual forces and ancestral knowledge.',
    symbols: [
      { name: 'Eji Ogbe', meaning: 'Symbol of light, clarity, and new beginnings.', svg: badge('<path d="M13 12v24M20 12v24M28 12v24M35 12v24"/>', themed(5)) },
      { name: 'Oyeku Meji', meaning: 'Symbol of darkness, mystery, and the unknown.', svg: badge('<circle cx="24" cy="24" r="13" fill="currentColor" stroke="none"/><circle cx="19" cy="21" r="1.6" fill="white" stroke="none"/><circle cx="29" cy="21" r="1.6" fill="white" stroke="none"/>', themed(10)) },
      { name: 'Iwori Meji', meaning: 'Symbol of conflict resolution and balance.', svg: badge('<path d="M13 24h22M24 13v22"/><circle cx="24" cy="24" r="7"/>', themed(6)) },
      { name: 'Odi Meji', meaning: 'Symbol of foundation and stability.', svg: badge('<rect x="11" y="11" width="26" height="26" rx="2"/><rect x="17" y="17" width="14" height="14" rx="1"/>', themed(11)) },
      { name: 'Obara Meji', meaning: 'Symbol of family and ancestral connections.', svg: badge('<circle cx="17" cy="19" r="4.5"/><circle cx="31" cy="19" r="4.5"/><circle cx="24" cy="31" r="4.5"/><path d="M17 19l7 12M31 19l-7 12"/>', themed(9)) },
      { name: 'Ogunda Meji', meaning: 'Symbol of clearing the path, courage, and warrior spirit.', svg: badge('<path d="M24 10v28"/><path d="M17 17l14 14M31 17l-14 14"/>', themed(3)) },
      { name: 'Irosun Meji', meaning: 'Symbol of visibility, revelation, and truth coming to light.', svg: badge('<circle cx="24" cy="24" r="14" stroke-width="1.75"/><path d="M24 10v6M24 32v6M10 24h6M32 24h6"/>', themed(1)) },
      { name: 'Owonrin Meji', meaning: 'Symbol of transformation, upheaval, and unexpected change.', svg: badge('<path d="M12 32c4-10 8 6 12-4s8 6 12-4"/>', themed(7)) },
      { name: 'Osa Meji', meaning: 'Odù of hidden forces. Symbol of mystery and transformation.', svg: badge('<path d="M28 10a15 15 0 1 0 0 28 12 12 0 0 1 0-28z"/>', themed(8)) },
      { name: 'Irete Meji', meaning: 'Odù of perseverance. Symbol of steady wisdom.', svg: badge('<path d="M24 24c1.5 0 3-1.3 3-3s-1.3-3-3-3-3 1.3-3 3c0 3 2 4.5 4.5 4.5s4.5-1.3 4.5-4.5-1.3-4.5-4.5-4.5-4.5 3-4.5 6c0 4.5 3 7.5 7.5 7.5"/>', themed(9)) },
      { name: 'Otura Meji', meaning: 'Odù of truth. Symbol of clarity and destiny.', svg: badge('<circle cx="24" cy="24" r="8" fill="currentColor" stroke="none"/><path d="M24 8v6M24 34v6M8 24h6M34 24h6M13 13l4 4M31 31l4 4M35 13l-4 4M17 31l-4 4"/>', themed(10)) },
      { name: 'Ika Meji', meaning: 'Odù of protection. Symbol of resolve against adversity.', svg: badge('<path d="M24 9l12 5v11c0 8-6 15-14 16-8-1-14-8-14-16V14z"/><path d="M24 15v18"/>', themed(11)) },
      { name: 'Ofun Meji', meaning: 'Odù of purity. Symbol of divine blessing and completion.', svg: badge('<path d="M24 9l3.6 9.4 10 .8-7.6 6.8 2.4 9.6L24 30l-8.4 5.6 2.4-9.6-7.6-6.8 10-.8z"/>', themed(12)) },
    ]
  },
  {
    id: 'zimbabwe-symbols',
    country: 'Zimbabwe',
    flag: '🇿🇼',
    ethnicGroup: 'Great Zimbabwe Culture',
    use: 'Spiritual kingship, identity',
    notes: 'Derived from the ancient stone city of Great Zimbabwe',
    description: 'Symbols from Great Zimbabwe represent one of medieval Africa\'s most remarkable civilizations, flourishing between the 11th and 15th centuries. The iconic Zimbabwe Bird and architectural patterns derive from this ancient stone city, which served as a powerful trading empire. These symbols embody royal authority, architectural achievement, and the enduring cultural heritage of the Shona people.',
    symbols: [
      { name: 'Zimbabwe Bird', meaning: 'National emblem. Symbol of authority and heritage.', svg: badge('<path d="M24 13c-4 0-6.5 3-6.5 6.5v7c0 4 2.5 6.5 6.5 6.5s6.5-2.5 6.5-6.5v-7C30.5 16 28 13 24 13z"/><path d="M18 33h12l-2 5h-8z"/>', themed(5)) },
      { name: 'Stone Pattern', meaning: 'Symbol of ancient architecture and endurance.', svg: badge('<rect x="10" y="11" width="12" height="8"/><rect x="26" y="11" width="12" height="8"/><rect x="10" y="22" width="12" height="8"/><rect x="26" y="22" width="12" height="8"/><rect x="10" y="33" width="12" height="5"/>', themed(11)) },
      { name: 'Royal Scepter', meaning: 'Symbol of kingship and leadership.', svg: badge('<rect x="22" y="17" width="4" height="19" fill="currentColor" stroke="none"/><circle cx="24" cy="12" r="4.5"/>', themed(0)) },
      { name: 'Harvest Symbol', meaning: 'Symbol of prosperity and agricultural abundance.', svg: badge('<circle cx="24" cy="17" r="6"/><path d="M24 23v13M18 30h12"/>', themed(6)) },
      { name: 'Chevron Pattern', meaning: 'Repeating zigzag found on Great Zimbabwe walls, symbol of order and craftsmanship.', svg: badge('<path d="M11 30l6.5-6.5L24 30l6.5-6.5L37 30M11 20l6.5-6.5L24 20l6.5-6.5L37 20"/>', themed(2)) },
      { name: 'Sacred Enclosure', meaning: 'The Great Enclosure walls, symbol of the royal court and community protection.', svg: badge('<circle cx="24" cy="24" r="14" stroke-width="1.75"/><circle cx="24" cy="24" r="8"/>', themed(8)) },
      { name: 'Soapstone Bowl', meaning: 'Ceremonial carved bowl, symbol of ritual and offering.', svg: badge('<ellipse cx="24" cy="26" rx="14" ry="7"/><path d="M10 26c0 6 6 10 14 10s14-4 14-10"/>', themed(4)) },
      { name: 'Drum of Unity', meaning: 'Ceremonial drum, symbol of celebration and communal gathering.', svg: badge('<path d="M15 18h18l-3 18h-12z"/><ellipse cx="24" cy="18" rx="9" ry="3.5"/>', themed(9)) },
      { name: 'Great Zimbabwe Wall', meaning: 'Ancient stone walls. Symbol of permanence and craftsmanship.', svg: badge('<path d="M9 34l9-18 6 8 5-6 10 16z"/>', themed(8)) },
      { name: 'Balancing Stones', meaning: 'Natural rock formations. Symbol of equilibrium and patience.', svg: badge('<circle cx="24" cy="32" r="9"/><circle cx="24" cy="16" r="6"/>', themed(9)) },
      { name: 'Mbira', meaning: 'Thumb piano. Symbol of music and ancestral voice.', svg: badge('<path d="M15 18h18l-3 18h-12z"/><ellipse cx="24" cy="18" rx="9" ry="3.5"/>', themed(10)) },
      { name: 'Zebra Pattern', meaning: 'Striped hide. Symbol of individuality within unity.', svg: badge('<path d="M12 14v20M18 14v20M24 14v20M30 14v20M36 14v20"/>', themed(11)) },
      { name: 'Great Zimbabwe Sun', meaning: 'Radiant sun. Symbol of vitality and renewal.', svg: badge('<circle cx="24" cy="24" r="8" fill="currentColor" stroke="none"/><path d="M24 8v6M24 34v6M8 24h6M34 24h6M13 13l4 4M31 31l4 4M35 13l-4 4M17 31l-4 4"/>', themed(12)) },
    ]
  },
  {
    id: 'south-africa-san',
    country: 'South Africa',
    flag: '🇿🇦',
    ethnicGroup: 'San/Bushman (Khoisan)',
    use: 'Hunting, rituals, healing dances, storytelling',
    notes: 'Some symbols are 20,000+ years old',
    description: 'San (Bushman) rock art represents humanity\'s oldest continuous artistic tradition, with some symbols dating back over 20,000 years. Created by the indigenous Khoisan peoples of southern Africa, these sacred images record spiritual experiences, hunting knowledge, healing rituals, and trance dances. The symbols preserve ancient wisdom about the relationship between the physical and spiritual worlds.',
    symbols: [
      { name: 'Hunter', meaning: 'Symbol of skill, patience, and provision.', svg: badge('<circle cx="24" cy="15" r="4"/><path d="M24 19v8M20 23h8"/><path d="M24 27l-5 9M24 27l5 9"/>', themed(3)) },
      { name: 'Rain Dance', meaning: 'Symbol of spiritual connection and abundance.', svg: badge('<path d="M16 15v9M24 12v13M32 15v9"/><circle cx="16" cy="30" r="2" fill="currentColor" stroke="none"/><circle cx="24" cy="32" r="2" fill="currentColor" stroke="none"/><circle cx="32" cy="30" r="2" fill="currentColor" stroke="none"/>', themed(2)) },
      { name: 'Eland', meaning: 'Sacred animal. Symbol of spiritual power.', svg: badge('<ellipse cx="24" cy="26" rx="12" ry="7"/><path d="M18 18l-4-4M30 18l4-4"/>', themed(0)) },
      { name: 'Fire', meaning: 'Symbol of warmth, community, and storytelling.', svg: badge('<path d="M24 12c-3 4-4 8-2 12 2 4 6 6 6 6s-2-4 0-8c2-4 4-6 4-10-2 2-6 4-8 0z"/>', themed(7)) },
      { name: 'Healing Circle', meaning: 'Symbol of medicine, trance, and spiritual healing.', svg: badge('<circle cx="24" cy="24" r="15" stroke-width="1.75"/><circle cx="24" cy="24" r="9" stroke-width="1.75"/><circle cx="24" cy="14" r="2" fill="currentColor" stroke="none"/><circle cx="24" cy="34" r="2" fill="currentColor" stroke="none"/><circle cx="14" cy="24" r="2" fill="currentColor" stroke="none"/><circle cx="34" cy="24" r="2" fill="currentColor" stroke="none"/>', themed(4)) },
      { name: 'Trance Dance', meaning: 'Symbol of spiritual journeying between worlds during ritual dance.', svg: badge('<path d="M24 12v10M17 30l7-8 7 8"/><circle cx="24" cy="10" r="2.5" fill="currentColor" stroke="none"/>', themed(8)) },
      { name: 'Star Path', meaning: 'Symbol of guidance from the night sky and ancestral spirits.', svg: badge('<circle cx="24" cy="24" r="2" fill="currentColor" stroke="none"/><circle cx="14" cy="16" r="1.5" fill="currentColor" stroke="none"/><circle cx="34" cy="16" r="1.5" fill="currentColor" stroke="none"/><circle cx="14" cy="34" r="1.5" fill="currentColor" stroke="none"/><circle cx="34" cy="34" r="1.5" fill="currentColor" stroke="none"/><path d="M14 16l10 8 10-8M14 34l10-8 10 8"/>', themed(5)) },
      { name: 'Ostrich Egg', meaning: 'Water-storage vessel and canvas for art, symbol of resourcefulness.', svg: badge('<ellipse cx="24" cy="24" rx="11" ry="14"/><path d="M17 20h14M17 27h14"/>', themed(1)) },
      { name: 'San Rock Art', meaning: 'Ancient painted stone. Symbol of memory and storytelling.', svg: badge('<path d="M11 15l6 6-6 6 6 6M37 15l-6 6 6 6-6 6"/><path d="M17 15l6 6-6 6 6 6"/>', themed(8)) },
      { name: 'Moon Dance', meaning: 'Night ritual. Symbol of intuition and cycles.', svg: badge('<path d="M28 10a15 15 0 1 0 0 28 12 12 0 0 1 0-28z"/>', themed(9)) },
      { name: 'Springbok', meaning: 'Swift antelope. Symbol of agility and grace.', svg: badge('<path d="M17 32c-6-6-2-16 4-14M31 32c6-6 2-16-4-14"/><ellipse cx="24" cy="30" rx="6" ry="5"/>', themed(10)) },
      { name: 'Bushman Bow', meaning: 'Hunting bow. Symbol of precision and provision.', svg: badge('<path d="M14 10c14 6 14 22 0 28"/><path d="M14 10v28"/>', themed(11)) },
      { name: 'Healing Plant', meaning: 'Medicinal herb. Symbol of restoration and care.', svg: badge('<path d="M24 38V16"/><path d="M24 16c-8 2-10 12-10 18M24 16c8 2 10 12 10 18"/>', themed(12)) },
    ]
  },
  {
    id: 'congo-cosmogram',
    country: 'Congo',
    flag: '🇨🇬',
    ethnicGroup: 'Bakongo',
    use: 'Life cycle, spirituality, ancestral world',
    notes: 'A cross inside a circle showing sunrise, noon, sunset, night',
    description: 'The Bakongo cosmogram (Dikenga dia Kongo) is a profound spiritual diagram representing the cycle of life, death, and rebirth. Created by the Bakongo people of Central Africa, this cross-within-circle symbol maps the journey of the soul through four cosmic moments mirroring the sun\'s daily path. It illustrates the connection between the living world and the ancestral realm, serving as a fundamental framework for Kongo spiritual philosophy.',
    symbols: [
      { name: 'Dikenga', meaning: 'The cosmogram. Symbol of life, death, and rebirth cycle.', svg: badge('<path d="M24 6v36M6 24h36"/><circle cx="24" cy="9" r="2.5" fill="currentColor" stroke="none"/><circle cx="24" cy="39" r="2.5" fill="currentColor" stroke="none"/><circle cx="9" cy="24" r="2.5" fill="currentColor" stroke="none"/><circle cx="39" cy="24" r="2.5" fill="currentColor" stroke="none"/>', themed(5)) },
      { name: 'Kalunga Line', meaning: 'Boundary between living and spirit world.', svg: badge('<path d="M8 24h32"/><circle cx="16" cy="15" r="3"/><circle cx="32" cy="15" r="3"/><circle cx="16" cy="33" r="3"/><circle cx="32" cy="33" r="3"/>', themed(6)) },
      { name: 'Four Moments', meaning: 'Symbol of the four cosmic moments of the sun.', svg: badge('<circle cx="24" cy="10" r="4"/><circle cx="38" cy="24" r="4"/><circle cx="24" cy="38" r="4"/><circle cx="10" cy="24" r="4"/><circle cx="24" cy="24" r="5"/>', themed(0)) },
      { name: 'Ancestor Path', meaning: 'Connection to ancestors and spiritual guidance.', svg: badge('<path d="M24 9v30"/><circle cx="24" cy="9" r="2.5" fill="currentColor" stroke="none"/><circle cx="24" cy="19" r="2.5" fill="currentColor" stroke="none"/><circle cx="24" cy="29" r="2.5" fill="currentColor" stroke="none"/><circle cx="24" cy="38" r="2.5" fill="currentColor" stroke="none"/>', themed(4)) },
      { name: 'Nkisi Power Figure', meaning: 'Sacred power figure believed to hold protective and healing spiritual force.', svg: badge('<circle cx="24" cy="15" r="5"/><path d="M24 20v16M17 26h14M18 36l6-4 6 4"/>', themed(8)) },
      { name: 'Ndop Portrait', meaning: 'Idealized royal portrait figure, symbol of legacy and remembrance.', svg: badge('<circle cx="24" cy="16" r="5"/><rect x="16" y="22" width="16" height="14" rx="4"/>', themed(2)) },
      { name: 'Cowrie Currency', meaning: 'Shells once used as currency, symbol of wealth and exchange.', svg: badge('<ellipse cx="17" cy="22" rx="6" ry="8"/><ellipse cx="31" cy="26" rx="6" ry="8"/><path d="M14 22h6M28 26h6"/>', themed(11)) },
      { name: 'Raffia Cloth Pattern', meaning: 'Woven textile geometry, symbol of craftsmanship and community identity.', svg: badge('<path d="M11 15l6 6-6 6 6 6M37 15l-6 6 6 6-6 6"/><path d="M17 15l6 6-6 6 6 6"/>', themed(9)) },
      { name: 'Lukasa Memory Board', meaning: 'Memory device. Symbol of history and record-keeping.', svg: badge('<path d="M24 24c1.5 0 3-1.3 3-3s-1.3-3-3-3-3 1.3-3 3c0 3 2 4.5 4.5 4.5s4.5-1.3 4.5-4.5-1.3-4.5-4.5-4.5-4.5 3-4.5 6c0 4.5 3 7.5 7.5 7.5"/>', themed(8)) },
      { name: 'Leopard Power', meaning: 'Leopard spirit. Symbol of stealth and authority.', svg: badge('<circle cx="24" cy="30" r="5"/><circle cx="16" cy="20" r="3"/><circle cx="24" cy="16" r="3"/><circle cx="32" cy="20" r="3"/>', themed(9)) },
      { name: 'Palm Frond', meaning: 'Palm branch. Symbol of peace and sustenance.', svg: badge('<path d="M24 38V16"/><path d="M24 16c-8 2-10 12-10 18M24 16c8 2 10 12 10 18"/>', themed(10)) },
      { name: 'River Crossing', meaning: 'Crossing the water. Symbol of transition and courage.', svg: badge('<path d="M8 20c4-4 8-4 12 0s8 4 12 0 8-4 12 0M8 28c4-4 8-4 12 0s8 4 12 0 8-4 12 0"/>', themed(11)) },
      { name: 'Talking Drum', meaning: 'Speaking drum. Symbol of communication and rhythm.', svg: badge('<path d="M15 18h18l-3 18h-12z"/><ellipse cx="24" cy="18" rx="9" ry="3.5"/>', themed(12)) },
    ]
  },
  {
    id: 'mali-dogon',
    country: 'Mali',
    flag: '🇲🇱',
    ethnicGroup: 'Dogon',
    use: 'Cosmology, astronomy, spiritual truths',
    notes: 'Strong symbolic system linked to the stars (Sirius)',
    description: "Dogon symbols encode sophisticated astronomical and cosmological knowledge from the Dogon people of Mali's Bandiagara Escarpment. Their intricate symbolic system, particularly focused on the Sirius star system, represents creation myths, spiritual concepts, and celestial observations passed down through millennia. These symbols reflect the Dogon's deep understanding of the cosmos and their role within the universal order.",
    symbols: [
      { name: 'Sirius Star', meaning: 'Symbol of cosmic knowledge and astronomy.', svg: badge('<circle cx="24" cy="24" r="4.5" fill="currentColor" stroke="none"/><path d="M24 9v10M24 29v10M9 24h10M29 24h10M14 14l7 7M27 27l7 7M34 14l-7 7M21 27l-7 7"/>', themed(9)) },
      { name: 'Nommo', meaning: 'Ancestral spirits. Symbol of life force and creation.', svg: badge('<circle cx="24" cy="15" r="5"/><path d="M24 20v10M18 25h12"/><circle cx="24" cy="35" r="3"/>', themed(2)) },
      { name: 'Granary', meaning: 'Symbol of sustenance and cosmic order.', svg: badge('<rect x="12" y="19" width="24" height="17" rx="2"/><path d="M12 19L24 9l12 10"/><rect x="20" y="25" width="8" height="11"/>', themed(5)) },
      { name: 'Spiral of Creation', meaning: 'Symbol of cosmic expansion and evolution.', svg: badge('<path d="M24 24c1.5 0 3-1.3 3-3s-1.3-3-3-3-3 1.3-3 3c0 3 2 4.5 4.5 4.5s4.5-1.3 4.5-4.5-1.3-4.5-4.5-4.5-4.5 3-4.5 6c0 4.5 3 7.5 7.5 7.5"/>', themed(4)) },
      { name: 'Mask of the Ancestors', meaning: 'Ceremonial mask worn to honor and channel ancestral spirits.', svg: badge('<rect x="15" y="10" width="18" height="26" rx="6"/><path d="M19 21h3M26 21h3M20 29h8"/>', themed(0)) },
      { name: 'Kanaga Mask', meaning: 'Ritual mask representing the structure of the universe and human-cosmos link.', svg: badge('<path d="M24 12v24"/><path d="M14 16h20M14 32h20"/><path d="M14 16l-3-5M34 16l3-5M14 32l-3 5M34 32l3 5"/>', themed(7)) },
      { name: 'Toguna Pillars', meaning: 'Low-roofed council house pillars, symbol of wisdom and community deliberation.', svg: badge('<path d="M13 36V20M20 36V20M28 36V20M35 36V20"/><path d="M11 20h26"/>', themed(11)) },
      { name: 'Binu Shrine', meaning: 'Sacred shrine symbol representing totemic ancestral spirits.', svg: badge('<path d="M24 10l12 8v18H12V18z"/><circle cx="24" cy="26" r="4"/>', themed(6)) },
      { name: 'Dogon Door Pattern', meaning: 'Carved granary door. Symbol of guarded wisdom.', svg: badge('<path d="M24 10l14 14-14 14-14-14z"/><path d="M24 18l6 6-6 6-6-6z"/>', themed(8)) },
      { name: 'Dogon Ladder', meaning: 'Escarpment ladder. Symbol of ascent and aspiration.', svg: badge('<path d="M9 34l9-18 6 8 5-6 10 16z"/>', themed(9)) },
      { name: 'Dogon Granary Door', meaning: 'Sacred storehouse door. Symbol of provision and order.', svg: badge('<circle cx="24" cy="32" r="9"/><circle cx="24" cy="16" r="6"/>', themed(10)) },
      { name: 'Dogon Mask Dance', meaning: 'Ritual mask dance. Symbol of ancestral communion.', svg: badge('<path d="M24 10c-8 0-12 6-12 13s5 13 12 13 12-6 12-13-4-13-12-13z"/><circle cx="19" cy="21" r="1.8" fill="currentColor" stroke="none"/><circle cx="29" cy="21" r="1.8" fill="currentColor" stroke="none"/>', themed(11)) },
      { name: 'Dogon Crescent', meaning: 'Crescent moon. Symbol of cosmic rhythm.', svg: badge('<path d="M28 10a15 15 0 1 0 0 28 12 12 0 0 1 0-28z"/>', themed(12)) },
    ]
  },
  {
    id: 'morocco-amazigh',
    country: 'Morocco',
    flag: '🇲🇦',
    ethnicGroup: 'Amazigh (Berber)',
    use: 'Writing system, tribal identity, jewelry',
    notes: "Tifinagh is one of Africa's oldest alphabets",
    description: "Amazigh (Berber) symbols, particularly the Tifinagh script, represent one of Africa's oldest writing systems, dating back over 2,500 years. These distinctive geometric symbols serve as both alphabet and cultural identity markers for the indigenous peoples of North Africa. Featured in jewelry, textiles, and tattoos, they embody the enduring spirit of Amazigh freedom, resilience, and cultural pride across the Maghreb region.",
    symbols: [
      { name: 'Yaz (ⵣ)', meaning: 'Free person. Symbol of freedom and identity.', svg: badge('<path d="M24 10v28M10 24h28M17 17l14 14M31 17L17 31"/>', themed(2)) },
      { name: 'Amulet', meaning: 'Symbol of protection and warding off evil.', svg: badge('<circle cx="24" cy="24" r="14" stroke-width="1.75"/><circle cx="24" cy="24" r="8" stroke-width="1.75"/><circle cx="24" cy="24" r="2.5" fill="currentColor" stroke="none"/>', themed(0)) },
      { name: 'Mountain Symbol', meaning: 'Symbol of strength and endurance (Atlas Mountains).', svg: badge('<path d="M10 34l14-22 14 22"/><path d="M16 34l8-13 8 13"/>', themed(11)) },
      { name: 'Unity Pattern', meaning: 'Symbol of tribal unity and solidarity.', svg: badge('<path d="M24 10l-11 11 11 11 11-11-10-10M24 20l-6 6 6 6 6-6-6-6"/>', themed(9)) },
      { name: 'Fibula Brooch', meaning: 'Traditional silver clasp, symbol of heritage and womanhood.', svg: badge('<circle cx="16" cy="24" r="7"/><circle cx="32" cy="24" r="7"/><path d="M23 24h2"/>', themed(4)) },
      { name: 'Khamsa Hand', meaning: "Hand-shaped amulet, symbol of protection from the 'evil eye.'", svg: badge('<path d="M24 34V18M18 34v-9M30 34v-9M15 30v-6M33 30v-6"/><path d="M15 24a9 9 0 0 1 18 0"/>', themed(6)) },
      { name: 'Carpet Diamond', meaning: 'Geometric weaving motif from Amazigh rugs, symbol of fertility and land.', svg: badge('<path d="M24 10l14 14-14 14-14-14z"/><path d="M24 18l6 6-6 6-6-6z"/>', themed(8)) },
      { name: 'Oasis Palm', meaning: 'Date palm symbol representing life, sustenance, and desert resilience.', svg: badge('<path d="M24 38V20"/><path d="M24 20c-6-4-10-2-12 2 6 2 9-1 12-2zM24 20c6-4 10-2 12 2-6 2-9-1-12-2zM24 20c-3-6-1-10 0-12 3 4 2 8 0 12zM24 20c3-6 1-10 0-12"/>', themed(1)) },
      { name: 'Amazigh Moon', meaning: 'Crescent of the Amazigh. Symbol of guidance and renewal.', svg: badge('<path d="M28 10a15 15 0 1 0 0 28 12 12 0 0 1 0-28z"/>', themed(8)) },
      { name: 'Amazigh Star', meaning: 'Guiding star. Symbol of direction and hope.', svg: badge('<path d="M24 9l3.6 9.4 10 .8-7.6 6.8 2.4 9.6L24 30l-8.4 5.6 2.4-9.6-7.6-6.8 10-.8z"/>', themed(9)) },
      { name: 'Amazigh Eye', meaning: 'Watchful eye. Symbol of protection from harm.', svg: badge('<ellipse cx="24" cy="24" rx="14" ry="8"/><circle cx="24" cy="24" r="4" fill="currentColor" stroke="none"/>', themed(10)) },
      { name: 'Amazigh Weave', meaning: 'Woven textile. Symbol of heritage and craft.', svg: badge('<path d="M24 10l14 14-14 14-14-14z"/><path d="M24 18l6 6-6 6-6-6z"/>', themed(11)) },
      { name: 'Atlas Mountains', meaning: 'Great range. Symbol of endurance and majesty.', svg: badge('<path d="M9 34l9-18 6 8 5-6 10 16z"/>', themed(12)) },
    ]
  },
  {
    id: 'egypt-hieroglyphs',
    country: 'Egypt',
    flag: '🇪🇬',
    ethnicGroup: 'Ancient Egyptians',
    use: 'Writing, rituals, kingship',
    notes: 'The entire writing system was based on symbols',
    description: "Egyptian hieroglyphs form one of the world's oldest and most iconic writing systems, used for over 3,000 years in ancient Egypt. These sacred symbols combined phonetic, logographic, and symbolic meanings to record everything from royal decrees to religious texts and everyday life. Beyond mere writing, hieroglyphs embodied profound spiritual concepts and were believed to possess magical power, making them central to Egyptian religion, kingship, and the pursuit of eternal life.",
    symbols: [
      { name: 'Ankh', meaning: 'Symbol of life and immortality.', svg: badge('<circle cx="24" cy="16" r="5.5"/><path d="M24 21v17M16 28h16"/>', themed(5)) },
      { name: 'Eye of Horus', meaning: 'Symbol of protection, royal power, and good health.', svg: badge('<ellipse cx="24" cy="24" rx="14" ry="8"/><circle cx="24" cy="24" r="4" fill="currentColor" stroke="none"/><path d="M24 28c-4 2-6 4-8 0M24 28c4 2 6 4 8 0"/>', themed(2)) },
      { name: 'Scarab', meaning: 'Symbol of transformation and rebirth.', svg: badge('<ellipse cx="24" cy="26" rx="12" ry="10"/><circle cx="24" cy="18" r="4" fill="currentColor" stroke="none"/><path d="M12 26l-4 6M36 26l4 6M16 30l-2 6M32 30l2 6"/>', themed(1)) },
      { name: 'Djed', meaning: 'Symbol of stability and endurance.', svg: badge('<rect x="20" y="12" width="8" height="24" fill="currentColor" stroke="none"/><path d="M16 16h16M16 22h16M16 28h16"/>', themed(7)) },
      { name: 'Was Scepter', meaning: 'Symbol of power and dominion.', svg: badge('<rect x="22" y="14" width="4" height="22" fill="currentColor" stroke="none"/><path d="M18 14c0-3 2-4 6-4s6 1 6 4"/>', themed(4)) },
      { name: 'Lotus Flower', meaning: 'Symbol of rebirth, purity, and the rising sun.', svg: badge('<path d="M24 34V20"/><path d="M24 20c-6-2-9-8-9-12 6 0 9 5 9 12zM24 20c6-2 9-8 9-12-6 0-9 5-9 12z"/>', themed(9)) },
      { name: 'Sun Disk (Aten)', meaning: 'Symbol of the sun as the giver of all life.', svg: badge('<circle cx="24" cy="24" r="8" fill="currentColor" stroke="none"/><path d="M24 8v6M24 34v6M8 24h6M34 24h6M13 13l4 4M31 31l4 4M35 13l-4 4M17 31l-4 4"/>', themed(6)) },
      { name: "Feather of Ma'at", meaning: 'Symbol of truth, balance, and cosmic order.', svg: badge('<path d="M24 36V12"/><path d="M24 14l-8 4M24 18l8 4M24 22l-8 4M24 26l8 4M24 30l-8 4"/>', themed(11)) },
      { name: 'Eye of Ra', meaning: 'The sun god’s eye. Symbol of power and protection.', svg: badge('<ellipse cx="24" cy="24" rx="14" ry="8"/><circle cx="24" cy="24" r="4" fill="currentColor" stroke="none"/>', themed(8)) },
      { name: 'Horus Falcon', meaning: 'Sky god’s falcon. Symbol of vision and kingship.', svg: badge('<path d="M24 13c-4 0-6.5 3-6.5 6.5v7c0 4 2.5 6.5 6.5 6.5s6.5-2.5 6.5-6.5v-7C30.5 16 28 13 24 13z"/><path d="M18 33h12l-2 5h-8z"/>', themed(9)) },
      { name: 'Bastet Cat', meaning: 'Cat goddess. Symbol of grace and protection of the home.', svg: badge('<circle cx="24" cy="30" r="5"/><circle cx="16" cy="20" r="3"/><circle cx="24" cy="16" r="3"/><circle cx="32" cy="20" r="3"/>', themed(10)) },
      { name: 'Isis Knot', meaning: 'Tyet knot. Symbol of protection and eternal life.', svg: badge('<path d="M24 24c1.5 0 3-1.3 3-3s-1.3-3-3-3-3 1.3-3 3c0 3 2 4.5 4.5 4.5s4.5-1.3 4.5-4.5-1.3-4.5-4.5-4.5-4.5 3-4.5 6c0 4.5 3 7.5 7.5 7.5"/>', themed(11)) },
      { name: 'Papyrus', meaning: 'Reed plant. Symbol of knowledge and record.', svg: badge('<path d="M24 38V16"/><path d="M24 16c-8 2-10 12-10 18M24 16c8 2 10 12 10 18"/>', themed(12)) },
    ]
  },
  {
    id: 'kenya-maasai',
    country: 'Kenya',
    flag: '🇰🇪',
    ethnicGroup: 'Maasai',
    use: 'Beadwork, status, ceremony, warriorhood',
    notes: 'Colors and patterns communicate age, status, and clan identity',
    description: 'Maasai symbolism lives in beadwork, shields, and body markings across Kenya and northern Tanzania. Each color and pattern carries meaning — red for bravery and unity, blue for the sky and energy, green for land and health — worn to mark age-sets, achievements, and ceremonies within this pastoralist culture.',
    symbols: [
      { name: 'Maasai Shield', meaning: 'Symbol of protection, bravery, and warrior identity.', svg: badge('<path d="M24 9l12 5v11c0 8-5 14-12 15-7-1-12-7-12-15V14z"/><path d="M24 13v22"/>', themed(3)) },
      { name: 'Warrior Spear', meaning: 'Symbol of courage, hunting skill, and readiness to defend the community.', svg: badge('<path d="M24 10v28"/><path d="M24 10l-5 8h10z"/>', themed(0)) },
      { name: 'Beaded Collar', meaning: 'Ceremonial beadwork symbolizing status, beauty, and age-set identity.', svg: badge('<path d="M12 20a12 12 0 0 1 24 0"/><circle cx="12" cy="20" r="2" fill="currentColor" stroke="none"/><circle cx="18" cy="11" r="2" fill="currentColor" stroke="none"/><circle cx="30" cy="11" r="2" fill="currentColor" stroke="none"/><circle cx="36" cy="20" r="2" fill="currentColor" stroke="none"/>', themed(9)) },
      { name: 'Cattle Horns', meaning: 'Symbol of wealth, sustenance, and the central role of cattle in Maasai life.', svg: badge('<path d="M17 32c-6-6-2-16 4-14M31 32c6-6 2-16-4-14"/><ellipse cx="24" cy="30" rx="6" ry="5"/>', themed(6)) },
      { name: 'Warrior Staff', meaning: "Symbol of a moran's (young warrior's) rank and discipline.", svg: badge('<path d="M24 10v28"/><circle cx="24" cy="10" r="4"/>', themed(2)) },
      { name: 'Sun Shield Pattern', meaning: 'Radiating pattern symbolizing the sun, life, and vitality on the savanna.', svg: badge('<circle cx="24" cy="24" r="7"/><path d="M24 10v4M24 34v4M10 24h4M34 24h4M15 15l3 3M33 33l-3-3M33 15l-3 3M15 33l3-3"/>', themed(5)) },
      { name: 'Enkang Circle', meaning: 'The circular homestead layout, symbol of family unity and communal protection.', svg: badge('<circle cx="24" cy="24" r="14" stroke-width="1.75"/><rect x="20" y="20" width="8" height="8" rx="2"/>', themed(11)) },
      { name: 'Age-Set Mark', meaning: "Pattern marking a warrior's age-group and shared lifelong bond.", svg: badge('<path d="M11 18h26M11 24h26M11 30h26"/>', themed(8)) },
      { name: 'Maasai Red Shuka', meaning: 'Woven red cloth. Symbol of identity and courage.', svg: badge('<path d="M24 10l14 14-14 14-14-14z"/><path d="M24 18l6 6-6 6-6-6z"/>', themed(8)) },
      { name: 'Maasai Lion', meaning: 'The lion hunt. Symbol of bravery and manhood.', svg: badge('<circle cx="24" cy="30" r="5"/><circle cx="16" cy="20" r="3"/><circle cx="24" cy="16" r="3"/><circle cx="32" cy="20" r="3"/>', themed(9)) },
      { name: 'Maasai Manyatta', meaning: 'Warrior homestead. Symbol of brotherhood and discipline.', svg: badge('<path d="M24 12l13 24H11z"/><path d="M24 20v16"/>', themed(10)) },
      { name: 'Maasai Cattle', meaning: 'Herd of cattle. Symbol of wealth and sustenance.', svg: badge('<path d="M17 32c-6-6-2-16 4-14M31 32c6-6 2-16-4-14"/><ellipse cx="24" cy="30" rx="6" ry="5"/>', themed(11)) },
      { name: 'Maasai Warrior Dance', meaning: 'The adumu jump dance. Symbol of vitality and pride.', svg: badge('<path d="M15 18h18l-3 18h-12z"/><ellipse cx="24" cy="18" rx="9" ry="3.5"/>', themed(12)) },
    ]
  },
  {
    id: 'senegal-wolof',
    country: 'Senegal',
    flag: '🇸🇳',
    ethnicGroup: 'Wolof, Serer',
    use: 'Hospitality, family, coastal life, oral tradition',
    notes: 'Symbols reflect Teranga — Senegal\'s culture of hospitality',
    description: "Wolof and Serer symbolism centers on Teranga — the deep-rooted culture of hospitality and generosity that defines Senegalese life. From the baobab as a gathering place to the calabash used in daily ritual, these symbols reflect community, coastal livelihood, and respect for elders and ancestors.",
    symbols: [
      { name: 'Baobab Tree', meaning: 'The "tree of life," symbol of endurance, community gathering, and ancestry.', svg: badge('<path d="M24 38V24"/><ellipse cx="24" cy="18" rx="12" ry="9"/><path d="M18 12l-3-4M30 12l3-4M24 9V5"/>', themed(0)) },
      { name: 'Teranga Star', meaning: 'Symbol of hospitality, generosity, and welcome to strangers.', svg: badge('<path d="M24 9l4 10 10 1-7.5 7 2 10L24 32l-8.5 5 2-10-7.5-7 10-1z"/>', themed(6)) },
      { name: "Fisherman's Net", meaning: 'Symbol of coastal livelihood, patience, and provision for the family.', svg: badge('<path d="M11 15l26 26M37 15L11 41M11 24h26M24 11v26"/>', themed(2)) },
      { name: 'Cowrie Shell', meaning: 'Symbol of fertility, prosperity, and feminine spirituality.', svg: badge('<ellipse cx="24" cy="24" rx="13" ry="9"/><path d="M17 24h14"/>', themed(9)) },
      { name: 'Calabash', meaning: 'Gourd vessel symbolizing nourishment, ritual, and shared meals.', svg: badge('<path d="M24 12c-6 0-8 5-8 9s3 15 8 15 8-11 8-15-2-9-8-9z"/><path d="M20 22h8"/>', themed(5)) },
      { name: 'Djembe Rhythm', meaning: 'Drum pattern symbolizing celebration, oral history, and communal joy.', svg: badge('<path d="M15 16h18l-3 20h-12z"/><ellipse cx="24" cy="16" rx="9" ry="3.5"/>', themed(11)) },
      { name: 'Sunu Gaal', meaning: 'The fishing pirogue (boat), symbol of resilience and the journey of life.', svg: badge('<path d="M10 30q14 8 28 0l-4 6H14z"/><path d="M24 30V12M24 15l7 4-7 3"/>', themed(3)) },
      { name: 'Xalam Lute', meaning: 'Traditional stringed instrument, symbol of griot storytelling and heritage.', svg: badge('<ellipse cx="18" cy="30" rx="7" ry="6"/><path d="M22 26l12-14"/><path d="M31 14l3-2"/>', themed(8)) },
      { name: 'Wolof Weave', meaning: 'Woven textile. Symbol of craftsmanship and pride.', svg: badge('<path d="M24 10l14 14-14 14-14-14z"/><path d="M24 18l6 6-6 6-6-6z"/>', themed(8)) },
      { name: 'Serer Star', meaning: 'Guiding star. Symbol of ancestry and direction.', svg: badge('<path d="M24 9l3.6 9.4 10 .8-7.6 6.8 2.4 9.6L24 30l-8.4 5.6 2.4-9.6-7.6-6.8 10-.8z"/>', themed(9)) },
      { name: 'Senegal River', meaning: 'The great river. Symbol of life and connection.', svg: badge('<path d="M8 20c4-4 8-4 12 0s8 4 12 0 8-4 12 0M8 28c4-4 8-4 12 0s8 4 12 0 8-4 12 0"/>', themed(10)) },
      { name: 'Baobab Spirit', meaning: 'Spirit of the baobab. Symbol of ancestral presence.', svg: badge('<path d="M24 38V16"/><path d="M24 16c-8 2-10 12-10 18M24 16c8 2 10 12 10 18"/>', themed(11)) },
      { name: 'Wolof Drum', meaning: 'Sabar drum. Symbol of celebration and voice.', svg: badge('<path d="M15 18h18l-3 18h-12z"/><ellipse cx="24" cy="18" rx="9" ry="3.5"/>', themed(12)) },
    ]
  },
  {
    id: 'cameroon-bamileke',
    country: 'Cameroon',
    flag: '🇨🇲',
    ethnicGroup: 'Bamileke',
    use: 'Kingship, wisdom, royal regalia',
    notes: 'Grassfields kingdoms with rich carving and beadwork traditions',
    description: 'Bamileke symbolism comes from the Grassfields kingdoms of western Cameroon, expressed through royal masks, carved thrones, and beadwork. Motifs like the spider represent wisdom and connection to ancestors, while the leopard and buffalo mark royal power — together forming a visual language of kingship and community memory.',
    symbols: [
      { name: 'Spider Wisdom', meaning: 'The spider (Nya) is a symbol of wisdom, foresight, and connection to ancestors.', svg: badge('<circle cx="24" cy="24" r="6"/><path d="M18 20l-7-5M18 28l-7 5M30 20l7-5M30 28l7 5M20 18l-4-8M28 18l4-8"/>', themed(11)) },
      { name: 'Royal Mask', meaning: 'Ceremonial mask worn by royal societies, symbol of authority and lineage.', svg: badge('<path d="M24 10c-8 0-12 6-12 13s5 13 12 13 12-6 12-13-4-13-12-13z"/><circle cx="19" cy="21" r="1.8" fill="currentColor" stroke="none"/><circle cx="29" cy="21" r="1.8" fill="currentColor" stroke="none"/>', themed(4)) },
      { name: 'Buffalo Horns', meaning: 'Symbol of strength, royal power, and prosperity.', svg: badge('<path d="M16 30c-6-8 0-18 8-16M32 30c6-8 0-18-8-16"/><ellipse cx="24" cy="30" rx="5" ry="4"/>', themed(9)) },
      { name: 'Leopard Spots', meaning: 'Symbol of royalty — only chiefs may wear leopard patterns.', svg: badge('<circle cx="17" cy="17" r="2.5"/><circle cx="31" cy="17" r="2.5"/><circle cx="24" cy="24" r="2.5"/><circle cx="17" cy="31" r="2.5"/><circle cx="31" cy="31" r="2.5"/>', themed(6)) },
      { name: 'Bead Throne', meaning: 'Beaded royal stool, symbol of kingship, ancestry, and continuity.', svg: badge('<path d="M14 34l3-14h14l3 14z"/><circle cx="20" cy="14" r="2" fill="currentColor" stroke="none"/><circle cx="28" cy="14" r="2" fill="currentColor" stroke="none"/><circle cx="24" cy="10" r="2" fill="currentColor" stroke="none"/>', themed(0)) },
      { name: 'Elephant Mask', meaning: 'Prestigious royal mask, symbol of power, wealth, and long memory.', svg: badge('<circle cx="24" cy="18" r="8"/><path d="M20 26c-3 4-3 9 0 12"/><path d="M28 26c3 4 3 9 0 12"/>', themed(2)) },
      { name: 'Double Gong', meaning: 'Royal instrument used to announce and honor the chief, symbol of ceremony.', svg: badge('<circle cx="17" cy="24" r="7"/><circle cx="31" cy="24" r="7"/><path d="M17 17V11M31 17V11M24 11h0"/>', themed(7)) },
      { name: 'Kingdom Star', meaning: 'Symbol marking royal lineage and the unity of the Grassfields kingdoms.', svg: badge('<path d="M24 9l3.6 9.4 10 .8-7.6 6.8 2.4 9.6L24 30l-8.4 5.6 2.4-9.6-7.6-6.8 10-.8z"/>', themed(5)) },
      { name: 'Bamileke Elephant', meaning: 'Royal elephant. Symbol of power and memory.', svg: badge('<circle cx="24" cy="18" r="8"/><path d="M20 26c-3 4-3 9 0 12"/><path d="M28 26c3 4 3 9 0 12"/>', themed(8)) },
      { name: 'Bamileke Sun', meaning: 'Radiant sun. Symbol of vitality and kingship.', svg: badge('<circle cx="24" cy="24" r="8" fill="currentColor" stroke="none"/><path d="M24 8v6M24 34v6M8 24h6M34 24h6M13 13l4 4M31 31l4 4M35 13l-4 4M17 31l-4 4"/>', themed(9)) },
      { name: 'Bamileke Spider', meaning: 'Wise spider. Symbol of foresight and ancestry.', svg: badge('<circle cx="24" cy="24" r="6"/><path d="M18 20l-7-5M18 28l-7 5M30 20l7-5M30 28l7 5M20 18l-4-8M28 18l4-8"/>', themed(10)) },
      { name: 'Bamileke Beadwork', meaning: 'Royal beadwork. Symbol of status and artistry.', svg: badge('<path d="M12 20a12 12 0 0 1 24 0"/><circle cx="12" cy="20" r="2" fill="currentColor" stroke="none"/><circle cx="18" cy="11" r="2" fill="currentColor" stroke="none"/><circle cx="30" cy="11" r="2" fill="currentColor" stroke="none"/><circle cx="36" cy="20" r="2" fill="currentColor" stroke="none"/>', themed(11)) },
      { name: 'Bamileke Palace', meaning: 'Royal palace. Symbol of lineage and authority.', svg: badge('<path d="M12 34h24l-2-14-7 6-7-10-7 10-7-6z"/>', themed(12)) },
    ]
  },
  {
    id: 'tanzania-makonde',
    country: 'Tanzania',
    flag: '🇹🇿',
    ethnicGroup: 'Makonde, Maasai',
    use: 'Carving, ancestry, community, coastal trade',
    notes: 'Home to the Makonde ebony-carving tradition and Ujamaa philosophy',
    description: "Tanzanian symbolism spans the Makonde people's renowned ebony carving tradition — famous for intricate Ujamaa 'tree of life' sculptures depicting interlocked figures — alongside Maasai pastoral life and Swahili coastal trade heritage. Together they represent family, spirit, and the meeting of cultures along the East African coast.",
    symbols: [
      { name: 'Tree of Life', meaning: 'Interlocking figures (Ujamaa) symbolizing family unity and shared strength.', svg: badge('<circle cx="24" cy="14" r="4"/><circle cx="16" cy="28" r="4"/><circle cx="32" cy="28" r="4"/><path d="M24 18v6M20 24l-4 4M28 24l4 4"/>', themed(1)) },
      { name: 'Ujamaa', meaning: 'Familyhood and togetherness — a founding philosophy of Tanzanian community life.', svg: badge('<circle cx="17" cy="20" r="3.5"/><circle cx="31" cy="20" r="3.5"/><circle cx="24" cy="32" r="3.5"/><path d="M17 20l7 12M31 20l-7 12M17 20h14"/>', themed(6)) },
      { name: 'Makonde Mask', meaning: 'Ceremonial carved mask, symbol of ancestral spirits and initiation.', svg: badge('<rect x="15" y="10" width="18" height="26" rx="7"/><path d="M20 22h2M26 22h2M21 29h6"/>', themed(11)) },
      { name: 'Kilimanjaro Peak', meaning: "Africa's highest peak, symbol of aspiration and national pride.", svg: badge('<path d="M9 34l9-18 6 8 5-6 10 16z"/><path d="M15 20l3 2 3-4"/>', themed(2)) },
      { name: 'Tinga Tinga Sun', meaning: 'Bold radiant sun from the Tinga Tinga painting style, symbol of vibrancy and life.', svg: badge('<circle cx="24" cy="24" r="8" fill="currentColor" stroke="none"/><path d="M24 8v5M24 35v5M8 24h5M35 24h5M14 14l3.5 3.5M30.5 30.5L34 34M34 14l-3.5 3.5M17.5 30.5L14 34"/>', themed(5)) },
      { name: 'Shetani Spirit', meaning: 'Imaginative spirit figures from Makonde carving, symbol of the unseen world.', svg: badge('<path d="M24 10c-6 0-9 5-9 10 0 8 5 16 9 16s9-8 9-16c0-5-3-10-9-10z"/><circle cx="20" cy="18" r="1.6" fill="currentColor" stroke="none"/><circle cx="28" cy="18" r="1.6" fill="currentColor" stroke="none"/>', themed(9)) },
      { name: 'Ebony Carving', meaning: 'Fine blackwood sculpture, symbol of craftsmanship and cultural pride.', svg: badge('<path d="M24 10v28"/><path d="M17 16c0 8 14 8 14 0M17 30c0 8 14 8 14 0"/>', themed(0)) },
      { name: 'Coastal Dhow', meaning: 'Traditional sailing vessel, symbol of trade, travel, and Swahili coastal heritage.', svg: badge('<path d="M10 30q14 7 28 0l-4 5H14z"/><path d="M24 30V11l9 8z"/>', themed(3)) },
      { name: 'Makonde Mother and Child', meaning: 'Carved figure. Symbol of nurture and continuity.', svg: badge('<path d="M24 36s-10-7.5-10-15a8 8 0 0 1 10-3.5A8 8 0 0 1 34 21c0 7.5-10 15-10 15z"/>', themed(8)) },
      { name: 'Makonde Tree Figure', meaning: 'Carved tree of life. Symbol of ancestry and growth.', svg: badge('<path d="M24 38V16"/><path d="M24 16c-8 2-10 12-10 18M24 16c8 2 10 12 10 18"/>', themed(9)) },
      { name: 'Maasai Shield Dance', meaning: 'Warrior shield dance. Symbol of unity and pride.', svg: badge('<path d="M24 9l12 5v11c0 8-6 15-14 16-8-1-14-8-14-16V14z"/><path d="M24 15v18"/>', themed(10)) },
      { name: 'Zanzibar Door Pattern', meaning: 'Carved coastal door. Symbol of welcome and heritage.', svg: badge('<path d="M24 10l14 14-14 14-14-14z"/><path d="M24 18l6 6-6 6-6-6z"/>', themed(11)) },
      { name: 'Tanzania Baobab', meaning: 'The great tree. Symbol of endurance and gathering.', svg: badge('<path d="M24 38V16"/><path d="M24 16c-8 2-10 12-10 18M24 16c8 2 10 12 10 18"/>', themed(12)) },
    ]
  },
  {
    id: 'namibia-himba',
    country: 'Namibia',
    flag: '🇳🇦',
    ethnicGroup: 'Himba, Herero',
    use: 'Ochre body art, cattle culture, desert life',
    notes: 'Semi-nomadic pastoralists known for distinctive ochre-and-butterfat adornment',
    description: 'Himba and Herero symbolism reflects life in the Namib desert — ochre body patterns for protection and beauty, cattle motifs for wealth and status, and conical homestead shapes echoing the sacred family fire. These symbols carry deep ties to ancestry, the land, and the resilience of semi-nomadic desert life.',
    symbols: [
      { name: 'Ochre Sun', meaning: 'Red ochre pigment symbolizing beauty, protection, and connection to the earth.', svg: badge('<circle cx="24" cy="24" r="9" fill="currentColor" stroke="none"/><path d="M24 8v6M24 34v6M8 24h6M34 24h6"/>', themed(0)) },
      { name: 'Cattle Horn', meaning: 'Symbol of wealth, status, and the central role of cattle in Himba life.', svg: badge('<path d="M17 32c-6-7-1-17 6-15M31 32c6-7 1-17-6-15"/><ellipse cx="24" cy="30" rx="5" ry="4"/>', themed(11)) },
      { name: 'Desert Dune', meaning: 'Symbol of resilience and harmony with the harsh, beautiful Namib landscape.', svg: badge('<path d="M8 32c6-10 10 4 16-4s10 8 16-2"/>', themed(5)) },
      { name: 'Otjize Pattern', meaning: 'Ochre-and-butterfat skin pattern, symbol of identity, beauty, and protection.', svg: badge('<path d="M13 15l5 5-5 5 5 5M35 15l-5 5 5 5-5 5"/><path d="M20 15l4 18M28 15l-4 18"/>', themed(9)) },
      { name: 'Conical Hut', meaning: "Traditional homestead shape, symbol of family and the sacred ancestral fire.", svg: badge('<path d="M24 12l13 24H11z"/><path d="M24 20v16"/>', themed(6)) },
      { name: 'Herero Star', meaning: 'Symbol seen in Herero textile patterns, representing guidance and hope.', svg: badge('<path d="M24 9l3.5 9.5L37 22l-9.5 3.5L24 35l-3.5-9.5L11 22l9.5-3.5z"/>', themed(2)) },
      { name: 'Ancestral Fire', meaning: 'The sacred okuruwo fire, symbol of ancestral connection and family continuity.', svg: badge('<path d="M24 13c-3 4-4 8-2 12 2 4 6 6 6 6s-2-4 0-8c2-4 4-6 4-10-2 2-6 4-8 0z"/><path d="M14 36h20"/>', themed(7)) },
      { name: 'Welwitschia Leaf', meaning: 'Ancient desert plant, symbol of endurance and living history.', svg: badge('<path d="M24 38V16"/><path d="M24 16c-8 2-10 12-10 18M24 16c8 2 10 12 10 18"/>', themed(4)) },
      { name: 'Himba Jewelry', meaning: 'Ochre-beaded adornment. Symbol of beauty and identity.', svg: badge('<path d="M12 20a12 12 0 0 1 24 0"/><circle cx="12" cy="20" r="2" fill="currentColor" stroke="none"/><circle cx="18" cy="11" r="2" fill="currentColor" stroke="none"/><circle cx="30" cy="11" r="2" fill="currentColor" stroke="none"/><circle cx="36" cy="20" r="2" fill="currentColor" stroke="none"/>', themed(8)) },
      { name: 'Herero Dress Pattern', meaning: 'Vivid woven dress. Symbol of resilience and pride.', svg: badge('<path d="M24 10l14 14-14 14-14-14z"/><path d="M24 18l6 6-6 6-6-6z"/>', themed(9)) },
      { name: 'Namib Desert Star', meaning: 'Desert night sky. Symbol of guidance and hope.', svg: badge('<path d="M24 9l3.6 9.4 10 .8-7.6 6.8 2.4 9.6L24 30l-8.4 5.6 2.4-9.6-7.6-6.8 10-.8z"/>', themed(10)) },
      { name: 'Himba Cattle', meaning: 'Sacred cattle. Symbol of wealth and lineage.', svg: badge('<path d="M17 32c-6-6-2-16 4-14M31 32c6-6 2-16-4-14"/><ellipse cx="24" cy="30" rx="6" ry="5"/>', themed(11)) },
      { name: 'Desert Fire', meaning: 'The evening fire. Symbol of warmth and ancestral bond.', svg: badge('<path d="M24 13c-3 4-4 8-2 12 2 4 6 6 6 6s-2-4 0-8c2-4 4-6 4-10-2 2-6 4-8 0z"/>', themed(12)) },
    ]
  },
  {
    id: 'western-zodiac',
    country: 'Western Astrology',
    flag: '♈',
    ethnicGroup: 'Global (Western Culture)',
    use: 'Personality traits, destiny, compatibility',
    notes: 'Ancient Babylonian system based on constellations and birth dates',
    description: 'The Western zodiac originated from ancient Babylonian astronomy over 2,000 years ago and was later refined by Greek and Roman civilizations. This system divides the ecliptic into twelve signs corresponding to constellations, each associated with specific personality traits, elements, and mythological archetypes. Used globally for understanding character, predicting compatibility, and exploring life patterns based on birth dates.',
    symbols: [
      { name: 'Aries', meaning: 'The Ram (Mar 21-Apr 19). Courage, energy, leadership.', svg: westernZodiacGlyphSvg('♈', themed(3)) },
      { name: 'Taurus', meaning: 'The Bull (Apr 20-May 20). Stability, determination, sensuality.', svg: westernZodiacGlyphSvg('♉', themed(1)) },
      { name: 'Gemini', meaning: 'The Twins (May 21-Jun 20). Communication, adaptability, duality.', svg: westernZodiacGlyphSvg('♊', themed(5)) },
      { name: 'Cancer', meaning: 'The Crab (Jun 21-Jul 22). Emotion, intuition, protection.', svg: westernZodiacGlyphSvg('♋', themed(2)) },
      { name: 'Leo', meaning: 'The Lion (Jul 23-Aug 22). Confidence, creativity, passion.', svg: westernZodiacGlyphSvg('♌', themed(0)) },
      { name: 'Virgo', meaning: 'The Maiden (Aug 23-Sep 22). Analysis, service, perfection.', svg: westernZodiacGlyphSvg('♍', themed(4)) },
      { name: 'Libra', meaning: 'The Scales (Sep 23-Oct 22). Balance, harmony, justice.', svg: westernZodiacGlyphSvg('♎', themed(9)) },
      { name: 'Scorpio', meaning: 'The Scorpion (Oct 23-Nov 21). Intensity, transformation, mystery.', svg: westernZodiacGlyphSvg('♏', themed(10)) },
      { name: 'Sagittarius', meaning: 'The Archer (Nov 22-Dec 21). Adventure, optimism, freedom.', svg: westernZodiacGlyphSvg('♐', themed(2)) },
      { name: 'Capricorn', meaning: 'The Goat (Dec 22-Jan 19). Ambition, discipline, responsibility.', svg: westernZodiacGlyphSvg('♑', themed(11)) },
      { name: 'Aquarius', meaning: 'The Water Bearer (Jan 20-Feb 18). Innovation, humanitarianism, independence.', svg: westernZodiacGlyphSvg('♒', themed(6)) },
      { name: 'Pisces', meaning: 'The Fish (Feb 19-Mar 20). Compassion, imagination, spirituality.', svg: westernZodiacGlyphSvg('♓', themed(4)) },
    ]
  },
  {
    id: 'chinese-zodiac',
    country: 'Chinese Astrology',
    flag: '🐉',
    ethnicGroup: 'East Asian Culture',
    use: 'Personality, fortune, compatibility, lunar calendar',
    notes: '12-year cycle based on lunar calendar, over 3,000 years old',
    description: 'The Chinese zodiac is an ancient astrological system with roots stretching back over 3,000 years, based on a twelve-year cycle with each year represented by an animal. Deeply integrated with Chinese philosophy, lunar calendar, and cultural traditions, each animal embodies specific personality traits and fortunes. This system influences major life decisions, compatibility assessments, and cultural celebrations across East Asian societies.',
    symbols: [
      { name: 'Rat', meaning: 'Intelligence, adaptability, charm. Years: 2020, 2008, 1996...', svg: badge('<ellipse cx="24" cy="26" rx="10" ry="8"/><circle cx="20" cy="24" r="1.8" fill="currentColor" stroke="none"/><circle cx="28" cy="24" r="1.8" fill="currentColor" stroke="none"/><circle cx="14" cy="20" r="4"/><circle cx="34" cy="20" r="4"/>', themed(11)) },
      { name: 'Ox', meaning: 'Diligence, strength, honesty. Years: 2021, 2009, 1997...', svg: badge('<rect x="12" y="20" width="24" height="16" rx="4"/><circle cx="18" cy="26" r="1.8" fill="currentColor" stroke="none"/><circle cx="30" cy="26" r="1.8" fill="currentColor" stroke="none"/><path d="M14 18l-4-6M34 18l4-6"/>', themed(10)) },
      { name: 'Tiger', meaning: 'Bravery, competitiveness, confidence. Years: 2022, 2010, 1998...', svg: badge('<ellipse cx="24" cy="26" rx="12" ry="10"/><path d="M16 20l-4-6M32 20l4-6"/><circle cx="20" cy="24" r="1.8" fill="currentColor" stroke="none"/><circle cx="28" cy="24" r="1.8" fill="currentColor" stroke="none"/>', themed(0)) },
      { name: 'Rabbit', meaning: 'Elegance, kindness, responsibility. Years: 2023, 2011, 1999...', svg: badge('<ellipse cx="24" cy="28" rx="10" ry="8"/><ellipse cx="18" cy="13" rx="3" ry="10"/><ellipse cx="30" cy="13" rx="3" ry="10"/><circle cx="20" cy="26" r="1.6" fill="currentColor" stroke="none"/><circle cx="28" cy="26" r="1.6" fill="currentColor" stroke="none"/>', themed(9)) },
      { name: 'Dragon', meaning: 'Power, wisdom, luck. Years: 2024, 2012, 2000...', svg: badge('<path d="M24 11c-6 0-10 4-10 10s4 10 10 10 10-4 10-10-4-10-10-10z"/><circle cx="20" cy="20" r="1.8" fill="currentColor" stroke="none"/><circle cx="28" cy="20" r="1.8" fill="currentColor" stroke="none"/><path d="M12 20l-6-4M36 20l6-4M24 31c-4 4-8 8-12 6M24 31c4 4 8 8 12 6"/>', themed(3)) },
      { name: 'Snake', meaning: 'Wisdom, enigmatic, intuition. Years: 2025, 2013, 2001...', svg: badge('<path d="M12 24c0-6 4-12 12-12s12 6 12 12c0 8-6 14-12 14-4 0-8-4-10-8"/><circle cx="20" cy="20" r="1.6" fill="currentColor" stroke="none"/><circle cx="28" cy="20" r="1.6" fill="currentColor" stroke="none"/>', themed(1)) },
      { name: 'Horse', meaning: 'Energy, independence, enthusiasm. Years: 2026, 2014, 2002...', svg: badge('<rect x="12" y="20" width="24" height="16" rx="4"/><circle cx="18" cy="24" r="1.8" fill="currentColor" stroke="none"/><circle cx="30" cy="24" r="1.8" fill="currentColor" stroke="none"/><path d="M24 14c-4-6 0-10 6-8"/>', themed(6)) },
      { name: 'Goat', meaning: 'Gentle, compassionate, artistic. Years: 2027, 2015, 2003...', svg: badge('<ellipse cx="24" cy="28" rx="12" ry="10"/><path d="M16 20c-2-6 0-8 4-8M32 20c2-6 0-8-4-8"/><circle cx="20" cy="26" r="1.6" fill="currentColor" stroke="none"/><circle cx="28" cy="26" r="1.6" fill="currentColor" stroke="none"/>', themed(4)) },
      { name: 'Monkey', meaning: 'Cleverness, curiosity, playfulness. Years: 2028, 2016, 2004...', svg: badge('<circle cx="24" cy="26" r="14"/><circle cx="18" cy="24" r="4"/><circle cx="30" cy="24" r="4"/><circle cx="18" cy="24" r="1.6" fill="currentColor" stroke="none"/><circle cx="30" cy="24" r="1.6" fill="currentColor" stroke="none"/>', themed(11)) },
      { name: 'Rooster', meaning: 'Honesty, punctuality, hardworking. Years: 2029, 2017, 2005...', svg: badge('<ellipse cx="24" cy="26" rx="10" ry="8"/><path d="M24 14c-4-4-6-4-8 0"/><circle cx="20" cy="24" r="1.8" fill="currentColor" stroke="none"/><circle cx="28" cy="24" r="1.8" fill="currentColor" stroke="none"/><path d="M24 30l-4 6M24 30l4 6"/>', themed(0)) },
      { name: 'Dog', meaning: 'Loyalty, honesty, amiability. Years: 2030, 2018, 2006...', svg: badge('<ellipse cx="24" cy="28" rx="12" ry="10"/><circle cx="14" cy="20" r="4"/><circle cx="34" cy="20" r="4"/><circle cx="20" cy="26" r="1.8" fill="currentColor" stroke="none"/><circle cx="28" cy="26" r="1.8" fill="currentColor" stroke="none"/>', themed(5)) },
      { name: 'Pig', meaning: 'Generosity, compassion, diligence. Years: 2031, 2019, 2007...', svg: badge('<ellipse cx="24" cy="26" rx="14" ry="12"/><circle cx="24" cy="20" r="6"/><circle cx="20" cy="18" r="1.6" fill="currentColor" stroke="none"/><circle cx="28" cy="18" r="1.6" fill="currentColor" stroke="none"/>', themed(9)) },
    ]
  }
];

// For backward compatibility - Ghana Adinkra symbols
export const SELECTABLE_ADINKRA_SYMBOLS = AFRICAN_SYMBOL_GROUPS.find(g => g.id === 'ghana-adinkra')?.symbols || [];

/** Most cultural signs a profile can pick (sign-up, complete profile and the
 *  profile editor all enforce this). */
export const MAX_CULTURAL_SIGNS = 3;
