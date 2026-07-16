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
  return manifest as unknown as InitialManifest;
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
  const ids = new Set<string>();
  for (const [index, entry] of notes.entries()) {
    const label = `atomicNotes[${index}]`;
    const note = requireObject(entry, label);
    const id = requireString(note.id, `${label}.id`);
    if (!/^L2-\d{2}$/.test(id)) {
      throw new CommandError('MANIFEST_INVALID', `${label}.id 必须使用 L2- 加两位数字`);
    }
    if (ids.has(id)) {
      throw new CommandError('MANIFEST_INVALID', `候选 ID 重复: ${id}`);
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
  const ids = new Set<string>();
  for (const [index, entry] of materials.entries()) {
    const label = `materials[${index}]`;
    const material = requireObject(entry, label);
    const id = requireString(material.id, `${label}.id`);
    if (!/^L3-\d{2}$/.test(id)) {
      throw new CommandError('MANIFEST_INVALID', `${label}.id 必须使用 L3- 加两位数字`);
    }
    if (ids.has(id)) {
      throw new CommandError('MANIFEST_INVALID', `候选 ID 重复: ${id}`);
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
  const ids = new Set<string>();
  for (const [index, entry] of questions.entries()) {
    const label = `reviewQuestions[${index}]`;
    const question = requireObject(entry, label);
    const id = requireString(question.id, `${label}.id`);
    if (!/^L4-Q\d{2}$/.test(id)) {
      throw new CommandError('MANIFEST_INVALID', `${label}.id 必须使用 L4-Q 加两位数字`);
    }
    if (ids.has(id)) {
      throw new CommandError('MANIFEST_INVALID', `候选 ID 重复: ${id}`);
    }
    ids.add(id);
    requireString(question.question, `${label}.question`);
  }
}

export function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CommandError('MANIFEST_INVALID', `${label} 必须是对象`);
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new CommandError('MANIFEST_INVALID', `${label} 必须是非空字符串`);
  }
  return value;
}
