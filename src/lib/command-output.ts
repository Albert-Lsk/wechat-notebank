export function writeJsonOutput(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}
