import { isJsonObject, type JsonObject, type JsonValue } from "@krypton/schema";

const MAX_EXPRESSION_LENGTH = 1_000;
const MAX_EXPRESSION_NODES = 256;
const MAX_EXPRESSION_DEPTH = 32;
const MAX_PARAMETER_DEPTH = 64;

type ReferenceRoot = "json" | "input";

type BinaryOperator =
  | "||"
  | "&&"
  | "==="
  | "!=="
  | "=="
  | "!="
  | "<"
  | "<="
  | ">"
  | ">="
  | "+"
  | "-"
  | "*"
  | "/"
  | "%";

type ExpressionNode =
  | { readonly kind: "literal"; readonly value: JsonValue; readonly offset: number }
  | { readonly kind: "reference"; readonly root: ReferenceRoot; readonly offset: number }
  | {
      readonly kind: "member";
      readonly object: ExpressionNode;
      readonly key: string | number;
      readonly offset: number;
    }
  | {
      readonly kind: "unary";
      readonly operator: "!" | "-";
      readonly operand: ExpressionNode;
      readonly offset: number;
    }
  | {
      readonly kind: "binary";
      readonly operator: BinaryOperator;
      readonly left: ExpressionNode;
      readonly right: ExpressionNode;
      readonly offset: number;
    };

type CompiledValue =
  | { readonly kind: "literal"; readonly value: JsonValue }
  | { readonly kind: "array"; readonly items: readonly CompiledValue[] }
  | { readonly kind: "object"; readonly entries: readonly (readonly [string, CompiledValue])[] }
  | {
      readonly kind: "expression";
      readonly expression: ExpressionNode;
      readonly path: string;
    };

export type CompiledParameters = {
  readonly kind: "object";
  readonly entries: readonly (readonly [string, CompiledValue])[];
};

export type ExpressionContext = {
  readonly item: JsonObject;
  readonly input: JsonObject;
};

/**
 * A typed expression failure. The path identifies the parameter field, and the
 * offset identifies the character in the expression source (zero-based).
 */
export class ExpressionError extends Error {
  readonly detail: string;
  readonly offset: number;
  readonly path: string;

  constructor(detail: string, offset: number, path = "$") {
    const normalized = detail.endsWith(".") ? detail.slice(0, -1) : detail;
    super(`${path}: ${normalized} at position ${offset + 1}.`);
    this.name = "ExpressionError";
    this.detail = normalized;
    this.offset = offset;
    this.path = path;
  }
}

const isDigit = (character: string | undefined): boolean =>
  character !== undefined && character >= "0" && character <= "9";

const isIdentifierStart = (character: string | undefined): boolean =>
  character !== undefined &&
  ((character >= "a" && character <= "z") ||
    (character >= "A" && character <= "Z") ||
    character === "_");

const isIdentifierPart = (character: string | undefined): boolean =>
  isIdentifierStart(character) || isDigit(character);

const hasOwn = (value: JsonObject, key: string): boolean => Object.hasOwn(value, key);

class Parser {
  private index = 0;
  private depth = 0;
  private nodeCount = 0;
  private readonly source: string;

  constructor(source: string) {
    this.source = source;
  }

  parse(): ExpressionNode {
    if (this.source.length > MAX_EXPRESSION_LENGTH) {
      throw this.error(`Expression is longer than ${MAX_EXPRESSION_LENGTH} characters.`, 0);
    }

    const expression = this.parseOr();
    this.skipWhitespace();
    if (this.index < this.source.length) {
      throw this.error("Unexpected token.");
    }
    return expression;
  }

  private parseOr(): ExpressionNode {
    let left = this.parseAnd();
    while (true) {
      const operator = this.matchOperator(["||"]);
      if (operator === undefined) {
        return left;
      }
      const right = this.parseAnd();
      left = this.track({
        kind: "binary",
        operator: operator.value,
        left,
        right,
        offset: operator.offset,
      });
    }
  }

