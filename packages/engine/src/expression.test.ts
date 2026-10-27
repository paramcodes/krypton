import type { JsonObject, JsonValue } from "@krypton/schema";
import { describe, expect, it } from "vitest";

import { ExpressionError, compileParameters, evaluateParameters } from "./expression";

const item: JsonObject = {
  customer: { name: "Ada", plan: "trial" },
  tags: ["trial", "web"],
  count: 2,
  active: true,
  nothing: null,
};

const input: JsonObject = { region: "eu", plan: "trial" };

const evaluate = (parameters: JsonObject, currentItem: JsonObject = item): JsonObject =>
  evaluateParameters(compileParameters(parameters), { item: currentItem, input });

const field = (source: string): string => `{{ ${source} }}`;

const expressionError = (parameters: JsonObject): ExpressionError => {
  try {
    evaluate(parameters);
  } catch (error) {
    if (error instanceof ExpressionError) {
      return error;
    }
    throw error;
  }
  throw new Error("Expected an expression error.");
};

describe("field expressions", () => {
  it("resolves whole-field references and leaves mixed text untouched", () => {
    const result = evaluate({
      name: "{{ $json.customer.name }}",
      plan: "{{ $input.plan }}",
      mixed: "Customer: {{ $json.customer.name }}",
      literalBraces: "{{ '{{literal}}' }}",
      nested: {
        values: ["{{ $json.tags[0] }}", "literal", { active: "{{ $json.active }}" }],
      },
    });

    expect(result).toEqual({
      name: "Ada",
      plan: "trial",
      mixed: "Customer: {{ $json.customer.name }}",
      literalBraces: "{{literal}}",
      nested: { values: ["trial", "literal", { active: true }] },
    });
  });

  it("evaluates compiled parameters against each item with a stable input", () => {
    const compiled = compileParameters({
      current: "{{ $json.value }}",
      input: "{{ $input.value }}",
    });

    expect(
      evaluateParameters(compiled, {
        item: { value: "first" },
        input: { value: "shared" },
      }),
    ).toEqual({ current: "first", input: "shared" });
    expect(
      evaluateParameters(compiled, {
        item: { value: "second" },
        input: { value: "shared" },
      }),
    ).toEqual({ current: "second", input: "shared" });
  });

  it("supports dot and bracket access with own properties only", () => {
    const result = evaluate({
      dot: "{{ $json.customer.plan }}",
      bracket: "{{ $json['customer']['name'] }}",
      array: "{{ $json.tags[1] }}",
      root: "{{ $json }}",
    });

    expect(result).toEqual({
      dot: "trial",
      bracket: "Ada",
      array: "web",
      root: item,
    });
    expect(() => evaluate({ value: "{{ $json.toString }}" })).toThrow(/Unknown field "toString"/);
    expect(() => evaluate({ value: "{{ $json.constructor }}" })).toThrow(
      /Unknown field "constructor"/,
    );
  });

  it("evaluates literals and arithmetic with precedence", () => {
    const result = evaluate({
      number: "{{ 1 + 3 * 2 }}",
      grouped: "{{ (1 + 3) * 2 }}",
      negative: "{{ -$json.count + 5 }}",
      subtraction: "{{ 5 - 2 }}",
      decimal: "{{ 1.5 + 2 }}",
      division: "{{ 9 / 3 }}",
      modulo: "{{ 7 % 4 }}",
      string: "{{ 'Ada' }}",
      boolean: "{{ true }}",
      empty: "{{ null }}",
    });

    expect(result).toEqual({
      number: 7,
      grouped: 8,
      negative: 3,
      subtraction: 3,
      decimal: 3.5,
      division: 3,
      modulo: 3,
      string: "Ada",
      boolean: true,
      empty: null,
    });
  });

  it("supports strict equality, comparisons, and boolean logic", () => {
    const result = evaluate({
      equal: "{{ $json.count === 2 }}",
      notEqual: "{{ $json.count !== '2' }}",
      looseLooking: "{{ $json.count == 2 }}",
      coercedEqual: "{{ 1 == '1' }}",
      coercedNotEqual: "{{ 1 != '1' }}",
      coercedBoolean: "{{ 0 == false }}",
      sameObject: "{{ $json.customer === $json.customer }}",
      differentObjects: "{{ $json.customer === $json.tags }}",
      lower: "{{ $json.count < 3 }}",
      lowerOrEqual: "{{ $json.count <= 2 }}",
      higher: "{{ $json.count > 1 }}",
      higherOrEqual: "{{ $json.count >= 2 }}",
      text: "{{ $json.customer.name < 'Bob' }}",
      textLowerOrEqual: "{{ 'Ada' <= 'Ada' }}",
      textHigher: "{{ 'Bob' > 'Ada' }}",
      textHigherOrEqual: "{{ 'Bob' >= 'Bob' }}",
      both: "{{ $json.active && $json.count === 2 }}",
      either: "{{ !$json.active || $input.plan === 'trial' }}",
      nullish: "{{ $json.nothing === null }}",
      shortAnd: "{{ false && $json.nope }}",
      shortOr: "{{ true || $json.nope }}",
    });

    expect(result).toEqual({
      equal: true,
      notEqual: true,
      looseLooking: true,
      coercedEqual: false,
      coercedNotEqual: true,
      coercedBoolean: false,
      sameObject: true,
      differentObjects: false,
      lower: true,
      lowerOrEqual: true,
      higher: true,
      higherOrEqual: true,
      text: true,
      textLowerOrEqual: true,
      textHigher: true,
      textHigherOrEqual: true,
      both: true,
      either: true,
      nullish: true,
      shortAnd: false,
      shortOr: true,
    });
  });

  it("supports escaped strings", () => {
    const result = evaluate({
      quote: "{{ 'it\\'s fine' }}",
      backslash: field(String.raw`'\\'`),
      singleQuote: field(String.raw`'\''`),
      doubleQuote: field(String.raw`"\""`),
      newline: field(String.raw`'\n'`),
      carriageReturn: field(String.raw`'\r'`),
      tab: field(String.raw`'\t'`),
      backspace: field(String.raw`'\b'`),
      formFeed: field(String.raw`'\f'`),
      unicode: "{{ '\\u0041' }}",
    });

    expect(result).toEqual({
      quote: "it's fine",
      backslash: "\\",
      singleQuote: "'",
      doubleQuote: '"',
      newline: "\n",
      carriageReturn: "\r",
      tab: "\t",
      backspace: "\b",
      formFeed: "\f",
      unicode: "A",
    });
  });

  it("does not mutate the parameter tree", () => {
    const parameters: JsonObject = {
      values: { status: "{{ $json.customer.name }}" },
    };
    const compiled = compileParameters(parameters);

    expect(parameters).toEqual({ values: { status: "{{ $json.customer.name }}" } });
    expect(evaluateParameters(compiled, { item, input })).toEqual({
      values: { status: "Ada" },
    });
  });
});

