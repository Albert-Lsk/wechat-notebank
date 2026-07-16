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
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateInitialManifest = validateInitialManifest;
exports.validatePackManifest = validatePackManifest;
exports.initialManifestOf = initialManifestOf;
exports.validateQuotes = validateQuotes;
exports.normalizeProcessingGoal = normalizeProcessingGoal;
exports.computePackId = computePackId;
exports.computeSourceId = computeSourceId;
exports.canonicalJson = canonicalJson;
exports.requireObject = requireObject;
const crypto_1 = require("crypto");
const path = __importStar(require("path"));
const command_error_1 = require("./command-error");
function validateInitialManifest(value, sourceFile) {
    return validateManifest(value, sourceFile, false);
}
function validatePackManifest(value, sourceFile) {
    return validateManifest(value, sourceFile, true);
}
function initialManifestOf(manifest) {
    return {
        schemaVersion: manifest.schemaVersion,
        sourceFile: manifest.sourceFile,
        sourceUrl: manifest.sourceUrl,
        processingGoal: manifest.processingGoal,
        atomicNotes: manifest.atomicNotes,
        materials: manifest.materials,
        reviewQuestions: manifest.reviewQuestions,
    };
}
function validateManifest(value, sourceFile, allowReviewContent) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new command_error_1.CommandError('MANIFEST_INVALID', 'Manifest 必须是 JSON 对象');
    }
    const manifest = value;
    const allowedFields = new Set([
        'schemaVersion',
        'sourceFile',
        'sourceUrl',
        'processingGoal',
        'atomicNotes',
        'materials',
        'reviewQuestions',
        ...(allowReviewContent ? ['reviewAnswers', 'reviewDraft'] : []),
    ]);
    const unknownFields = Object.keys(manifest).filter((field) => !allowedFields.has(field));
    if (unknownFields.length > 0) {
        throw new command_error_1.CommandError('MANIFEST_INVALID', `Manifest 包含未知字段: ${unknownFields.join(', ')}`);
    }
    if (manifest.schemaVersion !== 1) {
        throw new command_error_1.CommandError('MANIFEST_INVALID', 'schemaVersion 只接受 1');
    }
    if (path.resolve(String(manifest.sourceFile || '')) !== sourceFile) {
        throw new command_error_1.CommandError('MANIFEST_INVALID', 'Manifest sourceFile 与命令参数不一致');
    }
    if (typeof manifest.sourceUrl !== 'string' || !manifest.sourceUrl.trim()) {
        throw new command_error_1.CommandError('MANIFEST_INVALID', 'Manifest sourceUrl 无效');
    }
    if (manifest.processingGoal !== null && typeof manifest.processingGoal !== 'string') {
        throw new command_error_1.CommandError('MANIFEST_INVALID', 'processingGoal 必须是字符串或 null');
    }
    for (const key of ['atomicNotes', 'materials', 'reviewQuestions']) {
        if (!Array.isArray(manifest[key])) {
            throw new command_error_1.CommandError('MANIFEST_INVALID', `${key} 必须是数组`);
        }
    }
    validateAtomicNotes(manifest.atomicNotes);
    validateMaterials(manifest.materials);
    validateReviewQuestions(manifest.reviewQuestions);
    const atomicNotes = manifest.atomicNotes;
    const materials = manifest.materials;
    const reviewQuestions = manifest.reviewQuestions;
    const reviewAnswers = allowReviewContent
        ? validateReviewAnswers(manifest.reviewAnswers, reviewQuestions)
        : undefined;
    const reviewDraft = allowReviewContent
        ? validateReviewDraft(manifest.reviewDraft, reviewAnswers)
        : undefined;
    return {
        schemaVersion: 1,
        sourceFile,
        sourceUrl: manifest.sourceUrl.trim(),
        processingGoal: normalizeProcessingGoal(manifest.processingGoal),
        atomicNotes: atomicNotes.map((note) => ({
            id: note.id,
            title: note.title,
            claim: note.claim,
            evidence: note.evidence,
            boundary: note.boundary,
            useCases: [...note.useCases],
        })),
        materials: materials.map((material) => ({
            id: material.id,
            kind: material.kind,
            title: material.title,
            content: material.content,
            sourceSection: material.sourceSection,
        })),
        reviewQuestions: reviewQuestions.map((question) => ({
            id: question.id,
            question: question.question,
        })),
        ...(reviewAnswers ? { reviewAnswers } : {}),
        ...(reviewDraft ? { reviewDraft } : {}),
    };
}
function validateQuotes(materials, sourceBody) {
    for (const material of materials) {
        if (material.kind === 'quote' && !sourceBody.includes(material.content)) {
            throw new command_error_1.CommandError('QUOTE_NOT_FOUND', `直接引用 ${material.id} 未在原文中精确命中`);
        }
    }
}
function normalizeProcessingGoal(value) {
    if (value === null) {
        return null;
    }
    return value.trim() || null;
}
function computePackId(sourceUrl, processingGoal) {
    return (0, crypto_1.createHash)('sha256')
        .update(`${sourceUrl}\n${processingGoal ?? '__general__'}`)
        .digest('hex');
}
function computeSourceId(sourceUrl) {
    return (0, crypto_1.createHash)('sha256').update(sourceUrl).digest('hex');
}
function canonicalJson(value) {
    if (Array.isArray(value)) {
        return `[${value.map(canonicalJson).join(',')}]`;
    }
    if (value && typeof value === 'object') {
        const record = value;
        return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}
function validateAtomicNotes(value) {
    const notes = value;
    if (notes.length > 99) {
        throw new command_error_1.CommandError('MANIFEST_INVALID', 'atomicNotes 最多包含 99 项');
    }
    const ids = new Set();
    for (const [index, entry] of notes.entries()) {
        const label = `atomicNotes[${index}]`;
        const note = requireObject(entry, label);
        assertExactFields(note, ['id', 'title', 'claim', 'evidence', 'boundary', 'useCases'], label);
        const id = requireString(note.id, `${label}.id`);
        if (ids.has(id)) {
            throw new command_error_1.CommandError('MANIFEST_INVALID', `候选 ID 重复: ${id}`);
        }
        const expectedId = `L2-${String(index + 1).padStart(2, '0')}`;
        if (id !== expectedId) {
            throw new command_error_1.CommandError('MANIFEST_INVALID', `${label}.id 必须是 ${expectedId}`);
        }
        ids.add(id);
        for (const field of ['title', 'claim', 'evidence', 'boundary']) {
            requireString(note[field], `${label}.${field}`);
        }
        if (!Array.isArray(note.useCases) ||
            note.useCases.some((useCase) => typeof useCase !== 'string' || !useCase.trim())) {
            throw new command_error_1.CommandError('MANIFEST_INVALID', `${label}.useCases 必须是字符串数组`);
        }
    }
}
function validateMaterials(value) {
    const materials = value;
    if (materials.length > 99) {
        throw new command_error_1.CommandError('MANIFEST_INVALID', 'materials 最多包含 99 项');
    }
    const ids = new Set();
    for (const [index, entry] of materials.entries()) {
        const label = `materials[${index}]`;
        const material = requireObject(entry, label);
        assertExactFields(material, ['id', 'kind', 'title', 'content', 'sourceSection'], label);
        const id = requireString(material.id, `${label}.id`);
        if (ids.has(id)) {
            throw new command_error_1.CommandError('MANIFEST_INVALID', `候选 ID 重复: ${id}`);
        }
        const expectedId = `L3-${String(index + 1).padStart(2, '0')}`;
        if (id !== expectedId) {
            throw new command_error_1.CommandError('MANIFEST_INVALID', `${label}.id 必须是 ${expectedId}`);
        }
        ids.add(id);
        if (!['quote', 'paraphrase', 'case', 'data'].includes(String(material.kind))) {
            throw new command_error_1.CommandError('MANIFEST_INVALID', `${label}.kind 无效`);
        }
        for (const field of ['title', 'content', 'sourceSection']) {
            requireString(material[field], `${label}.${field}`);
        }
    }
}
function validateReviewQuestions(value) {
    const questions = value;
    if (questions.length > 99) {
        throw new command_error_1.CommandError('MANIFEST_INVALID', 'reviewQuestions 最多包含 99 项');
    }
    const ids = new Set();
    for (const [index, entry] of questions.entries()) {
        const label = `reviewQuestions[${index}]`;
        const question = requireObject(entry, label);
        assertExactFields(question, ['id', 'question'], label);
        const id = requireString(question.id, `${label}.id`);
        if (ids.has(id)) {
            throw new command_error_1.CommandError('MANIFEST_INVALID', `候选 ID 重复: ${id}`);
        }
        const expectedId = `L4-Q${String(index + 1).padStart(2, '0')}`;
        if (id !== expectedId) {
            throw new command_error_1.CommandError('MANIFEST_INVALID', `${label}.id 必须是 ${expectedId}`);
        }
        ids.add(id);
        requireString(question.question, `${label}.question`);
    }
}
function validateReviewAnswers(value, questions) {
    if (value === undefined) {
        return undefined;
    }
    const answers = requireObject(value, 'reviewAnswers');
    const questionIds = new Set(questions.map((question) => question.id));
    const answerIds = Object.keys(answers);
    if (answerIds.length === 0) {
        throw new command_error_1.CommandError('MANIFEST_INVALID', 'reviewAnswers 至少需要一条用户回答');
    }
    const unknownIds = answerIds.filter((id) => !questionIds.has(id));
    if (unknownIds.length > 0) {
        throw new command_error_1.CommandError('MANIFEST_INVALID', `reviewAnswers 包含未知问题: ${unknownIds.join(', ')}`);
    }
    for (const id of answerIds) {
        requireString(answers[id], `reviewAnswers.${id}`);
    }
    return Object.fromEntries(questions
        .filter((question) => Object.prototype.hasOwnProperty.call(answers, question.id))
        .map((question) => [question.id, answers[question.id]]));
}
function validateReviewDraft(value, answers) {
    if (value === undefined) {
        return undefined;
    }
    if (!answers) {
        throw new command_error_1.CommandError('MANIFEST_INVALID', 'reviewDraft 必须建立在用户原始回答上');
    }
    requireString(value, 'reviewDraft');
    return value;
}
function requireObject(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new command_error_1.CommandError('MANIFEST_INVALID', `${label} 必须是对象`);
    }
    return value;
}
function assertExactFields(value, allowedFields, label) {
    const allowed = new Set(allowedFields);
    const unknownFields = Object.keys(value).filter((field) => !allowed.has(field));
    if (unknownFields.length > 0) {
        throw new command_error_1.CommandError('MANIFEST_INVALID', `${label} 包含未知字段: ${unknownFields.join(', ')}`);
    }
}
function requireString(value, label) {
    if (typeof value !== 'string' || !value.trim()) {
        throw new command_error_1.CommandError('MANIFEST_INVALID', `${label} 必须是非空字符串`);
    }
    return value;
}
