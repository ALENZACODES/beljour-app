/** W89 editable occasion bundles. Author: John Khan. */
import { competenceClaim, editBundle, scaleBundle, serialiseBundle } from "../occasion.js";
export function planW89(name = "everyday", amount = 1, changes = {}) { const recipe = serialiseBundle(scaleBundle(editBundle(name, changes), amount)); return { recipe, editable: true, competenceClaim: competenceClaim(), passed: recipe.editable && !competenceClaim() }; }
export const passDefinitionW89 = "all bundle controls editable; interview preset never equates makeup with competence";
//# sourceMappingURL=w89_occasion.js.map