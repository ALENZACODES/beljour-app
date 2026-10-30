/** Observational proof page; missing external evidence never becomes a pass. Author: John Khan. */
function integer(value, upper) {
    return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= upper;
}
/** Any included status is derived from actual client state, not manually entered scores. */
export function proofWallReading(value) {
    if (typeof value.drawnLoaded !== "boolean"
        || typeof value.subjectChosen !== "boolean"
        || typeof value.localPermission !== "boolean"
        || typeof value.requestedDownload !== "boolean"
        || typeof value.mockTryon !== "boolean"
        || !integer(value.editCount, 7)
        || !integer(value.cacheFrames, 3)
        || (value.subjectChosen && !value.drawnLoaded)
        || (value.requestedDownload && (!value.drawnLoaded || !value.localPermission))) {
        throw new TypeError("Proof Wall input has invalid client observations");
    }
    const entries = [
        {
            id: "drawn", heading: "Source illustration",
            state: value.drawnLoaded ? "observed" : "pending",
            description: value.drawnLoaded
                ? "Local drawing opened in this visit" : "No drawing opened",
        },
        {
            id: "subject", heading: "Person selected",
            state: value.subjectChosen ? "observed" : "pending",
            description: value.subjectChosen ? "One drawn subject chosen" : "Subject not selected",
        },
        {
            id: "local", heading: "Local edits",
            state: value.editCount > 0 && value.localPermission ? "observed" : "pending",
            description: value.localPermission
                ? `${value.editCount} illustrative edit stages in this session`
                : "No permission to use local edits",
        },
        {
            id: "download", heading: "File handoff",
            state: value.requestedDownload ? "observed" : "pending",
            description: value.requestedDownload
                ? "Download requested; saved file not independently confirmed"
                : "No download requested",
        },
        {
            id: "youcam", heading: "Provider result",
            state: value.mockTryon ? "mock" : "pending",
            description: value.mockTryon
                ? "Mock branch exercised, not a live API response"
                : "Live YouCam result not verified",
        },
        {
            id: "identity", heading: "Identity protection",
            state: "pending", description: "Independent identity gate evidence required",
        },
        {
            id: "real-face", heading: "Real-face quality",
            state: "pending", description: "Representative real-face results required",
        },
        {
            id: "frozen", heading: "100,000-face release",
            state: "pending", description: "Frozen release gate has not been evidenced here",
        },
    ];
    return {
        format: "beljour-editorial-proof/1", entries,
        externalQualityPassed: false,
        liveProviderVerified: false,
        frozen100kPassed: false,
    };
}
export function validateProofWall(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new TypeError("Invalid Proof Wall report");
    }
    const row = value;
    const keys = ["format", "entries", "externalQualityPassed", "liveProviderVerified", "frozen100kPassed"];
    if (Object.keys(row).length !== keys.length || keys.some((key) => !(key in row))
        || row.format !== "beljour-editorial-proof/1"
        || row.externalQualityPassed !== false || row.liveProviderVerified !== false
        || row.frozen100kPassed !== false || !Array.isArray(row.entries)
        || row.entries.length !== 8) {
        throw new Error("Proof Wall cannot assert unverified external results");
    }
    const original = row.entries;
    const ids = ["drawn", "subject", "local", "download", "youcam",
        "identity", "real-face", "frozen"];
    for (let index = 0; index < ids.length; index += 1) {
        const entry = original[index];
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            throw new Error("Invalid Proof Wall row");
        }
        const record = entry;
        if (Object.keys(record).length !== 4 || record.id !== ids[index]
            || typeof record.heading !== "string" || record.heading.length > 48
            || typeof record.description !== "string" || record.description.length > 120
            || !["observed", "mock", "pending"].includes(String(record.state))
            || (index >= 5 && record.state !== "pending")
            || (index === 4 && record.state === "observed")
            || (index !== 4 && record.state === "mock")) {
            throw new Error("Proof Wall contains an unsupported claim");
        }
    }
    return value;
}
function node(doc, tag, className, text) {
    const result = doc.createElement(tag);
    result.className = className;
    if (text !== undefined)
        result.textContent = text;
    return result;
}
/** Compact publication-like data typography without publication mimicry. */
export function renderProofWall(doc, value) {
    const reading = validateProofWall(value);
    const section = node(doc, "section", "lg-editorial-proof");
    section.setAttribute("aria-label", "Proof Wall: observed and pending evidence");
    section.dataset.editorialStage = "page";
    const intro = node(doc, "div", "lg-editorial-proof-intro");
    intro.append(node(doc, "span", "lg-editorial-eyebrow", "Evidence ledger / Local session"));
    intro.append(node(doc, "h3", "lg-editorial-proof-heading", "The Proof Wall"));
    intro.append(node(doc, "p", "lg-editorial-proof-note", "A record of what this browser observed, what was mocked, and what needs independent testing."));
    section.append(intro);
    const table = node(doc, "table", "lg-editorial-proof-table");
    const caption = node(doc, "caption", "lg-editorial-proof-caption", "No synthetic demo can pass a live provider or real-face release gate");
    const head = node(doc, "thead", "");
    const heading = node(doc, "tr", "");
    for (const label of ["Check", "Evidence", "Interpretation"]) {
        const cell = node(doc, "th", "", label);
        cell.setAttribute("scope", "col");
        heading.append(cell);
    }
    head.append(heading);
    const body = node(doc, "tbody", "");
    for (const entry of reading.entries) {
        const row = node(doc, "tr", "");
        row.dataset.proofId = entry.id;
        row.dataset.proofState = entry.state;
        const title = node(doc, "th", "", entry.heading);
        title.setAttribute("scope", "row");
        const status = node(doc, "td", "");
        const statusText = entry.state === "observed" ? "Observed on device"
            : entry.state === "mock" ? "Mock only" : "Not verified";
        status.append(node(doc, "span", "lg-editorial-proof-status", statusText));
        const interpretation = node(doc, "td", "", entry.description);
        row.append(title, status, interpretation);
        body.append(row);
    }
    table.append(caption, head, body);
    section.append(table);
    section.append(node(doc, "p", "lg-editorial-proof-endnote", "No simulated result, manual check or cached illustration is release certification."));
    return section;
}
//# sourceMappingURL=proof.js.map