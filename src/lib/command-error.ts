export type FetchErrorCode =
  | 'CLI_USAGE_ERROR'
  | 'CONFIG_INVALID'
  | 'ARTICLE_UNAVAILABLE'
  | 'ARTICLE_PARSE_FAILED'
  | 'TRANSACTION_FAILED';

export class CommandError extends Error {
  constructor(
    public readonly code: FetchErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'CommandError';
  }
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
