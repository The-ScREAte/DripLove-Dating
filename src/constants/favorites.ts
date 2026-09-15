// Shared "Favorites" data: the structured entry shape, the predefined
// category list with its per-category emoji, and the sport sub-list used
// when "Sports" is picked. Single source of truth for the editor
// (FavoritesEditor.tsx) and every place that displays favorites (MatchCard,
// LikedMePage, ProfilePreviewModal, and the compact highlight-chip row in
// MatchCardHelpers.ts).

export interface FavoriteEntry {
  category: string;
  // Sports: which sport. Music: favorite artist or album. Other categories: unused.
  detail?: string;
  // Music only: up to 3 top/most-listened artists, separate from the
  // artist-or-album pick above (someone's top artists aren't always the
  // same as their single favorite album/song).
  topArtists?: string[];
  // Optional share link - currently only offered for Music (e.g. a Spotify/
  // Apple Music/YouTube link), but the shape allows any category to carry one.
  link?: string;
}

export const FAVORITES_MAX = 3;

// A distinct emoji per category so the info-area chips (and the compact
// highlight row) read at a glance instead of every favorite looking like a
// generic starred tag. DEFAULT_FAVORITE_EMOJI covers custom/free-text
// categories that aren't in this list.
export const FAVORITE_CATEGORY_EMOJI: Record<string, string> = {
  Sports: '⚽',
  Music: '🎵',
  Movies: '🎬',
  'TV Shows': '📺',
  Anime: '🎌',
  Gaming: '🎮',
  Books: '📚',
  Art: '🎨',
  Photography: '📷',
  Dancing: '💃',
  Singing: '🎤',
  Fashion: '👗',
  Cooking: '🍳',
  Baking: '🧁',
  Travel: '✈️',
  Hiking: '🥾',
  Camping: '🏕️',
  Fitness: '💪',
  Yoga: '🧘',
  Cycling: '🚴',
  Running: '🏃',
  Nature: '🌿',
  Animals: '🐾',
  Cars: '🚗',
  Comedy: '😂',
  Theatre: '🎭',
  Wine: '🍷',
  Coffee: '☕',
  Coding: '💻',
  Technology: '📱',
  Science: '🔬',
  History: '📜',
  Gardening: '🌱',
};

export const DEFAULT_FAVORITE_EMOJI = '🔖';

export const favoriteEmoji = (category: string): string =>
  FAVORITE_CATEGORY_EMOJI[category] || DEFAULT_FAVORITE_EMOJI;

export const PREDEFINED_FAVORITE_CATEGORIES = Object.keys(FAVORITE_CATEGORY_EMOJI);

// Categories that use the free-text detail + optional link flow (Music: artist
// or album, plus an optional share link) instead of a pick-list.
export const CATEGORIES_WITH_DETAIL = new Set(['Music']);

export const SPORT_OPTIONS = [
  'Football', 'Basketball', 'Soccer', 'Tennis', 'Boxing', 'Swimming',
  'Athletics', 'Cricket', 'Rugby', 'Golf', 'Volleyball', 'Baseball',
  'American Football', 'Table Tennis', 'Martial Arts', 'Cycling',
  'Wrestling', 'MMA', 'Hockey', 'Badminton', 'Skateboarding', 'Surfing',
  'Snowboarding', 'Skiing', 'Motorsport', 'Darts', 'Handball', 'Fencing',
];

