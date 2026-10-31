/** Reviewed, sourced seasonal reporting contracts. Author: John Khan.
 * All trend claims arrive through the public catalogue port. No stock trend,
 * style date, publication attribution or result is inferred by this module.
 */
export const SEASON_BOOK_FORMAT = "beljour-season-book/1";
export class SeasonContractError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = "SeasonContractError";
    }
}
const ID = /^[a-z0-9][a-z0-9-]{1,47}$/;
const TONE = /^[A-Za-z0-9][A-Za-z0-9_-]{1,39}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
function record(value, label) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new SeasonContractError("shape", `${label} must be an object`);
    }
    return value;
}
function exactKeys(object, keys, label) {
    for (const key of Object.keys(object)) {
        if (!keys.includes(key)) {
            throw new SeasonContractError("unknown_field", `${label} contains an unknown field`);
        }
    }
    for (const key of keys) {
        if (!(key in object)) {
            throw new SeasonContractError("missing_field", `${label} is missing a field`);
        }
    }
}
function text(value, name, max = 120) {
    if (typeof value !== "string" || value.length === 0 || value.length > max) {
        throw new SeasonContractError("text", `${name} has an invalid length`);
    }
    if (value.trim() !== value || /[\x00-\x1f\x7f]/.test(value)) {
        throw new SeasonContractError("text", `${name} must be plain, single-line text`);
    }
    return value;
}
function id(value, name) {
    const result = text(value, name, 48);
    if (!ID.test(result)) {
        throw new SeasonContractError("id", `${name} contains an invalid identifier`);
    }
    return result;
}
function day(value, name) {
    const result = text(value, name, 10);
    if (!DATE.test(result)) {
        throw new SeasonContractError("date", `${name} must be YYYY-MM-DD`);
    }
    const parsed = new Date(`${result}T12:00:00Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== result) {
        throw new SeasonContractError("date", `${name} is not a calendar day`);
    }
    return result;
}
function release(value) {
    if (value !== "reviewed" && value !== "draft") {
        throw new SeasonContractError("release", "Release must be reviewed or draft");
    }
    return value;
}
function list(value, label, maximum) {
    if (!Array.isArray(value) || value.length > maximum) {
        throw new SeasonContractError("list", `${label} exceeds its size bound`);
    }
    return value;
}
function source(value) {
    const raw = record(value, "source");
    exactKeys(raw, ["publisher", "title", "published", "url"], "source");
    const publisher = text(raw.publisher, "publisher", 80);
    const title = text(raw.title, "source title", 160);
    const published = day(raw.published, "publication date");
    const rawUrl = text(raw.url, "source URL", 600);
    let url;
    try {
        url = new URL(rawUrl);
    }
    catch {
        throw new SeasonContractError("url", "Source URL must be absolute HTTPS");
    }
    if (url.protocol !== "https:" || url.username || url.password || url.hostname.length < 4 ||
        url.hostname === "localhost" || url.hostname.endsWith(".local") ||
        url.hostname.startsWith("127.") || url.hostname === "[::1]") {
        throw new SeasonContractError("url", "Source URL must be a public HTTPS page");
    }
    if (url.href !== rawUrl) {
        throw new SeasonContractError("url", "Source URL must be canonical and unmodified");
    }
    return { publisher, title, published, url: rawUrl };
}
function house(value) {
    const raw = record(value, "house");
    exactKeys(raw, ["id", "name", "reportedTrend", "reportedOn", "release", "sources"], "house");
    const sources = list(raw.sources, "sources", 6).map(source);
    const state = release(raw.release);
    if (state === "reviewed" && sources.length === 0) {
        throw new SeasonContractError("source_missing", "Reviewed trends require a source");
    }
    return {
        id: id(raw.id, "house id"),
        name: text(raw.name, "house name", 90),
        reportedTrend: text(raw.reportedTrend, "reported trend", 180),
        reportedOn: day(raw.reportedOn, "reported date"),
        release: state,
        sources,
    };
}
function look(value) {
    const raw = record(value, "look");
    exactKeys(raw, ["id", "houseId", "name", "toneIds", "release", "status", "note"], "look");
    const tones = list(raw.toneIds, "tone IDs", 12).map((item) => {
        const result = text(item, "tone ID", 40);
        if (!TONE.test(result)) {
            throw new SeasonContractError("tone", "Tone IDs must be explicit catalogue identifiers");
        }
        return result;
    });
    if (new Set(tones).size !== tones.length) {
        throw new SeasonContractError("duplicate_tone", "Tone IDs cannot repeat within a look");
    }
    if (raw.status !== "illustrative" && raw.status !== "available") {
        throw new SeasonContractError("status", "Look status is invalid");
    }
    return {
        id: id(raw.id, "look id"),
        houseId: id(raw.houseId, "house id"),
        name: text(raw.name, "look name", 90),
        toneIds: tones,
        release: release(raw.release),
        status: raw.status,
        note: text(raw.note, "look note", 160),
    };
}
export function validateSeasonBook(value) {
    const raw = record(value, "Season Book");
    exactKeys(raw, [
        "format", "seasonId", "seasonName", "validFrom", "validUntil",
        "reviewedAt", "houses", "looks",
    ], "Season Book");
    if (raw.format !== SEASON_BOOK_FORMAT) {
        throw new SeasonContractError("format", "Unknown Season Book format");
    }
    const validFrom = day(raw.validFrom, "season start");
    const validUntil = day(raw.validUntil, "season end");
    const reviewedAt = day(raw.reviewedAt, "reviewed date");
    if (validUntil < validFrom || reviewedAt > validUntil) {
        throw new SeasonContractError("period", "Season dates are inconsistent");
    }
    const houses = list(raw.houses, "houses", 16).map(house);
    const looks = list(raw.looks, "looks", 80).map(look);
    const houseIds = new Set(houses.map((item) => item.id));
    if (houseIds.size !== houses.length || new Set(looks.map((item) => item.id)).size !== looks.length) {
        throw new SeasonContractError("duplicate", "Season entries must have unique IDs");
    }
    for (const item of houses) {
        if (item.release === "reviewed" && item.reportedOn > reviewedAt) {
            throw new SeasonContractError("date", "A trend cannot be reviewed before it was reported");
        }
        for (const citation of item.sources) {
            if (citation.published > item.reportedOn) {
                throw new SeasonContractError("date", "A citation cannot postdate its reported trend");
            }
        }
    }
    for (const item of looks) {
        if (!houseIds.has(item.houseId)) {
            throw new SeasonContractError("reference", "Look must reference a known trend house");
        }
        const parent = houses.find((candidate) => candidate.id === item.houseId);
        if (item.release === "reviewed" && parent?.release !== "reviewed") {
            throw new SeasonContractError("release", "A reviewed look needs a reviewed trend");
        }
    }
    return {
        format: SEASON_BOOK_FORMAT,
        seasonId: id(raw.seasonId, "season id"),
        seasonName: text(raw.seasonName, "season name", 70),
        validFrom,
        validUntil,
        reviewedAt,
        houses,
        looks,
    };
}
export function visibleSeasonBook(book, today) {
    const date = day(today, "current day");
    if (date < book.validFrom || date > book.validUntil || book.reviewedAt > date) {
        throw new SeasonContractError("out_of_season", "No reviewed season is active for this date");
    }
    const houses = book.houses.filter((item) => item.release === "reviewed");
    const houseIds = new Set(houses.map((item) => item.id));
    const looks = book.looks.filter((item) => item.release === "reviewed" && houseIds.has(item.houseId));
    if (houses.length === 0) {
        throw new SeasonContractError("unreviewed", "No reviewed seasonal sources are available");
    }
    return { ...book, houses, looks };
}
