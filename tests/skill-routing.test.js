const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const skillRoot = path.join(projectRoot, 'skills', 'alskai-notebank');
const entryPath = path.join(skillRoot, 'SKILL.md');
const archiveReferencePath = path.join(skillRoot, 'references', 'archive.md');
const openAiMetadataPath = path.join(skillRoot, 'agents', 'openai.yaml');
const claudeCommandPath = path.join(
  projectRoot,
  '.claude',
  'commands',
  'alskai-notebank.md'
);

const entry = fs.readFileSync(entryPath, 'utf8');
const publicSkillEntries = fs.readdirSync(path.join(projectRoot, 'skills'))
  .filter((entryName) => fs.existsSync(
    path.join(projectRoot, 'skills', entryName, 'SKILL.md')
  ));
assert.deepStrictEqual(publicSkillEntries, ['alskai-notebank']);
assert.match(entry, /^---\nname: alskai-notebank\n/m);
assert.match(entry, /references\/archive\.md/);
assert.match(entry, /Agent[^\n]*(interface|操作界面)/i);
assert.match(entry, /CLI[^\n]*(deterministic|确定性)/i);
assert.doesNotMatch(entry, /alskai-notebank (fetch|import)/);

assert.ok(fs.existsSync(archiveReferencePath));
const archiveReference = fs.readFileSync(archiveReferencePath, 'utf8');
assert.match(archiveReference, /alskai-notebank fetch [^\n]*--json/);
assert.match(archiveReference, /alskai-notebank import [^\n]*--json/);
assert.match(archiveReference, /(multiple|多个)[^\n]*(URL|链接)/i);
assert.match(archiveReference, /result\.savedFile/);
assert.match(archiveReference, /SOURCE_URL_EXISTS/);
assert.match(archiveReference, /exit code is `1`/);
assert.match(archiveReference, /result\.items/);
assert.match(archiveReference, /`partial`/);
assert.match(archiveReference, /stderr/);
assert.match(archiveReference, /result\.autoProcess/);
assert.match(archiveReference, /result\.processingGoal/);
assert.match(archiveReference, /current request[^\n]*result\.processingGoal/i);
assert.match(archiveReference, /only save[^\n]*autoProcess/i);
assert.match(archiveReference, /osascript/);
assert.match(archiveReference, /set -e/);
assert.match(archiveReference, /close theDocument saving no/);
assert.match(archiveReference, /rm -rf/);
assert.doesNotMatch(archiveReference, /\bpack\b|\bL[234]\b|审核|approve/i);

const claudeCommand = fs.readFileSync(claudeCommandPath, 'utf8');
assert.match(claudeCommand, /(Use|使用)[^\n]*`?alskai-notebank`?[^\n]*(skill|Skill)/i);
assert.doesNotMatch(claudeCommand, /alskai-notebank (fetch|import)/);

const openAiMetadata = fs.readFileSync(openAiMetadataPath, 'utf8');
assert.match(openAiMetadata, /default_prompt: [^\n]*\$alskai-notebank/);

const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-notebank-skill-'));
const installResult = spawnSync('bash', ['scripts/install-skills.sh'], {
  cwd: projectRoot,
  encoding: 'utf8',
  env: {
    ...process.env,
    HOME: tempHome,
  },
});
assert.strictEqual(installResult.status, 0, installResult.stderr || installResult.stdout);
for (const target of [
  path.join(tempHome, '.claude', 'skills', 'alskai-notebank', 'references', 'archive.md'),
  path.join(tempHome, '.codex', 'skills', 'alskai-notebank', 'references', 'archive.md'),
  path.join(tempHome, '.agents', 'skills', 'alskai-notebank', 'references', 'archive.md'),
]) {
  assert.ok(fs.existsSync(target), `installed skill should include ${target}`);
}

console.log('skill routing tests passed');
