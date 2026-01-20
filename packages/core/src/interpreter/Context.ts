export class Context {
    private variables: Map<string, any> = new Map();

    public set(name: string, value: any): void {
        this.variables.set(name, value);
    }

    public get(name: string): any {
        return this.variables.get(name);
    }
}
