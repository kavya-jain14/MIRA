import { randomUUID } from "node:crypto";

import {
  createPost,
  markMemoryPublished,
  type AgentRecord,
} from "../db.js";
import { generateEditorialPost, type SelectionContext } from "./generator.js";
import type { ProcessedCandidate } from "./pipeline.js";

export async function publishCandidate(
  agent: AgentRecord,
  item: ProcessedCandidate,
  selection: SelectionContext,
) {
  if (!item.editorialScore.accepted) {
    return { published: false as const };
  }

  const generated = generateEditorialPost(
    agent,
    item.candidate,
    item.editorialScore,
    selection,
  );
  const id = randomUUID();
  const post = await createPost({
    id,
    agentId: agent.agentId,
    fingerprint: item.fingerprint,
    createdAt: generated.generatedAt,
    text: generated.text,
    rationale: generated.rationale,
    sources: generated.sourceUrls,
  });

  await markMemoryPublished(agent.agentId, item.fingerprint, id);

  return {
    published: true as const,
    post,
  };
}
