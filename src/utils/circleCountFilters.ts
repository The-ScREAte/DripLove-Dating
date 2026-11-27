/** Pure (no Supabase client import): the shared Circle count filters + category filter type. */

/** The one thing a Circle category tile filters people by (exactly one is ever set). */
export interface CategoryFilter {
  relationshipIntent?: string;
  familyPlans?: string[];
  isVerified?: boolean;
  interest?: string;
  hasMusic?: boolean;
  hasSocialMedia?: boolean;
  hasPets?: boolean;
}

interface CountFilterOptions {
  /**
   * Counts INCLUDE archived accounts (members inactive for 30+ days - the same people Discover tops
   * its feed up with and the Circle deck now shows after the active ones), so a number equals the
   * pool a member can really browse. Only the real-photo teaser sets this: it shows active members.
   */
  activeOnly?: boolean;
  /** null/undefined = no country filter (entire app). */
  codes?: string[] | null;
  /** null/undefined = no gender filter. */
  allowedGenders?: string[] | null;
  /** null/undefined = no age filter. */
  dob?: { earliest: string; latest: string } | null;
  excluded?: Set<string>;
  box?: { lat: number; lon: number; degrees: number } | null;
  viewerGender?: string;
  filter?: CategoryFilter;
}

/**
 * The profile filters shared by every Circle COUNT (the viewer's local tile counts and the
 * all-countries totals on locked tiles), so the two can never drift apart. Works on a Supabase
 * `profiles` query builder (typed loosely: the builder type changes with every chained call).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const applyCircleCountFilters = (q: any, o: CountFilterOptions) => {
  q = q.eq('account_status', 'active').eq('is_admin', false);
  if (o.activeOnly) q = q.eq('is_archived', false);
  if (o.codes && o.codes.length > 0) q = q.in('country_code', o.codes);
  if (o.allowedGenders && o.allowedGenders.length > 0) q = q.in('gender', o.allowedGenders);
  if (o.dob) q = q.gte('date_of_birth', o.dob.earliest).lte('date_of_birth', o.dob.latest);
  if (o.excluded && o.excluded.size > 0) q = q.not('id', 'in', `(${Array.from(o.excluded).join(',')})`);
  if (o.box) {
    q = q
      .gte('latitude', o.box.lat - o.box.degrees)
      .lte('latitude', o.box.lat + o.box.degrees)
      .gte('longitude', o.box.lon - o.box.degrees)
      .lte('longitude', o.box.lon + o.box.degrees);
  }
  // Reciprocal: this profile has to actually be open to the viewer's own gender too.
  if (o.viewerGender) q = q.or(`preference.eq.${o.viewerGender},preference.eq.everyone`);
  const f = o.filter;
  if (f?.relationshipIntent) q = q.eq('relationship_intent', f.relationshipIntent);
  if (f?.isVerified) q = q.eq('is_verified', true);
  if (f?.familyPlans) q = q.in('family_plans', f.familyPlans);
  if (f?.interest) q = q.contains('interests', [f.interest]);
  // favorites is a jsonb column: the value must go over as JSON text (a JS array was serialised as
  // `{[object Object]}`, which Postgres rejected with a 400).
  if (f?.hasMusic) q = q.contains('favorites', JSON.stringify([{ category: 'Music' }]));
  if (f?.hasSocialMedia) q = q.not('social_media', 'is', null).neq('social_media', '');
  // pets is a text[] column: '{}' is Postgres' empty array (an empty JS array was sent as '').
  if (f?.hasPets) q = q.not('pets', 'is', null).filter('pets', 'neq', '{}');
  return q;
};

