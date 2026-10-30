/** Original-first, photo-free W28/W39 comparison from independent source previews.
 * No option consumes pixels edited by another option. Author: John Khan.
 */
import { parseRecipe, safeRecipe, } from "./consultation.js";
export const MAX_CHOICES = 4;
export const BOARD_FORMAT = "beljour-hair-board/1";
export const BOARD_DISCLOSURE = "Local colour simulations only. Physical results require a strand test.";
const CHOICE_ID = /^[a-z][a-z0-9-]{0,31}$/;
function checkSelections(selections) {
    if (selections.length < 1 || selections.length > MAX_CHOICES) {
        throw new RangeError("choose between one and four independent local styles");
    }
    const keys = new Set();
    for (const item of selections) {
        if (typeof item.key !== "string" || !CHOICE_ID.test(item.key)) {
            throw new RangeError("style choice id must be lowercase letters, digits and hyphens");
        }
        if (keys.has(item.key))
            throw new RangeError("duplicate style id");
        if (item.choice.mode === "W39" && item.strokes !== undefined) {
            throw new RangeError("W39 does not accept balayage placement");
        }
        keys.add(item.key);
    }
}
export function buildBoard(session, selections, options = {}) {
    checkSelections(selections);
    const tiles = [];
    for (const selection of selections) {
        const result = session.render(selection.choice, {
            strokes: selection.strokes,
            guard: options.guard,
            lockLevel: options.lockLevel,
            previewEdge: options.previewEdge,
        });
        tiles.push({
            key: selection.key,
            image: Uint8ClampedArray.from(result.image),
            mode: result.mode,
            level: result.level,
            changedShare: result.changedShare,
            meanDelta: result.meanDelta,
            guardApplied: result.lockApplied,
            disclosure: BOARD_DISCLOSURE,
        });
    }
    return {
        original: Uint8ClampedArray.from(session.original().data),
        tiles,
        disclosure: BOARD_DISCLOSURE,
        realfaceStatus: "unproven",
        countsOnly() {
            return {
                format: BOARD_FORMAT,
                tileCount: tiles.length,
                guardedTiles: tiles.filter((tile) => tile.guardApplied).length,
                realfaceStatus: "unproven",
            };
        },
    };
}
export function safeBoardRecipe(selections) {
    checkSelections(selections);
    return {
        format: BOARD_FORMAT,
        disclosure: BOARD_DISCLOSURE,
        choices: selections.map((item) => ({ id: item.key, recipe: safeRecipe(item.choice) })),
    };
}
export function parseBoardRecipe(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new RangeError("board must be an object");
    }
    const item = value;
    if (Object.keys(item).sort().join("|") !== ["format", "disclosure", "choices"].sort().join("|")) {
        throw new RangeError("unsupported board fields");
    }
    if (item.format !== BOARD_FORMAT || item.disclosure !== BOARD_DISCLOSURE) {
        throw new RangeError("unsupported board version or missing simulation disclosure");
    }
    if (!Array.isArray(item.choices) ||
        item.choices.length < 1 || item.choices.length > MAX_CHOICES) {
        throw new RangeError("board must have one to four choices");
    }
    const selections = item.choices.map((row) => {
        if (!row || typeof row !== "object" || Array.isArray(row)) {
            throw new RangeError("invalid board row");
        }
        const record = row;
        if (Object.keys(record).sort().join("|") !== "id|recipe" || typeof record.id !== "string") {
            throw new RangeError("invalid board row fields");
        }
        return { key: record.id, choice: parseRecipe(record.recipe) };
    });
    checkSelections(selections);
    return selections;
}
//# sourceMappingURL=consultation-board.js.map