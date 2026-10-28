import { execFile } from 'child_process';
import * as path from 'path';
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

  const result = process.platform === 'win32'
    ? await getWindowsProcessIdentity(pid)
    : await getPosixProcessIdentity(pid);

  processIdentityCache.set(pid, {
    result,
    expiresAt: Date.now() + PROCESS_IDENTITY_CACHE_MS,
  });
  return result;
}

async function getPosixProcessIdentity(pid: number): Promise<ProcessIdentityResult> {
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
    return identity
      ? { status: 'found', identity }
      : { status: 'unknown' };
  } catch (error) {
    return hasNumericErrorCode(error, 1)
      ? { status: 'missing' }
      : { status: 'unknown' };
  }
}

async function getWindowsProcessIdentity(pid: number): Promise<ProcessIdentityResult> {
  // GetProcessById accepts Int32; never interpolate an unvalidated value into PowerShell.
  if (!Number.isInteger(pid) || pid <= 0 || pid > 2147483647) {
    return { status: 'unknown' };
  }

  const systemRoot = process.env.SystemRoot || process.env.SYSTEMROOT;
  const powershell = systemRoot
    ? path.win32.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    : 'powershell.exe';
  const command = [
    "$ErrorActionPreference = 'Stop'",
    `try { $p = [System.Diagnostics.Process]::GetProcessById(${pid}) } catch { ` +
      '$e = $_.Exception; while ($e.InnerException) { $e = $e.InnerException }; ' +
      'if ($e -is [System.ArgumentException]) { exit 3 }; exit 2 }',
    'try { [Console]::Out.WriteLine($p.StartTime.ToUniversalTime().Ticks.ToString(' +
      '[System.Globalization.CultureInfo]::InvariantCulture)) } ' +
      'catch { exit 2 } finally { $p.Dispose() }',
  ].join('; ');

  try {
    const { stdout } = await execFileAsync(
      powershell,
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command],
      { windowsHide: true }
    );
    const identity = stdout.trim();
    return /^\d+$/.test(identity)
      ? { status: 'found', identity }
      : { status: 'unknown' };
  } catch (error) {
    // Other failures (including access denied) must not make an active lock look stale.
    return hasNumericErrorCode(error, 3)
      ? { status: 'missing' }
      : { status: 'unknown' };
  }
}

function hasNumericErrorCode(error: unknown, code: number): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}
