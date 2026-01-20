import { BaseStatement } from "./BaseStatement";

export interface ImportStatement extends BaseStatement {
    kind: "ImportStatement";
    moduleName: string;
    imports: { name: string; alias?: string }[];
}
