import * as fs from 'fs-extra';
import * as path from 'path';

export function getPackageRoot(): string {
  return path.resolve(__dirname, '..', '..');
}

export async function getPackageVersion(): Promise<string> {
  const packageJson = await fs.readJson(path.join(getPackageRoot(), 'package.json')) as {
    version: string;
  };
  return packageJson.version;
}
