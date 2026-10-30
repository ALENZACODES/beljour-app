import { cloneLook, latest } from "./recipe.js";
function cloneSteps(steps) {
    return JSON.parse(JSON.stringify(steps));
}
function validateState(raw) {
    if (!raw || !Array.isArray(raw.mesh) || raw.mesh.length < 3 || raw.mesh.length > 5000) {
        throw new TypeError("face mesh must contain 3 to 5000 points");
    }
    for (const point of raw.mesh) {
        if (!Array.isArray(point) || point.length < 2 || point.length > 4 ||
            point.some((coord) => typeof coord !== "number" || !Number.isFinite(coord))) {
            throw new TypeError("face mesh coordinates must be finite");
        }
    }
    if (!raw.identity || typeof raw.identity.reference !== "string" ||
        raw.identity.reference.length === 0 || raw.identity.reference.length > 256 ||
        typeof raw.identity.model !== "string" || raw.identity.model.length > 100 ||
        !Array.isArray(raw.identity.dimensions) || raw.identity.dimensions.length !== 2 ||
        raw.identity.dimensions.some((x) => !Number.isSafeInteger(x) || x <= 0 || x > 32768)) {
        throw new TypeError("invalid identity reference");
    }
    if (!Number.isSafeInteger(raw.activeVersion) || raw.activeVersion < 1) {
        throw new TypeError("invalid active recipe version");
    }
    if (!raw.strengths || !raw.settings || typeof raw.strengths !== "object" ||
        typeof raw.settings !== "object" || Array.isArray(raw.strengths) || Array.isArray(raw.settings)) {
        throw new TypeError("invalid editor settings");
    }
    for (const [key, strength] of Object.entries(raw.strengths)) {
        if (!/^[a-z][a-z0-9_-]{0,60}$/i.test(key) || !Number.isFinite(strength) || strength < 0 || strength > 100) {
            throw new TypeError("invalid editor strength");
        }
    }
    for (const [key, value] of Object.entries(raw.settings)) {
        if (!/^[a-z][a-z0-9_-]{0,60}$/i.test(key) ||
            (typeof value !== "boolean" && typeof value !== "string" &&
                (typeof value !== "number" || !Number.isFinite(value))) ||
            (typeof value === "string" && value.length > 2048)) {
            throw new TypeError("invalid editor setting");
        }
    }
    return JSON.parse(JSON.stringify(raw));
}
/** Attaches on-device face evidence to a versioned Major Save recipe. */
export class SavedFaceSessions {
    looks;
    storage;
    clock;
    locks = new Map();
    constructor(looks, storage, clock = () => new Date()) {
        this.looks = looks;
        this.storage = storage;
        this.clock = clock;
    }
    /** Serialize mutations for one saved face without blocking unrelated faces. */
    async exclusive(id, operation) {
        const previous = this.locks.get(id) ?? Promise.resolve();
        let release = () => { };
        const gate = new Promise((resolve) => { release = resolve; });
        const queued = previous.then(() => gate);
        this.locks.set(id, queued);
        await previous;
        try {
            return await operation();
        }
        finally {
            release();
            if (this.locks.get(id) === queued)
                this.locks.delete(id);
        }
    }
    async save(name, steps, state) {
        const face = validateState(state);
        if (face.activeVersion !== 1)
            throw new RangeError("a new saved look begins at version 1");
        const look = await this.looks.saveLook(name, steps);
        try {
            await this.storage.putFace(look.id, face);
        }
        catch (error) {
            await this.looks.remove(look.id);
            throw error;
        }
        return { look, face, steps: latest(look).steps };
    }
    async resume(id) {
        return this.exclusive(id, async () => {
            const look = await this.looks.get(id);
            if (!look)
                return null;
            const record = await this.storage.getFace(id);
            if (!record)
                return null;
            const face = validateState(record);
            const selected = look.versions.find((item) => item.version === face.activeVersion);
            if (!selected)
                throw new RangeError("saved face points to an unavailable recipe version");
            return { look: cloneLook(look), face, steps: cloneSteps(selected.steps) };
        });
    }
    async checkpoint(id, state) {
        return this.exclusive(id, async () => {
            const look = await this.looks.get(id);
            if (!look || !await this.storage.getFace(id))
                throw new RangeError("saved face does not exist");
            const face = validateState(state);
            if (!look.versions.some((v) => v.version === face.activeVersion)) {
                throw new RangeError("saved face version is unavailable");
            }
            await this.storage.putFace(id, face);
            const refreshedLook = await this.looks.get(id);
            const refreshedFace = await this.storage.getFace(id);
            if (!refreshedLook || !refreshedFace)
                throw new Error("saved face vanished during checkpoint");
            const selected = refreshedLook.versions.find((v) => v.version === refreshedFace.activeVersion);
            if (!selected)
                throw new RangeError("saved face version disappeared during checkpoint");
            return { look: cloneLook(refreshedLook), face: validateState(refreshedFace),
                steps: cloneSteps(selected.steps) };
        });
    }
    async delete(id) {
        return this.exclusive(id, async () => {
            const deleted = await this.looks.remove(id);
            const faceGone = await this.storage.getFace(id) === null;
            const recipeGone = await this.looks.get(id) === null;
            if (!faceGone || !recipeGone)
                throw new Error("local deletion could not be verified");
            return { id, deleted, localOnly: true, faceGone: true, recipeGone: true,
                issuedAt: this.clock().toISOString() };
        });
    }
}
//# sourceMappingURL=saved-face.js.map