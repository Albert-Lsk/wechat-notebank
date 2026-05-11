export interface FetchArgs {
  url: string | undefined;
  outputPath?: string;
}

export interface ImportArgs {
  filePath: string;
}

export interface NormalizedCliArgs {
  command: string | undefined;
  args: string[];
}

export function normalizeCliArgs(args: string[]): NormalizedCliArgs {
  const [command, ...rest] = args;

  if (looksLikeWechatArticleUrl(command)) {
    return {
      command: 'fetch',
      args,
    };
  }

  return {
    command,
    args: rest,
  };
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

export function parseImportArgs(args: string[]): ImportArgs {
  const [filePath, ...options] = args;

  if (!filePath) {
    throw new Error('请提供 Excel 文件地址');
  }

  for (const option of options) {
    throw new Error(`Unknown import option: ${option}`);
  }

  return { filePath };
}

function looksLikeWechatArticleUrl(value: string | undefined): boolean {
  return /^https?:\/\/mp\.weixin\.qq\.com\/s\//.test(value || '');
}
