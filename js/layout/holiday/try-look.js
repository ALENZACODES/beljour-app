/**
 * The studio side of a Holiday Engine suggestion: turn "try=filters:C40" or "try=portrait:PL13"
 * into one look step at that look's own gentle default strength, ready for the editor to add as
 * a layer on the photo she has open. Only looks that exist in this build are accepted; a portrait
 * look still runs only when that photo's own face points have been read (its usual readiness rule).
 * Kept apart from engine.ts so Home never loads the look catalogues.
 * Author: John Khan.
 */
import { catalogue } from "../../filters/recipe/registry.js";
import { defaultFilterParams } from "../../filters/runtime/layer.js";
import { defaultPortraitParams } from "../../filters/portrait/layer.js";
import { portraitLook } from "../../filters/portrait/looks.js";
import { parseTry } from "./engine.js";
export function tryStep(value) {
    const target = parseTry(value);
    if (!target)
        return null;
    if (target.studio === "portrait") {
        const look = portraitLook(target.id);
        if (!look)
            return null;
        return { step: { kind: "portrait", strength: look.recipe.defaults.strength, params: defaultPortraitParams(look.id) }, name: look.name };
    }
    const recipe = catalogue().recipes.find((r) => r.id === target.id);
    if (!recipe)
        return null;
    return { step: { kind: "filters", strength: recipe.defaults.strength, params: defaultFilterParams(recipe.id) }, name: recipe.name };
}
//# sourceMappingURL=try-look.js.map