  private parseAnd(): ExpressionNode {
    let left = this.parseEquality();
    while (true) {
      const operator = this.matchOperator(["&&"]);
      if (operator === undefined) {
        return left;
      }
      const right = this.parseEquality();
      left = this.track({
        kind: "binary",
        operator: operator.value,
        left,
        right,
        offset: operator.offset,
      });
    }
  }

  private parseEquality(): ExpressionNode {
    let left = this.parseComparison();
    while (true) {
      const operator = this.matchOperator(["===", "!==", "==", "!="]);
      if (operator === undefined) {
        return left;
      }
      const right = this.parseComparison();
      left = this.track({
        kind: "binary",
        operator: operator.value,
        left,
        right,
        offset: operator.offset,
      });
    }
  }

  private parseComparison(): ExpressionNode {
    let left = this.parseAdditive();
    while (true) {
      const operator = this.matchOperator(["<=", ">=", "<", ">"]);
      if (operator === undefined) {
        return left;
      }
      const right = this.parseAdditive();
      left = this.track({
        kind: "binary",
        operator: operator.value,
        left,
        right,
        offset: operator.offset,
      });
    }
  }

  private parseAdditive(): ExpressionNode {
    let left = this.parseMultiplicative();
    while (true) {
      const operator = this.matchOperator(["+", "-"]);
      if (operator === undefined) {
        return left;
      }
      const right = this.parseMultiplicative();
      left = this.track({
        kind: "binary",
        operator: operator.value,
        left,
        right,
        offset: operator.offset,
      });
    }
  }

  private parseMultiplicative(): ExpressionNode {
    let left = this.parseUnary();
    while (true) {
      const operator = this.matchOperator(["*", "/", "%"]);
      if (operator === undefined) {
        return left;
      }
      const right = this.parseUnary();
      left = this.track({
        kind: "binary",
        operator: operator.value,
        left,
        right,
        offset: operator.offset,
      });
    }
  }

  private parseUnary(): ExpressionNode {
    this.depth += 1;
    try {
      if (this.depth > MAX_EXPRESSION_DEPTH) {
        throw this.error("Expression is too deeply nested.");
      }

      this.skipWhitespace();
      const offset = this.index;
      const character = this.source[this.index];
      if (character === "!" || character === "-") {
        this.index += 1;
        return this.track({
          kind: "unary",
          operator: character,
          operand: this.parseUnary(),
          offset,
        });
      }

      return this.parsePrimary();
    } finally {
      this.depth -= 1;
    }
  }

  private parsePrimary(): ExpressionNode {
    this.skipWhitespace();
    const offset = this.index;
    const character = this.source[this.index];

    if (character === "(") {
      this.index += 1;
      const value = this.parseOr();
      this.skipWhitespace();
      if (this.source[this.index] !== ")") {
        throw this.error('Expected ")".');
      }
      this.index += 1;
      return this.parseMembers(value);
    }

    if (character === "'" || character === '"') {
      return this.parseMembers(this.track({ kind: "literal", value: this.parseString(), offset }));
    }

    if (isDigit(character)) {
      return this.parseMembers(this.track({ kind: "literal", value: this.parseNumber(), offset }));
    }

    if (character === "$") {
      return this.parseMembers(this.parseReference());
    }

    if (isIdentifierStart(character)) {
      const identifier = this.readIdentifier();
      if (identifier === "true") {
        return this.parseMembers(this.track({ kind: "literal", value: true, offset }));
      }
      if (identifier === "false") {
        return this.parseMembers(this.track({ kind: "literal", value: false, offset }));
      }
      if (identifier === "null") {
        return this.parseMembers(this.track({ kind: "literal", value: null, offset }));
      }
      throw this.error(`Unknown literal "${identifier}".`, offset);
    }

    throw this.error("Expected a value.");
  }

