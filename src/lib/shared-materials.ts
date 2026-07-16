import { validateQuotes } from './pack-manifest';
import {
  materialsFilePath,
  materialsStateFilePath,
  toWikiPath,
} from './pack-paths';
import {
  MaterialPublication,
  renderMaterials,
} from './pack-publication';
import {
  planSharedPublication,
  planSharedRetraction,
  SharedPublicationPlan,
  SharedPublicationAdapter,
  SharedRetractionPlan,
} from './shared-publication';
import { PackState } from './pack-state';

export type SharedMaterialsPlan = SharedPublicationPlan;
export type SharedMaterialsRetractionPlan = SharedRetractionPlan;

export async function planSharedMaterialsPublication(input: {
  vaultRoot: string;
  state: PackState;
  sourceTitle: string;
  sourceWikiPath: string;
  sourceBody: string;
  approvedItems: Set<string>;
  now: string;
}): Promise<SharedMaterialsPlan> {
  const { state, vaultRoot } = input;
  const existingOutput = state.outputs.find((output) => output.kind === 'L3');
  const currentPublication: MaterialPublication = {
    state,
    materials: state.manifest.materials.filter(
      (material) => input.approvedItems.has(material.id)
    ),
    packWikiPath: toWikiPath(vaultRoot, state.packFile),
    publishedAt: existingOutput?.publishedAt || input.now,
  };
  return planSharedPublication({
    vaultRoot,
    state,
    file: materialsFilePath(
      vaultRoot,
      state.manifest.sourceFile,
      state.manifest.sourceUrl
    ),
    stateFile: materialsStateFilePath(vaultRoot, state.manifest.sourceUrl),
    sourceTitle: input.sourceTitle,
    sourceWikiPath: input.sourceWikiPath,
    now: input.now,
    currentPublication,
    adapter: materialsAdapter(input.sourceBody),
  });
}

export async function planSharedMaterialsRetraction(input: {
  vaultRoot: string;
  state: PackState;
  sourceTitle: string;
  sourceWikiPath: string;
  sourceBody: string;
  remainingItems: Set<string>;
  now: string;
}): Promise<SharedMaterialsRetractionPlan> {
  const { state, vaultRoot } = input;
  const existingOutput = state.outputs.find((output) => output.kind === 'L3');
  if (!existingOutput) {
    throw new Error('内部错误：加工包缺少 L3 输出');
  }
  const materials = state.manifest.materials.filter(
    (material) => input.remainingItems.has(material.id)
  );
  const currentPublication: MaterialPublication | null = materials.length > 0
    ? {
      state,
      materials,
      packWikiPath: toWikiPath(vaultRoot, state.packFile),
      publishedAt: existingOutput.publishedAt,
    }
    : null;
  return planSharedRetraction({
    vaultRoot,
    state,
    file: materialsFilePath(
      vaultRoot,
      state.manifest.sourceFile,
      state.manifest.sourceUrl
    ),
    stateFile: materialsStateFilePath(vaultRoot, state.manifest.sourceUrl),
    sourceTitle: input.sourceTitle,
    sourceWikiPath: input.sourceWikiPath,
    now: input.now,
    currentPublication,
    adapter: materialsAdapter(input.sourceBody),
  });
}

function materialsAdapter(
  sourceBody: string
): SharedPublicationAdapter<MaterialPublication> {
  return {
    kind: 'L3',
    label: '共享 L3',
    itemIdPattern: /^L3-\d{2}$/,
    fromStoredState: materialPublication,
    itemIdsOf: (publication) =>
      publication.materials.map((material) => material.id),
    validatePublications: (publications) => validateQuotes(
      publications.flatMap((publication) => publication.materials),
      sourceBody
    ),
    render: renderMaterials,
  };
}

function materialPublication(state: PackState, vaultRoot: string): MaterialPublication {
  const output = state.outputs.find((candidate) => candidate.kind === 'L3');
  if (!output) {
    throw new Error('内部错误：加工包缺少 L3 输出');
  }
  const selected = new Set(output.itemIds);
  return {
    state,
    materials: state.manifest.materials.filter((material) => selected.has(material.id)),
    packWikiPath: toWikiPath(vaultRoot, state.packFile),
    publishedAt: output.publishedAt,
  };
}