// Sub-activity pick-lists for categories where "just the category" is too
// vague to be interesting - picking the category shows this list of pills
// instead of adding the bare category immediately.
export const CATEGORY_SUB_OPTIONS: Record<string, string[]> = {
  Sports: SPORT_OPTIONS,
  Movies: ['Action', 'Comedy', 'Horror', 'Romance', 'Sci-Fi', 'Thriller', 'Drama', 'Animation', 'Documentary', 'Fantasy', 'Crime', 'Mystery', 'Musical', 'War', 'Superhero', 'Western'],
  'TV Shows': ['Drama', 'Comedy', 'Reality TV', 'Anime', 'Crime', 'Sci-Fi', 'Sitcom', 'Documentary', 'Fantasy', 'Thriller', 'Talk Show', 'Soap Opera', 'Game Show', 'Mystery'],
  Anime: ['Shonen', 'Shojo', 'Isekai', 'Slice of Life', 'Mecha', 'Studio Ghibli', 'Seinen', 'Sports Anime', 'Romance', 'Horror', 'Fantasy', 'Action'],
  Gaming: ['FPS', 'RPG', 'Strategy', 'Sports Games', 'Racing', 'Puzzle', 'Open World', 'Mobile Gaming', 'Fighting', 'MOBA', 'Battle Royale', 'Simulation', 'Horror Games', 'Indie Games', 'Retro Gaming'],
  Books: ['Fiction', 'Non-Fiction', 'Romance', 'Thriller', 'Fantasy', 'Self-Help', 'Biography', 'Poetry', 'Mystery', 'Sci-Fi', 'History', 'Horror', 'Classics', 'Comics / Graphic Novels'],
  Art: ['Painting', 'Drawing', 'Sculpture', 'Digital Art', 'Street Art', 'Illustration', 'Calligraphy', 'Printmaking', 'Ceramics', 'Mixed Media'],
  Photography: ['Portrait', 'Landscape', 'Street', 'Wildlife', 'Travel', 'Fashion', 'Macro', 'Astrophotography', 'Documentary', 'Product'],
  Dancing: ['Salsa', 'Hip Hop', 'Ballet', 'Afrobeat', 'Contemporary', 'Ballroom', 'Latin', 'Tap', 'Breakdance', 'K-Pop Dance', 'Bachata'],
  Singing: ['Pop', 'R&B', 'Gospel', 'Opera', 'Rap', 'Jazz', 'Country', 'Rock', 'Acapella', 'Choir'],
  Fashion: ['Streetwear', 'Luxury', 'Vintage', 'Minimalist', 'Sneakers', 'Haute Couture', 'Sustainable Fashion', 'Thrifting', 'Accessories', 'Menswear', 'Womenswear'],
  Cooking: ['Grilling', 'Vegan', 'Italian', 'Asian', 'Pastry', 'Baking', 'BBQ', 'Mexican', 'Mediterranean', 'Seafood', 'Meal Prep', 'Fine Dining'],
  Baking: ['Bread', 'Cakes', 'Pastries', 'Cookies', 'Pies', 'Cupcakes', 'Donuts', 'Sourdough'],
  Travel: ['Beach', 'Mountains', 'City Breaks', 'Road Trips', 'Backpacking', 'Luxury', 'Solo Travel', 'Cruises', 'Safari', 'Cultural Tourism', 'Island Hopping'],
  Hiking: ['Day Hikes', 'Mountain Trails', 'Trail Running', 'Backpacking Trips', 'Summit Hikes', 'Forest Trails', 'Desert Hikes'],
  Camping: ['Tent Camping', 'RV Camping', 'Glamping', 'Backcountry', 'Car Camping', 'Beach Camping', 'Winter Camping'],
  Fitness: ['Weightlifting', 'Running', 'Climbing', 'CrossFit', 'Calisthenics', 'Swimming', 'Boxing', 'Powerlifting', 'HIIT', 'Pilates', 'Bodybuilding', 'Martial Arts'],
  Yoga: ['Vinyasa', 'Hatha', 'Power Yoga', 'Hot Yoga', 'Ashtanga', 'Yin Yoga', 'Restorative Yoga', 'Kundalini'],
  Cycling: ['Road Biking', 'Mountain Biking', 'BMX', 'Spin Class', 'Gravel Biking', 'Track Cycling', 'Commuter Cycling'],
  Running: ['5K', '10K', 'Half Marathon', 'Marathon', 'Trail Running', 'Sprinting', 'Ultra Marathon', 'Track', 'Cross Country'],
  Nature: ['Bird Watching', 'Botany', 'National Parks', 'Stargazing', 'Foraging', 'Wildlife Conservation', 'Beach Cleanups'],
  Animals: ['Dogs', 'Cats', 'Horses', 'Wildlife', 'Aquariums', 'Birds', 'Reptiles', 'Farm Animals', 'Animal Rescue'],
  Cars: ['Super Cars', 'Sedans', 'SUVs', 'Classic Cars', 'Off-Road', 'Motorcycles', 'Racing', 'Electric Vehicles', 'Muscle Cars', 'Car Restoration', 'JDM'],
  Comedy: ['Stand-Up', 'Sitcoms', 'Sketch Comedy', 'Improv', 'Dark Comedy', 'Satire', 'Parody'],
  Theatre: ['Musicals', 'Drama', 'Comedy', 'Opera', 'Broadway', 'Shakespeare', 'Improv Theatre'],
  Wine: ['Red', 'White', 'Sparkling', 'Rosé', 'Dessert Wine', 'Natural Wine', 'Wine Tasting'],
  Coffee: ['Espresso', 'Latte', 'Cold Brew', 'Pour Over', 'Cappuccino', 'French Press', 'Specialty Roasts'],
  Coding: ['Web Dev', 'Mobile Dev', 'AI / ML', 'Game Dev', 'Backend', 'Open Source', 'Frontend', 'DevOps', 'Cybersecurity', 'Data Science'],
  Technology: ['Gadgets', 'AI', 'VR / AR', 'Smart Home', 'Wearables', 'Robotics', 'Drones', 'Crypto / Web3', 'PC Building'],
  Science: ['Astronomy', 'Physics', 'Biology', 'Chemistry', 'Space Exploration', 'Neuroscience', 'Environmental Science', 'Psychology', 'Geology'],
  History: ['Ancient History', 'World Wars', 'Civilizations', 'Art History', 'Medieval History', 'African History', 'Military History', 'Archaeology'],
  Gardening: ['Vegetables', 'Flowers', 'Succulents', 'Landscaping', 'Herbs', 'Indoor Plants', 'Bonsai', 'Composting'],
};

