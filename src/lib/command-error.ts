export type CommandErrorCode =
  | 'CLI_USAGE_ERROR'
  | 'ENV_UNSUPPORTED'
  | 'NODE_VERSION_UNSUPPORTED'
  | 'NPM_NOT_FOUND'
  | 'CHROME_NOT_FOUND'
  | 'CONFIG_INVALID'
  | 'ARTICLE_UNAVAILABLE'
  | 'ARTICLE_PARSE_FAILED'
  | 'TRANSACTION_FAILED';

export class CommandError extends Error {
  constructor(
    public readonly code: CommandErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'CommandError';
  }
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
