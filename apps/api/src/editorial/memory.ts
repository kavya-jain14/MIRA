import { createHash } from "node:crypto";

import {
  getMemory,
  listMemories,
  upsertMemory,
  type MemoryRecord,
} from "../db.js";
import type { SourceCandidate } from "../sources/types.js";

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKC")
    .replace(/https?:\/\/www\./g, "https://")
    .replace(/[^a-z0-9\s:/.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";

    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase().startsWith("utm_")) {
        url.searchParams.delete(key);
      }
    }

    return url.toString();
  } catch {
    return normalizeText(value);
  }
}

function tokens(value: string): Set<string> {
  const ignored = new Set([
    "the",
    "and",
    "for",
    "with",
    "from",
    "that",
    "this",
    "into",
    "are",
    "was",
    "has",
    "have",
  ]);

  return new Set(
    normalizeText(value)
      .split(" ")
      .filter((token) => token.length >= 3 && !ignored.has(token)),
  );
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) {
    return 0;
  }

  let intersection = 0;

  for (const value of left) {
    if (right.has(value)) {
      intersection += 1;
    }
  }

  return intersection / (left.size + right.size - intersection);
}

export function createFingerprint(candidate: SourceCandidate): string {
  const stableIdentity = [
    candidate.sourceKind,
    normalizeText(candidate.sourceId),
    canonicalUrl(candidate.url),
    normalizeText(candidate.title),
    candidate.publishedAt,
  ].join("|");

  return createHash("sha256").update(stableIdentity).digest("hex");
}

export class EditorialMemory {
  constructor(private readonly agentId: string) {}

  async has(fingerprint: string): Promise<boolean> {
    return (await getMemory(this.agentId, fingerprint)) !== null;
  }

  async remember(
    candidate: SourceCandidate,
    fingerprint: string,
    observedAt = new Date().toISOString(),
  ): Promise<MemoryRecord> {
    const existing = await getMemory(this.agentId, fingerprint);

    return upsertMemory({
      agentId: this.agentId,
      fingerprint,
      sourceId: candidate.sourceId,
      sourceKind: candidate.sourceKind,
      title: candidate.title,
      summary: candidate.summary,
      canonicalUrl: canonicalUrl(candidate.url),
      firstSeenAt: existing?.firstSeenAt ?? observedAt,
      lastSeenAt: observedAt,
    });
  }

  async similarityToPublished(candidate: SourceCandidate): Promise<number> {
    const candidateTokens = tokens(`${candidate.title} ${candidate.summary}`);
    let highest = 0;

    for (const memory of await listMemories(this.agentId)) {
      if (!memory.publishedPostId) {
        continue;
      }

      highest = Math.max(
        highest,
        jaccard(candidateTokens, tokens(`${memory.title} ${memory.summary}`)),
      );
    }

    return Number(highest.toFixed(3));
  }

  async get(fingerprint: string): Promise<MemoryRecord | undefined> {
    return (await getMemory(this.agentId, fingerprint)) ?? undefined;
  }

  async size(): Promise<number> {
    return (await listMemories(this.agentId)).length;
  }
}
