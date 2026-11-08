import type { AnalyzeResponse, ExtractedArticle, HealthResponse, VisualizeResponse } from '../shared/types';

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 0,
    public retryable = false,
    public retryAfterSeconds: number | null = null,
  ) {
    super(message);
  }
}

const ANALYZE_TIMEOUT_MS = 180_000;
const HEALTH_TIMEOUT_MS = 5_000;

function endpoint(baseUrl: string, path: string): string {
  return baseUrl.replace(/\/+$/, '') + path;
}

function withTimeout(ms: number, signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(ms);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

async function request<T>(url: string, init: RequestInit, timeoutMs: number, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: withTimeout(timeoutMs, signal) });
  } catch (error) {
    if (signal?.aborted) throw new ApiError('CANCELLED', 'Analysis cancelled.');
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new ApiError('CLIENT_TIMEOUT', 'The ArticleDNA server took too long to respond.', 0, true);
    }
    throw new ApiError(
      'BACKEND_UNREACHABLE',
      'Make sure the server is running and that the address in Settings is correct.',
      0,
      true,
    );
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const err = (body as { error?: Record<string, unknown> } | null)?.error;
    if (err && typeof err.code === 'string') {
      throw new ApiError(
        err.code,
        typeof err.message === 'string' ? err.message : 'The server returned an error.',
        response.status,
        Boolean(err.retryable),
        typeof err.retry_after_seconds === 'number' ? err.retry_after_seconds : null,
      );
    }
    throw new ApiError('HTTP_ERROR', `The server responded with status ${response.status}.`, response.status);
  }
  if (body === null) throw new ApiError('BAD_RESPONSE', 'The server sent a response ArticleDNA could not read.');
  return body as T;
}

export function checkHealth(baseUrl: string, signal?: AbortSignal): Promise<HealthResponse> {
  return request<HealthResponse>(endpoint(baseUrl, '/api/health'), { method: 'GET' }, HEALTH_TIMEOUT_MS, signal);
}

/** Minimal structural check, so a malformed response fails here rather than deep inside the UI. */
function assertAnalysis(data: AnalyzeResponse): AnalyzeResponse {
  const a = data?.analysis;
  const ok =
    a &&
    typeof a.central_topic === 'string' &&
    typeof a.main_argument?.thesis === 'string' &&
    (a.summary_kind === 'research' ? !!a.research_summary : !!a.article_summary) &&
    [
      'evidence',
      'assumptions',
      'limitations',
      'future_directions',
      'key_takeaways',
      'missing_information',
    ].every(
      (key) => Array.isArray((a as unknown as Record<string, unknown>)[key]),
    ) &&
    typeof data.meta?.model === 'string';
  if (!ok) throw new ApiError('BAD_RESPONSE', 'The server returned an analysis in an unexpected format.');
  return data;
}

export interface PreparedContent {
  text: string;
  truncated: boolean;
}

/** Trim the article to the server's limit, cutting at a paragraph (or sentence) boundary. */
export function prepareContent(text: string, maxChars: number): PreparedContent {
  if (text.length <= maxChars) return { text, truncated: false };
  const slice = text.slice(0, maxChars);
  const paragraph = slice.lastIndexOf('\n\n');
  const sentence = slice.search(/[.!?]\s[^.!?]*$/);
  const cut = paragraph > maxChars * 0.8 ? paragraph : sentence > maxChars * 0.8 ? sentence + 1 : maxChars;
  return { text: slice.slice(0, cut).trim(), truncated: true };
}

function articleBody(article: ExtractedArticle, content: string): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: article.title.slice(0, 500),
      url: article.url,
      content,
      author: article.author?.slice(0, 300) ?? null,
      published_date: article.publishedDate,
      site_name: article.siteName?.slice(0, 200) ?? null,
      language: article.language?.slice(0, 35) ?? null,
    }),
  };
}

export async function analyzeArticle(
  baseUrl: string,
  article: ExtractedArticle,
  content: string,
  signal?: AbortSignal,
): Promise<AnalyzeResponse> {
  const data = await request<AnalyzeResponse>(
    endpoint(baseUrl, '/api/analyze'),
    articleBody(article, content),
    ANALYZE_TIMEOUT_MS,
    signal,
  );
  return assertAnalysis(data);
}

export async function visualizeArticle(
  baseUrl: string,
  article: ExtractedArticle,
  content: string,
  signal?: AbortSignal,
): Promise<VisualizeResponse> {
  const data = await request<VisualizeResponse>(
    endpoint(baseUrl, '/api/visualize'),
    articleBody(article, content),
    ANALYZE_TIMEOUT_MS,
    signal,
  );
  const v = data?.visual;
  if (!v || !Array.isArray(v.workflow) || !Array.isArray(v.nodes) || !Array.isArray(v.edges)) {
    throw new ApiError('BAD_RESPONSE', 'The server returned diagrams in an unexpected format.');
  }
  return data;
}
