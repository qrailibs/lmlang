import { DefStatement } from "./DefStatement";
import { ImportStatement } from "./ImportStatement";
import { ExpressionStatement } from "./ExpressionStatement";

export * from "./BaseStatement";
export * from "./DefStatement";
export * from "./ImportStatement";
export * from "./ExpressionStatement";

export type Statement = DefStatement | ImportStatement | ExpressionStatement;
