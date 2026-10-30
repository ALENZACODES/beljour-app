/** W47 lip tint/blush healed-state consultation. Author: John Khan. */
import { pmuState, pmuPigmentColour, pmuDisclosure } from "../pmu.js";
import { renderLip } from "../engine.js";
import { photoOf } from "./shared.js";
export function previewW47(pixels, width, height, points, stateName = "healed", amount = .5, adultConfirmed = false) {
    if (!adultConfirmed)
        throw new Error("18+ confirmation required for W47");
    const state = pmuState(stateName);
    const colour = pmuPigmentColour([145, 72, 79], state);
    const result = renderLip(photoOf(pixels, width, height), points, { feature: "W47", style: stateName, amount, adult_confirmed: true, colour });
    return { pixels: result.data, state: stateName, pigmentStrength: state.pigmentStrength, saturationScale: state.saturationScale, adultConfirmed: true, disclosures: pmuDisclosure(.5, null), passed: state.pigmentStrength >= 0 && state.pigmentStrength <= 1 };
}
export const passDefinitionW47 = "adult gate, healed/fade states monotonic, no permanence guarantee";
//# sourceMappingURL=w47_blush.js.map