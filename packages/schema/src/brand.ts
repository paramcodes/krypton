declare const brandSymbol: unique symbol;

/**
 * A nominal type: the underlying value plus a compile-time label.
 * A WorkflowId cannot be passed where an ExecutionId is expected.
 */
export type Brand<T, B extends string> = T & { readonly [brandSymbol]: B };

/**
 * Cast a validated primitive to a branded type.
 *
 * This is one of the few reviewed boundary casts in the repo. Do not add
 * more casts casually; parse and validate first, then brand at the boundary.
 */
export const brand = <T, B extends string>(value: T): Brand<T, B> => value as Brand<T, B>;

export type WorkflowId = Brand<string, "WorkflowId">;
export type NodeId = Brand<string, "NodeId">;
export type ExecutionId = Brand<string, "ExecutionId">;

export const asWorkflowId = (value: string): WorkflowId => brand<string, "WorkflowId">(value);
export const asNodeId = (value: string): NodeId => brand<string, "NodeId">(value);
export const asExecutionId = (value: string): ExecutionId => brand<string, "ExecutionId">(value);
