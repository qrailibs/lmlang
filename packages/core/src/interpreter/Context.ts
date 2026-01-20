import { RuntimeValue } from "./Interpreter";

export class Context {
    private variables: Map<string, RuntimeValue> = new Map();

    public set(name: string, value: RuntimeValue): void {
        this.variables.set(name, value);
    }

    public get(name: string): RuntimeValue | undefined {
        return this.variables.get(name);
    }
}
