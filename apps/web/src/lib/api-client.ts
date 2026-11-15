/**
 * Typed API Client for ModelFit backend with automatic error envelope parsing.
 */

export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    details: Record<string, unknown>;
    request_id: string;
  };
}

export class ApiError extends Error {
  public readonly code: string;
  public readonly details: Record<string, unknown>;
  public readonly requestId: string;
  public readonly status: number;

  constructor(
    code: string,
    message: string,
    status: number,
    requestId: string,
    details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.requestId = requestId;
    this.details = details;
  }
}

export async function apiClient<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;

  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorData: ErrorEnvelope | null = null;
    try {
      errorData = (await response.json()) as ErrorEnvelope;
    } catch {
      // Non-JSON error response fallback
    }

    if (errorData && errorData.error) {
      throw new ApiError(
        errorData.error.code,
        errorData.error.message,
        response.status,
        errorData.error.request_id,
        errorData.error.details
      );
    }

    throw new ApiError(
      `HTTP_${response.status}`,
      `Request failed with status ${response.status}`,
      response.status,
      response.headers.get("X-Request-ID") || "unknown"
    );
  }

  return (await response.json()) as T;
}
