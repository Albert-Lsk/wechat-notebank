import { createHash } from 'crypto';
import * as path from 'path';
import { CommandError } from './command-error';

export interface InitialManifest {
  schemaVersion: 1;
  sourceFile: string;
  sourceUrl: string;
  processingGoal: string | null;
  atomicNotes: AtomicNote[];
  materials: Material[];
  reviewQuestions: ReviewQuestion[];
}

export interface PackManifest extends InitialManifest {
  reviewAnswers?: Record<string, string>;
  reviewDraft?: string;
}

export interface AtomicNote {
  id: string;
  title: string;
  claim: string;
  evidence: string;
  boundary: string;
  useCases: string[];
}

export interface Material {
  id: string;
  kind: 'quote' | 'paraphrase' | 'case' | 'data';
  title: string;
  content: string;
  sourceSection: string;
}

export interface ReviewQuestion {
  id: string;
  question: string;
}

export function validateInitialManifest(
  value: unknown,
  sourceFile: string
): InitialManifest {
  return validateManifest(value, sourceFile, false);
}

export function validatePackManifest(
  value: unknown,
  sourceFile: string
): PackManifest {
  return validateManifest(value, sourceFile, true);
}

export function initialManifestOf(manifest: PackManifest): InitialManifest {
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

function validateManifest(
  value: unknown,
  sourceFile: string,
  allowReviewContent: boolean
): PackManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CommandError('MANIFEST_INVALID', 'Manifest 必须是 JSON 对象');
  }
  const manifest = value as Record<string, unknown>;
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
  const unknownFields = Object.keys(manifest).filter(
    (field) => !allowedFields.has(field)
  );
  if (unknownFields.length > 0) {
    throw new CommandError(
      'MANIFEST_INVALID',
      `Manifest 包含未知字段: ${unknownFields.join(', ')}`
    );
  }
  if (manifest.schemaVersion !== 1) {
    throw new CommandError('MANIFEST_INVALID', 'schemaVersion 只接受 1');
  }
  if (path.resolve(String(manifest.sourceFile || '')) !== sourceFile) {
    throw new CommandError('MANIFEST_INVALID', 'Manifest sourceFile 与命令参数不一致');
  }
  if (typeof manifest.sourceUrl !== 'string' || !manifest.sourceUrl.trim()) {
    throw new CommandError('MANIFEST_INVALID', 'Manifest sourceUrl 无效');
  }
  if (manifest.processingGoal !== null && typeof manifest.processingGoal !== 'string') {
    throw new CommandError('MANIFEST_INVALID', 'processingGoal 必须是字符串或 null');
  }
  for (const key of ['atomicNotes', 'materials', 'reviewQuestions']) {
    if (!Array.isArray(manifest[key])) {
      throw new CommandError('MANIFEST_INVALID', `${key} 必须是数组`);
    }
  }
  validateAtomicNotes(manifest.atomicNotes);
  validateMaterials(manifest.materials);
  validateReviewQuestions(manifest.reviewQuestions);
  const atomicNotes = manifest.atomicNotes as AtomicNote[];
  const materials = manifest.materials as Material[];
  const reviewQuestions = manifest.reviewQuestions as ReviewQuestion[];
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
    processingGoal: normalizeProcessingGoal(manifest.processingGoal as string | null),
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

export function validateQuotes(materials: Material[], sourceBody: string): void {
  for (const material of materials) {
    if (material.kind === 'quote' && !sourceBody.includes(material.content)) {
      throw new CommandError(
        'QUOTE_NOT_FOUND',
        `直接引用 ${material.id} 未在原文中精确命中`
      );
    }
  }
}

export function normalizeProcessingGoal(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  return value.trim() || null;
}

export function computePackId(sourceUrl: string, processingGoal: string | null): string {
  return createHash('sha256')
    .update(`${sourceUrl}\n${processingGoal ?? '__general__'}`)
    .digest('hex');
}

