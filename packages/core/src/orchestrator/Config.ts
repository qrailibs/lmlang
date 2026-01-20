export interface ProjectConfig {
    entrypoint: string;
    containers: Record<string, ContainerConfig>;
}

export interface ContainerConfig {
    runtime: "nodejs" | "python";
    packageManager?: string;
    dependencies?: Record<string, string> | string[];
}
