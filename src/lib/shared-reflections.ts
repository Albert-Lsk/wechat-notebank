import { CommandError } from './command-error';
import {
  reflectionFilePath,
  reflectionStateFilePath,
  toWikiPath,
} from './pack-paths';
import {
  ReflectionPublication,
  renderReflections,
} from './pack-publication';
import {
  planSharedPublication,
  SharedPublicationPlan,
} from './shared-publication';
import { PackState } from './pack-state';

export type SharedReflectionPlan = SharedPublicationPlan;

export async function planSharedReflectionPublication(input: {
  vaultRoot: string;
  state: PackState;
  sourceTitle: string;
  sourceWikiPath: string;
  now: string;
}): Promise<SharedReflectionPlan> {
  const { state, vaultRoot } = input;
  assertCompleteReview(state);
  const existingOutput = state.outputs.find((output) => output.kind === 'L4');
  const currentPublication: ReflectionPublication = {
    state,
    packWikiPath: toWikiPath(vaultRoot, state.packFile),
    publishedAt: existingOutput?.publishedAt || input.now,
  };
  return planSharedPublication({
    vaultRoot,
    state,
    file: reflectionFilePath(
      vaultRoot,
      state.manifest.sourceFile,
      state.manifest.sourceUrl
    ),
    stateFile: reflectionStateFilePath(vaultRoot, state.manifest.sourceUrl),
    sourceTitle: input.sourceTitle,
    sourceWikiPath: input.sourceWikiPath,
    now: input.now,
    currentPublication,
    adapter: {
      kind: 'L4',
      label: '共享 L4',
      itemIdPattern: /^L4-Q\d{2}$/,
      fromStoredState: reflectionPublication,
      itemIdsOf: (publication) =>
        publication.state.manifest.reviewQuestions.map((question) => question.id),
      validatePublications: (publications) => {
        for (const publication of publications) {
          assertCompleteReview(publication.state);
        }
      },
      render: renderReflections,
    },
  });
}

function assertCompleteReview(state: PackState): void {
  const answers = state.manifest.reviewAnswers;
  if (
    !answers ||
    state.manifest.reviewQuestions.some((question) => answers[question.id] === undefined) ||
    !state.manifest.reviewDraft
  ) {
    throw new CommandError(
      'MANIFEST_INVALID',
      'L4 发布需要所有问题的用户原始回答与 Agent 整理稿'
    );
  }
}

function reflectionPublication(state: PackState, vaultRoot: string): ReflectionPublication {
  const output = state.outputs.find((candidate) => candidate.kind === 'L4');
  if (!output) {
    throw new Error('内部错误：加工包缺少 L4 输出');
  }
  assertCompleteReview(state);
  return {
    state,
    packWikiPath: toWikiPath(vaultRoot, state.packFile),
    publishedAt: output.publishedAt,
  };
}
