export interface IRuntimeContainer {
    /**
     * Initialize runtime container
     */
    init(): Promise<void>;

    /**
     * Execute code inside container
     * @param code to execute
     * @param context variables passed into code
     */
    execute(code: string, context: Record<string, any>): Promise<unknown>;

    /**
     * Execute code inside container in a sync mode
     * @param code to execute
     * @param context variables passed into code
     */
    executeSync?: (code: string, context: Record<string, any>) => unknown;

    /**
     * Stop and destroy runtime container
     */
    destroy(): Promise<void>;
}
