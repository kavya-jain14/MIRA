import { evaluateSourceSafety } from "./safety.js";
import { createFingerprint, EditorialMemory } from "./memory.js";
import {
  evaluateEditorialPolicy,
  rejectedByHardGate,
  type EditorialScore,
} from "./judge.js";
import type { SourceCandidate } from "../sources/types.js";

export type CandidateDecision = "accepted" | "rejected" | "duplicate";

export interface ProcessedCandidate {
  candidate: SourceCandidate;
  decision: CandidateDecision;
  reasons: string[];
  fingerprint: string;
  seenBefore: boolean;
  similarityToPublished: number;
  editorialScore: EditorialScore;
}

export interface PipelineResult {
  processed: ProcessedCandidate[];
  accepted: ProcessedCandidate[];
  rejected: ProcessedCandidate[];
  duplicates: ProcessedCandidate[];
}

export class EditorialPipeline {
  constructor(
    private readonly memory: EditorialMemory,
    private readonly personaDomain: string,
  ) {}

  async process(
    candidates: SourceCandidate[],
    now = new Date(),
  ): Promise<PipelineResult> {
    const processed: ProcessedCandidate[] = [];

    for (const candidate of candidates) {
      const fingerprint = createFingerprint(candidate);
      const existing = await this.memory.get(fingerprint);
      const seenBefore = existing !== undefined;
      const similarityToPublished =
        await this.memory.similarityToPublished(candidate);

      if (existing?.publishedPostId) {
        await this.memory.remember(candidate, fingerprint, now.toISOString());

        const editorialScore = rejectedByHardGate("near_duplicate", [
          "Rejected because this exact source/topic has already been published.",
        ]);

        processed.push({
          candidate,
          decision: "duplicate",
          reasons: editorialScore.rationale,
          fingerprint,
          seenBefore,
          similarityToPublished: 1,
          editorialScore,
        });
        continue;
      }

      const safety = evaluateSourceSafety(candidate);

      if (!safety.safe) {
        await this.memory.remember(candidate, fingerprint, now.toISOString());

        const editorialScore = rejectedByHardGate(
          "unsafe_source_content",
          safety.reasons,
        );

        processed.push({
          candidate,
          decision: "rejected",
          reasons: editorialScore.rationale,
          fingerprint,
          seenBefore,
          similarityToPublished,
          editorialScore,
        });
        continue;
      }

      const editorialScore = evaluateEditorialPolicy(candidate, {
        personaDomain: this.personaDomain,
        similarityToPublished,
        now,
      });

      await this.memory.remember(candidate, fingerprint, now.toISOString());

      processed.push({
        candidate,
        decision: editorialScore.accepted ? "accepted" : "rejected",
        reasons: editorialScore.rationale,
        fingerprint,
        seenBefore,
        similarityToPublished,
        editorialScore,
      });
    }

    return {
      processed,
      accepted: processed.filter((item) => item.decision === "accepted"),
      rejected: processed.filter((item) => item.decision === "rejected"),
      duplicates: processed.filter((item) => item.decision === "duplicate"),
    };
  }
}
