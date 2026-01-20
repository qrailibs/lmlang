export interface Runtime {
    init(): Promise<void>;
    execute(code: string, context: Record<string, any>): Promise<any>;
    destroy(): Promise<void>;
}
