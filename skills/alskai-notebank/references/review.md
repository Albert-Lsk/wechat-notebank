# Review and publishing

Load this reference only when the user wants to inspect or act on an existing processing pack, or immediately after the processing route creates a pending pack and the user continues into review.

Use the installed `alskai-notebank` CLI for every lifecycle change. The Agent presents candidates, asks questions, preserves user language, and translates explicit choices into stable IDs; the CLI owns validation, publication, links, hashes, state, rollback, and deletion safety.

## Present the pack before acting

Use `result.packFile` and `result.stateFile` returned by processing. If the user later supplies only a visible pack path, read its Frontmatter `packId` and use the corresponding `<vault>/.alskai-notebank/packs/<packId>/state.json`, where `<vault>` is the parent of the `Inbox` containing that pack. Do not search for or guess a different pack.

Read the visible pack and present every L2, L3, and L4 candidate with its stable ID and enough content for an informed decision. State the processing goal and revision. Keep direct quotes visibly distinct from paraphrases, cases, data, and Agent interpretations.

Ask for an explicit approval, rejection, or deferral. Offer all approval, partial approval by stable IDs, reject the remaining candidates, or continue later in one concise prompt. Accept natural-language selections such as “keep L2-01 and L3-02” only when they map unambiguously to IDs; otherwise clarify before changing state.

`autoProcess` is not approval and must never be treated as approval. A previous approval for another pack, goal, or revision is also not approval. Do not run `pack approve` until the user explicitly selects the candidates in the current pack. Creating a pending pack, displaying candidates, or answering L4 questions never grants publication permission.

## Collect L4 answers without publishing

Ask every unanswered `L4-Qxx` question exactly as shown in the visible pack. The user may answer all questions together or continue later. Do not answer on the user's behalf and do not turn an inferred opinion into a user answer.

Preserve the initial Manifest fields and every candidate exactly. Add `reviewAnswers` with each user's exact, verbatim answer keyed by its question ID. Put only the Agent-authored synthesis in `reviewDraft`, clearly treating it as an Agent draft rather than the user's original language. Never delete or rewrite an answer already recorded for the current revision.

Read `state.manifest` from the resolved state file as the machine source of truth. Copy it to a temporary JSON document, append the new answers and Agent draft, and preserve every existing field byte-for-byte at the value level. Do not edit the hidden state file; `pack update` is the only writer. Never reconstruct Manifest data from rendered candidate prose in the visible pack.

Run:

```text
alskai-notebank pack update "<pack path>" --manifest "<temporary manifest-with-answers.json>" --json
```

Parse and report `result.answeredQuestionIds` and `result.hasReviewDraft`, then remove the temporary file. A partial answer update is allowed and does not publish L4. Before offering L4 approval, ensure every L4 question has a recorded user answer and the user has seen the Agent draft.

## Execute the user's explicit lifecycle choice

Translate only the current user's unambiguous selection into a comma-separated list of stable IDs.

Approve selected candidates, including a partial selection, with:

```text
alskai-notebank pack approve "<pack path>" --items "<comma-separated IDs>" --json
```

L2 and L3 may be approved independently. Approve every L4 question together in one command, only after all user answers and the Agent draft have been recorded and explicitly accepted for publication. Do not silently add unselected IDs to make the pack complete.

Reject a pending or partial pack only when the user explicitly rejects the remaining candidates:

```text
alskai-notebank pack reject "<pack path>" --json
```

Reject applies to pending or partial review; use revoke instead when the user wants to remove content that was already published. Rejecting a partial pack preserves its previously published files and links.

Revoke only IDs the user explicitly names as previously published:

```text
alskai-notebank pack revoke "<pack path>" --items "<comma-separated IDs>" --json
```

Revoke every published L4 question from the current pack together. Never use revoke for candidates that were never published.

If the user chooses later or defers the decision, leave the pending or partial pack unchanged and run no command.

## Interpret lifecycle results

Always parse the single JSON document on stdout, including on exit code `1`.

- For approve, report `result.approvedItems`, `result.publishedFiles`, and whether the status is `partial`, `approved`, or `unchanged`.
- For reject, report the `rejected` status and make clear that any already approved items remain published.
- For revoke, report `result.revokedItems`, `result.removedFiles`, `result.publishedFiles`, and whether the status is `revoked` or `unchanged`.
- On `DERIVED_FILE_MODIFIED`, stop and explain which generated file has user edits. Do not delete, overwrite, unlink, or repair it manually.
- On any other error, report the stable error code and message. Do not imitate a failed lifecycle operation with direct file edits.

Repeated lifecycle commands can return `unchanged`; report this as an idempotent result, not a failure. Apart from reading the resolved state file as machine truth, never inspect unrelated hidden state or edit source, pack, state, derived files, links, or hashes yourself.
