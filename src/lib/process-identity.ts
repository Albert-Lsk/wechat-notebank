import { execFile } from 'child_process';
import { promisify } from 'util';

const PROCESS_IDENTITY_CACHE_MS = 1_000;
const execFileAsync = promisify(execFile);

export type ProcessIdentityResult =
  | { status: 'found'; identity: string }
  | { status: 'missing' }
  | { status: 'unknown' };

const processIdentityCache = new Map<number, {
  result: ProcessIdentityResult;
  expiresAt: number;
}>();

export async function getProcessIdentity(
  pid: number,
  options: { fresh?: boolean } = {}
): Promise<ProcessIdentityResult> {
  const cached = processIdentityCache.get(pid);
  if (!options.fresh && cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }

  let result: ProcessIdentityResult;
  try {
    const { stdout } = await execFileAsync('/bin/ps', [
      '-p',
      String(pid),
      '-o',
      'lstart=',
    ], {
      env: {
        ...process.env,
        TZ: 'UTC',
        LC_ALL: 'C',
        LANG: 'C',
      },
    });
    const identity = stdout.trim();
    result = identity
      ? { status: 'found', identity }
      : { status: 'unknown' };
  } catch (error) {
    result = hasNumericErrorCode(error, 1)
      ? { status: 'missing' }
      : { status: 'unknown' };
  }

  processIdentityCache.set(pid, {
    result,
    expiresAt: Date.now() + PROCESS_IDENTITY_CACHE_MS,
  });
  return result;
}

function hasNumericErrorCode(error: unknown, code: number): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}
