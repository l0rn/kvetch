export function toLocalISO8601(input: Date | string) {
    const date = typeof input === 'string' ? new Date(input) : input;
    const pad = (num: number) => String(num).padStart(2, '0');
    
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    const seconds = pad(date.getSeconds());

    // Timezone offset
    const offsetMinutes = date.getTimezoneOffset();
    const sign = offsetMinutes <= 0 ? '+' : '-';
    const absOffset = Math.abs(offsetMinutes);
    const offsetHours = pad(Math.floor(absOffset / 60));
    const offsetMins = pad(absOffset % 60);

    const timezone = `${sign}${offsetHours}:${offsetMins}`;

    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${timezone}`;
}

export function toLocalDateTimeInputValue(input: Date | string) {
    return toLocalISO8601(input).slice(0, 16);
}

export function toLocalDateInputValue(input: Date | string) {
    return toLocalISO8601(input).slice(0, 10);
}

// Helper function to format date in localized format
export function formatLocalizedDateTime(date: Date, language?: string): string {
  const locale = language || 'en';
  return date.toLocaleString(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function formatLocalizedDate(date: Date, language?: string): string {
  const locale = language || 'en';
  return date.toLocaleString(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
}