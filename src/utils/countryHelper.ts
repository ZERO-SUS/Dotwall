export interface CountryOption {
  code: string;
  name: string;
  flag: string;
}

export const POPULAR_COUNTRIES: CountryOption[] = [
  { code: 'IN', name: 'India', flag: '🇮🇳' },
  { code: 'US', name: 'United States', flag: '🇺🇸' },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧' },
  { code: 'CA', name: 'Canada', flag: '🇨🇦' },
  { code: 'AU', name: 'Australia', flag: '🇦🇺' },
  { code: 'DE', name: 'Germany', flag: '🇩🇪' },
  { code: 'FR', name: 'France', flag: '🇫🇷' },
  { code: 'JP', name: 'Japan', flag: '🇯🇵' },
  { code: 'KR', name: 'South Korea', flag: '🇰🇷' },
  { code: 'BR', name: 'Brazil', flag: '🇧🇷' },
  { code: 'SG', name: 'Singapore', flag: '🇸🇬' },
  { code: 'AE', name: 'United Arab Emirates', flag: '🇦🇪' },
  { code: 'ID', name: 'Indonesia', flag: '🇮🇩' },
  { code: 'PH', name: 'Philippines', flag: '🇵🇭' },
  { code: 'VN', name: 'Vietnam', flag: '🇻🇳' },
  { code: 'MY', name: 'Malaysia', flag: '🇲🇾' },
  { code: 'TH', name: 'Thailand', flag: '🇹🇭' },
  { code: 'NL', name: 'Netherlands', flag: '🇳🇱' },
  { code: 'ES', name: 'Spain', flag: '🇪🇸' },
  { code: 'IT', name: 'Italy', flag: '🇮🇹' },
  { code: 'SE', name: 'Sweden', flag: '🇸🇪' },
  { code: 'NO', name: 'Norway', flag: '🇳🇴' },
  { code: 'MX', name: 'Mexico', flag: '🇲🇽' },
  { code: 'ZA', name: 'South Africa', flag: '🇿🇦' },
  { code: 'NZ', name: 'New Zealand', flag: '🇳🇿' },
];

/**
 * Detects the client's country using browser timezone and locale information.
 */
export function detectUserCountry(): CountryOption {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    const lang = (typeof navigator !== 'undefined' ? navigator.language : '') || '';

    // Timezone heuristics
    if (tz.includes('Calcutta') || tz.includes('Kolkata') || tz === 'Asia/Kolkata') {
      return { code: 'IN', name: 'India', flag: '🇮🇳' };
    }
    if (tz.includes('New_York') || tz.includes('Chicago') || tz.includes('Los_Angeles') || tz.includes('Denver')) {
      return { code: 'US', name: 'United States', flag: '🇺🇸' };
    }
    if (tz.includes('London')) {
      return { code: 'GB', name: 'United Kingdom', flag: '🇬🇧' };
    }
    if (tz.includes('Toronto') || tz.includes('Vancouver')) {
      return { code: 'CA', name: 'Canada', flag: '🇨🇦' };
    }
    if (tz.includes('Sydney') || tz.includes('Melbourne')) {
      return { code: 'AU', name: 'Australia', flag: '🇦🇺' };
    }
    if (tz.includes('Berlin')) {
      return { code: 'DE', name: 'Germany', flag: '🇩🇪' };
    }
    if (tz.includes('Paris')) {
      return { code: 'FR', name: 'France', flag: '🇫🇷' };
    }
    if (tz.includes('Tokyo')) {
      return { code: 'JP', name: 'Japan', flag: '🇯🇵' };
    }
    if (tz.includes('Seoul')) {
      return { code: 'KR', name: 'South Korea', flag: '🇰🇷' };
    }
    if (tz.includes('Dubai')) {
      return { code: 'AE', name: 'United Arab Emirates', flag: '🇦🇪' };
    }
    if (tz.includes('Singapore')) {
      return { code: 'SG', name: 'Singapore', flag: '🇸🇬' };
    }
    if (tz.includes('Jakarta')) {
      return { code: 'ID', name: 'Indonesia', flag: '🇮🇩' };
    }
    if (tz.includes('Sao_Paulo')) {
      return { code: 'BR', name: 'Brazil', flag: '🇧🇷' };
    }

    // Locale heuristics (e.g. 'en-IN' -> 'IN')
    if (lang.includes('-')) {
      const code = lang.split('-')[1].toUpperCase();
      const match = POPULAR_COUNTRIES.find((c) => c.code === code);
      if (match) return match;
    }
  } catch {
    // fallback
  }

  return { code: 'IN', name: 'India', flag: '🇮🇳' };
}

/**
 * Formats a country string or code into a clean "FLAG Name" label (e.g. "🇮🇳 India").
 */
export function formatCountryDisplay(countryStr?: string | null): string {
  if (!countryStr || !countryStr.trim()) {
    const detected = detectUserCountry();
    return `${detected.flag} ${detected.name}`;
  }

  const clean = countryStr.trim();
  // Check if string already contains a flag emoji
  if (/\p{Extended_Pictographic}/u.test(clean)) {
    return clean;
  }

  // Lookup in POPULAR_COUNTRIES
  const upper = clean.toUpperCase();
  const byCode = POPULAR_COUNTRIES.find((c) => c.code === upper);
  if (byCode) return `${byCode.flag} ${byCode.name}`;

  const byName = POPULAR_COUNTRIES.find((c) => c.name.toLowerCase() === clean.toLowerCase());
  if (byName) return `${byName.flag} ${byName.name}`;

  return `🌍 ${clean}`;
}
