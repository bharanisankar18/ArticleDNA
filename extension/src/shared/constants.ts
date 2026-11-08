/** Message sent by the background worker when the toolbar icon is clicked on a tab. */
export const ACCESS_GRANTED = 'articledna:access-granted';

export const DEFAULT_BACKEND_URL = 'http://localhost:8000';

/** Fallback limits, used until the backend reports its own via /api/health. */
export const DEFAULT_LIMITS = { max_content_chars: 100_000, min_content_words: 50 };

export const LIBRARY_LIMIT = 300;
