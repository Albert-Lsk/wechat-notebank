export interface FetchArgs {
  url: string | undefined;
  outputPath?: string;
}

export function parseFetchArgs(args: string[]): FetchArgs {
  const [url, ...options] = args;
  let outputPath: string | undefined;

  for (let i = 0; i < options.length; i++) {
    const option = options[i];

    if (option === '--output' || option === '-o') {
      const value = options[i + 1];
      if (!value || value.startsWith('-')) {
        throw new Error(`${option} requires a folder path`);
      }
      outputPath = value;
      i++;
      continue;
    }

    throw new Error(`Unknown fetch option: ${option}`);
  }

  return { url, outputPath };
}
