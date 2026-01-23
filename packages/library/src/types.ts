export type RuntimeValue =
    | { type: "str"; value: string }
    | { type: "int"; value: number }
    | { type: "dbl"; value: number }
    | { type: "bool"; value: boolean }
    | { type: "obj"; value: any }
    | { type: "nil"; value: null | undefined }
    | { type: "func"; value: Function }
    | { type: "unknown"; value: unknown }
    | { type: "err"; value: unknown };

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
