import { FunctionSignature, NativeFunction, RuntimeValue } from "../types";

/**
 * Define a native function with signature
 * @param fn Implementation
 * @param signature Signature metadata
 */
export function native(
    fn: (...args: RuntimeValue[]) => RuntimeValue | Promise<RuntimeValue>,
    signature: FunctionSignature,
): NativeFunction {
    const nativeFn = fn as NativeFunction;
    nativeFn.signature = signature;
    return nativeFn;
}
