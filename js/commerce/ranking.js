export const MAX_MATCHES = 16;
export const CATEGORY_ORDER = ["complexion", "cheek", "lip", "prep", "finish"];
export function assertProfile(profile) {
    if (!Number.isInteger(profile.depth) || profile.depth < 1 || profile.depth > 10 ||
        !["cool", "neutral", "warm", "olive"].includes(profile.undertone) ||
        !["estimate", "manual", "measured"].includes(profile.confidence))
        throw Error("Choose a valid sample shade profile.");
    if (profile.lightness != null && (!Number.isFinite(profile.lightness) || profile.lightness < 0 || profile.lightness > 100)) {
        throw Error("Invalid local lightness estimate");
    }
}
export function scoreOne(product, profile, cosmetic, finish) {
    let score = 0;
    const why = [];
    if (product.depth !== null) {
        if (product.depth !== profile.depth || product.undertone !== profile.undertone)
            return null;
        score += 110;
        why.push(`W6 local depth ${profile.depth} and ${profile.undertone} undertone`);
    }
    else {
        score += 10;
        why.push("Universal sample colour (not a foundation shade)");
    }
    if (product.finish === finish) {
        score += 22;
        why.push(`Your ${finish} finish choice`);
    }
    const relevant = Object.entries(cosmetic).filter(([key]) => product.concerns.includes(key))
        .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
    if (relevant.length) {
        const [concern, rating] = relevant[0];
        score += Math.min(40, Math.max(0, Math.floor((100 - rating) / 2)));
        why.push(`Cosmetic ${concern.replaceAll("_", " ")} focus (${rating}/100, optional)`);
    }
    if (product.category === "complexion")
        score += 17;
    if (product.vto) {
        score += 8;
        why.push("A visual try-on is available");
    }
    return { product, score, why, label: "Fictional sample; cosmetic sorting, not product testing" };
}
export function rank(catalogue, profile, cosmetic = {}, finish = "natural", limit = MAX_MATCHES) {
    assertProfile(profile);
    if (!["natural", "dewy", "satin", "matte"].includes(finish) || !Number.isInteger(limit) || limit < 1 || limit > MAX_MATCHES) {
        throw Error("Invalid sample preferences");
    }
    if (Object.keys(cosmetic).length > 32 || Object.values(cosmetic).some((value) => !Number.isInteger(value) || value < 0 || value > 100)) {
        throw Error("Invalid optional cosmetic scores");
    }
    const sorted = catalogue.map((p) => scoreOne(p, profile, cosmetic, finish))
        .filter((p) => p !== null)
        .sort((a, b) => b.score - a.score || a.product.id.localeCompare(b.product.id));
    const groups = new Map(CATEGORY_ORDER.map((category) => [category, sorted.filter((row) => row.product.category === category)]));
    const out = [];
    while (out.length < limit && [...groups.values()].some((items) => items.length)) {
        for (const category of CATEGORY_ORDER) {
            const next = groups.get(category)?.shift();
            if (next && out.length < limit)
                out.push(next);
        }
    }
    return out;
}
//# sourceMappingURL=ranking.js.map