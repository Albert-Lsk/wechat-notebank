export interface ArticleMeta {
  title: string;
  author: string;
  wechatName: string;
  pubDate: string;
  sourceUrl: string;
  archivedAt: string;
  tags: string[];
}

export interface Article extends ArticleMeta {
  content: string;
}

export interface WechatNotebankConfig {
  name: string;
  archivePath: string;
  createdAt: string;
}

export interface ParseResult {
  title: string;
  author: string;
  wechatName: string;
  pubDate: string;
  content: string;
}
