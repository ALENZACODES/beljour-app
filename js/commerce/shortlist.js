export const CATEGORY_ORDER = ['complexion', 'cheek', 'lip', 'prep', 'finish'];
export function normalizeOptions(input, concerns) {
    const p = {
        budget_cents: input.budget_cents ?? 6000,
        category: input.category ?? 'all',
        goal: input.goal ?? 'balanced',
        max_items: input.max_items ?? 8,
        visual_only: input.visual_only ?? false,
        coverage: input.coverage ?? 'any',
        preferred_concern: input.preferred_concern ?? null,
    };
    if (!Number.isInteger(p.budget_cents) || p.budget_cents < 0 || p.budget_cents > 100_000) {
        throw Error('Sample budget must be integer cents up to 100000');
    }
    if (!['all', ...CATEGORY_ORDER].includes(p.category))
        throw Error('Unknown category');
    if (!['balanced', 'lower-cost', 'visual-try-on', 'shade-first'].includes(p.goal))
        throw Error('Unknown shortlist goal');
    if (!Number.isInteger(p.max_items) || p.max_items < 1 || p.max_items > 16)
        throw Error('Max 1..16 sample products');
    if (typeof p.visual_only !== 'boolean')
        throw Error('Visual-only must be explicit');
    if (!['any', 'none', 'sheer', 'medium'].includes(p.coverage))
        throw Error('Unknown coverage');
    if (p.preferred_concern !== null && !concerns.includes(p.preferred_concern))
        throw Error('Unknown cosmetic concern');
    return p;
}
function canonical(candidate, catalogue) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate))
        return null;
    const row = candidate;
    const display = row.product;
    if (!display || typeof display !== 'object')
        return null;
    const original = catalogue.find(p => p.id === display.id);
    if (!original || original.name !== display.name || original.price_cents !== display.price_cents ||
        original.category !== display.category || original.swatch !== display.swatch ||
        original.depth !== display.depth || original.undertone !== display.undertone ||
        !Number.isInteger(row.score) || (row.score ?? -1) < 0 || (row.score ?? 0) > 1000)
        return null;
    return { product: original, score: row.score };
}
function explain(product, base, p) {
    const value = p.budget_cents - product.price_cents;
    const price_bonus = p.goal === 'lower-cost' ? Math.min(30, Math.max(0, Math.floor(value / 300))) : 0;
    const visualization_bonus = product.vto && p.goal === 'visual-try-on' ? 17 : 0;
    const concern_bonus = p.preferred_concern && product.concerns.includes(p.preferred_concern) ? 14 : 0;
    const shade = p.goal === 'shade-first' && product.category === 'complexion' ? 10 : 0;
    const reason_codes = ['owned_sample_product', 'within_user_sample_budget', 'base_rank_verified'];
    if (price_bonus)
        reason_codes.push('sample_cost_preference');
    if (visualization_bonus)
        reason_codes.push('optional_vto_available');
    if (concern_bonus)
        reason_codes.push('cosmetic_sorting_focus');
    if (shade)
        reason_codes.push('depth_undertone_hard_gate_in_base_rank');
    return { product, base_score: base, price_bonus, visualization_bonus, concern_bonus,
        score: base + price_bonus + visualization_bonus + concern_bonus + shade, reason_codes,
        sample_price_cents: product.price_cents, currency: 'CAD', sample: true,
        notice: 'Fictional sample comparison, not a verified real product recommendation.' };
}
function sorted(entries) {
    return entries.slice().sort((a, b) => b.score - a.score ||
        a.sample_price_cents - b.sample_price_cents ||
        (a.product.id < b.product.id ? -1 : a.product.id > b.product.id ? 1 : 0));
}
function threePiece(entries, budget) {
    const groups = ['complexion', 'cheek', 'lip'].map(category => entries.filter(e => e.product.category === category && e.product.vto !== null));
    if (groups.some(g => g.length === 0))
        return null;
    let best = null;
    for (const face of groups[0])
        for (const cheek of groups[1])
            for (const lip of groups[2]) {
                const cost = face.sample_price_cents + cheek.sample_price_cents + lip.sample_price_cents;
                if (cost > budget)
                    continue;
                const score = face.score + cheek.score + lip.score;
                const candidate = { products: [face.product.id, cheek.product.id, lip.product.id],
                    subtotal_cents: cost, total_score: score, currency: 'CAD', checkout_enabled: false,
                    tax_and_shipping_included: false, simulated: true,
                    notice: 'Not a purchase quote; these items and prices are fictional.' };
                const key = (c) => [-c.total_score, c.subtotal_cents, c.products.join('|')];
                if (!best) {
                    best = candidate;
                    continue;
                }
                const a = key(candidate), b = key(best);
                if (a[0] < b[0] || a[0] === b[0] && (a[1] < b[1] || a[1] === b[1] && a[2] < b[2]))
                    best = candidate;
            }
    return best;
}
export function buildShortlist(catalogue, ranked, input = {}, concerns = []) {
    const p = normalizeOptions(input, concerns);
    if (ranked.length > 32)
        throw Error('Excessive rank count');
    const seen = new Set();
    let excluded_budget = 0, excluded_preferences = 0, discarded_untrusted_rows = 0;
    const all = [];
    for (const raw of ranked) {
        const record = canonical(raw, catalogue);
        if (!record || seen.has(record.product.id)) {
            discarded_untrusted_rows++;
            continue;
        }
        seen.add(record.product.id);
        if (record.product.price_cents > p.budget_cents) {
            excluded_budget++;
            continue;
        }
        if (p.category !== 'all' && record.product.category !== p.category ||
            p.visual_only && record.product.vto === null ||
            p.coverage !== 'any' && record.product.coverage !== p.coverage) {
            excluded_preferences++;
            continue;
        }
        all.push(explain(record.product, record.score, p));
    }
    const candidates = sorted(all), items = [];
    if (p.category === 'all') {
        const groups = new Map(CATEGORY_ORDER.map(c => [c, candidates.filter(x => x.product.category === c)]));
        while (items.length < p.max_items && [...groups.values()].some(v => v.length)) {
            for (const category of CATEGORY_ORDER) {
                if (items.length >= p.max_items)
                    break;
                const next = groups.get(category)?.shift();
                if (next)
                    items.push(next);
            }
        }
    }
    else
        items.push(...candidates.slice(0, p.max_items));
    return { version: 'beljour-shopping-shortlist-r19c/1', source: 'owned-catalogue',
        budget_cents: p.budget_cents, items, three_piece: threePiece(candidates, p.budget_cents),
        excluded_budget, excluded_preferences, discarded_untrusted_rows, provider_calls: 0,
        simulated: true, checkout_enabled: false,
        notice: 'Illustrative Canadian-dollar samples only; no inventory, taxes, shipping or verified shade match.' };
}
