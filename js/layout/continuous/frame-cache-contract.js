/** Private authority for drawn-frame replay; never serialise an authority key. Author: John Khan. */
import { TOUR_EFFECTS, } from "./contract.js";
export const FRAME_IDS = ["hair", "makeup", "skin"];
export const FRAME_WIDTH = 160;
export const FRAME_HEIGHT = 200;
export const FRAME_MAX_BYTES = 1_048_576;
export const FRAME_TTL_MS = 180_000;
export const FRAME_CAPTIONS = Object.freeze({
    hair: "Illustrative hair colour and highlights. No hairstyle transfer was performed.",
    makeup: "Illustrative cheek colour and style guide. No product fit was verified.",
    skin: "Drawn complexion reference grid. No Skin AI result or diagnosis is available.",
});
export function isFrameId(value) {
    return FRAME_IDS.some((item) => item === value);
}
function levelStamp(state) {
    return TOUR_EFFECTS.map((effect) => state.levels[effect]);
}
/** Revoke all frames on *any* setting or permission revision. */
export function cacheAuthority(state, drawn) {
    if (!drawn || !state.sourceLoaded || state.sourceRevision < 1
        || !Number.isSafeInteger(state.sourceRevision)
        || !["drawn-main", "drawn-second"].includes(state.selectedId ?? "")
        || !state.identityLock || !state.permissions.local
        || !state.permissions.hair || !state.permissions.face
        || (state.mockMode === "mock" && !state.permissions.mock))
        return null;
    if (TOUR_EFFECTS.some((effect) => !Number.isFinite(state.levels[effect])
        || state.levels[effect] < 1 || state.levels[effect] > 5))
        return null;
    const signature = JSON.stringify([
        "beljour-drawn-frame-authority/1",
        state.sourceRevision,
        state.selectedId,
        state.permissions.local,
        state.permissions.hair,
        state.permissions.face,
        state.permissions.mock,
        state.identityLock,
        state.mockMode,
        state.appearanceCue,
        ...levelStamp(state),
        ...TOUR_EFFECTS.map((effect) => state.applied[effect]),
    ]);
    return { signature, mode: state.mockMode };
}
/** Render a family-specific local frame, never an attributed provider result. */
export function stateForFrame(state, id) {
    if (!isFrameId(id))
        throw new RangeError("Unknown cached drawing family");
    const applied = Object.fromEntries(TOUR_EFFECTS.map((effect) => [effect, false]));
    if (id === "hair") {
        applied.hair = true;
        applied.colour = true;
    }
    if (id === "makeup") {
        applied.concealer = true;
        applied.appearance = true;
    }
    if (id === "skin") {
        applied.ratio = true;
    }
    return {
        ...state,
        applied: applied,
        mockResult: "not-requested",
        requestedDownload: false,
    };
}
export function validFrame(frame) {
    if (!isFrameId(frame.id) || frame.width !== FRAME_WIDTH
        || frame.height !== FRAME_HEIGHT || frame.provenance !== "local-rendered-illustration"
        || frame.providerVerified !== false || frame.unitsSpent !== 0)
        return false;
    if (!(frame.rgba instanceof Uint8ClampedArray)
        || frame.rgba.length !== FRAME_WIDTH * FRAME_HEIGHT * 4)
        return false;
    return true;
}
//# sourceMappingURL=frame-cache-contract.js.map