  private parseMembers(value: ExpressionNode): ExpressionNode {
    let object = value;
    while (true) {
      this.skipWhitespace();
      const character = this.source[this.index];

      if (character === ".") {
        const offset = this.index;
        this.index += 1;
        this.skipWhitespace();
        if (!isIdentifierStart(this.source[this.index])) {
          throw this.error("Expected a field name.");
        }
        const key = this.readIdentifier();
        object = this.track({ kind: "member", object, key, offset });
        continue;
      }

      if (character === "[") {
        const offset = this.index;
        this.index += 1;
        this.skipWhitespace();
        const keyCharacter = this.source[this.index];
        let key: string | number;
        if (keyCharacter === "'" || keyCharacter === '"') {
          key = this.parseString();
        } else if (isDigit(keyCharacter)) {
          key = this.parseNumber();
        } else {
          throw this.error("Expected a field name or array index.");
        }
        this.skipWhitespace();
        if (this.source[this.index] !== "]") {
          throw this.error('Expected "]".');
        }
        this.index += 1;
        object = this.track({ kind: "member", object, key, offset });
        continue;
      }

      return object;
    }
  }

  private parseReference(): ExpressionNode {
    const offset = this.index;
    this.index += 1;
    if (!isIdentifierStart(this.source[this.index])) {
      throw this.error("Expected a reference name.");
    }
    const name = this.readIdentifier();

    if (name === "json") {
      return this.track({ kind: "reference", root: "json", offset });
    }
    if (name === "input") {
      return this.track({ kind: "reference", root: "input", offset });
    }
    throw this.error(`Unknown reference "$${name}".`, offset);
  }

  private parseString(): string {
    const start = this.index;
    const quote = this.source[this.index];
    this.index += 1;

    let result = "";
    while (true) {
      const character = this.source[this.index];
      if (character === undefined) {
        throw this.error("Unterminated string.", start);
      }
      if (character === quote) {
        this.index += 1;
        return result;
      }
      if (character === "\\") {
        this.index += 1;
        result += this.parseEscape(start);
        continue;
      }
      result += character;
      this.index += 1;
    }
  }

  private parseEscape(stringStart: number): string {
    const escape = this.source[this.index];
    if (escape === undefined) {
      throw this.error("Unterminated string.", stringStart);
    }
    this.index += 1;

    switch (escape) {
      case "\\":
        return "\\";
      case "'":
        return "'";
      case '"':
        return '"';
      case "n":
        return "\n";
      case "r":
        return "\r";
      case "t":
        return "\t";
      case "b":
        return "\b";
      case "f":
        return "\f";
      case "u": {
        const hex = this.source.slice(this.index, this.index + 4);
        if (hex.length !== 4 || !/^[0-9a-fA-F]{4}$/.test(hex)) {
          throw this.error("Invalid unicode escape.", this.index);
        }
        this.index += 4;
        return String.fromCharCode(Number.parseInt(hex, 16));
      }
      default:
        throw this.error(`Unknown escape "\\${escape}".`, this.index - 1);
    }
  }

  private parseNumber(): number {
    const start = this.index;
    while (isDigit(this.source[this.index])) {
      this.index += 1;
    }

    if (this.source[this.index] === ".") {
      this.index += 1;
      if (!isDigit(this.source[this.index])) {
        throw this.error("Expected a digit after the decimal point.");
      }
      while (isDigit(this.source[this.index])) {
        this.index += 1;
      }
    }

    const value = Number(this.source.slice(start, this.index));
    if (!Number.isFinite(value)) {
      throw this.error("Number is out of range.", start);
    }
    return value;
  }

  private readIdentifier(): string {
    const start = this.index;
    while (isIdentifierPart(this.source[this.index])) {
      this.index += 1;
    }
    return this.source.slice(start, this.index);
  }

  private skipWhitespace(): void {
    while (
      this.source[this.index] === " " ||
      this.source[this.index] === "\n" ||
      this.source[this.index] === "\r" ||
      this.source[this.index] === "\t"
    ) {
      this.index += 1;
    }
  }

  private matchOperator<T extends string>(
    operators: readonly T[],
  ): { readonly value: T; readonly offset: number } | undefined {
    this.skipWhitespace();
    for (const operator of operators) {
      if (this.source.startsWith(operator, this.index)) {
        const offset = this.index;
        this.index += operator.length;
        return { value: operator, offset };
      }
    }
    return undefined;
  }

