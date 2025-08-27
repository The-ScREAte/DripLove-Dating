// Bad word filter for text moderation (simple version)
// You can expand this list or use an external API for more advanced filtering

const BAD_WORDS = [
  'fuck', 'shit', 'bitch', 'asshole', 'dick', 'cunt', 'nigger', 'fag', 'slut', 'whore', 'bastard', 'damn', 'crap', 'piss', 'douche', 'cock', 'pussy', 'twat', 'wank', 'spastic', 'retard', 'nigga', 'kike', 'chink', 'gook', 'spic', 'wetback', 'tranny', 'faggot', 'homo', 'dyke', 'queer', 'rape', 'molest', 'abuse', 'kill', 'murder', 'suicide', 'terrorist', 'bomb', 'shoot', 'stab', 'hate', 'racist', 'homophobe', 'islamophobe', 'antisemitic', 'pedophile', 'incest', 'zoophile', 'bestiality', 'beastiality', 'childporn', 'child porn', 'cp', 'loli', 'lolicon', 'gore', 'blood', 'violence', 'nazi', 'hitler', 'heil', 'kkk', 'lynch', 'hang', 'genocide', 'holocaust', 'slave', 'slavery', 'torture', 'abduct', 'kidnap', 'sex', 'porn', 'xxx', 'anal', 'oral', 'cum', 'jizz', 'ejaculate', 'masturbate', 'orgasm', 'suck', 'blowjob', 'handjob', 'rimjob', 'dildo', 'vibrator', 'buttplug', 'butt plug', 'fisting', 'fist', 'gangbang', 'gang bang', 'bdsm', 'bondage', 'rape', 'molest', 'abuse', 'incest', 'zoophile', 'bestiality', 'beastiality', 'childporn', 'child porn', 'cp', 'loli', 'lolicon', 'gore', 'blood', 'violence', 'nazi', 'hitler', 'heil', 'kkk', 'lynch', 'hang', 'genocide', 'holocaust', 'slave', 'slavery', 'torture', 'abduct', 'kidnap', 'sex', 'porn', 'xxx', 'anal', 'oral', 'cum', 'jizz', 'ejaculate', 'masturbate', 'orgasm', 'suck', 'blowjob', 'handjob', 'rimjob', 'dildo', 'vibrator', 'buttplug', 'butt plug', 'fisting', 'fist', 'gangbang', 'gang bang', 'bdsm', 'bondage'
];

export function containsBadWords(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return BAD_WORDS.some(word => lower.includes(word));
}

export function filterBadWords(text: string): string {
  if (!text) return '';
  let filtered = text;
  BAD_WORDS.forEach(word => {
    const re = new RegExp(word, 'gi');
    filtered = filtered.replace(re, '*'.repeat(word.length));
  });
  return filtered;
}
