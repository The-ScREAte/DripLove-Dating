// African Symbols from various countries and ethnic groups

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
      {
        name: 'Gye Nyame',
        meaning: 'Except for God. Symbol of the supremacy of God.',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" stroke="#F9A825" stroke-width="3" fill="#FFFDE7"/><path d="M24 10c-3 3-3 9 0 12s3 9 0 12" stroke="#E53935" stroke-width="3" fill="none"/><path d="M24 38c3-3 3-9 0-12s-3-9 0-12" stroke="#43A047" stroke-width="3" fill="none"/><circle cx="24" cy="24" r="3" fill="#1E88E5"/></svg>`
      },
      {
        name: 'Sankofa',
        meaning: 'Go back and get it. Symbol of learning from the past.',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" stroke="#43A047" stroke-width="3" fill="#E8F5E9"/><path d="M32 24c0-4.4-3.6-8-8-8s-8 3.6-8 8 3.6 8 8 8c3 0 6-2.4 6-6" stroke="#E53935" stroke-width="3" fill="none"/><path d="M24 30l6-6-6-6" stroke="#F9A825" stroke-width="3" fill="none"/></svg>`
      },
      {
        name: 'Duafe',
        meaning: 'Wooden comb. Symbol of beauty, cleanliness, feminine qualities.',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><rect x="6" y="12" width="36" height="24" rx="12" fill="#FFF3E0" stroke="#E53935" stroke-width="3"/><rect x="18" y="6" width="12" height="12" rx="6" fill="#F9A825" stroke="#43A047" stroke-width="3"/><rect x="14" y="30" width="3" height="8" fill="#1E88E5"/><rect x="22" y="30" width="3" height="8" fill="#1E88E5"/><rect x="30" y="30" width="3" height="8" fill="#1E88E5"/></svg>`
      },
      {
        name: 'Akoma',
        meaning: 'The heart. Symbol of patience and tolerance.',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><path d="M24 42s-12-9-12-18a12 12 0 0 1 24 0c0 9-12 18-12 18z" fill="#E53935" stroke="#F9A825" stroke-width="3"/><circle cx="18" cy="21" r="3" fill="#FFFDE7"/><circle cx="30" cy="21" r="3" fill="#FFFDE7"/></svg>`
      },
      {
        name: 'Adinkrahene',
        meaning: 'Chief of the adinkra symbols. Symbol of greatness, charisma, and leadership.',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#F9A825" stroke="#E53935" stroke-width="3"/><circle cx="24" cy="24" r="14" fill="#43A047" stroke="#1E88E5" stroke-width="2"/></svg>`
      },
      {
        name: 'Dwennimmen',
        meaning: "Ram's horns. Symbol of humility together with strength.",
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#FFF3E0" stroke="#E53935" stroke-width="3"/><path d="M20 40c-8-8 8-24 16-16" stroke="#43A047" stroke-width="3" fill="none"/><path d="M44 40c8-8-8-24-16-16" stroke="#43A047" stroke-width="3" fill="none"/></svg>`
      },
      {
        name: 'Aya',
        meaning: 'The fern. Symbol of endurance and resourcefulness.',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><ellipse cx="24" cy="24" rx="20" ry="12" fill="#A5D6A7" stroke="#388E3C" stroke-width="3"/><path d="M24 12v24M18 18l12 12M30 18l-12 12" stroke="#388E3C" stroke-width="3"/></svg>`
      },
      {
        name: 'Nkyinkyim',
        meaning: 'Twisting. Symbol of initiative, dynamism, and versatility.',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><path d="M12 36c12-24 24 0 24-24" stroke="#E53935" stroke-width="4" fill="none"/><circle cx="12" cy="36" r="3" fill="#F9A825"/><circle cx="36" cy="12" r="3" fill="#43A047"/></svg>`
      },
      {
        name: 'Eban',
        meaning: 'Fence. Symbol of love, safety, and security.',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><rect x="8" y="8" width="32" height="32" rx="8" fill="#FFFDE7" stroke="#E53935" stroke-width="3"/><path d="M14 8v32M24 8v32M34 8v32" stroke="#43A047" stroke-width="3"/></svg>`
      },
      {
        name: 'Nyame Dua',
        meaning: "Tree of God. Symbol of God's presence and protection.",
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><rect x="20" y="24" width="8" height="16" fill="#795548"/><ellipse cx="24" cy="18" rx="12" ry="14" fill="#43A047" stroke="#388E3C" stroke-width="3"/><circle cx="24" cy="12" r="4" fill="#F9A825"/></svg>`
      }
    ]
  },
  {
    id: 'nigeria-nsibidi',
    country: 'Nigeria',
    flag: '🇳🇬',
    ethnicGroup: 'Ejagham, Igbo, Efik',
    use: 'Communication, rituals, love letters, justice symbols',
    notes: 'One of Africa\'s oldest symbol systems (over 1,000 years old)',
    description: 'Nsibidi is an ancient ideographic writing system from southeastern Nigeria, created by the Ejagham people. Dating back thousands of years, it was used by secret societies for communication and record-keeping, making it one of Africa\'s oldest indigenous writing systems.',
    symbols: [
      {
        name: 'Love',
        meaning: 'Symbol of love and affection. Used in love letters.',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#FFE0E6" stroke="#C2185B" stroke-width="2"/><path d="M24 36s-8-6-8-12a6 6 0 0 1 12 0 6 6 0 0 1 12 0c0 6-8 12-8 12h-8z" fill="#E91E63" stroke="#880E4F" stroke-width="2"/></svg>`
      },
      {
        name: 'Unity',
        meaning: 'Symbol of coming together. Represents community bonds.',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#E3F2FD" stroke="#1976D2" stroke-width="2"/><circle cx="18" cy="20" r="4" fill="#2196F3"/><circle cx="30" cy="20" r="4" fill="#2196F3"/><circle cx="24" cy="32" r="4" fill="#2196F3"/><path d="M18 20l6 12M30 20l-6 12" stroke="#0D47A1" stroke-width="3"/></svg>`
      },
      {
        name: 'Strength',
        meaning: 'Symbol of inner strength and resilience.',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><rect x="6" y="6" width="36" height="36" rx="4" fill="#FFF3E0" stroke="#E65100" stroke-width="3"/><path d="M16 24h16M24 16v16" stroke="#FF6F00" stroke-width="4"/><circle cx="16" cy="24" r="3" fill="#BF360C"/><circle cx="32" cy="24" r="3" fill="#BF360C"/></svg>`
      },
      {
        name: 'Wisdom',
        meaning: 'Symbol of knowledge and wisdom. Used by elders.',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#F3E5F5" stroke="#6A1B9A" stroke-width="2"/><circle cx="24" cy="24" r="16" fill="none" stroke="#9C27B0" stroke-width="2"/><circle cx="24" cy="24" r="10" fill="none" stroke="#AB47BC" stroke-width="2"/><circle cx="24" cy="24" r="4" fill="#7B1FA2"/></svg>`
      },
      {
        name: 'Journey',
        meaning: 'Symbol of life\'s journey and progress.',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><rect x="4" y="4" width="40" height="40" rx="6" fill="#E8F5E9" stroke="#2E7D32" stroke-width="2"/><path d="M12 36L36 12" stroke="#388E3C" stroke-width="3"/><circle cx="12" cy="36" r="4" fill="#1B5E20"/><circle cx="36" cy="12" r="4" fill="#4CAF50"/></svg>`
      },
      {
        name: 'Protection',
        meaning: 'Shield symbol. Represents protection from harm.',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><path d="M24 4L8 12v12c0 10 7 19 16 20 9-1 16-10 16-20V12L24 4z" fill="#FFEBEE" stroke="#C62828" stroke-width="2"/><path d="M24 12v24" stroke="#D32F2F" stroke-width="3"/><path d="M16 24h16" stroke="#D32F2F" stroke-width="3"/></svg>`
      },
      {
        name: 'Abundance',
        meaning: 'Symbol of prosperity and plenty.',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#FFF9C4" stroke="#F57F17" stroke-width="2"/><circle cx="18" cy="18" r="5" fill="#FFEB3B"/><circle cx="30" cy="18" r="5" fill="#FFEB3B"/><circle cx="24" cy="30" r="5" fill="#FFEB3B"/><circle cx="24" cy="24" r="3" fill="#F9A825"/></svg>`
      },
      {
        name: 'Peace',
        meaning: 'Symbol of harmony and peaceful resolution.',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#E0F2F1" stroke="#00695C" stroke-width="2"/><circle cx="24" cy="24" r="14" fill="none" stroke="#00897B" stroke-width="2"/><path d="M24 10v28M10 24h28" stroke="#009688" stroke-width="2"/></svg>`
      }
    ]
  },
  {
    id: 'ethiopia-geez',
    country: 'Ethiopia',
    flag: '🇪🇹',
    ethnicGroup: 'Amhara, Tigray',
    use: 'Protection, religious texts, healing scrolls',
    notes: 'Ancient Christian mystical symbols drawn on parchment scrolls',
    description: 'Ethiopian Ge\'ez symbols are mystical protective signs rooted in ancient Ethiopian Christianity, one of the world\'s oldest Christian traditions. These sacred symbols appear on healing scrolls, religious manuscripts, and talismans, combining indigenous spiritual practices with Orthodox Christian iconography. They serve as powerful protective emblems believed to ward off evil and bring divine blessings.',
    symbols: [
      {
        name: 'Cross of Lalibela',
        meaning: 'Symbol of faith and divine protection.',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><rect x="4" y="4" width="40" height="40" rx="6" fill="#FFF8E1" stroke="#EF6C00" stroke-width="2"/><path d="M24 8v32M8 24h32" stroke="#FF9800" stroke-width="4"/><circle cx="24" cy="24" r="6" fill="none" stroke="#E65100" stroke-width="2"/></svg>`
      },
      {
        name: 'Eye of Protection',
        meaning: 'Wards off evil spirits and negative energy.',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><ellipse cx="24" cy="24" rx="20" ry="12" fill="#E1F5FE" stroke="#01579B" stroke-width="2"/><circle cx="24" cy="24" r="8" fill="#0277BD"/><circle cx="24" cy="24" r="4" fill="#FFFFFF"/><circle cx="24" cy="24" r="2" fill="#000000"/></svg>`
      },
      {
        name: 'Trinity Knot',
        meaning: 'Symbol of the Holy Trinity and divine unity.',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#F3E5F5" stroke="#4A148C" stroke-width="2"/><circle cx="24" cy="16" r="6" fill="none" stroke="#6A1B9A" stroke-width="3"/><circle cx="16" cy="28" r="6" fill="none" stroke="#6A1B9A" stroke-width="3"/><circle cx="32" cy="28" r="6" fill="none" stroke="#6A1B9A" stroke-width="3"/></svg>`
      },
      {
        name: 'Healing Hand',
        meaning: 'Symbol of healing power and divine intervention.',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><rect x="6" y="6" width="36" height="36" rx="8" fill="#E8F5E9" stroke="#1B5E20" stroke-width="2"/><path d="M24 12v24M16 20v16M32 20v16M20 16v20M28 16v20" stroke="#2E7D32" stroke-width="2"/></svg>`
      },
      {
        name: 'Wisdom Scroll',
        meaning: 'Symbol of ancient knowledge and wisdom.',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><rect x="8" y="12" width="32" height="24" rx="4" fill="#FFF3E0" stroke="#E65100" stroke-width="2"/><circle cx="12" cy="24" r="3" fill="#BF360C"/><circle cx="36" cy="24" r="3" fill="#BF360C"/><path d="M16 20h16M16 24h16M16 28h16" stroke="#FF6F00" stroke-width="2"/></svg>`
      }
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
      {
        name: 'Eji Ogbe',
        meaning: 'Symbol of light, clarity, and new beginnings.',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><rect x="6" y="6" width="36" height="36" rx="4" fill="#FFFDE7" stroke="#F57F17" stroke-width="2"/><line x1="12" y1="12" x2="12" y2="36" stroke="#FBC02D" stroke-width="3"/><line x1="20" y1="12" x2="20" y2="36" stroke="#FBC02D" stroke-width="3"/><line x1="28" y1="12" x2="28" y2="36" stroke="#FBC02D" stroke-width="3"/><line x1="36" y1="12" x2="36" y2="36" stroke="#FBC02D" stroke-width="3"/></svg>`
      },
      {
        name: 'Oyeku Meji',
        meaning: 'Symbol of darkness, mystery, and the unknown.',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#263238" stroke="#000000" stroke-width="2"/><circle cx="18" cy="20" r="2" fill="#FFFFFF"/><circle cx="30" cy="20" r="2" fill="#FFFFFF"/></svg>`
      },
      {
        name: 'Iwori Meji',
        meaning: 'Symbol of conflict resolution and balance.',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><rect x="6" y="6" width="36" height="36" rx="4" fill="#E0F2F1" stroke="#00695C" stroke-width="2"/><path d="M12 24h24M24 12v24" stroke="#00897B" stroke-width="3"/><circle cx="24" cy="24" r="6" fill="none" stroke="#004D40" stroke-width="2"/></svg>`
      },
      {
        name: 'Odi Meji',
        meaning: 'Symbol of foundation and stability.',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><rect x="8" y="8" width="32" height="32" rx="2" fill="#EFEBE9" stroke="#4E342E" stroke-width="3"/><rect x="14" y="14" width="20" height="20" rx="2" fill="#8D6E63"/><rect x="20" y="20" width="8" height="8" fill="#3E2723"/></svg>`
      },
      {
        name: 'Obara Meji',
        meaning: 'Symbol of family and ancestral connections.',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#FCE4EC" stroke="#C2185B" stroke-width="2"/><circle cx="16" cy="20" r="5" fill="#E91E63"/><circle cx="32" cy="20" r="5" fill="#E91E63"/><circle cx="24" cy="32" r="5" fill="#E91E63"/><path d="M16 20l8 12M32 20l-8 12" stroke="#880E4F" stroke-width="2"/></svg>`
      }
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
      {
        name: 'Zimbabwe Bird',
        meaning: 'National emblem. Symbol of authority and heritage.',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><rect x="4" y="4" width="40" height="40" rx="6" fill="#FFF8E1" stroke="#F57F17" stroke-width="2"/><path d="M24 10c-4 0-6 3-6 6v8c0 4 2 6 6 6s6-2 6-6v-8c0-3-2-6-6-6z" fill="#FBC02D" stroke="#F57F17" stroke-width="2"/><circle cx="21" cy="18" r="1.5" fill="#000"/><circle cx="27" cy="18" r="1.5" fill="#000"/><path d="M18 30h12l-2 6h-8l-2-6z" fill="#F9A825"/></svg>`
      },
      {
        name: 'Stone Pattern',
        meaning: 'Symbol of ancient architecture and endurance.',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><rect x="6" y="6" width="36" height="36" rx="2" fill="#D7CCC8" stroke="#4E342E" stroke-width="2"/><rect x="10" y="10" width="12" height="8" fill="#8D6E63" stroke="#3E2723" stroke-width="1"/><rect x="26" y="10" width="12" height="8" fill="#8D6E63" stroke="#3E2723" stroke-width="1"/><rect x="10" y="22" width="12" height="8" fill="#8D6E63" stroke="#3E2723" stroke-width="1"/><rect x="26" y="22" width="12" height="8" fill="#8D6E63" stroke="#3E2723" stroke-width="1"/><rect x="10" y="34" width="12" height="4" fill="#8D6E63" stroke="#3E2723" stroke-width="1"/></svg>`
      },
      {
        name: 'Royal Scepter',
        meaning: 'Symbol of kingship and leadership.',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#FFF3E0" stroke="#E65100" stroke-width="2"/><rect x="22" y="16" width="4" height="20" fill="#FF6F00"/><circle cx="24" cy="12" r="4" fill="#FFAB00"/><path d="M20 12l4 4 4-4" fill="#FF6F00"/></svg>`
      },
      {
        name: 'Harvest Symbol',
        meaning: 'Symbol of prosperity and agricultural abundance.',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><rect x="6" y="6" width="36" height="36" rx="6" fill="#F1F8E9" stroke="#33691E" stroke-width="2"/><circle cx="24" cy="18" r="6" fill="#FFEB3B"/><path d="M24 24v12M18 30h12" stroke="#689F38" stroke-width="3"/></svg>`
      }
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
      {
        name: 'Hunter',
        meaning: 'Symbol of skill, patience, and provision.',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#FFEBEE" stroke="#B71C1C" stroke-width="2"/><circle cx="24" cy="16" r="4" fill="#C62828"/><path d="M24 20v8M20 24h8" stroke="#D32F2F" stroke-width="2"/><path d="M24 28l-4 8M24 28l4 8" stroke="#D32F2F" stroke-width="2"/></svg>`
      },
      {
        name: 'Rain Dance',
        meaning: 'Symbol of spiritual connection and abundance.',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><rect x="6" y="6" width="36" height="36" rx="4" fill="#E1F5FE" stroke="#01579B" stroke-width="2"/><path d="M16 16v8M24 12v12M32 16v8" stroke="#0288D1" stroke-width="3"/><circle cx="16" cy="30" r="2" fill="#0277BD"/><circle cx="24" cy="32" r="2" fill="#0277BD"/><circle cx="32" cy="30" r="2" fill="#0277BD"/></svg>`
      },
      {
        name: 'Eland',
        meaning: 'Sacred animal. Symbol of spiritual power.',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#FFF3E0" stroke="#E65100" stroke-width="2"/><ellipse cx="24" cy="26" rx="12" ry="8" fill="#FF9800" stroke="#E65100" stroke-width="2"/><circle cx="20" cy="24" r="2" fill="#000"/><circle cx="28" cy="24" r="2" fill="#000"/><path d="M18 18l-4-4M30 18l4-4" stroke="#BF360C" stroke-width="2"/></svg>`
      },
      {
        name: 'Fire',
        meaning: 'Symbol of warmth, community, and storytelling.',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#FBE9E7" stroke="#BF360C" stroke-width="2"/><path d="M24 12c-3 4-4 8-2 12 2 4 6 6 6 6s-2-4 0-8c2-4 4-6 4-10-2 2-6 4-8 0z" fill="#FF5722" stroke="#BF360C" stroke-width="2"/><path d="M20 28c-2-2-2-4 0-6 2-2 4-2 4-2s-1 2 0 4c1 2 2 3 2 5-1-1-4-2-6-1z" fill="#FFAB00"/></svg>`
      },
      {
        name: 'Healing Circle',
        meaning: 'Symbol of medicine, trance, and spiritual healing.',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#F3E5F5" stroke="#4A148C" stroke-width="2"/><circle cx="24" cy="24" r="16" fill="none" stroke="#6A1B9A" stroke-width="2"/><circle cx="24" cy="24" r="10" fill="none" stroke="#7B1FA2" stroke-width="2"/><circle cx="24" cy="14" r="2" fill="#9C27B0"/><circle cx="24" cy="34" r="2" fill="#9C27B0"/><circle cx="14" cy="24" r="2" fill="#9C27B0"/><circle cx="34" cy="24" r="2" fill="#9C27B0"/></svg>`
      }
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
      {
        name: 'Dikenga',
        meaning: 'The cosmogram. Symbol of life, death, and rebirth cycle.',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#FFF9C4" stroke="#F57F17" stroke-width="3"/><path d="M24 4v40M4 24h40" stroke="#F9A825" stroke-width="3"/><circle cx="24" cy="8" r="3" fill="#FFEB3B"/><circle cx="24" cy="40" r="3" fill="#F57F17"/><circle cx="8" cy="24" r="3" fill="#FBC02D"/><circle cx="40" cy="24" r="3" fill="#FDD835"/></svg>`
      },
      {
        name: 'Kalunga Line',
        meaning: 'Boundary between living and spirit world.',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><rect x="6" y="6" width="36" height="36" rx="4" fill="#E0F2F1" stroke="#00695C" stroke-width="2"/><path d="M6 24h36" stroke="#00897B" stroke-width="4"/><circle cx="15" cy="15" r="3" fill="#009688"/><circle cx="33" cy="15" r="3" fill="#009688"/><circle cx="15" cy="33" r="3" fill="#004D40"/><circle cx="33" cy="33" r="3" fill="#004D40"/></svg>`
      },
      {
        name: 'Four Moments',
        meaning: 'Symbol of the four cosmic moments of the sun.',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#FFF3E0" stroke="#E65100" stroke-width="2"/><circle cx="24" cy="8" r="4" fill="#FFB300"/><circle cx="40" cy="24" r="4" fill="#FF6F00"/><circle cx="24" cy="40" r="4" fill="#E65100"/><circle cx="8" cy="24" r="4" fill="#FFA726"/><circle cx="24" cy="24" r="6" fill="none" stroke="#FF9800" stroke-width="2"/></svg>`
      },
      {
        name: 'Ancestor Path',
        meaning: 'Connection to ancestors and spiritual guidance.',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><rect x="6" y="6" width="36" height="36" rx="6" fill="#F3E5F5" stroke="#4A148C" stroke-width="2"/><path d="M24 10v28" stroke="#6A1B9A" stroke-width="3"/><circle cx="24" cy="10" r="3" fill="#7B1FA2"/><circle cx="24" cy="20" r="3" fill="#8E24AA"/><circle cx="24" cy="30" r="3" fill="#9C27B0"/><circle cx="24" cy="38" r="3" fill="#AB47BC"/></svg>`
      }
    ]
  },
  {
    id: 'mali-dogon',
    country: 'Mali',
    flag: '🇲🇱',
    ethnicGroup: 'Dogon',
    use: 'Cosmology, astronomy, spiritual truths',
    notes: 'Strong symbolic system linked to the stars (Sirius)',
    description: 'Dogon symbols encode sophisticated astronomical and cosmological knowledge from the Dogon people of Mali\'s Bandiagara Escarpment. Their intricate symbolic system, particularly focused on the Sirius star system, represents creation myths, spiritual concepts, and celestial observations passed down through millennia. These symbols reflect the Dogon\'s deep understanding of the cosmos and their role within the universal order.',
    symbols: [
      {
        name: 'Sirius Star',
        meaning: 'Symbol of cosmic knowledge and astronomy.',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#1A237E" stroke="#000051" stroke-width="2"/><circle cx="24" cy="24" r="6" fill="#FFFFFF"/><path d="M24 10l2 8-2 8-2-8 2-8M10 24l8 2 8-2-8-2-8 2M17 17l5 5-5 5-5-5 5-5M31 17l5 5-5 5-5-5 5-5" fill="#FBC02D"/></svg>`
      },
      {
        name: 'Nommo',
        meaning: 'Ancestral spirits. Symbol of life force and creation.',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><rect x="6" y="6" width="36" height="36" rx="4" fill="#E8EAF6" stroke="#283593" stroke-width="2"/><circle cx="24" cy="16" r="5" fill="#3F51B5"/><path d="M24 21v10M18 26h12" stroke="#1A237E" stroke-width="3"/><circle cx="24" cy="36" r="3" fill="#5C6BC0"/></svg>`
      },
      {
        name: 'Granary',
        meaning: 'Symbol of sustenance and cosmic order.',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#FFF8E1" stroke="#F57F17" stroke-width="2"/><rect x="12" y="18" width="24" height="18" rx="2" fill="#F9A825" stroke="#E65100" stroke-width="2"/><path d="M12 18L24 8l12 10" stroke="#FF6F00" stroke-width="2"/><rect x="20" y="24" width="8" height="12" fill="#BF360C"/></svg>`
      },
      {
        name: 'Spiral of Creation',
        meaning: 'Symbol of cosmic expansion and evolution.',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#F3E5F5" stroke="#4A148C" stroke-width="2"/><path d="M24 24c2 0 4-2 4-4s-2-4-4-4-4 2-4 4c0 4 2 6 6 6s6-2 6-6-2-6-6-6-6 4-6 8c0 6 4 10 10 10" stroke="#7B1FA2" stroke-width="2" fill="none"/></svg>`
      }
    ]
  },
  {
    id: 'morocco-amazigh',
    country: 'Morocco',
    flag: '🇲🇦',
    ethnicGroup: 'Amazigh (Berber)',
    use: 'Writing system, tribal identity, jewelry',
    notes: 'Tifinagh is one of Africa\'s oldest alphabets',
    description: 'Amazigh (Berber) symbols, particularly the Tifinagh script, represent one of Africa\'s oldest writing systems, dating back over 2,500 years. These distinctive geometric symbols serve as both alphabet and cultural identity markers for the indigenous peoples of North Africa. Featured in jewelry, textiles, and tattoos, they embody the enduring spirit of Amazigh freedom, resilience, and cultural pride across the Maghreb region.',
    symbols: [
      {
        name: 'Yaz (ⵣ)',
        meaning: 'Free person. Symbol of freedom and identity.',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#E3F2FD" stroke="#01579B" stroke-width="2"/><path d="M24 10v28M10 24h28M17 17l14 14M31 17L17 31" stroke="#0277BD" stroke-width="3"/></svg>`
      },
      {
        name: 'Amulet',
        meaning: 'Symbol of protection and warding off evil.',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#FFF3E0" stroke="#E65100" stroke-width="2"/><circle cx="24" cy="24" r="14" fill="none" stroke="#FF6F00" stroke-width="2"/><circle cx="24" cy="24" r="8" fill="none" stroke="#F57F17" stroke-width="2"/><circle cx="24" cy="24" r="3" fill="#BF360C"/></svg>`
      },
      {
        name: 'Mountain Symbol',
        meaning: 'Symbol of strength and endurance (Atlas Mountains).',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><rect x="6" y="6" width="36" height="36" rx="4" fill="#EFEBE9" stroke="#3E2723" stroke-width="2"/><path d="M10 36l14-24 14 24" stroke="#5D4037" stroke-width="3" fill="none"/><path d="M16 36l8-14 8 14" fill="#8D6E63"/></svg>`
      },
      {
        name: 'Unity Pattern',
        meaning: 'Symbol of tribal unity and solidarity.',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#FCE4EC" stroke="#880E4F" stroke-width="2"/><path d="M24 10l-10 10 10 10 10-10-10-10M24 20l-6 6 6 6 6-6-6-6" stroke="#C2185B" stroke-width="2" fill="none"/></svg>`
      }
    ]
  },
  {
    id: 'egypt-hieroglyphs',
    country: 'Egypt',
    flag: '🇪🇬',
    ethnicGroup: 'Ancient Egyptians',
    use: 'Writing, rituals, kingship',
    notes: 'The entire writing system was based on symbols',
    description: 'Egyptian hieroglyphs form one of the world\'s oldest and most iconic writing systems, used for over 3,000 years in ancient Egypt. These sacred symbols combined phonetic, logographic, and symbolic meanings to record everything from royal decrees to religious texts and everyday life. Beyond mere writing, hieroglyphs embodied profound spiritual concepts and were believed to possess magical power, making them central to Egyptian religion, kingship, and the pursuit of eternal life.',
    symbols: [
      {
        name: 'Ankh',
        meaning: 'Symbol of life and immortality.',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#FFF9C4" stroke="#F57F17" stroke-width="2"/><circle cx="24" cy="16" r="5" fill="none" stroke="#F9A825" stroke-width="3"/><path d="M24 21v17M16 28h16" stroke="#F9A825" stroke-width="3"/></svg>`
      },
      {
        name: 'Eye of Horus',
        meaning: 'Symbol of protection, royal power, and good health.',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#E3F2FD" stroke="#01579B" stroke-width="2"/><ellipse cx="24" cy="24" rx="14" ry="8" fill="none" stroke="#0277BD" stroke-width="3"/><circle cx="24" cy="24" r="4" fill="#01579B"/><path d="M24 28c-4 2-6 4-8 0M24 28c4 2 6 4 8 0" stroke="#0277BD" stroke-width="2"/></svg>`
      },
      {
        name: 'Scarab',
        meaning: 'Symbol of transformation and rebirth.',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#E8F5E9" stroke="#1B5E20" stroke-width="2"/><ellipse cx="24" cy="26" rx="12" ry="10" fill="#43A047" stroke="#2E7D32" stroke-width="2"/><circle cx="24" cy="18" r="4" fill="#1B5E20"/><path d="M12 26l-4 6M36 26l4 6M16 30l-2 6M32 30l2 6" stroke="#2E7D32" stroke-width="2"/></svg>`
      },
      {
        name: 'Djed',
        meaning: 'Symbol of stability and endurance.',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><rect x="6" y="6" width="36" height="36" rx="4" fill="#FFF3E0" stroke="#E65100" stroke-width="2"/><rect x="20" y="12" width="8" height="24" fill="#FF6F00"/><path d="M16 16h16M16 22h16M16 28h16M16 34h16" stroke="#BF360C" stroke-width="2"/></svg>`
      },
      {
        name: 'Was Scepter',
        meaning: 'Symbol of power and dominion.',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#F3E5F5" stroke="#4A148C" stroke-width="2"/><rect x="22" y="14" width="4" height="22" fill="#7B1FA2"/><path d="M18 14c0-3 2-4 6-4s6 1 6 4" stroke="#6A1B9A" stroke-width="2" fill="none"/><path d="M20 36l4 2 4-2" fill="#9C27B0"/></svg>`
      }
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
      {
        name: 'Aries',
        meaning: 'The Ram (Mar 21-Apr 19). Courage, energy, leadership.',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#FFEBEE" stroke="#D32F2F" stroke-width="2"/><path d="M16 20c-3-6 0-10 4-10s4 4 4 10M28 20c3-6 0-10-4-10s-4 4-4 10" stroke="#F44336" stroke-width="3" fill="none"/><circle cx="16" cy="12" r="3" fill="#D32F2F"/><circle cx="32" cy="12" r="3" fill="#D32F2F"/></svg>`
      },
      {
        name: 'Taurus',
        meaning: 'The Bull (Apr 20-May 20). Stability, determination, sensuality.',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#E8F5E9" stroke="#388E3C" stroke-width="2"/><circle cx="24" cy="28" r="12" fill="none" stroke="#4CAF50" stroke-width="3"/><path d="M12 20c0-8 6-12 12-12s12 4 12 12" stroke="#2E7D32" stroke-width="3" fill="none"/><circle cx="14" cy="16" r="3" fill="#1B5E20"/><circle cx="34" cy="16" r="3" fill="#1B5E20"/></svg>`
      },
      {
        name: 'Gemini',
        meaning: 'The Twins (May 21-Jun 20). Communication, adaptability, duality.',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><rect x="4" y="4" width="40" height="40" rx="6" fill="#FFF9C4" stroke="#F9A825" stroke-width="2"/><rect x="14" y="12" width="6" height="24" rx="2" fill="#FFB300"/><rect x="28" y="12" width="6" height="24" rx="2" fill="#FFB300"/><path d="M14 16h20M14 32h20" stroke="#F57F17" stroke-width="2"/></svg>`
      },
      {
        name: 'Cancer',
        meaning: 'The Crab (Jun 21-Jul 22). Emotion, intuition, protection.',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#E3F2FD" stroke="#1976D2" stroke-width="2"/><circle cx="18" cy="20" r="6" fill="none" stroke="#2196F3" stroke-width="2"/><circle cx="30" cy="20" r="6" fill="none" stroke="#2196F3" stroke-width="2"/><path d="M12 20c-4 0-6 2-6 6M36 20c4 0 6 2 6 6" stroke="#0D47A1" stroke-width="2" fill="none"/><circle cx="18" cy="20" r="2" fill="#1565C0"/><circle cx="30" cy="20" r="2" fill="#1565C0"/></svg>`
      },
      {
        name: 'Leo',
        meaning: 'The Lion (Jul 23-Aug 22). Confidence, creativity, passion.',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#FFF3E0" stroke="#E65100" stroke-width="2"/><circle cx="24" cy="24" r="14" fill="#FF9800" stroke="#E65100" stroke-width="2"/><circle cx="16" cy="16" r="4" fill="#FFB300"/><circle cx="32" cy="16" r="4" fill="#FFB300"/><circle cx="12" cy="24" r="4" fill="#FFB300"/><circle cx="36" cy="24" r="4" fill="#FFB300"/></svg>`
      },
      {
        name: 'Virgo',
        meaning: 'The Maiden (Aug 23-Sep 22). Analysis, service, perfection.',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><rect x="6" y="6" width="36" height="36" rx="4" fill="#F3E5F5" stroke="#6A1B9A" stroke-width="2"/><path d="M12 12v24M20 12v20c0 4 2 6 6 6M28 12v24M36 30c-2 4-6 6-8 2" stroke="#8E24AA" stroke-width="2" fill="none"/></svg>`
      },
      {
        name: 'Libra',
        meaning: 'The Scales (Sep 23-Oct 22). Balance, harmony, justice.',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#FCE4EC" stroke="#C2185B" stroke-width="2"/><path d="M10 28h28M24 18v10" stroke="#E91E63" stroke-width="3"/><circle cx="14" cy="28" r="4" fill="none" stroke="#AD1457" stroke-width="2"/><circle cx="34" cy="28" r="4" fill="none" stroke="#AD1457" stroke-width="2"/></svg>`
      },
      {
        name: 'Scorpio',
        meaning: 'The Scorpion (Oct 23-Nov 21). Intensity, transformation, mystery.',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><rect x="4" y="4" width="40" height="40" rx="6" fill="#212121" stroke="#000000" stroke-width="2"/><path d="M12 12v16c0 4 2 6 6 6M20 12v16c0 4 2 6 6 6M28 12v20l8 4" stroke="#E91E63" stroke-width="2" fill="none"/><path d="M36 36l4-4-4-4" stroke="#E91E63" stroke-width="2"/></svg>`
      },
      {
        name: 'Sagittarius',
        meaning: 'The Archer (Nov 22-Dec 21). Adventure, optimism, freedom.',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#E1F5FE" stroke="#01579B" stroke-width="2"/><path d="M12 36L36 12M28 12h8v8M12 32l6 6" stroke="#0277BD" stroke-width="3"/></svg>`
      },
      {
        name: 'Capricorn',
        meaning: 'The Goat (Dec 22-Jan 19). Ambition, discipline, responsibility.',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><rect x="6" y="6" width="36" height="36" rx="4" fill="#EFEBE9" stroke="#4E342E" stroke-width="2"/><path d="M12 20c0-6 4-10 8-10v20c0 4 4 6 8 2" stroke="#6D4C41" stroke-width="3" fill="none"/><circle cx="32" cy="28" r="6" fill="none" stroke="#5D4037" stroke-width="2"/></svg>`
      },
      {
        name: 'Aquarius',
        meaning: 'The Water Bearer (Jan 20-Feb 18). Innovation, humanitarianism, independence.',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#E0F2F1" stroke="#00695C" stroke-width="2"/><path d="M8 18c4 0 4 4 8 4s4-4 8-4 4 4 8 4 4-4 8-4M8 28c4 0 4 4 8 4s4-4 8-4 4 4 8 4 4-4 8-4" stroke="#00897B" stroke-width="2" fill="none"/></svg>`
      },
      {
        name: 'Pisces',
        meaning: 'The Fish (Feb 19-Mar 20). Compassion, imagination, spirituality.',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><rect x="4" y="4" width="40" height="40" rx="6" fill="#F3E5F5" stroke="#4A148C" stroke-width="2"/><path d="M16 12c-4 6-4 18 0 24M32 12c4 6 4 18 0 24M12 24h24" stroke="#7B1FA2" stroke-width="2" fill="none"/><circle cx="16" cy="18" r="2" fill="#6A1B9A"/><circle cx="32" cy="18" r="2" fill="#6A1B9A"/></svg>`
      }
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
      {
        name: 'Rat',
        meaning: 'Intelligence, adaptability, charm. Years: 2020, 2008, 1996...',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#ECEFF1" stroke="#455A64" stroke-width="2"/><ellipse cx="24" cy="26" rx="10" ry="8" fill="#607D8B"/><circle cx="20" cy="24" r="2" fill="#000"/><circle cx="28" cy="24" r="2" fill="#000"/><circle cx="24" cy="28" r="1" fill="#000"/><circle cx="14" cy="20" r="4" fill="#78909C"/><circle cx="34" cy="20" r="4" fill="#78909C"/></svg>`
      },
      {
        name: 'Ox',
        meaning: 'Diligence, strength, honesty. Years: 2021, 2009, 1997...',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><rect x="6" y="6" width="36" height="36" rx="4" fill="#D7CCC8" stroke="#4E342E" stroke-width="2"/><rect x="12" y="20" width="24" height="16" rx="4" fill="#6D4C41"/><circle cx="18" cy="26" r="2" fill="#FFF"/><circle cx="30" cy="26" r="2" fill="#FFF"/><path d="M14 18l-4-6M34 18l4-6" stroke="#5D4037" stroke-width="2"/></svg>`
      },
      {
        name: 'Tiger',
        meaning: 'Bravery, competitiveness, confidence. Years: 2022, 2010, 1998...',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#FFF3E0" stroke="#E65100" stroke-width="2"/><ellipse cx="24" cy="26" rx="12" ry="10" fill="#FF9800"/><path d="M16 20l-4-6M32 20l4-6" stroke="#BF360C" stroke-width="2"/><circle cx="20" cy="24" r="2" fill="#000"/><circle cx="28" cy="24" r="2" fill="#000"/><path d="M18 28h12" stroke="#000" stroke-width="2"/></svg>`
      },
      {
        name: 'Rabbit',
        meaning: 'Elegance, kindness, responsibility. Years: 2023, 2011, 1999...',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#FCE4EC" stroke="#C2185B" stroke-width="2"/><ellipse cx="24" cy="28" rx="10" ry="8" fill="#F8BBD0"/><ellipse cx="18" cy="12" rx="3" ry="10" fill="#EC407A"/><ellipse cx="30" cy="12" rx="3" ry="10" fill="#EC407A"/><circle cx="20" cy="26" r="2" fill="#000"/><circle cx="28" cy="26" r="2" fill="#000"/></svg>`
      },
      {
        name: 'Dragon',
        meaning: 'Power, wisdom, luck. Years: 2024, 2012, 2000...',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#FFEBEE" stroke="#C62828" stroke-width="2"/><path d="M24 10c-6 0-10 4-10 10s4 10 10 10 10-4 10-10-4-10-10-10z" fill="#F44336"/><circle cx="20" cy="20" r="2" fill="#FFF"/><circle cx="28" cy="20" r="2" fill="#FFF"/><path d="M12 20l-6-4M36 20l6-4M24 30c-4 4-8 8-12 6M24 30c4 4 8 8 12 6" stroke="#D32F2F" stroke-width="2"/></svg>`
      },
      {
        name: 'Snake',
        meaning: 'Wisdom, enigmatic, intuition. Years: 2025, 2013, 2001...',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><rect x="4" y="4" width="40" height="40" rx="6" fill="#E8F5E9" stroke="#1B5E20" stroke-width="2"/><path d="M12 24c0-6 4-12 12-12s12 6 12 12c0 8-6 14-12 14-4 0-8-4-10-8" stroke="#2E7D32" stroke-width="3" fill="none"/><circle cx="20" cy="20" r="2" fill="#FFF"/><circle cx="28" cy="20" r="2" fill="#FFF"/></svg>`
      },
      {
        name: 'Horse',
        meaning: 'Energy, independence, enthusiasm. Years: 2026, 2014, 2002...',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#FFF8E1" stroke="#F57F17" stroke-width="2"/><rect x="12" y="20" width="24" height="16" rx="4" fill="#FFCA28"/><circle cx="18" cy="24" r="2" fill="#000"/><circle cx="30" cy="24" r="2" fill="#000"/><path d="M24 14c-4-6 0-10 6-8" stroke="#F9A825" stroke-width="2" fill="none"/></svg>`
      },
      {
        name: 'Goat',
        meaning: 'Gentle, compassionate, artistic. Years: 2027, 2015, 2003...',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><rect x="6" y="6" width="36" height="36" rx="4" fill="#F3E5F5" stroke="#4A148C" stroke-width="2"/><ellipse cx="24" cy="28" rx="12" ry="10" fill="#AB47BC"/><path d="M16 20c-2-6 0-8 4-8M32 20c2-6 0-8-4-8" stroke="#6A1B9A" stroke-width="2" fill="none"/><circle cx="20" cy="26" r="2" fill="#FFF"/><circle cx="28" cy="26" r="2" fill="#FFF"/></svg>`
      },
      {
        name: 'Monkey',
        meaning: 'Cleverness, curiosity, playfulness. Years: 2028, 2016, 2004...',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#EFEBE9" stroke="#3E2723" stroke-width="2"/><circle cx="24" cy="26" r="14" fill="#8D6E63"/><circle cx="18" cy="24" r="4" fill="#D7CCC8"/><circle cx="30" cy="24" r="4" fill="#D7CCC8"/><circle cx="18" cy="24" r="2" fill="#000"/><circle cx="30" cy="24" r="2" fill="#000"/><path d="M20 30h8" stroke="#000" stroke-width="2"/></svg>`
      },
      {
        name: 'Rooster',
        meaning: 'Honesty, punctuality, hardworking. Years: 2029, 2017, 2005...',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#FFF3E0" stroke="#E65100" stroke-width="2"/><ellipse cx="24" cy="26" rx="10" ry="8" fill="#FF6F00"/><path d="M24 14c-4-4-6-4-8 0" stroke="#D84315" stroke-width="2" fill="none"/><circle cx="20" cy="24" r="2" fill="#000"/><circle cx="28" cy="24" r="2" fill="#000"/><path d="M24 30l-4 6M24 30l4 6" stroke="#BF360C" stroke-width="2"/></svg>`
      },
      {
        name: 'Dog',
        meaning: 'Loyalty, honesty, amiability. Years: 2030, 2018, 2006...',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><rect x="6" y="6" width="36" height="36" rx="4" fill="#FFF9C4" stroke="#F57F17" stroke-width="2"/><ellipse cx="24" cy="28" rx="12" ry="10" fill="#FBC02D"/><circle cx="14" cy="20" r="4" fill="#F9A825"/><circle cx="34" cy="20" r="4" fill="#F9A825"/><circle cx="20" cy="26" r="2" fill="#000"/><circle cx="28" cy="26" r="2" fill="#000"/></svg>`
      },
      {
        name: 'Pig',
        meaning: 'Generosity, compassion, diligence. Years: 2031, 2019, 2007...',
        svg: `<svg width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#FCE4EC" stroke="#880E4F" stroke-width="2"/><ellipse cx="24" cy="26" rx="14" ry="12" fill="#F8BBD0"/><circle cx="24" cy="20" r="6" fill="#F48FB1"/><circle cx="20" cy="18" r="2" fill="#000"/><circle cx="28" cy="18" r="2" fill="#000"/><circle cx="22" cy="22" r="1" fill="#000"/><circle cx="26" cy="22" r="1" fill="#000"/></svg>`
      }
    ]
  }
];

// For backward compatibility - Ghana Adinkra symbols
export const SELECTABLE_ADINKRA_SYMBOLS = AFRICAN_SYMBOL_GROUPS.find(g => g.id === 'ghana-adinkra')?.symbols || [];