  private track<T extends ExpressionNode>(node: T): T {
    this.nodeCount += 1;
    if (this.nodeCount > MAX_EXPRESSION_NODES) {
      throw this.error(`Expression has too many nodes (maximum ${MAX_EXPRESSION_NODES}).`);
    }
    return node;
  }

  private error(detail: string, offset = this.index): ExpressionError {
    return new ExpressionError(detail, offset);
  }
}

const parseExpression = (source: string): ExpressionNode => new Parser(source).parse();

const describeType = (value: JsonValue): string => {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  return typeof value;
};

const requireBoolean = (value: JsonValue, offset: number): boolean => {
  if (typeof value !== "boolean") {
    throw new ExpressionError(`Expected a boolean, received ${describeType(value)}.`, offset);
  }
  return value;
};

const requireNumber = (value: JsonValue, offset: number): number => {
  if (typeof value !== "number") {
    throw new ExpressionError(`Expected a number, received ${describeType(value)}.`, offset);
  }
  return value;
};

const ensureFinite = (value: number, offset: number): number => {
  if (!Number.isFinite(value)) {
    throw new ExpressionError("Arithmetic result is not finite.", offset);
  }
  return value;
};

const accessMember = (target: JsonValue, key: string | number, offset: number): JsonValue => {
  if (Array.isArray(target)) {
    if (typeof key !== "number" || !Number.isInteger(key) || key < 0 || key >= target.length) {
      throw new ExpressionError("Expected a valid array index.", offset);
    }
    const value = target[key];
    if (value === undefined) {
      throw new ExpressionError("Array item is missing.", offset);
    }
    return value;
  }

  if (!isJsonObject(target)) {
    throw new ExpressionError("Cannot access a field on a non-object value.", offset);
  }
  if (typeof key !== "string" || !hasOwn(target, key)) {
    throw new ExpressionError(`Unknown field "${String(key)}".`, offset);
  }
  const value = target[key];
  if (value === undefined) {
    throw new ExpressionError(`Unknown field "${key}".`, offset);
  }
  return value;
};

const evaluateBinary = (
  operator: BinaryOperator,
  leftNode: ExpressionNode,
  rightNode: ExpressionNode,
  offset: number,
  context: ExpressionContext,
): JsonValue => {
  if (operator === "&&") {
    const left = requireBoolean(evaluateNode(leftNode, context), leftNode.offset);
    if (!left) {
      return false;
    }
    return requireBoolean(evaluateNode(rightNode, context), rightNode.offset);
  }

  if (operator === "||") {
    const left = requireBoolean(evaluateNode(leftNode, context), leftNode.offset);
    if (left) {
      return true;
    }
    return requireBoolean(evaluateNode(rightNode, context), rightNode.offset);
  }

  const left = evaluateNode(leftNode, context);
  const right = evaluateNode(rightNode, context);

  if (operator === "===" || operator === "==") {
    return left === right;
  }
  if (operator === "!==" || operator === "!=") {
    return left !== right;
  }

  if (operator === "<" || operator === "<=" || operator === ">" || operator === ">=") {
    if (typeof left === "number" && typeof right === "number") {
      if (operator === "<") {
        return left < right;
      }
      if (operator === "<=") {
        return left <= right;
      }
      if (operator === ">") {
        return left > right;
      }
      return left >= right;
    }

    if (typeof left === "string" && typeof right === "string") {
      if (operator === "<") {
        return left < right;
      }
      if (operator === "<=") {
        return left <= right;
      }
      if (operator === ">") {
        return left > right;
      }
      return left >= right;
    }

    throw new ExpressionError("Values must be the same type and comparable.", offset);
  }

  const leftNumber = requireNumber(left, leftNode.offset);
  const rightNumber = requireNumber(right, rightNode.offset);

  if ((operator === "/" || operator === "%") && rightNumber === 0) {
    throw new ExpressionError(operator === "/" ? "Division by zero." : "Modulo by zero.", offset);
  }

  switch (operator) {
    case "+":
      return ensureFinite(leftNumber + rightNumber, offset);
    case "-":
      return ensureFinite(leftNumber - rightNumber, offset);
    case "*":
      return ensureFinite(leftNumber * rightNumber, offset);
    case "/":
      return ensureFinite(leftNumber / rightNumber, offset);
    case "%":
      return ensureFinite(leftNumber % rightNumber, offset);
  }
};

