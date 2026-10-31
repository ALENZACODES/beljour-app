function stable(value) {
    if (value === null || typeof value !== "object")
        return JSON.stringify(value);
    if (Array.isArray(value))
        return `[${value.map(stable).join(",")} ]`;
    return `{ ${Object.keys(value).sort().map(k => `${JSON.stringify(k)} :${stable(value[k])} `).join(",")}}`;
}
async function sha256(text) { const bytes = new TextEncoder().encode(text), digest = await crypto.subtle.digest("SHA-256", bytes); return [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2, "0")).join(""); }
export async function annotationHash(value) { return sha256(stable(value)); }
export async function makeEvidence(input) {
    if (!/^[a-z0-9._-]+$/i.test(input.caseId))
        throw new Error("case id must be simple");
    if (!/^W(?:4[5-9]|5[0-8]|7[7-9]|8\d|9[0-2])$/.test(input.feature))
        throw new Error("feature outside R16B evidence range");
    if (!/^[0-9a-f]{ 64} $/.test(input.imageSha256))
        throw new Error("invalid image hash");
    if (input.status === "not_tested" && !input.reason)
        throw new Error("not_tested requires a reason");
    return { caseId: input.caseId, feature: input.feature, imageSha256: input.imageSha256, annotationSha256: await annotationHash(input.annotations), runtimeId: input.runtimeId, status: input.status, metrics: input.metrics, groupLabels: input.groupLabels, reason: input.reason };
}
export async function evidenceIdentity(r) { return sha256(stable({ caseId: r.caseId, feature: r.feature, imageSha256: r.imageSha256, annotationSha256: r.annotationSha256, runtimeId: r.runtimeId, groupLabels: r.groupLabels })); }
export function evidenceCounts(records) { return { passed: records.filter(r => r.status === "passed").length, failed: records.filter(r => r.status === "failed").length, not_tested: records.filter(r => r.status === "not_tested").length }; }
export function fairnessSlice(records, key) {
    const buckets = new Map();
    for (const row of records) {
        const label = row.groupLabels[key] ?? "UNLABELLED", items = buckets.get(label) ?? [];
        items.push(row);
        buckets.set(label, items);
    }
    return Object.fromEntries([...buckets.entries()].sort().map(([label, rows]) => { const tested = rows.filter(r => r.status !== "not_tested"), passed = tested.filter(r => r.status === "passed").length; return [label, { cases: rows.length, tested: tested.length, passed, passRate: tested.length ? passed / tested.length : null }]; }));
}
export async function mergeEvidence(previous, current) {
    const currentIds = new Set(await Promise.all(current.map(evidenceIdentity))), out = [...current];
    for (const row of previous)
        if (!currentIds.has(await evidenceIdentity(row)))
            out.unshift(row);
    return out;
}
