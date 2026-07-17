const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const skillRoot = path.join(projectRoot, 'skills', 'alskai-notebank');
const entryPath = path.join(skillRoot, 'SKILL.md');
const setupReferencePath = path.join(skillRoot, 'references', 'setup.md');
const archiveReferencePath = path.join(skillRoot, 'references', 'archive.md');
const processingReferencePath = path.join(skillRoot, 'references', 'processing.md');
const reviewReferencePath = path.join(skillRoot, 'references', 'review.md');
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
assert.match(entry, /references\/setup\.md/);
assert.match(entry, /references\/archive\.md/);
assert.match(entry, /references\/processing\.md/);
assert.match(entry, /references\/review\.md/);
assert.match(entry, /(install|update|diagnos|安装|更新|诊断)/i);
assert.match(entry, /Agent[^\n]*(interface|操作界面)/i);
assert.match(entry, /CLI[^\n]*(deterministic|确定性)/i);
assert.doesNotMatch(entry, /alskai-notebank (setup|doctor|fetch|import)/);

assert.ok(fs.existsSync(setupReferencePath));
const setupReference = fs.readFileSync(setupReferencePath, 'utf8');
assert.match(setupReference, /alskai-notebank doctor --json/);
assert.match(setupReference, /alskai-notebank setup --agents <codex\|claude\|codex,claude>/);
assert.match(setupReference, /--dry-run/);
assert.match(setupReference, /v0\.2\.0/);
assert.match(setupReference, /restart|重启/i);
assert.doesNotMatch(setupReference, /refs\/heads\/main|\bsudo\b/i);

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
assert.match(archiveReference, /skipped[^\n]*eligible[^\n]*explicit/i);
assert.match(archiveReference, /autoProcess[^\n]*only[^\n]*saved/i);
assert.match(archiveReference, /osascript/);
assert.match(archiveReference, /set -e/);
assert.match(archiveReference, /close theDocument saving no/);
assert.match(archiveReference, /rm -rf/);
assert.doesNotMatch(archiveReference, /\bpack\b|\bL[234]\b|审核|approve/i);

assert.ok(fs.existsSync(processingReferencePath));
const processingReference = fs.readFileSync(processingReferencePath, 'utf8');
assert.match(
  processingReference,
  /alskai-notebank pack create[^\n]*--source[^\n]*--manifest[^\n]*--json/
);
for (const field of [
  'schemaVersion',
  'sourceFile',
  'sourceUrl',
  'processingGoal',
  'atomicNotes',
  'materials',
  'reviewQuestions',
]) {
  assert.match(processingReference, new RegExp(`\\b${field}\\b`));
}
assert.match(processingReference, /L2-01/);
assert.match(processingReference, /L3-01/);
assert.match(processingReference, /L4-Q01/);
assert.match(processingReference, /quote[^\n]*(exact|verbatim)[^\n]*source/i);
assert.match(processingReference, /pending[^\n]*(review|approval)/i);
assert.match(processingReference, /current request[^\n]*(takes precedence|override)/i);
assert.match(processingReference, /result\.processingGoal/);
assert.match(processingReference, /result\.savedFile/);
assert.match(processingReference, /item\.savedFile/);
assert.match(processingReference, /existing L1/i);
assert.match(processingReference, /SOURCE_URL_EXISTS[^\n]*explicit/i);
assert.match(
  processingReference,
  /alskai-notebank fetch[^\n]*--output[^\n]*--json/
);
assert.match(processingReference, /existing L1[^\n]*result\.processingGoal/i);
assert.doesNotMatch(
  processingReference,
  /alskai-notebank pack (approve|reject|revoke)/
);

