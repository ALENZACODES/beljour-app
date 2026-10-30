/** Bounded recipe undo/redo; never retains photograph, pixel or mask raster data.
 * The byte budget conservatively estimates JSON strings plus parsed snapshots;
 * it is not a measurement of JavaScript engine heap overhead.
 */
import { cloneRecipe, serializeRecipe } from "./recipe.js";
import { defaultRecipe, ProInputError } from "./types.js";
function budgetCost(json) {
    return new TextEncoder().encode(json).length * 4;
}
export class RecipeHistory {
    limit;
    byteCap;
    entries;
    keys;
    estimatedBytes;
    position = 0;
    constructor(initial = defaultRecipe(), limit = 40, byteCap = 128 * 1024) {
        this.limit = limit;
        this.byteCap = byteCap;
        if (!Number.isInteger(limit) || limit < 2 || limit > 100) {
            throw new ProInputError("History limit must be from 2 to 100");
        }
        if (!Number.isInteger(byteCap) || byteCap < 8192 || byteCap > 4 * 1024 * 1024) {
            throw new ProInputError("History byte cap must be from 8 KB to 4 MB");
        }
        const key = serializeRecipe(initial);
        this.estimatedBytes = budgetCost(key);
        if (this.estimatedBytes > byteCap) {
            throw new ProInputError("Initial recipe exceeds the history memory cap", "PRO_HISTORY_LIMIT");
        }
        this.entries = [cloneRecipe(initial)];
        this.keys = [key];
    }
    get current() {
        return cloneRecipe(this.entries[this.position]);
    }
    get state() {
        return {
            length: this.entries.length,
            position: this.position,
            canUndo: this.position > 0,
            canRedo: this.position < this.entries.length - 1,
            estimatedBytes: this.estimatedBytes,
            byteCap: this.byteCap,
        };
    }
    commit(recipe) {
        const key = serializeRecipe(recipe);
        if (key === this.keys[this.position])
            return false;
        const nextCost = budgetCost(key);
        if (nextCost > this.byteCap) {
            throw new ProInputError("This recipe exceeds the history memory cap", "PRO_HISTORY_LIMIT");
        }
        const snapshot = cloneRecipe(recipe);
        for (let i = this.keys.length - 1; i > this.position; i--) {
            this.estimatedBytes -= budgetCost(this.keys[i]);
        }
        this.entries.splice(this.position + 1);
        this.keys.splice(this.position + 1);
        this.entries.push(snapshot);
        this.keys.push(key);
        this.estimatedBytes += nextCost;
        while (this.entries.length > this.limit || this.estimatedBytes > this.byteCap) {
            this.estimatedBytes -= budgetCost(this.keys.shift());
            this.entries.shift();
        }
        this.position = this.entries.length - 1;
        return true;
    }
    undo() {
        if (this.position > 0)
            this.position--;
        return this.current;
    }
    redo() {
        if (this.position < this.entries.length - 1)
            this.position++;
        return this.current;
    }
    reset(recipe = defaultRecipe()) {
        const key = serializeRecipe(recipe);
        const nextCost = budgetCost(key);
        if (nextCost > this.byteCap) {
            throw new ProInputError("This recipe exceeds the history memory cap", "PRO_HISTORY_LIMIT");
        }
        const value = cloneRecipe(recipe);
        this.entries.splice(0, this.entries.length, value);
        this.keys.splice(0, this.keys.length, key);
        this.estimatedBytes = nextCost;
        this.position = 0;
    }
}
//# sourceMappingURL=history.js.map