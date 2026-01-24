export type PrimitiveType =
    | "str"
    | "int"
    | "dbl"
    | "bool"
    | "obj"
    | "nil"
    | "func"
    | "unknown"
    | "err"
    | "void";

export interface ArrayType {
    base: "array";
    generic: VariableType;
}

export interface StructType {
    base: "struct";
    fields?: Record<string, VariableType>;
    signatures?: Record<string, FunctionSignature>;
    extends?: CompoundType;
}

export type CompoundType = ArrayType | StructType;

export type VariableType = PrimitiveType | CompoundType;

export type RuntimeValue =
    | { type: "str"; value: string }
    | { type: "int"; value: number }
    | { type: "dbl"; value: number }
    | { type: "bool"; value: boolean }
    | { type: "obj"; value: any }
    | { type: "nil"; value: null | undefined }
    | { type: "func"; value: Function }
    | { type: "unknown"; value: unknown }
    | { type: "err"; value: unknown }
    | { type: ArrayType; value: any[] };

export interface FunctionSignature {
    params: { name: string; type: string; description?: string }[];
    returnType: string;
    description?: string;
}

export type NativeFunction = ((
    ...args: RuntimeValue[]
) => RuntimeValue | Promise<RuntimeValue>) & {
    signature: FunctionSignature;
};
