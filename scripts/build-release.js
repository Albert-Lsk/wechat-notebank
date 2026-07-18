#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const packageJson = require(path.join(projectRoot, 'package.json'));

function parseOutputPath(args) {
  if (args.length === 0) {
    return path.join(projectRoot, 'release');
  }
  if (args.length === 2 && args[0] === '--output' && args[1]) {
    return path.resolve(args[1]);
  }
  throw new Error('用法：node scripts/build-release.js [--output <folder>]');
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `${command} 执行失败`);
  }
  return result.stdout;
}

function main() {
  const outputPath = parseOutputPath(process.argv.slice(2));
  fs.mkdirSync(outputPath, { recursive: true });

  run('npm', ['run', 'build']);
  const packed = JSON.parse(run('npm', [
    'pack',
    '--json',
    '--pack-destination',
    outputPath,
  ]));
  const [release] = packed;
  const asset = release.filename;
  const assetPath = path.join(outputPath, asset);
  const sha256 = crypto
    .createHash('sha256')
    .update(fs.readFileSync(assetPath))
    .digest('hex');
  const checksum = `${asset}.sha256`;
  fs.writeFileSync(
    path.join(outputPath, checksum),
    `${sha256}  ${asset}\n`,
    'utf8'
  );

  process.stdout.write(`${JSON.stringify({
    ok: true,
    action: 'release-pack',
    version: packageJson.version,
    tag: `v${packageJson.version}`,
    outputPath,
    asset,
    checksum,
    sha256,
  })}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
