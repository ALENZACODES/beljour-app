/** R17B local workflow mirror. Author: John Khan. */
import { decodeIntegrity, encodeIntegrity } from "./passport.js";
function validNumber(value, fallback, low, high, name) {
    const result = value ?? fallback;
    if (!Number.isFinite(result) || result < low || result > high)
        throw new RangeError(`${name} outside range`);
    return result;
}
function bankersRound(value) {
    const floor = Math.floor(value);
    const fraction = value - floor;
    if (fraction < 0.5)
        return floor;
    if (fraction > 0.5)
        return floor + 1;
    return floor % 2 === 0 ? floor : floor + 1;
}
export function priceEstimate(low, high, sessions, weeks) {
    if (low < 0 || high < low)
        throw new RangeError("price band order");
    const visits = Math.max(1, bankersRound(52 / Math.max(weeks, 1)));
    const initialLow = low * sessions;
    const initialHigh = high * sessions;
    return {
        initial_low: initialLow,
        initial_high: initialHigh,
        year1_low: initialLow + low * visits,
        year1_high: initialHigh + high * visits,
        maintenance_visits_estimate: visits,
        label: "ESTIMATE from user-entered or sourced price band; no affiliate steering",
    };
}
export function maintenanceCalendar(start, weeks, count = 8) {
    const base = new Date(`${start}T00:00:00Z`);
    if (Number.isNaN(base.getTime()))
        throw new RangeError("invalid start date");
    return Array.from({ length: Math.max(1, Math.min(count, 24)) }, (_, index) => {
        const date = new Date(base);
        date.setUTCDate(date.getUTCDate() + index * weeks * 7);
        return { index, date: date.toISOString().slice(0, 10), label: "estimated maintenance date" };
    });
}
export function passportPayload(options) {
    return {
        schema: "beljour.shade-passport.v1",
        depth: validNumber(options.depth, 0, 0, 100, "depth"),
        undertone: options.undertone ?? "neutral",
        hair_base: options.hair_base ?? "",
        allergens: options.allergens ?? [],
        measured_on: options.measured_on ?? "",
        privacy: "local export; no network transmission",
    };
}
export function encodePassport(payload) {
    return encodeIntegrity(payload);
}
export function decodePassport(text) {
    return decodeIntegrity(text);
}
export function runWorkflow(options) {
    if (options.feature === "W94") {
        return {
            feature: "W94",
            city: options.city ?? "",
            service: options.service ?? "",
            ...priceEstimate(validNumber(options.price_low, 0, 0, 100000, "price_low"), validNumber(options.price_high, 0, 0, 100000, "price_high"), Math.trunc(validNumber(options.sessions, 1, 1, 24, "sessions")), Math.trunc(validNumber(options.maintenance_weeks, 8, 1, 104, "maintenance_weeks"))),
        };
    }
    if (options.feature === "W96") {
        if (!options.occasion || !options.look_id)
            throw new RangeError("occasion and look required");
        return {
            feature: "W96",
            occasion: options.occasion,
            look_id: options.look_id,
            storage: "local recipe reference",
            network: false,
        };
    }
    if (options.feature === "W99") {
        const metadataStart = typeof options.metadata?.start_date === "string" ? options.metadata.start_date : undefined;
        const start = options.start_date ?? metadataStart ?? "2026-10-24";
        return {
            feature: "W99",
            calendar: maintenanceCalendar(start, Math.trunc(validNumber(options.maintenance_weeks, 8, 1, 104, "maintenance_weeks"))),
            label: "estimated maintenance schedule",
        };
    }
    const payload = passportPayload(options);
    return {
        feature: "W100",
        export: encodePassport(payload),
        network: false,
        encrypted: false,
        note: "integrity protected local export; encrypt externally before sharing",
    };
}
