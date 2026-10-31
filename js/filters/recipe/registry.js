/**
 * The filter catalogue in the browser: the generated copy of the Python recipes, ranked.
 * Python is the source (api/plumb_api/filters/recipes/*.json); `make filters-data` fails if
 * the generated file is stale. Strip order is the §2.22 rank (unique, so it never shuffles).
 * Author: John Khan.
 */
import { CATALOGUE } from "../data/generated/recipes.js";
import { checkCatalogue } from "./schema.js";
export class FilterCatalogue {
    data;
    recipes;
    addons;
    byId;
    constructor(data) {
        this.data = data;
        this.recipes = [...data.recipes].sort((a, b) => a.rank - b.rank || (a.id < b.id ? -1 : 1));
        this.byId = new Map(this.recipes.map((r) => [r.id, r]));
        this.addons = new Map(data.addons.map((a) => [a.id, a]));
    }
    has(id) { return this.byId.has(id); }
    get(id) {
        const r = this.byId.get(id);
        if (!r)
            throw new RangeError(`no filter ${JSON.stringify(id)}`);
        return r;
    }
    ids() { return this.recipes.map((r) => r.id); }
    tabs() {
        const out = [];
        for (const r of this.recipes)
            if (!out.includes(r.tab))
                out.push(r.tab);
        return out;
    }
    inTab(tab) { return this.recipes.filter((r) => r.tab === tab); }
    forRound(round) { return this.recipes.filter((r) => r.round === round); }
    problems() { return checkCatalogue(this.data); }
}
let shipped = null;
/** The shipped catalogue (built once). */
export function catalogue() {
    if (!shipped) {
        const problems = checkCatalogue(CATALOGUE);
        if (problems.length)
            throw new Error(`Invalid filter catalogue: ${problems.join("; ")}`);
        shipped = new FilterCatalogue(CATALOGUE);
    }
    return shipped;
}