assert.ok(fs.existsSync(reviewReferencePath));
const reviewReference = fs.readFileSync(reviewReferencePath, 'utf8');
assert.match(reviewReference, /result\.packFile/);
assert.match(reviewReference, /result\.stateFile/);
assert.match(reviewReference, /state\.manifest/);
assert.match(reviewReference, /machine (source of truth|truth)/i);
assert.match(reviewReference, /do not edit[^\n]*hidden state/i);
assert.match(reviewReference, /never reconstruct[^\n]*visible pack/i);
assert.match(reviewReference, /present[^\n]*L2[^\n]*L3[^\n]*L4/i);
assert.match(reviewReference, /explicit[^\n]*(approval|choice|selection)/i);
assert.match(reviewReference, /partial[^\n]*reject[^\n]*(later|continue)/i);
assert.match(reviewReference, /autoProcess[^\n]*(not|never)[^\n]*approval/i);
assert.match(reviewReference, /do not run[^\n]*pack approve[^\n]*until/i);
assert.match(reviewReference, /ask[^\n]*L4-Q/i);
assert.match(reviewReference, /reviewAnswers[^\n]*(exact|verbatim)[^\n]*(user|answer)/i);
assert.match(reviewReference, /reviewDraft[^\n]*Agent/i);
assert.match(
  reviewReference,
  /alskai-notebank pack update[^\n]*--manifest[^\n]*--json/
);
assert.match(reviewReference, /preserve[^\n]*initial Manifest/i);
assert.match(
  reviewReference,
  /alskai-notebank pack approve[^\n]*--items[^\n]*--json/
);
assert.match(
  reviewReference,
  /alskai-notebank pack reject[^\n]*--json/
);
assert.match(
  reviewReference,
  /alskai-notebank pack revoke[^\n]*--items[^\n]*--json/
);
assert.match(reviewReference, /L4[^\n]*(all|every)[^\n]*(together|one command)/i);
assert.match(reviewReference, /reject[^\n]*(pending|partial)[^\n]*revoke/i);
assert.match(reviewReference, /DERIVED_FILE_MODIFIED/);
assert.match(reviewReference, /(later|defer)[^\n]*(no command|do nothing|leave)/i);

const claudeCommand = fs.readFileSync(claudeCommandPath, 'utf8');
assert.match(claudeCommand, /(Use|使用)[^\n]*`?alskai-notebank`?[^\n]*(skill|Skill)/i);
assert.doesNotMatch(claudeCommand, /alskai-notebank (fetch|import)/);

const openAiMetadata = fs.readFileSync(openAiMetadataPath, 'utf8');
assert.match(openAiMetadata, /default_prompt: [^\n]*\$alskai-notebank/);
assert.match(openAiMetadata, /short_description: [^\n]*归档[^\n]*加工[^\n]*审核/);
assert.match(openAiMetadata, /default_prompt: [^\n]*archive/i);
assert.doesNotMatch(openAiMetadata, /default_prompt: [^\n]*(process|review)/i);

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
  path.join(tempHome, '.claude', 'skills', 'alskai-notebank', 'references', 'setup.md'),
  path.join(tempHome, '.claude', 'skills', 'alskai-notebank', 'references', 'archive.md'),
  path.join(tempHome, '.codex', 'skills', 'alskai-notebank', 'references', 'setup.md'),
  path.join(tempHome, '.codex', 'skills', 'alskai-notebank', 'references', 'archive.md'),
  path.join(tempHome, '.agents', 'skills', 'alskai-notebank', 'references', 'setup.md'),
  path.join(tempHome, '.agents', 'skills', 'alskai-notebank', 'references', 'archive.md'),
  path.join(tempHome, '.claude', 'skills', 'alskai-notebank', 'references', 'processing.md'),
  path.join(tempHome, '.codex', 'skills', 'alskai-notebank', 'references', 'processing.md'),
  path.join(tempHome, '.agents', 'skills', 'alskai-notebank', 'references', 'processing.md'),
  path.join(tempHome, '.claude', 'skills', 'alskai-notebank', 'references', 'review.md'),
  path.join(tempHome, '.codex', 'skills', 'alskai-notebank', 'references', 'review.md'),
  path.join(tempHome, '.agents', 'skills', 'alskai-notebank', 'references', 'review.md'),
]) {
  assert.ok(fs.existsSync(target), `installed skill should include ${target}`);
}

console.log('skill routing tests passed');
