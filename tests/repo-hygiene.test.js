const assert = require('assert');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');

function git(args) {
  return spawnSync('git', args, { cwd: projectRoot, encoding: 'utf8' });
}

// 非 git 环境守卫：本测试断言的是 git 索引状态，只在真正的 git 工作树里有意义。
// 打包后的 tgz、用户下载的源码压缩包等场景没有 .git，必须跳过而不是失败。
const gitAvailable = git(['--version']);
if (gitAvailable.error || gitAvailable.status !== 0) {
  console.log('repo-hygiene tests skipped: git 不可用，非 git 环境');
  process.exit(0);
}

const insideWorkTree = git(['rev-parse', '--is-inside-work-tree']);
if (
  insideWorkTree.error ||
  insideWorkTree.status !== 0 ||
  insideWorkTree.stdout.trim() !== 'true'
) {
  console.log('repo-hygiene tests skipped: 不在 git 工作树内（无 .git），非 git 环境');
  process.exit(0);
}

// dist/ 是构建产物，.gitignore 已忽略；历史上有人用 git add -f 把它塞进索引，
// 且索引副本与最新源码脱节（干净克隆连 --version 都起不来）。
// 守卫：git 索引里不允许出现任何 dist/ 下的文件。
const lsFiles = git(['ls-files', 'dist']);
assert.strictEqual(lsFiles.status, 0, lsFiles.stderr || 'git ls-files dist 执行失败');

const tracked = lsFiles.stdout
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line.length > 0);

assert.deepStrictEqual(
  tracked,
  [],
  `dist/ 不应被 git 跟踪（构建产物，.gitignore 已忽略），但索引里仍有：\n${tracked.join('\n')}\n` +
    '修复：git rm -r --cached dist'
);

console.log('repo-hygiene tests passed');
