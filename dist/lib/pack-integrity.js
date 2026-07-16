"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.inspectPackIntegrity = inspectPackIntegrity;
exports.inferVaultRoot = inferVaultRoot;
const crypto_1 = require("crypto");
const fs = __importStar(require("fs-extra"));
const gray_matter_1 = __importDefault(require("gray-matter"));
const path = __importStar(require("path"));
const pack_manifest_1 = require("./pack-manifest");
const pack_paths_1 = require("./pack-paths");
const pack_state_1 = require("./pack-state");
const pack_publication_1 = require("./pack-publication");
const pack_render_1 = require("./pack-render");
async function inspectPackIntegrity(vaultRootInput) {
    const vaultRoot = path.resolve(vaultRootInput);
    const findings = [];
    const states = new Map();
    const referencedPacks = new Set();
    const packsRoot = path.join(vaultRoot, '.alskai-notebank', 'packs');
    const packsInspection = await inspectDirectory(packsRoot, vaultRoot);
    if (packsInspection.status === 'untrusted') {
        findings.push(warning('integrity:scan:packs', `无法可信扫描加工包隐藏状态目录: ${packsRoot}（${packsInspection.message}）`));
    }
    const packDirectories = packsInspection.entries;
    for (const packId of packDirectories) {
        const packDirectory = path.join(packsRoot, packId);
        const directoryStat = await lstatIfExists(packDirectory);
        if (!directoryStat || directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) {
            findings.push(warning(`integrity:pack:${packId}:r?:state`, `加工包隐藏状态目录无效: ${packDirectory}`));
            continue;
        }
        const currentStateFile = path.join(packDirectory, 'state.json');
        const current = await readStoredState(currentStateFile, vaultRoot, packId);
        const revisions = await readRevisionStates(packDirectory, vaultRoot, packId, findings);
        if (!current) {
            const latest = [...revisions].sort((left, right) => right.state.revision - left.state.revision)[0];
            findings.push(warning(`integrity:pack:${packId}:r${latest?.state.revision ?? '?'}:state`, `加工包当前状态缺失或无效: ${currentStateFile}`));
        }
        else {
            registerState(states, current);
            referencedPacks.add(path.resolve(current.state.packFile));
            const revision = revisions.find((candidate) => candidate.state.revision === current.state.revision);
            const revisionStateFile = path.join(packDirectory, 'revisions', `${current.state.revision}.json`);
            if (!revision) {
                findings.push(warning(stateCheckId(current.state), `加工包当前状态缺少 revision 快照: ${currentStateFile}；${revisionStateFile}`));
            }
            else if ((0, pack_state_1.serializePackState)(current.state) !== (0, pack_state_1.serializePackState)(revision.state)) {
                findings.push(warning(stateCheckId(current.state), `加工包当前状态与 revision 快照漂移: ${currentStateFile}；${revision.file}`));
            }
        }
        for (const revision of revisions) {
            registerState(states, revision);
            referencedPacks.add(path.resolve(revision.state.packFile));
        }
    }
    await inspectOrphanVisiblePacks(vaultRoot, referencedPacks, findings);
    for (const stored of states.values()) {
        await inspectStateAssets(vaultRoot, stored.state, findings);
    }
    await inspectSourceManagedRegions(vaultRoot, [...states.values()].map(({ state }) => state), findings);
    await inspectSharedAssets(vaultRoot, [...states.values()].map(({ state }) => state), findings);
    const uniqueFindings = dedupeFindings(findings);
    return [
        uniqueFindings.length === 0
            ? { id: 'integrity', status: 'passed', message: '加工包、生成文件与双链完整' }
            : {
                id: 'integrity',
                status: 'warning',
                message: `发现 ${uniqueFindings.length} 项加工包完整性问题；doctor 仅诊断，不自动修复`,
            },
        ...uniqueFindings,
    ];
}
function inferVaultRoot(archivePathInput) {
    const archivePath = path.resolve(archivePathInput);
    const parsed = path.parse(archivePath);
    const segments = archivePath.slice(parsed.root.length).split(path.sep);
    const l1Index = segments.lastIndexOf('L1_原文');
    return l1Index < 0
        ? archivePath
        : path.join(parsed.root, ...segments.slice(0, l1Index));
}
async function inspectStateAssets(vaultRoot, state, findings) {
    const [sourceContent, packContent] = await Promise.all([
        readRegularTextFile(state.manifest.sourceFile, vaultRoot),
        readRegularTextFile(state.packFile, vaultRoot),
    ]);
    if (!packContent) {
        findings.push(warning(`${stateCheckId(state)}:visible`, `可见加工包缺失或不是普通文件: ${state.packFile}`));
    }
    else {
        inspectVisiblePackState(state, packContent, findings);
    }
    if (!sourceContent) {
        findings.push(warning(`${stateCheckId(state)}:source`, `加工包原文缺失或不是普通文件: ${state.manifest.sourceFile}`));
    }
    else {
        inspectSourceIdentity(state, sourceContent, findings);
    }
    let links = [];
    try {
        links = (0, pack_publication_1.renderPublicationLinks)(vaultRoot, state.outputs, state);
    }
    catch (error) {
        findings.push(warning(`${stateCheckId(state)}:links`, `无法计算加工包双链: ${getMessage(error)}`));
    }
    if (sourceContent) {
        try {
            (0, pack_render_1.derivedRegionLinkLines)(sourceContent);
        }
        catch (error) {
            findings.push(warning(`${packCheckPrefix(state)}:source-links`, `原文衍生内容受控区域损坏: ${state.manifest.sourceFile}（${getMessage(error)}）`));
        }
    }
    if (packContent) {
        try {
            if (!(0, pack_render_1.publishedRegionMatches)(packContent, links.map((link) => link.pack))) {
                findings.push(warning(`${packCheckPrefix(state)}:pack-links`, `加工包已发布内容受控区域与隐藏状态不一致: ${state.packFile}`));
            }
        }
        catch (error) {
            findings.push(warning(`${packCheckPrefix(state)}:pack-links`, `加工包已发布内容受控区域损坏: ${state.packFile}（${getMessage(error)}）`));
        }
    }
    for (const [index, output] of state.outputs.entries()) {
        const itemKey = output.itemIds.join(',');
        if (output.kind === 'L2') {
            const outputContent = await readRegularTextFile(output.file, vaultRoot);
            if (!outputContent) {
                findings.push(warning(`${packCheckPrefix(state)}:output:${itemKey}`, `L2 生成文件缺失或哈希漂移: ${output.file}`));
            }
            else {
                if ((0, pack_publication_1.sha256Content)(outputContent) !== output.sha256) {
                    findings.push(warning(`${packCheckPrefix(state)}:output:${itemKey}`, `L2 生成文件缺失或哈希漂移: ${output.file}`));
                }
                inspectL2Backlinks(vaultRoot, state, outputContent, itemKey, output.file, findings);
            }
        }
        const link = links[index];
        if (link && (!sourceContent || !safeHasDerivedLink(sourceContent, link.source))) {
            findings.push(warning(`${packCheckPrefix(state)}:source-link:${itemKey}`, `原文缺少生成内容双链: ${state.manifest.sourceFile}`));
        }
        if (link && (!packContent || !safeHasPublishedLink(packContent, link.pack))) {
            findings.push(warning(`${packCheckPrefix(state)}:pack-link:${itemKey}`, `可见加工包缺少已发布内容双链: ${state.packFile}`));
        }
    }
    const packLink = `- 待审核加工包：[[${(0, pack_paths_1.toWikiPath)(vaultRoot, state.packFile)}` +
        `|待审核加工包 r${state.revision}]]`;
    if (sourceContent && !safeHasDerivedLink(sourceContent, packLink)) {
        findings.push(warning(`${packCheckPrefix(state)}:source-link:pack`, `原文缺少加工包双链: ${state.manifest.sourceFile}`));
    }
    const sourceWikiPath = (0, pack_paths_1.toWikiPath)(vaultRoot, state.manifest.sourceFile);
    if (packContent && !hasExactPackSourceLink(packContent, sourceWikiPath)) {
        findings.push(warning(`${packCheckPrefix(state)}:pack-link:source`, `可见加工包缺少原文反向链接: ${state.packFile}`));
    }
}
function inspectVisiblePackState(state, content, findings) {
    try {
        const document = (0, gray_matter_1.default)(content);
        const approvedItems = normalizeStringArray(document.data.approvedItems);
        const revokedItems = normalizeStringArray(document.data.revokedItems);
        if (document.data.packId !== state.packId ||
            document.data.revision !== state.revision ||
            document.data.status !== state.status ||
            document.data.sourceFile !== state.manifest.sourceFile ||
            document.data.sourceUrl !== state.manifest.sourceUrl ||
            document.data.createdAt !== state.createdAt ||
            (document.data.processingGoal ?? null) !== state.manifest.processingGoal ||
            (document.data.updatedAt ?? undefined) !== state.updatedAt ||
            (document.data.rejectedAt ?? undefined) !== state.rejectedAt ||
            (document.data.revokedAt ?? undefined) !== state.revokedAt ||
            (document.data.supersededAt ?? undefined) !== state.supersededAt ||
            JSON.stringify(approvedItems) !== JSON.stringify(state.approvedItems) ||
            JSON.stringify(revokedItems) !== JSON.stringify(state.revokedItems)) {
            findings.push(warning(`${stateCheckId(state)}:visible`, `可见加工包与隐藏状态漂移: ${state.packFile}`));
        }
    }
    catch (error) {
        findings.push(warning(`${stateCheckId(state)}:visible`, `可见加工包 Frontmatter 无效: ${state.packFile}（${getMessage(error)}）`));
    }
}
function inspectSourceIdentity(state, content, findings) {
    try {
        const document = (0, gray_matter_1.default)(content);
        if (document.data.sourceUrl !== state.manifest.sourceUrl) {
            throw new Error('sourceUrl 与加工包状态不一致');
        }
    }
    catch (error) {
        findings.push(warning(`${packCheckPrefix(state)}:source-state`, `加工包原文身份与隐藏状态漂移: ${state.manifest.sourceFile}（${getMessage(error)}）`));
    }
}
function inspectL2Backlinks(vaultRoot, state, content, itemKey, outputFile, findings) {
    const sourceWikiPath = (0, pack_paths_1.toWikiPath)(vaultRoot, state.manifest.sourceFile);
    const packWikiPath = (0, pack_paths_1.toWikiPath)(vaultRoot, state.packFile);
    if (!hasExactLabeledWikiLink(content, '原文', sourceWikiPath) ||
        !hasExactLabeledWikiLink(content, '加工包', packWikiPath)) {
        findings.push(warning(`${packCheckPrefix(state)}:output-links:${itemKey}`, `L2 生成文件缺少原文或加工包反向链接: ${outputFile}`));
    }
}
async function inspectSourceManagedRegions(vaultRoot, states, findings) {
    const groups = new Map();
    for (const state of states) {
        const key = `${state.manifest.sourceFile}\n${state.manifest.sourceUrl}`;
        const group = groups.get(key) || [];
        group.push(state);
        groups.set(key, group);
    }
    for (const group of groups.values()) {
        const sourceFile = group[0].manifest.sourceFile;
        const sourceContent = await readRegularTextFile(sourceFile, vaultRoot);
        if (!sourceContent) {
            continue;
        }
        const expected = new Set();
        for (const state of group) {
            expected.add(`- 待审核加工包：[[${(0, pack_paths_1.toWikiPath)(vaultRoot, state.packFile)}` +
                `|待审核加工包 r${state.revision}]]`);
            for (const link of (0, pack_publication_1.renderPublicationLinks)(vaultRoot, state.outputs, state)) {
                expected.add(link.source);
            }
        }
        let matches = false;
        try {
            matches = (0, pack_render_1.derivedRegionMatches)(sourceContent, [...expected]);
        }
        catch {
            matches = false;
        }
        if (matches) {
            continue;
        }
        for (const state of group) {
            findings.push(warning(`${packCheckPrefix(state)}:source-links`, `原文衍生内容受控区域与隐藏状态不一致: ${sourceFile}`));
        }
    }
}
async function inspectSharedAssets(vaultRoot, states, findings) {
    const sourceGroups = new Map();
    for (const state of states) {
        const key = `${state.manifest.sourceFile}\n${state.manifest.sourceUrl}`;
        const group = sourceGroups.get(key) || [];
        group.push(state);
        sourceGroups.set(key, group);
    }
    for (const group of sourceGroups.values()) {
        for (const kind of ['L3', 'L4']) {
            const publications = group.filter((state) => state.outputs.some((output) => output.kind === kind));
            if (publications.length === 0) {
                continue;
            }
            const first = publications[0];
            const sourceUrl = first.manifest.sourceUrl;
            const sourceId = (0, pack_manifest_1.computeSourceId)(sourceUrl);
            const stateFile = kind === 'L3'
                ? (0, pack_paths_1.materialsStateFilePath)(vaultRoot, sourceUrl)
                : (0, pack_paths_1.reflectionStateFilePath)(vaultRoot, sourceUrl);
            const id = `integrity:shared:${kind}:${sourceId}`;
            const loaded = await readSharedState(stateFile, vaultRoot);
            const outputFile = first.outputs.find((output) => output.kind === kind).file;
            const content = await readRegularTextFile(outputFile, vaultRoot);
            if (!loaded || !content) {
                findings.push(warning(id, `共享 ${kind} 文件或隐藏状态缺失: ${outputFile}；${stateFile}`));
                continue;
            }
            const expectedPublications = publications
                .sort(publicationOrder)
                .map((state) => {
                const output = state.outputs.find((candidate) => candidate.kind === kind);
                return {
                    packId: state.packId,
                    revision: state.revision,
                    itemIds: output.itemIds,
                    packFile: state.packFile,
                    publishedAt: output.publishedAt,
                };
            });
            if (loaded.sourceFile !== first.manifest.sourceFile ||
                loaded.sourceUrl !== sourceUrl ||
                path.resolve(loaded.file) !== path.resolve(outputFile) ||
                (0, pack_publication_1.sha256Content)(content) !== loaded.sha256 ||
                JSON.stringify(loaded.publications) !== JSON.stringify(expectedPublications)) {
                findings.push(warning(id, `共享 ${kind} 文件、当前哈希或贡献清单漂移: ${outputFile}；${stateFile}`));
            }
        }
    }
}
async function inspectOrphanVisiblePacks(vaultRoot, referencedPacks, findings) {
    const inbox = path.join(vaultRoot, 'Inbox');
    const inspection = await inspectDirectory(inbox, vaultRoot);
    if (inspection.status === 'untrusted') {
        findings.push(warning('integrity:scan:inbox', `无法可信扫描可见加工包目录: ${inbox}（${inspection.message}）`));
    }
    for (const entry of inspection.entries) {
        if (!entry.endsWith('.md')) {
            continue;
        }
        const file = path.resolve(inbox, entry);
        if (!referencedPacks.has(file) && await looksLikeVisiblePack(file, entry, vaultRoot)) {
            const id = (0, crypto_1.createHash)('sha256').update(file).digest('hex').slice(0, 12);
            findings.push(warning(`integrity:visible:${id}:state`, `可见加工包没有对应隐藏状态: ${file}`));
        }
    }
}
async function looksLikeVisiblePack(file, entry, vaultRoot) {
    const hasPackFileName = /-[a-f0-9]{12}-r\d+\.md$/i.test(entry);
    const content = await readRegularTextFile(file, vaultRoot);
    if (!content) {
        return false;
    }
    try {
        const data = (0, gray_matter_1.default)(content).data;
        const hasIdentity = (typeof data.packId === 'string' &&
            /^[a-f0-9]{64}$/.test(data.packId) &&
            Number.isInteger(data.revision) &&
            typeof data.sourceFile === 'string' &&
            typeof data.sourceUrl === 'string');
        const hasPackHeading = /^# 待审核加工包：.+$/m.test((0, gray_matter_1.default)(content).content);
        return hasIdentity || (hasPackFileName && hasPackHeading);
    }
    catch {
        return false;
    }
}
function hasExactPackSourceLink(content, sourceWikiPath) {
    let body;
    try {
        body = (0, gray_matter_1.default)(content).content;
    }
    catch {
        return false;
    }
    return hasExactLabeledWikiLink(body, '原文', sourceWikiPath);
}
function hasExactLabeledWikiLink(content, label, wikiPath) {
    const lines = content.split('\n').filter((line) => line.startsWith(`${label}：[[`));
    if (lines.length !== 1) {
        return false;
    }
    const prefix = `${label}：[[${wikiPath}|`;
    const line = lines[0];
    if (!line.startsWith(prefix) || !line.endsWith(']]')) {
        return false;
    }
    const alias = line.slice(prefix.length, -2);
    return alias.length > 0 && !alias.includes(']]');
}
async function readRevisionStates(packDirectory, vaultRoot, packId, findings) {
    const revisionsDirectory = path.join(packDirectory, 'revisions');
    const result = [];
    for (const entry of await safeDirectoryEntries(revisionsDirectory)) {
        if (!/^\d+\.json$/.test(entry)) {
            continue;
        }
        const file = path.join(revisionsDirectory, entry);
        const stored = await readStoredState(file, vaultRoot, packId);
        const fileRevision = Number.parseInt(path.basename(entry, '.json'), 10);
        const canonicalFileName = Number.isSafeInteger(fileRevision) &&
            fileRevision >= 1 &&
            entry === `${fileRevision}.json`;
        if (canonicalFileName && stored && stored.state.revision === fileRevision) {
            result.push(stored);
        }
        else {
            findings.push(warning(`integrity:pack:${packId}:r${fileRevision}:state`, stored
                ? `加工包 revision 快照文件名与内部 revision 错位: ${file}`
                : `加工包 revision 状态无效: ${file}`));
        }
    }
    return result;
}
async function readStoredState(file, vaultRoot, packId) {
    const content = await readRegularTextFile(file, vaultRoot);
    if (!content) {
        return null;
    }
    try {
        return {
            state: (0, pack_state_1.validatePackState)(JSON.parse(content), {
                vaultRoot,
                expectedPackId: packId,
            }),
            file,
        };
    }
    catch {
        return null;
    }
}
async function readSharedState(file, vaultRoot) {
    const content = await readRegularTextFile(file, vaultRoot);
    if (!content) {
        return null;
    }
    try {
        const value = JSON.parse(content);
        if (value.schemaVersion !== 1 ||
            typeof value.sourceFile !== 'string' ||
            typeof value.sourceUrl !== 'string' ||
            typeof value.file !== 'string' ||
            typeof value.sha256 !== 'string' ||
            !/^[a-f0-9]{64}$/.test(value.sha256) ||
            !Array.isArray(value.publications)) {
            return null;
        }
        const publications = value.publications.map((entry) => {
            const record = entry;
            if (!record ||
                typeof record.packId !== 'string' ||
                !Number.isInteger(record.revision) ||
                !Array.isArray(record.itemIds) ||
                record.itemIds.some((item) => typeof item !== 'string') ||
                typeof record.packFile !== 'string' ||
                typeof record.publishedAt !== 'string') {
                throw new Error('共享状态贡献项无效');
            }
            return {
                packId: record.packId,
                revision: Number(record.revision),
                itemIds: [...record.itemIds],
                packFile: path.resolve(record.packFile),
                publishedAt: record.publishedAt,
            };
        });
        return {
            sourceFile: path.resolve(value.sourceFile),
            sourceUrl: value.sourceUrl,
            file: path.resolve(value.file),
            sha256: value.sha256,
            publications,
        };
    }
    catch {
        return null;
    }
}
async function readRegularTextFile(file, vaultRoot) {
    if (!(await hasTrustedManagedAncestors(vaultRoot, file))) {
        return null;
    }
    const stat = await lstatIfExists(file);
    if (!stat || stat.isSymbolicLink() || !stat.isFile()) {
        return null;
    }
    try {
        return await fs.readFile(file, 'utf8');
    }
    catch {
        return null;
    }
}
async function inspectDirectory(directory, vaultRoot) {
    if (!(await hasTrustedManagedAncestors(vaultRoot, directory))) {
        return { status: 'untrusted', entries: [], message: '父路径包含符号链接或非目录' };
    }
    let stat;
    try {
        stat = await fs.lstat(directory);
    }
    catch (error) {
        if (error.code === 'ENOENT') {
            return { status: 'missing', entries: [] };
        }
        return { status: 'untrusted', entries: [], message: getMessage(error) };
    }
    if (stat.isSymbolicLink()) {
        return { status: 'untrusted', entries: [], message: '路径是符号链接' };
    }
    if (!stat.isDirectory()) {
        return { status: 'untrusted', entries: [], message: '路径不是目录' };
    }
    try {
        return { status: 'ok', entries: (await fs.readdir(directory)).sort() };
    }
    catch (error) {
        return { status: 'untrusted', entries: [], message: getMessage(error) };
    }
}
async function hasTrustedManagedAncestors(vaultRootInput, targetInput) {
    const vaultRoot = path.resolve(vaultRootInput);
    const target = path.resolve(targetInput);
    const relative = path.relative(vaultRoot, target);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        return false;
    }
    try {
        const rootStat = await fs.lstat(vaultRoot);
        if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
            return false;
        }
    }
    catch {
        return false;
    }
    let current = vaultRoot;
    const parentSegments = relative.split(path.sep).filter(Boolean).slice(0, -1);
    for (const segment of parentSegments) {
        current = path.join(current, segment);
        try {
            const stat = await fs.lstat(current);
            if (stat.isSymbolicLink() || !stat.isDirectory()) {
                return false;
            }
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                return true;
            }
            return false;
        }
    }
    return true;
}
async function safeDirectoryEntries(directory) {
    const stat = await lstatIfExists(directory);
    if (!stat || stat.isSymbolicLink() || !stat.isDirectory()) {
        return [];
    }
    try {
        return (await fs.readdir(directory)).sort();
    }
    catch {
        return [];
    }
}
async function lstatIfExists(file) {
    try {
        return await fs.lstat(file);
    }
    catch (error) {
        if (error.code === 'ENOENT') {
            return null;
        }
        return null;
    }
}
function registerState(states, stored) {
    if (!states.has((0, pack_state_1.packStateKey)(stored.state))) {
        states.set((0, pack_state_1.packStateKey)(stored.state), stored);
    }
}
function stateCheckId(state) {
    return `${packCheckPrefix(state)}:state`;
}
function packCheckPrefix(state) {
    return `integrity:pack:${state.packId}:r${state.revision}`;
}
function warning(id, message) {
    return { id, status: 'warning', message };
}
function safeHasDerivedLink(content, link) {
    try {
        return (0, pack_render_1.hasExactDerivedLink)(content, link);
    }
    catch {
        return false;
    }
}
function safeHasPublishedLink(content, link) {
    try {
        return (0, pack_render_1.hasExactPublishedLink)(content, link);
    }
    catch {
        return false;
    }
}
function normalizeStringArray(value) {
    return Array.isArray(value) && value.every((item) => typeof item === 'string')
        ? [...value]
        : [];
}
function publicationOrder(left, right) {
    return left.createdAt.localeCompare(right.createdAt) ||
        (0, pack_state_1.packStateKey)(left).localeCompare((0, pack_state_1.packStateKey)(right));
}
function dedupeFindings(findings) {
    const unique = new Map();
    for (const finding of findings) {
        const existing = unique.get(finding.id);
        if (existing && existing.message !== finding.message) {
            unique.set(finding.id, {
                ...existing,
                message: `${existing.message}；${finding.message}`,
            });
        }
        else if (!existing) {
            unique.set(finding.id, finding);
        }
    }
    return [...unique.values()];
}
function getMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
