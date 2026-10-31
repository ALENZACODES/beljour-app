export const REAL_DEMO_CHECKS = [
    {
        id: "photo-open", route: "photo", title: "Actual local photo selected",
        question: "Did the regular Photo lab accept an authorized source and retain the original?",
        limitation: "This does not check decoding quality across devices.",
    },
    {
        id: "studio-edit", route: "studio", title: "Real local edit made",
        question: "Did a supported Studio edit visibly change and restore the selected photo?",
        limitation: "One person's observation cannot replace scored real-face quality.",
    },
    {
        id: "hair-consent", route: "hair", title: "Hair action separately authorized",
        question: "Was the correct hair consent granted before quote and live task start?",
        limitation: "Do not copy this Judge Mode consent into the actual application.",
    },
    {
        id: "hair-response", route: "hair", title: "Real hair-provider response observed",
        question: "Was the provider result or a typed refusal observed in the actual hair flow?",
        limitation: "A simulated hair overlay cannot satisfy this check.",
    },
    {
        id: "makeup-consent", route: "makeup", title: "Makeup action separately authorized",
        question: "Was makeup consent and the permitted-unit quote checked independently?",
        limitation: "The separate mock try-on consent is not valid for a real call.",
    },
    {
        id: "makeup-response", route: "makeup", title: "Real makeup response observed",
        question: "Was a returned provider image or typed refusal actually observed?",
        limitation: "Do not label the local mock as an API result.",
    },
    {
        id: "shade-product", route: "shade", title: "Shade suggestion tied to a catalogue item",
        question: "Does the actual shade result show a traceable catalogue item or a clear estimate?",
        limitation: "The preview alone cannot prove real product shade equivalence.",
    },
    {
        id: "bag-review", route: "commerce", title: "Bag action observed",
        question: "Could an available product be added to a demonstration bag without payment?",
        limitation: "A demo bag is not an actual purchase or inventory check.",
    },
    {
        id: "privacy-deletion", route: "trust", title: "Privacy and deletion reviewed",
        question: "Did the current privacy screen correctly describe and exercise its relevant controls?",
        limitation: "Visual inspection is not a legal or security audit.",
    },
];
const STATUSES = ["not-run", "operator-observed", "blocked"];
const CHECK_IDS = new Set(REAL_DEMO_CHECKS.map((entry) => entry.id));
/** One visit: nothing is persisted, no browser requests are issued. */
export class JudgeLiveChecks {
    entries = new Map();
    disposed = false;
    constructor() {
        this.reset();
    }
    get count() {
        return this.entries.size;
    }
    set(id, status) {
        if (this.disposed || !CHECK_IDS.has(id) || !STATUSES.includes(status))
            return false;
        if (this.entries.get(id) === status)
            return false;
        this.entries.set(id, status);
        return true;
    }
    status(id) {
        if (!CHECK_IDS.has(id))
            throw new RangeError("Unknown manual check");
        return this.entries.get(id) ?? "not-run";
    }
    reset() {
        if (this.disposed)
            return;
        this.entries.clear();
        for (const entry of REAL_DEMO_CHECKS)
            this.entries.set(entry.id, "not-run");
    }
    snapshot() {
        const rows = REAL_DEMO_CHECKS.map((entry) => ({
            id: entry.id,
            title: entry.title,
            route: entry.route,
            question: entry.question,
            limitation: entry.limitation,
            status: this.entries.get(entry.id) ?? "not-run",
        }));
        return {
            rows,
            observed: rows.filter((entry) => entry.status === "operator-observed").length,
            blocked: rows.filter((entry) => entry.status === "blocked").length,
            notRun: rows.filter((entry) => entry.status === "not-run").length,
            provenance: "operator-reported-not-certified",
            verifiedProvider: false,
            releasePassed: false,
        };
    }
    dispose() {
        this.entries.clear();
        this.disposed = true;
    }
}
/** Validate a snapshot before download without trusting caller-owned text. */
export function validateManualChecks(snapshot) {
    const problems = [];
    if (snapshot.provenance !== "operator-reported-not-certified")
        problems.push("Invalid provenance");
    if (snapshot.releasePassed !== false || snapshot.verifiedProvider !== false) {
        problems.push("External checks cannot be certified from Judge Mode");
    }
    if (!Array.isArray(snapshot.rows) || snapshot.rows.length !== REAL_DEMO_CHECKS.length) {
        problems.push("Incorrect manual-check count");
        return problems;
    }
    for (const [index, item] of REAL_DEMO_CHECKS.entries()) {
        const entry = snapshot.rows[index];
        if (!entry || typeof entry !== "object") {
            problems.push(`Missing check at ${index}`);
            continue;
        }
        if (entry.id !== item.id || entry.route !== item.route)
            problems.push(`Invalid check at ${index}`);
        if (!STATUSES.includes(entry.status))
            problems.push(`Invalid status at ${index}`);
        if (entry.title !== item.title || entry.question !== item.question || entry.limitation !== item.limitation) {
            problems.push(`Unrecognized user-supplied text at ${index}`);
        }
    }
    if (problems.length)
        return problems;
    const observed = snapshot.rows.filter((entry) => entry.status === "operator-observed").length;
    const blocked = snapshot.rows.filter((entry) => entry.status === "blocked").length;
    const notRun = snapshot.rows.filter((entry) => entry.status === "not-run").length;
    if (observed !== snapshot.observed || blocked !== snapshot.blocked || notRun !== snapshot.notRun) {
        problems.push("Check counts do not agree with rows");
    }
    return problems;
}
