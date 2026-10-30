/** W56 lipstick wear-off orchestration. Author: John Khan. */
import { renderLip } from "../engine.js";
import { monotonicWear } from "../wear.js";
import { photoOf } from "./shared.js";
export function previewW56(pixels, width, height, points, name = "coffee", amount = .6, seed = 17) { const photo = photoOf(pixels, width, height); const result = renderLip(photo, points, { feature: "W56", style: name, amount, seed }); const monotonic = monotonicWear(result.coverage, width, height); return { pixels: result.data, scenario: name, twoHours: monotonic.two_hours, coffee: monotonic.coffee, meal: monotonic.meal, monotonic: monotonic.monotonic === true, passed: monotonic.monotonic === true }; }
export const passDefinitionW56 = "same scenario remains deterministic and stronger wear never increases retained colour";
//# sourceMappingURL=w56_wear.js.map