export const normalizeCountryCode = (value: string | null | undefined): string => {
  const cleaned = (value || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
  if (!cleaned) return '';

  if (cleaned.length === 2) return cleaned;

  const iso3Map: Record<string, string> = {
    USA: 'US',
    CAN: 'CA',
    GBR: 'GB',
    IRL: 'IE',
    AUS: 'AU',
    NZL: 'NZ',
    IND: 'IN',
    PAK: 'PK',
    KEN: 'KE',
    NGA: 'NG',
    GHA: 'GH',
    ZAF: 'ZA',
  };

  const nameMap: Record<string, string> = {
    UNITEDSTATES: 'US',
    UNITEDSTATESOFAMERICA: 'US',
    AMERICA: 'US',
    CANADA: 'CA',
    UNITEDKINGDOM: 'GB',
    GREATBRITAIN: 'GB',
    ENGLAND: 'GB',
    IRELAND: 'IE',
    AUSTRALIA: 'AU',
    NEWZEALAND: 'NZ',
    INDIA: 'IN',
    PAKISTAN: 'PK',
    KENYA: 'KE',
    NIGERIA: 'NG',
    GHANA: 'GH',
    SOUTHAFRICA: 'ZA',
  };

  return iso3Map[cleaned] || nameMap[cleaned] || cleaned;
};
