import { DefStatement } from "./DefStatement";
import { ImportStatement } from "./ImportStatement";
import { ExpressionStatement } from "./ExpressionStatement";
import { ReturnStatement } from "./ReturnStatement";
import { BlockStatement } from "./BlockStatement";

import { AssignmentStatement } from "./AssignmentStatement";

export * from "./BaseStatement";
export * from "./DefStatement";
export * from "./ImportStatement";
export * from "./ExpressionStatement";
export * from "./ReturnStatement";
export * from "./BlockStatement";
export * from "./AssignmentStatement";

export type Statement =
    | DefStatement
    | ImportStatement
    | ExpressionStatement
    | ReturnStatement
    | BlockStatement
    | AssignmentStatement;
