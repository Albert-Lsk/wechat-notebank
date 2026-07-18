# 发布 wechat-notebank

本项目首版通过 GitHub Release 附件发布，不发布到 npm registry。用户安装的是经过边界校验的 npm `.tgz`，不要使用 GitHub 自动生成的 `Source code (zip)` 或 `Source code (tar.gz)` 作为安装源。

## v0.2.0 发布前提

- 发布提交已经进入 `main`，本地工作区干净且与 `origin/main` 一致。
- `package.json`、`package-lock.json`、README 安装 URL 和计划创建的 Tag 都是 `0.2.0` / `v0.2.0`。
- 发布机器是 macOS Apple Silicon，并已安装 Node.js 20+、npm 和 Google Chrome。
- GitHub Issue #15 的实现提交已经完成评审、推送和关闭授权。

## 生成并验证资产

从干净检出的发布提交执行：

```bash
npm ci
npm test
npm run release:pack
(cd release && shasum -a 256 -c wechat-notebank-0.2.0.tgz.sha256)
```

`npm run release:pack` 会重新构建 CLI，生成以下两个文件：

```text
release/wechat-notebank-0.2.0.tgz
release/wechat-notebank-0.2.0.tgz.sha256
```

自动化测试会连续打包两次并比较 SHA-256，同时从真实 `.tgz` 安装到隔离目录，完成 setup、init、doctor、默认保存、自动建包、审批、L4 和撤销验收。发布包只允许包含编译后的 CLI、公共 `alskai-notebank` Skill、Claude Code 命令、README、LICENSE 和 npm 必需元数据。

## 创建 Tag 与 GitHub Release

只有在维护者明确授权发布后才执行：

```bash
git tag -a v0.2.0 -m "发布 v0.2.0"
git push origin v0.2.0
gh release create v0.2.0 \
  release/wechat-notebank-0.2.0.tgz \
  release/wechat-notebank-0.2.0.tgz.sha256 \
  --title "wechat-notebank v0.2.0" \
  --notes-from-tag \
  --verify-tag
```

创建完成后，确认 GitHub Release 中两个附件都可下载，并核对 README 的固定安装地址：

```text
https://github.com/Albert-Lsk/wechat-notebank/releases/download/v0.2.0/wechat-notebank-0.2.0.tgz
```

首版不执行 `npm publish`，也不创建浮动 `latest` 下载地址。发现资产或文档不一致时停止发布，修复后重新生成资产；不要用源码压缩包替代缺失的 `.tgz`。