export function computeSourceId(sourceUrl: string): string {
  return createHash('sha256').update(sourceUrl).digest('hex');
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(
      (key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`
    ).join(',')}}`;
  }
  return JSON.stringify(value);
}

function validateAtomicNotes(value: unknown): void {
  const notes = value as unknown[];
  if (notes.length > 99) {
    throw new CommandError('MANIFEST_INVALID', 'atomicNotes 最多包含 99 项');
  }
  const ids = new Set<string>();
  for (const [index, entry] of notes.entries()) {
    const label = `atomicNotes[${index}]`;
    const note = requireObject(entry, label);
    assertExactFields(
      note,
      ['id', 'title', 'claim', 'evidence', 'boundary', 'useCases'],
      label
    );
    const id = requireString(note.id, `${label}.id`);
    if (ids.has(id)) {
      throw new CommandError('MANIFEST_INVALID', `候选 ID 重复: ${id}`);
    }
    const expectedId = `L2-${String(index + 1).padStart(2, '0')}`;
    if (id !== expectedId) {
      throw new CommandError('MANIFEST_INVALID', `${label}.id 必须是 ${expectedId}`);
    }
    ids.add(id);
    for (const field of ['title', 'claim', 'evidence', 'boundary']) {
      requireString(note[field], `${label}.${field}`);
    }
    if (
      !Array.isArray(note.useCases) ||
      note.useCases.some((useCase) => typeof useCase !== 'string' || !useCase.trim())
    ) {
      throw new CommandError('MANIFEST_INVALID', `${label}.useCases 必须是字符串数组`);
    }
  }
}

function validateMaterials(value: unknown): void {
  const materials = value as unknown[];
  if (materials.length > 99) {
    throw new CommandError('MANIFEST_INVALID', 'materials 最多包含 99 项');
  }
  const ids = new Set<string>();
  for (const [index, entry] of materials.entries()) {
    const label = `materials[${index}]`;
    const material = requireObject(entry, label);
    assertExactFields(
      material,
      ['id', 'kind', 'title', 'content', 'sourceSection'],
      label
    );
    const id = requireString(material.id, `${label}.id`);
    if (ids.has(id)) {
      throw new CommandError('MANIFEST_INVALID', `候选 ID 重复: ${id}`);
    }
    const expectedId = `L3-${String(index + 1).padStart(2, '0')}`;
    if (id !== expectedId) {
      throw new CommandError('MANIFEST_INVALID', `${label}.id 必须是 ${expectedId}`);
    }
    ids.add(id);
    if (!['quote', 'paraphrase', 'case', 'data'].includes(String(material.kind))) {
      throw new CommandError('MANIFEST_INVALID', `${label}.kind 无效`);
    }
    for (const field of ['title', 'content', 'sourceSection']) {
      requireString(material[field], `${label}.${field}`);
    }
  }
}

function validateReviewQuestions(value: unknown): void {
  const questions = value as unknown[];
  if (questions.length > 99) {
    throw new CommandError('MANIFEST_INVALID', 'reviewQuestions 最多包含 99 项');
  }
  const ids = new Set<string>();
  for (const [index, entry] of questions.entries()) {
    const label = `reviewQuestions[${index}]`;
    const question = requireObject(entry, label);
    assertExactFields(question, ['id', 'question'], label);
    const id = requireString(question.id, `${label}.id`);
    if (ids.has(id)) {
      throw new CommandError('MANIFEST_INVALID', `候选 ID 重复: ${id}`);
    }
    const expectedId = `L4-Q${String(index + 1).padStart(2, '0')}`;
    if (id !== expectedId) {
      throw new CommandError('MANIFEST_INVALID', `${label}.id 必须是 ${expectedId}`);
    }
    ids.add(id);
    requireString(question.question, `${label}.question`);
  }
}

function validateReviewAnswers(
  value: unknown,
  questions: ReviewQuestion[]
): Record<string, string> | undefined {
  if (value === undefined) {
    return undefined;
  }
  const answers = requireObject(value, 'reviewAnswers');
  const questionIds = new Set(questions.map((question) => question.id));
  const answerIds = Object.keys(answers);
  if (answerIds.length === 0) {
    throw new CommandError('MANIFEST_INVALID', 'reviewAnswers 至少需要一条用户回答');
  }
  const unknownIds = answerIds.filter((id) => !questionIds.has(id));
  if (unknownIds.length > 0) {
    throw new CommandError(
      'MANIFEST_INVALID',
      `reviewAnswers 包含未知问题: ${unknownIds.join(', ')}`
    );
  }
  for (const id of answerIds) {
    requireString(answers[id], `reviewAnswers.${id}`);
  }
  return Object.fromEntries(
    questions
      .filter((question) => Object.prototype.hasOwnProperty.call(answers, question.id))
      .map((question) => [question.id, answers[question.id] as string])
  );
}

function validateReviewDraft(
  value: unknown,
  answers: Record<string, string> | undefined
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!answers) {
    throw new CommandError('MANIFEST_INVALID', 'reviewDraft 必须建立在用户原始回答上');
  }
  requireString(value, 'reviewDraft');
  return value as string;
}

export function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CommandError('MANIFEST_INVALID', `${label} 必须是对象`);
  }
  return value as Record<string, unknown>;
}

function assertExactFields(
  value: Record<string, unknown>,
  allowedFields: string[],
  label: string
): void {
  const allowed = new Set(allowedFields);
  const unknownFields = Object.keys(value).filter((field) => !allowed.has(field));
  if (unknownFields.length > 0) {
    throw new CommandError(
      'MANIFEST_INVALID',
      `${label} 包含未知字段: ${unknownFields.join(', ')}`
    );
  }
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new CommandError('MANIFEST_INVALID', `${label} 必须是非空字符串`);
  }
  return value;
}