describe("expression errors", () => {
  it("reports missing and invalid field access with a path", () => {
    const error = expressionError({ nested: { value: "{{ $json.nope }}" } });

    expect(error).toBeInstanceOf(ExpressionError);
    expect(error.message).toBe('$.nested.value: Unknown field "nope" at position 7.');
    expect(() => evaluate({ value: "{{ $json.nothing.value }}" })).toThrow(/non-object value/);
    expect(() => evaluate({ value: "{{ $json.tags[9] }}" })).toThrow(/array index/);
    expect(() => evaluate({ value: "{{ $json.tags['0'] }}" })).toThrow(/array index/);
    expect(() => evaluate({ value: field("$json[0]") })).toThrow(/Unknown field "0"/);

    const sparse: JsonValue[] = [];
    sparse[1] = "present";
    const sparseItem: JsonObject = { sparse };
    expect(() => evaluate({ value: field("$json.sparse[0]") }, sparseItem)).toThrow(
      /Array item is missing/,
    );

    const withUndefined: JsonObject = {};
    Object.defineProperty(withUndefined, "value", { value: undefined, enumerable: true });
    expect(() => evaluate({ value: field("$json.value") }, withUndefined)).toThrow(
      /Unknown field "value"/,
    );
  });

  it("rejects type coercion and invalid arithmetic", () => {
    expect(() => evaluate({ value: "{{ $json.count && true }}" })).toThrow(/boolean/);
    expect(() => evaluate({ value: "{{ !$json.count }}" })).toThrow(/boolean/);
    expect(() => evaluate({ value: "{{ $json.nothing && true }}" })).toThrow(
      /boolean, received null/,
    );
    expect(() => evaluate({ value: "{{ $json.tags && true }}" })).toThrow(
      /boolean, received array/,
    );
    expect(() => evaluate({ value: "{{ 'x' - 1 }}" })).toThrow(/number/);
    expect(() => evaluate({ value: "{{ $json.nothing + 1 }}" })).toThrow(/number, received null/);
    expect(() => evaluate({ value: "{{ $json.tags + 1 }}" })).toThrow(/number, received array/);
    expect(() => evaluate({ value: "{{ 'x' < 1 }}" })).toThrow(/same type|comparable/);
    expect(() => evaluate({ value: "{{ 1 / 0 }}" })).toThrow(/zero/);
    expect(() => evaluate({ value: "{{ 1 % 0 }}" })).toThrow(/zero/);
    expect(() => evaluate({ value: "{{ 0 / 0 }}" })).toThrow(/zero|finite/);

    const big = "9".repeat(200);
    expect(() => evaluate({ value: field(`${big} * ${big}`) })).toThrow(/not finite/);
  });

  it("reports syntax errors with a source position", () => {
    expect(() => evaluate({ value: "{{ }}" })).toThrow(/Expected a value/);
    expect(() => evaluate({ value: "{{ $json. }}" })).toThrow(/Expected a field name/);
    expect(() => evaluate({ value: "{{ $secret }}" })).toThrow(/Unknown reference/);
    expect(() => evaluate({ value: "{{ (1 + 2 }}" })).toThrow(/Expected "\)"/);
    expect(() => evaluate({ value: "{{ nope }}" })).toThrow(/Unknown literal/);
    expect(() => evaluate({ value: "{{ $json[true] }}" })).toThrow(
      /Expected a field name or array index/,
    );
    expect(() => evaluate({ value: "{{ $json['customer' }}" })).toThrow(/Expected "\]"/);
    expect(() => evaluate({ value: "{{ $ }}" })).toThrow(/Expected a reference name/);
    expect(() => evaluate({ value: "{{ 1. }}" })).toThrow(/decimal point/);
    expect(() => evaluate({ value: "{{ $json.customer.name + }}" })).toThrow(/Expected a value/);
    expect(() => evaluate({ value: "{{ 'unterminated }}" })).toThrow(/Unterminated string/);
    expect(() => evaluate({ value: field(String.raw`'\q'`) })).toThrow(/Unknown escape/);
    expect(() => evaluate({ value: field(String.raw`'\u12'`) })).toThrow(/Invalid unicode escape/);
    expect(() => evaluate({ value: "{{ 1 2 }}" })).toThrow(/Unexpected/);
    expect(() => evaluate({ value: "{{ 1 }} and {{ 2 }}" })).toThrow(/Unexpected/);
  });

  it("bounds expression length, node count, nesting depth, and number size", () => {
    expect(() => evaluate({ value: `{{ ${"1".repeat(1_001)} }}` })).toThrow(/longer than/);

    const manyNodes = Array.from({ length: 200 }, () => "1").join("+");
    expect(() => evaluate({ value: `{{ ${manyNodes} }}` })).toThrow(/too many nodes/);

    const deep = `${"(".repeat(33)}1${")".repeat(33)}`;
    expect(() => evaluate({ value: `{{ ${deep} }}` })).toThrow(/deeply nested/);

    expect(() => evaluate({ value: field("9".repeat(400)) })).toThrow(/out of range/);

    let manyLevels: JsonObject = { leaf: true };
    for (let depth = 0; depth < 70; depth += 1) {
      manyLevels = { next: manyLevels };
    }
    expect(() => compileParameters(manyLevels)).toThrow(/nested too deeply/);
  });
});
