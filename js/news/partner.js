/** The partner spot on the "What's new in beauty" page: one clearly labelled slot kept for future
 * brand partners, empty by default (docs/PARTNER-SPOT.md).
 *
 * web/data/partner-spot.json maps region keys (two-letter country codes, plus "default") to a
 * placement or null. With no config, or one that fails validatePartnerConfig, the page draws no
 * slot at all. With a config but no placement for her region, it draws only the neutral label.
 * A placement is always shown under the word "Sponsored", in its own box apart from the
 * unbranded entries, and only between its start and end dates; nothing here ever invents one.
 *
 * Region: from the browser's own language settings (navigator.languages, "en-CA" gives CA) by
 * default. Only when the operator turns it on (window.BELJOUR_REGION_FROM_API) does the page ask
 * the BELJOUR API's /api/region, which reads a country header the hosting CDN sets and nothing
 * else (api/plumb_api/services/partner_region.py). No third-party lookup, and the page never
 * sends her address anywhere to find a region. Author: John Khan.
 */
import { BANNED_WORDS } from "./terms.js";
import { isDate } from "./feed.js";
export const PARTNER_FORMAT = "beljour-partner-spot/1";
export const PARTNER_PATH = "data/partner-spot.json";
export const NEUTRAL_LABEL = "Partner spot — this space is for future brand partners";
export const SPONSORED = "Sponsored";
export const DEFAULT_REGION = "default";
/** ASSUMED: short enough to read at a glance and to keep a placement from crowding the feed. */
export const LIMITS = { sponsor: 60, headline: 90, body: 280, alt: 140 };
export class PartnerConfigError extends Error {
    where;
    constructor(where, message) {
        super(`${where}: ${message}`);
        this.where = where;
        this.name = "PartnerConfigError";
    }
}
const COUNTRY = /^[A-Z]{2}$/;
const IMAGE = /^assets\/partners\/[a-z0-9][a-z0-9-]{0,62}\.(png|jpe?g|webp)$/;
const PLACEMENT_KEYS = new Set(["sponsor", "headline", "body", "link", "image", "alt", "starts", "ends", "disclosure"]);
function copy(where, value, max) {
    if (typeof value !== "string" || !value.trim())
        throw new PartnerConfigError(where, "must be non-empty text");
    if (value.length > max)
        throw new PartnerConfigError(where, `is longer than ${max} characters`);
    const banned = BANNED_WORDS.exec(value);
    if (banned)
        throw new PartnerConfigError(where, `uses the word "${banned[0]}"`);
    return value;
}
function placement(where, raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
        throw new PartnerConfigError(where, "must be an object or null");
    const p = raw;
    for (const k of Object.keys(p))
        if (!PLACEMENT_KEYS.has(k))
            throw new PartnerConfigError(where, `unknown field ${k}`);
    if (p.disclosure !== SPONSORED)
        throw new PartnerConfigError(`${where}.disclosure`, `must be "${SPONSORED}"`);
    let link;
    try {
        link = new URL(String(p.link));
    }
    catch {
        throw new PartnerConfigError(`${where}.link`, "is not a link");
    }
    if (link.protocol !== "https:")
        throw new PartnerConfigError(`${where}.link`, "must be https");
    if (!isDate(p.starts) || !isDate(p.ends) || p.ends < p.starts)
        throw new PartnerConfigError(`${where}.starts`, "starts and ends must be dates, ends on or after starts");
    const out = {
        sponsor: copy(`${where}.sponsor`, p.sponsor, LIMITS.sponsor), headline: copy(`${where}.headline`, p.headline, LIMITS.headline),
        body: copy(`${where}.body`, p.body, LIMITS.body), link: link.href, starts: p.starts, ends: p.ends, disclosure: SPONSORED,
    };
    if (p.image !== undefined) {
        if (typeof p.image !== "string" || !IMAGE.test(p.image))
            throw new PartnerConfigError(`${where}.image`, "must be a png, jpg or webp under assets/partners/");
        out.image = p.image;
        out.alt = copy(`${where}.alt`, p.alt, LIMITS.alt);
    }
    return out;
}
/** The config, or a PartnerConfigError naming the first thing wrong. */
export function validatePartnerConfig(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
        throw new PartnerConfigError("config", "must be an object");
    const c = raw;
    if (c.format !== PARTNER_FORMAT)
        throw new PartnerConfigError("config.format", `must be ${PARTNER_FORMAT}`);
    if (c.label !== NEUTRAL_LABEL)
        throw new PartnerConfigError("config.label", `must be "${NEUTRAL_LABEL}"`);
    if (!c.regions || typeof c.regions !== "object" || Array.isArray(c.regions))
        throw new PartnerConfigError("config.regions", "must map regions to placements");
    const regions = {};
    for (const [key, value] of Object.entries(c.regions)) {
        if (key !== DEFAULT_REGION && !COUNTRY.test(key))
            throw new PartnerConfigError(`regions.${key}`, "keys are two-letter country codes or default");
        regions[key] = value === null ? null : placement(`regions.${key}`, value);
    }
    if (!(DEFAULT_REGION in regions))
        throw new PartnerConfigError("config.regions", "needs a default key (null is fine)");
    return { format: PARTNER_FORMAT, label: NEUTRAL_LABEL, regions };
}
/** The country in the first browser language that names one ("fr-CA" gives CA), else null. */
export function regionFromLanguages(languages) {
    for (const tag of languages) {
        if (typeof tag !== "string")
            continue;
        for (const part of tag.split(/[-_]/).slice(1)) {
            if (/^[A-Za-z]{2}$/.test(part))
                return part.toUpperCase();
        }
    }
    return null;
}
/** A country code the server reported, when it is a plain two-letter code; XX and T1 are the
 * codes CDNs use for "unknown" and "Tor", so they count as no answer. */
export function cleanServerRegion(value) {
    if (typeof value !== "string")
        return null;
    const v = value.trim().toUpperCase();
    return COUNTRY.test(v) && v !== "XX" ? v : null;
}
/** The region to use: the server's answer when there is one, else the browser's languages, else default. */
export function chooseRegion(server, languages) {
    const fromServer = cleanServerRegion(server);
    if (fromServer)
        return { region: fromServer, source: "server" };
    const fromBrowser = regionFromLanguages(languages);
    if (fromBrowser)
        return { region: fromBrowser, source: "browser" };
    return { region: DEFAULT_REGION, source: "default" };
}
/** What the slot shows for a region on a day: the region's own entry when it has a key (null
 * there means "nothing for this region", not "fall back"), else the default entry. */
export function slotView(config, region, today) {
    if (!config)
        return { show: "none" };
    const key = region in config.regions ? region : DEFAULT_REGION;
    const p = config.regions[key] ?? null;
    if (!p || today < p.starts || today > p.ends)
        return { show: "label", label: config.label };
    return { show: "placement", label: config.label, key, placement: p };
}
