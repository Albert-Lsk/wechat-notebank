# 发布 wechat-notebank

本项目通过 GitHub Release 附件发布，不发布到 npm registry。用户安装的是经过边界校验的 npm `.tgz`，不要使用 GitHub 自动生成的 `Source code (zip)` 或 `Source code (tar.gz)` 作为安装源。

## v0.3.0 发布前提

- 发布提交已经进入 `main`，本地工作区干净且与 `origin/main` 一致。
- `package.json`、`package-lock.json`、README 固定安装 URL 和计划创建的 Tag 都是 `0.3.0` / `v0.3.0`。
- 发布机器已安装 Node.js 20+、npm 和 Google Chrome；需要执行 Agent 安装验收时，使用 macOS Apple Silicon。
- v0.3.0 的文章发现、图片本地化和 Markdown 转换实现已经完成评审；发布前必须确认离线测试与发布包清单检查通过。

## 发布前真实网络手工验证

以下检查不进入自动化测试，必须在发布前用真实网络逐项记录结果。搜索任务要遵守默认节流，验证码出现后立即停止，不自动重试。

1. **带图文章归档**：选择一篇当前可访问且包含图片的微信公众号文章，运行
   `alskai-notebank fetch "<mp.weixin.qq.com URL>" --json`。确认文章同名的
   `.assets/` 目录落盘，正文 Markdown 使用 `./<文章名>.assets/imgN.<ext>` 相对路径，
   失败图片仍保留远程 URL，并在 Obsidian 中打开确认渲染正常。
2. **搜狗最近文章**：运行
   `alskai-notebank search "饼干哥哥AGI" --limit 3 --json`，确认返回结构化条目，
   `resolved:true` 的 `sourceUrl` 是 `mp.weixin.qq.com` 直链；若遇验证码，记录
   `SOGOU_CAPTCHA` 并停止，不把验证码当作空结果。
3. **今天看啥完整历史**：运行
   `alskai-notebank search "https://www.jintiankansha.me/column/FDo3tWhjrh" --source mirror --json`，
   确认历史列表、翻页和重复标题去重正常；逐条核对直链还原结果，计算
   `resolved:true / items.length` 的实际还原率，并把结果如实回写
   `docs/superpowers/specs/2026-08-12-wechat-discovery-and-image-localization-spec.md`。
4. **关闭图片下载（可选回归）**：对同一篇文章运行 `fetch --no-images --json`，确认不会创建
   `.assets/`，且 JSON 的 `images` 为 `{ "total": 0, "downloaded": 0 }`。

记录验证日期、网络环境、命令和结果；任何一项无法解释时停止发布，不用“看起来能用”替代证据。

## 生成并验证资产

从干净检出的发布提交执行：

```bash
npm ci
npm test
npm run release:pack
(cd release && shasum -a 256 -c wechat-notebank-0.3.0.tgz.sha256)
```

`npm run release:pack` 会重新构建 CLI，生成以下两个文件：

```text
release/wechat-notebank-0.3.0.tgz
release/wechat-notebank-0.3.0.tgz.sha256
```

发布验收需要连续执行两次 `npm run release:pack` 并比较两个 `.sha256` 文件的 SHA-256；
自动化发布包测试还会从真实 `.tgz` 安装到隔离目录，完成 setup、init、doctor、默认保存、
自动建包、审批、L4 和撤销验收。发布包只允许包含编译后的 CLI、公共
`alskai-notebank` Skill、Claude Code 命令、README、LICENSE 和 npm 必需元数据。

## 创建 Tag 与 GitHub Release

只有在维护者明确授权发布后才执行：

```bash
git tag -a v0.3.0 -m "发布 v0.3.0"
git push origin v0.3.0
gh release create v0.3.0 \
  release/wechat-notebank-0.3.0.tgz \
  release/wechat-notebank-0.3.0.tgz.sha256 \
  --title "wechat-notebank v0.3.0" \
  --notes-from-tag \
  --verify-tag
```

创建完成后，确认 GitHub Release 中两个附件都可下载，并核对 README 的固定安装地址：

```text
https://github.com/Albert-Lsk/wechat-notebank/releases/download/v0.3.0/wechat-notebank-0.3.0.tgz
```

不执行 `npm publish`，也不创建浮动 `latest` 下载地址。发现资产或文档不一致时停止发布，
修复后重新生成资产；不要用源码压缩包替代缺失的 `.tgz`。
