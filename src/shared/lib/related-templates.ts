/**
 * Topically related Master Library templates.
 *
 * Pure client-side similarity heuristic. No external NLP dependency, no
 * server-side ranking. Runs over the already-fetched Master Library snapshot,
 * so there is no extra DB round trip.
 */

/** Small English stoplist — kept inline to avoid an external dependency. */
const STOPWORDS: ReadonlySet<string> = new Set([
    'the', 'a', 'an', 'and', 'or', 'of', 'to', 'for', 'in', 'on',
    'with', 'by', 'is', 'are', 'be', 'this', 'that', 'it', 'as', 'at',
]);

const MIN_TOKEN_LENGTH = 3;

export interface ScoreInput {
    title?: string | null;
    description?: string | null;
}

export interface RankableTemplate {
    id: string;
    title?: string | null;
    description?: string | null;
}

const tokenize = (text: string | null | undefined): Set<string> => {
    if (!text) return new Set();
    const tokens = text.toLowerCase().match(/[a-z0-9]+/g);
    if (!tokens) return new Set();
    const out = new Set<string>();
    for (const tok of tokens) {
        if (tok.length < MIN_TOKEN_LENGTH) continue;
        if (STOPWORDS.has(tok)) continue;
        out.add(tok);
    }
    return out;
};

const intersectionSize = (a: Set<string>, b: Set<string>): number => {
    const [small, large] = a.size <= b.size ? [a, b] : [b, a];
    let n = 0;
    for (const tok of small) if (large.has(tok)) n += 1;
    return n;
};

const unionSize = (a: Set<string>, b: Set<string>): number => {
    if (a.size === 0) return b.size;
    if (b.size === 0) return a.size;
    return a.size + b.size - intersectionSize(a, b);
};

/**
 * Score how topically related two templates are.
 *
 * @returns a non-negative number; 0 means "no shared non-stopword tokens".
 * Values are bounded in `[0, 1]` by construction.
 */
export function scoreRelatedness(seed: ScoreInput, candidate: ScoreInput): number {
    const seedTitle = tokenize(seed.title);
    const seedDesc = tokenize(seed.description);
    const candTitle = tokenize(candidate.title);
    const candDesc = tokenize(candidate.description);

    const titleInter = intersectionSize(seedTitle, candTitle);
    const descInter = intersectionSize(seedDesc, candDesc);
    const titleUnion = unionSize(seedTitle, candTitle);
    const descUnion = unionSize(seedDesc, candDesc);

    const numerator = 2 * titleInter + descInter;
    const denominator = 2 * titleUnion + descUnion;
    if (denominator === 0) return 0;
    return numerator / denominator;
}

/**
 * Rank candidates by relatedness to the seed, dropping the seed itself and
 * returning at most `limit` items.
 *
 * Ties break by title ascending for deterministic ordering across renders.
 */
export function rankRelated<T extends RankableTemplate>(
    seed: { id?: string } & ScoreInput,
    candidates: readonly T[],
    limit = 5,
): T[] {
    const seedId = seed.id;
    const scored: Array<{ item: T; score: number }> = [];
    for (const cand of candidates) {
        if (seedId !== undefined && cand.id === seedId) continue;
        const score = scoreRelatedness(seed, cand);
        if (score <= 0) continue;
        scored.push({ item: cand, score });
    }
    scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const at = a.item.title ?? '';
        const bt = b.item.title ?? '';
        if (at < bt) return -1;
        if (at > bt) return 1;
        return 0;
    });
    return scored.slice(0, limit).map((entry) => entry.item);
}
