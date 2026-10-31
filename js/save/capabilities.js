/** One compatibility check for recipes, the visible picker and recovery.
 * Missing geometry disables a step with a reason; it never selects sample geometry.
 * Author: John Khan. */
import { CATALOGUE, readiness } from "../ui/shell/catalogue.js";
import { RENDER_KINDS } from "../ui/shell/types.js";
import { EFFECTS } from "../layout/effects.js";
import { TOOLS } from "./recipe.js";
export function recipeAvailability(steps, source) {
    return steps.map((step) => {
        if (step.provider !== "local")
            return { tool: step.tool, available: false, reason: "A new YouCam quote and consent are required." };
        if (!RENDER_KINDS.includes(step.tool))
            return { tool: step.tool, available: false, reason: "This saved tool has no editor renderer yet." };
        const state = readiness(step.tool, source);
        return { tool: step.tool, available: state.ready, reason: state.ready ? "Ready on this photo." : state.reason };
    });
}
export function effectAvailability(effect, source) {
    if (!effect.built || !effect.studio)
        return { tool: effect.id, available: false, reason: effect.note };
    const state = readiness(effect.studio, source);
    return { tool: effect.id, available: state.ready, reason: state.ready ? "Ready on this photo." : state.reason };
}
export function registryProblems(catalogue = CATALOGUE, effects = EFFECTS, renderKinds = RENDER_KINDS) {
    const problems = [];
    const unique = (ids, label) => {
        const seen = new Set();
        for (const id of ids) {
            if (seen.has(id))
                problems.push(`${label}: duplicate ${id}`);
            seen.add(id);
        }
    };
    unique(catalogue.map((row) => row.id), "studio");
    unique(effects.map((row) => row.id), "effect");
    unique(renderKinds, "renderer");
    const tools = new Map(catalogue.map((row) => [row.id, row]));
    for (const kind of renderKinds) {
        if (!tools.has(kind) || tools.get(kind)?.source !== "local")
            problems.push(`${kind}: renderer has no local studio`);
        if (!Object.hasOwn(TOOLS, kind) || TOOLS[kind].provider !== "local")
            problems.push(`${kind}: renderer has no local recipe contract`);
    }
    for (const row of catalogue) {
        if (row.source === "local" && !renderKinds.includes(row.id))
            problems.push(`${row.id}: visible studio has no renderer`);
    }
    for (const item of effects) {
        if (!item.studio)
            continue;
        const row = tools.get(item.studio);
        if (!row)
            problems.push(`${item.id}: effect points to an unknown studio`);
        else if (item.provider !== row.source)
            problems.push(`${item.id}: provider differs from its studio`);
        if (!item.built)
            problems.push(`${item.id}: unavailable effect has an active studio`);
    }
    return problems;
}
