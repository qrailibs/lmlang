import { RuntimeValue } from "@lmlang/library";

export class Context {
    private variables: Map<string, RuntimeValue> = new Map();
    private parent?: Context;

    constructor(parent?: Context) {
        this.parent = parent;
    }

    public set(name: string, value: RuntimeValue): void {
        this.variables.set(name, value);
    }

    public get(name: string): RuntimeValue | undefined {
        if (this.variables.has(name)) {
            return this.variables.get(name);
        }
        if (this.parent) {
            return this.parent.get(name);
        }
        return undefined;
    }

    public assign(name: string, value: RuntimeValue): void {
        if (this.variables.has(name)) {
            this.variables.set(name, value);
            return;
        }
        if (this.parent) {
            this.parent.assign(name, value);
            return;
        }
        throw new Error(`Variable '${name}' not defined.`);
    }
}