// The prompt shown above a category's sub-option pick-list - phrased per
// category so it reads naturally ("Which genre?" vs "Which sport?").
export const CATEGORY_SUB_QUESTION: Record<string, string> = {
  Sports: 'Which sport?',
  Movies: 'Which genre?',
  'TV Shows': 'Which genre?',
  Anime: 'Which genre?',
  Gaming: 'Which genre?',
  Books: 'Which genre?',
  Art: 'Which style?',
  Photography: 'Which style?',
  Dancing: 'Which style?',
  Singing: 'Which style?',
  Fashion: 'Which style?',
  Cooking: 'Which style?',
  Baking: 'Which specialty?',
  Travel: 'Which type?',
  Hiking: 'Which type?',
  Camping: 'Which type?',
  Fitness: 'Which activity?',
  Yoga: 'Which style?',
  Cycling: 'Which type?',
  Running: 'Which distance?',
  Nature: 'Which interest?',
  Animals: 'Which kind?',
  Cars: 'Which type?',
  Comedy: 'Which style?',
  Theatre: 'Which type?',
  Wine: 'Which type?',
  Coffee: 'Which type?',
  Coding: 'Which area?',
  Technology: 'Which area?',
  Science: 'Which field?',
  History: 'Which era?',
  Gardening: 'Which type?',
};

// A one-line, human-readable label for a favorite entry - "Sports: Basketball",
// "Music: Drake - Scorpion", or just "Movies" when there's no detail. Music
// entries with top artists set append them too - "Music: Scorpion (album) •
// Top Artist: Kendrick Lamar" (or "Top Artists: X, Y, Z" for more than one) -
// so it shows up everywhere this label is used (the expanded info card on
// Discover/Circle/Liked Me/profile preview, the Favorites editor's own
// selected chips, the music player's title) without each of those needing
// its own separate rendering for it.
export const formatFavoriteLabel = (favorite: FavoriteEntry): string => {
  const base = favorite.detail ? `${favorite.category}: ${favorite.detail}` : favorite.category;
  if (favorite.category === 'Music' && favorite.topArtists && favorite.topArtists.length > 0) {
    const suffix = favorite.topArtists.length === 1
      ? `Top Artist: ${favorite.topArtists[0]}`
      : `Top Artists: ${favorite.topArtists.join(', ')}`;
    return `${base} • ${suffix}`;
  }
  return base;
};

// Loosely validates and coerces whatever the DB/cache handed back (jsonb ->
// unknown at the type level) into FavoriteEntry[], dropping anything
// malformed rather than letting a bad row crash rendering.
export const parseFavorites = (value: unknown): FavoriteEntry[] => {
  if (!Array.isArray(value)) return [];
  const out: FavoriteEntry[] = [];
  for (const item of value) {
    if (item && typeof item === 'object' && typeof (item as { category?: unknown }).category === 'string') {
      const entry = item as { category: string; detail?: unknown; topArtists?: unknown; topArtist?: unknown; link?: unknown };
      // topArtists is the current shape (up to 3); topArtist (singular) is a
      // short-lived earlier shape from before multiple artists were
      // supported - migrated on read so any already-saved rows still show.
      const topArtists = Array.isArray(entry.topArtists)
        ? entry.topArtists.filter((a): a is string => typeof a === 'string' && a.trim().length > 0).map((a) => a.trim()).slice(0, 3)
        : typeof entry.topArtist === 'string' && entry.topArtist.trim()
          ? [entry.topArtist.trim()]
          : undefined;
      out.push({
        category: entry.category,
        detail: typeof entry.detail === 'string' && entry.detail.trim() ? entry.detail.trim() : undefined,
        topArtists: topArtists && topArtists.length > 0 ? topArtists : undefined,
        link: typeof entry.link === 'string' && entry.link.trim() ? entry.link.trim() : undefined,
      });
    }
  }
  return out.slice(0, FAVORITES_MAX);
};

// The one favorite (if any) with a usable share link - used to decide
// whether to show the compact 🎵-style link badge in the highlight row.
export const findFavoriteWithLink = (favorites: FavoriteEntry[] | undefined | null): FavoriteEntry | null => {
  if (!favorites) return null;
  return favorites.find((f) => f.link) || null;
};
