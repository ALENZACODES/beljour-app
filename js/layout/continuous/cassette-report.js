/** Metadata-only audit of the local replay cassette. Author: John Khan. */
import { CASSETTE_CARDS, cassetteById } from "./cassette-contract.js";
export function cassetteAudit(snapshot) {
    const ids = snapshot.observed.filter((id) => cassetteById(id) !== null);
    return Object.freeze({
        format: "beljour-cassette-audit/1",
        listedIds: Object.freeze(CASSETTE_CARDS.map((card) => card.id)),
        observedIds: Object.freeze(ids),
        providerScreensEnabled: snapshot.providerScreensEnabled,
        providerRequests: 0,
        unitsSpent: 0,
        photoUploaded: false,
        realFaceTested: false,
        productionProviderVerified: false,
        releaseGatePassed: false,
    });
}
export function serializeCassetteAudit(report) {
    if (report.format !== "beljour-cassette-audit/1")
        throw new Error("Invalid audit format");
    if (report.providerRequests !== 0 || report.unitsSpent !== 0 || report.photoUploaded
        || report.realFaceTested || report.productionProviderVerified || report.releaseGatePassed) {
        throw new Error("An illustrative result cannot become independent release evidence");
    }
    if (report.listedIds.length !== CASSETTE_CARDS.length
        || report.listedIds.some((id, index) => id !== CASSETTE_CARDS[index].id)) {
        throw new Error("Catalogue identifiers do not match the local fixture");
    }
    const seen = new Set();
    for (const id of report.observedIds) {
        if (!cassetteById(id) || seen.has(id))
            throw new Error("Unknown or duplicate cache result");
        seen.add(id);
    }
    const serialized = JSON.stringify(report, null, 2);
    if (serialized.length > 2048)
        throw new Error("Audit exceeds metadata bound");
    return serialized;
}
/** Refuse arbitrary imported records, extra fields and forged pass declarations. */
export function parseCassetteAudit(source) {
    if (typeof source !== "string" || source.length > 2048)
        throw new TypeError("Invalid audit file");
    const parsed = JSON.parse(source);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new TypeError("Invalid audit document");
    }
    const record = parsed;
    const expected = [
        "format", "listedIds", "observedIds", "providerScreensEnabled", "providerRequests",
        "unitsSpent", "photoUploaded", "realFaceTested", "productionProviderVerified", "releaseGatePassed",
    ];
    if (Object.keys(record).length !== expected.length
        || expected.some((key) => !Object.hasOwn(record, key))) {
        throw new Error("Unexpected audit fields");
    }
    if (!Array.isArray(record.observedIds) || !Array.isArray(record.listedIds)
        || typeof record.providerScreensEnabled !== "boolean") {
        throw new TypeError("Invalid audit status");
    }
    const audit = record;
    serializeCassetteAudit(audit);
    return audit;
}