const evaluateNode = (node: ExpressionNode, context: ExpressionContext): JsonValue => {
  switch (node.kind) {
    case "literal":
      return node.value;
    case "reference":
      return node.root === "json" ? context.item : context.input;
    case "member":
      return accessMember(evaluateNode(node.object, context), node.key, node.offset);
    case "unary": {
      const value = evaluateNode(node.operand, context);
      if (node.operator === "!") {
        return !requireBoolean(value, node.operand.offset);
      }
      return ensureFinite(-requireNumber(value, node.operand.offset), node.offset);
    }
    case "binary":
      return evaluateBinary(node.operator, node.left, node.right, node.offset, context);
  }
};

const evaluateValue = (
  value: CompiledValue,
  context: ExpressionContext,
  depth: number,
): JsonValue => {
  if (depth > MAX_PARAMETER_DEPTH) {
    throw new ExpressionError("Parameters are nested too deeply.", 0);
  }

  switch (value.kind) {
    case "literal":
      return value.value;
    case "array":
      return value.items.map((item) => evaluateValue(item, context, depth + 1));
    case "object": {
      const entries: Array<readonly [string, JsonValue]> = [];
      for (const [key, item] of value.entries) {
        entries.push([key, evaluateValue(item, context, depth + 1)]);
      }
      return Object.fromEntries(entries);
    }
    case "expression":
      try {
        return evaluateNode(value.expression, context);
      } catch (error) {
        if (error instanceof ExpressionError) {
          throw new ExpressionError(error.detail, error.offset, value.path);
        }
        throw error;
      }
  }
};

const compileString = (value: string, path: string): CompiledValue => {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{{") || !trimmed.endsWith("}}")) {
    return { kind: "literal", value };
  }

  try {
    return {
      kind: "expression",
      expression: parseExpression(trimmed.slice(2, -2)),
      path,
    };
  } catch (error) {
    if (error instanceof ExpressionError) {
      throw new ExpressionError(error.detail, error.offset, path);
    }
    throw error;
  }
};

const compileObject = (value: JsonObject, path: string, depth: number): CompiledParameters => {
  const entries: Array<readonly [string, CompiledValue]> = [];
  for (const [key, item] of Object.entries(value)) {
    entries.push([key, compileValue(item, `${path}.${key}`, depth + 1)]);
  }
  return { kind: "object", entries };
};

const compileValue = (value: JsonValue, path: string, depth: number): CompiledValue => {
  if (depth > MAX_PARAMETER_DEPTH) {
    throw new ExpressionError("Parameters are nested too deeply.", 0, path);
  }
  if (typeof value === "string") {
    return compileString(value, path);
  }
  if (Array.isArray(value)) {
    const items = value.map((item, index) => compileValue(item, `${path}[${index}]`, depth + 1));
    if (items.every((item) => item.kind === "literal")) {
      return { kind: "literal", value };
    }
    return { kind: "array", items };
  }
  if (isJsonObject(value)) {
    const compiled = compileObject(value, path, depth);
    if (compiled.entries.every(([, item]) => item.kind === "literal")) {
      return { kind: "literal", value };
    }
    return compiled;
  }
  return { kind: "literal", value };
};

export const compileParameters = (parameters: JsonObject, path = "$"): CompiledParameters =>
  compileObject(parameters, path, 0);

export const evaluateParameters = (
  parameters: CompiledParameters,
  context: ExpressionContext,
): JsonObject => {
  const entries: Array<readonly [string, JsonValue]> = [];
  for (const [key, value] of parameters.entries) {
    entries.push([key, evaluateValue(value, context, 1)]);
  }
  return Object.fromEntries(entries);
};
