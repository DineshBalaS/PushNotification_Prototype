import { API_BASE_URL } from '../config/api';

const SIGNUP_PATH = '/api/v1/providers/signup';
const REQUEST_TIMEOUT_MS = 15_000;

export type ProviderSignupOwnerType = 'doctor' | 'staff';

/** JSON body for `POST /api/v1/providers/signup` (matches backend `ProviderSignupRequest`). */
export interface ProviderSignupApiBody {
  owner_type: ProviderSignupOwnerType;
  first_name: string;
  last_name: string;
  /** Optional; omitted when not set. Server defaults doctor specialty to General. */
  specialty?: string;
}

/** Parsed success body (matches backend `ProviderSignupResponse`). */
export interface ProviderSignupApiSuccess {
  owner_id: string;
  user_id: string;
  owner_type: ProviderSignupOwnerType;
}

/**
 * Thrown when signup fails (HTTP non-2xx, invalid JSON, or network/timeout).
 * Use `userMessage` (and optionally `code`) for UI; never silent failure.
 */
export class ProviderSignupApiError extends Error {
  readonly statusCode: number;
  readonly code?: string;

  constructor(
    message: string,
    options: { statusCode: number; code?: string },
  ) {
    super(message);
    this.name = 'ProviderSignupApiError';
    this.statusCode = options.statusCode;
    this.code = options.code;
  }

  /** Short string suitable for alerts / toasts. */
  get userMessage(): string {
    return this.message;
  }
}

function buildRequestJson(body: ProviderSignupApiBody): Record<string, string> {
  const json: Record<string, string> = {
    owner_type: body.owner_type,
    first_name: body.first_name,
    last_name: body.last_name,
  };
  if (body.specialty !== undefined && body.specialty.trim() !== '') {
    json.specialty = body.specialty.trim();
  }
  return json;
}

function parseSuccessPayload(data: unknown): ProviderSignupApiSuccess {
  if (data === null || typeof data !== 'object') {
    throw new ProviderSignupApiError('Invalid response from server.', {
      statusCode: 502,
    });
  }
  const o = data as Record<string, unknown>;
  const owner_id = o.owner_id;
  const user_id = o.user_id;
  const owner_type = o.owner_type;
  if (typeof owner_id !== 'string' || owner_id.length === 0) {
    throw new ProviderSignupApiError('Invalid response: missing owner_id.', {
      statusCode: 502,
    });
  }
  if (typeof user_id !== 'string' || user_id.length === 0) {
    throw new ProviderSignupApiError('Invalid response: missing user_id.', {
      statusCode: 502,
    });
  }
  if (owner_type !== 'doctor' && owner_type !== 'staff') {
    throw new ProviderSignupApiError('Invalid response: missing owner_type.', {
      statusCode: 502,
    });
  }
  return { owner_id, user_id, owner_type };
}

function formatHttpErrorMessage(
  status: number,
  parsed: { detail?: unknown; code?: unknown },
  rawText: string,
): { message: string; code?: string } {
  const code =
    typeof parsed.code === 'string' && parsed.code.length > 0
      ? parsed.code
      : undefined;

  if (typeof parsed.detail === 'string' && parsed.detail.length > 0) {
    return { message: parsed.detail, code };
  }
  if (Array.isArray(parsed.detail)) {
    const first = parsed.detail[0] as Record<string, unknown> | undefined;
    const msg = first && typeof first.msg === 'string' ? first.msg : null;
    if (msg) {
      return { message: msg, code };
    }
  }
  const trimmed = rawText.trim().slice(0, 280);
  if (trimmed.length > 0) {
    return { message: trimmed, code };
  }
  return { message: `Request failed (${status}).`, code };
}

/**
 * Creates a provider via `POST /api/v1/providers/signup`.
 * @throws ProviderSignupApiError on failure
 */
export async function signUpProvider(
  body: ProviderSignupApiBody,
): Promise<ProviderSignupApiSuccess> {
  const url = `${API_BASE_URL}${SIGNUP_PATH}`;
  const jsonBody = buildRequestJson(body);

  if (__DEV__) {
    console.debug(
      '[ProviderAPI] signUpProvider',
      SIGNUP_PATH,
      'owner_type=',
      body.owner_type,
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(jsonBody),
      signal: controller.signal,
    });
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError';
    const message = aborted
      ? 'Signup request timed out. Check your connection and backend.'
      : 'Could not reach the server. Check network and adb reverse (Android).';
    if (__DEV__) {
      console.warn('[ProviderAPI] signUpProvider network error:', e);
    }
    throw new ProviderSignupApiError(message, { statusCode: 0 });
  } finally {
    clearTimeout(timeoutId);
  }

  const responseText = await response.text();

  if (__DEV__) {
    console.debug(
      '[ProviderAPI] signUpProvider response',
      response.status,
      'bytes=',
      responseText.length,
    );
  }

  if (response.status === 201) {
    let data: unknown;
    try {
      data = JSON.parse(responseText) as unknown;
    } catch {
      throw new ProviderSignupApiError('Server returned invalid JSON.', {
        statusCode: 502,
      });
    }
    return parseSuccessPayload(data);
  }

  let parsed: { detail?: unknown; code?: unknown } = {};
  try {
    parsed = JSON.parse(responseText) as { detail?: unknown; code?: unknown };
  } catch {
    /* use raw text below */
  }
  const { message, code } = formatHttpErrorMessage(
    response.status,
    parsed,
    responseText,
  );

  if (__DEV__) {
    console.warn(
      '[ProviderAPI] signUpProvider failed',
      response.status,
      code ?? '',
      message,
    );
  }

  throw new ProviderSignupApiError(message, {
    statusCode: response.status,
    code,
  });
}
