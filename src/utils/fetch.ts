import { log } from './logger.js';

interface FetchWithRetryOptions {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  signal?: AbortSignal;
}

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_RETRIES = 0;
const DEFAULT_RETRY_DELAY_MS = 1000;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export const fetchWithOptions = async (
  url: string,
  options?: FetchWithRetryOptions
): Promise<Response> => {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = options?.retries ?? DEFAULT_RETRIES;
  const retryDelayMs = options?.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;

  const maxAttempts = retries + 1;
  let lastError: unknown;
  let lastResponse: Response | undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await delay(retryDelayMs);
    }

    try {
      const signals: AbortSignal[] = [AbortSignal.timeout(timeoutMs)];
      if (options?.signal) {
        signals.push(options.signal);
      }

      const response = await fetch(url, {
        signal: AbortSignal.any(signals),
      });

      if (response.status >= 400 && response.status < 500) {
        return response;
      }

      if (response.ok) {
        return response;
      }

      lastResponse = response;
      log(`Fetch attempt ${attempt + 1} failed for ${url}: ${response.status}`);
    } catch (error) {
      lastError = error;
      log(`Fetch attempt ${attempt + 1} failed for ${url}: ${error}`);
    }
  }

  if (lastResponse) {
    return lastResponse;
  }

  throw lastError;
};
