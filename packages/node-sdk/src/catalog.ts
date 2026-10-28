import {
  isJsonObject,
  isRecord,
  parseJsonValue,
  SchemaError,
  type JsonObject,
  type JsonValue,
} from "@krypton/schema";

export type NodeCategory = "trigger" | "flow" | "data" | "network";

export type NodePort = {
  readonly name: string;
  readonly label: string;
  readonly description?: string;
};

export type NodeDynamicOutputs = {
  readonly label: string;
  readonly description: string;
};

type NodeParameterBase = {
  readonly key: string;
  readonly label: string;
  readonly description?: string;
  readonly required?: boolean;
};

export type TextParameter = NodeParameterBase & {
  readonly kind: "text";
  readonly placeholder?: string;
  readonly defaultValue?: string;
};

export type NumberParameter = NodeParameterBase & {
  readonly kind: "number";
  readonly integer?: boolean;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly defaultValue?: number;
};

export type BooleanParameter = NodeParameterBase & {
  readonly kind: "boolean";
  readonly defaultValue?: boolean;
};

export type SelectOption = {
  readonly value: string;
  readonly label: string;
};

export type SelectParameter = NodeParameterBase & {
  readonly kind: "select";
  readonly options: readonly SelectOption[];
  readonly defaultValue?: string;
};

export type JsonParameter = NodeParameterBase & {
  readonly kind: "json";
  readonly defaultValue?: JsonValue;
};

export type KeyValueParameter = NodeParameterBase & {
  readonly kind: "key-value";
  readonly valueKind: "string" | "json";
  readonly defaultValue?: JsonObject;
};

export type ListParameter = NodeParameterBase & {
  readonly kind: "list";
  readonly itemLabel?: string;
  readonly minItems?: number;
  readonly maxItems?: number;
  readonly fields: readonly NodeParameterField[];
};

export type NodeParameterField =
  | TextParameter
  | NumberParameter
  | BooleanParameter
  | SelectParameter
  | JsonParameter
  | KeyValueParameter
  | ListParameter;

export type NodeCatalogEntry = {
  readonly type: string;
  readonly label: string;
  readonly description: string;
  readonly category: NodeCategory;
  readonly inputs: readonly NodePort[];
  readonly outputs: readonly NodePort[];
  readonly dynamicOutputs?: NodeDynamicOutputs;
  readonly parameters: readonly NodeParameterField[];
};

const NODE_TYPE_PATTERN = /^[a-z][a-z0-9._-]*$/;
const PARAMETER_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_.-]*$/;
const MAX_PARAMETER_DEPTH = 16;

const readObject = (value: unknown, path: string): Readonly<Record<string, unknown>> => {
  if (!isRecord(value)) {
    throw new SchemaError(path, "Expected an object.");
  }
  return value;
};

const readArray = (value: unknown, path: string): readonly unknown[] => {
  if (!Array.isArray(value)) {
    throw new SchemaError(path, "Expected an array.");
  }
  return value;
};

const hasControlCharacter = (value: string): boolean => {
  for (const character of value) {
    const code = character.codePointAt(0);
    if (code !== undefined && (code <= 0x1f || (code >= 0x7f && code <= 0x9f))) {
      return true;
    }
  }
  return false;
};

const readText = (record: Readonly<Record<string, unknown>>, key: string, path: string): string => {
  const value = record[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new SchemaError(`${path}.${key}`, "Expected a non-empty string.");
  }
  if (hasControlCharacter(value)) {
    throw new SchemaError(`${path}.${key}`, "Expected a string without control characters.");
  }
  return value;
};

const readOptionalText = (
  record: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
): string | undefined => {
  if (record[key] === undefined) {
    return undefined;
  }
  return readText(record, key, path);
};

const readPatternText = (
  record: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
  pattern: RegExp,
  description: string,
): string => {
  const value = readText(record, key, path);
  if (!pattern.test(value)) {
    throw new SchemaError(`${path}.${key}`, `Expected ${description}.`);
  }
  return value;
};

const readOptionalBoolean = (
  record: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
): boolean | undefined => {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new SchemaError(`${path}.${key}`, "Expected a boolean.");
  }
  return value;
};

const readOptionalNumber = (
  record: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
): number | undefined => {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new SchemaError(`${path}.${key}`, "Expected a finite number.");
  }
  return value;
};

const readOptionalNonNegativeInteger = (
  record: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
): number | undefined => {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new SchemaError(`${path}.${key}`, "Expected a non-negative integer.");
  }
  return value;
};

const isJsonValue = (value: unknown): value is JsonValue => {
  try {
    parseJsonValue(value);
    return true;
  } catch {
    return false;
  }
};

const optionalFields = (
  description: string | undefined,
  required: boolean | undefined,
): { readonly description?: string; readonly required?: boolean } => {
  const fields: { description?: string; required?: boolean } = {};
  if (description !== undefined) {
    fields.description = description;
  }
  if (required !== undefined) {
    fields.required = required;
  }
  return fields;
};

const parseNodePort = (value: unknown, path: string): NodePort => {
  const record = readObject(value, path);
  const name = readText(record, "name", path);
  const label = readText(record, "label", path);
  const description = readOptionalText(record, "description", path);
  return description === undefined ? { name, label } : { name, label, description };
};

const parseNodePorts = (value: unknown, path: string): readonly NodePort[] => {
  const values = readArray(value, path);
  const names = new Set<string>();
  return values.map((item, index) => {
    const port = parseNodePort(item, `${path}[${index}]`);
    if (names.has(port.name)) {
      throw new SchemaError(`${path}[${index}].name`, `Duplicate port "${port.name}".`);
    }
    names.add(port.name);
    return port;
  });
};

const parseDynamicOutputs = (value: unknown, path: string): NodeDynamicOutputs => {
  const record = readObject(value, path);
  return {
    label: readText(record, "label", path),
    description: readText(record, "description", path),
  };
};

const parseSelectOptions = (value: unknown, path: string): readonly SelectOption[] => {
  const values = readArray(value, path);
  if (values.length === 0) {
    throw new SchemaError(path, "Expected at least one option.");
  }

  const seen = new Set<string>();
  return values.map((item, index) => {
    const record = readObject(item, `${path}[${index}]`);
    const optionValue = readText(record, "value", `${path}[${index}]`);
    const label = readText(record, "label", `${path}[${index}]`);
    if (seen.has(optionValue)) {
      throw new SchemaError(`${path}[${index}].value`, `Duplicate option value "${optionValue}".`);
    }
    seen.add(optionValue);
    return { value: optionValue, label };
  });
};

const parseParameterField = (value: unknown, path: string, depth: number): NodeParameterField => {
  if (depth > MAX_PARAMETER_DEPTH) {
    throw new SchemaError(path, "Parameters are nested too deeply.");
  }

  const record = readObject(value, path);
  const key = readPatternText(record, "key", path, PARAMETER_KEY_PATTERN, "a parameter key");
  const label = readText(record, "label", path);
  const description = readOptionalText(record, "description", path);
  const required = readOptionalBoolean(record, "required", path);
  const fields = optionalFields(description, required);
  const kind = record["kind"];

  switch (kind) {
    case "text": {
      const placeholder = readOptionalText(record, "placeholder", path);
      const rawDefault = record["defaultValue"];
      if (rawDefault !== undefined && typeof rawDefault !== "string") {
        throw new SchemaError(`${path}.defaultValue`, "Expected a string.");
      }
      return {
        key,
        label,
        ...fields,
        kind,
        ...(placeholder === undefined ? {} : { placeholder }),
        ...(rawDefault === undefined ? {} : { defaultValue: rawDefault }),
      };
    }
    case "number": {
      const integer = readOptionalBoolean(record, "integer", path);
      const minimum = readOptionalNumber(record, "minimum", path);
      const maximum = readOptionalNumber(record, "maximum", path);
      if (minimum !== undefined && maximum !== undefined && minimum > maximum) {
        throw new SchemaError(path, "Expected minimum to be less than or equal to maximum.");
      }
      const rawDefault = readOptionalNumber(record, "defaultValue", path);
      if (rawDefault !== undefined) {
        if (integer === true && !Number.isSafeInteger(rawDefault)) {
          throw new SchemaError(`${path}.defaultValue`, "Expected an integer.");
        }
        if (minimum !== undefined && rawDefault < minimum) {
          throw new SchemaError(`${path}.defaultValue`, "Expected a value at or above minimum.");
        }
        if (maximum !== undefined && rawDefault > maximum) {
          throw new SchemaError(`${path}.defaultValue`, "Expected a value at or below maximum.");
        }
      }
      return {
        key,
        label,
        ...fields,
        kind,
        ...(integer === undefined ? {} : { integer }),
        ...(minimum === undefined ? {} : { minimum }),
        ...(maximum === undefined ? {} : { maximum }),
        ...(rawDefault === undefined ? {} : { defaultValue: rawDefault }),
      };
    }
    case "boolean": {
      const defaultValue = readOptionalBoolean(record, "defaultValue", path);
      return {
        key,
        label,
        ...fields,
        kind,
        ...(defaultValue === undefined ? {} : { defaultValue }),
      };
    }
    case "select": {
      const options = parseSelectOptions(record["options"], `${path}.options`);
      const defaultValue = readOptionalText(record, "defaultValue", path);
      if (defaultValue !== undefined && !options.some((option) => option.value === defaultValue)) {
        throw new SchemaError(
          `${path}.defaultValue`,
          "Expected one of the configured option values.",
        );
      }
      return {
        key,
        label,
        ...fields,
        kind,
        options,
        ...(defaultValue === undefined ? {} : { defaultValue }),
      };
    }
    case "json": {
      const rawDefault = record["defaultValue"];
      if (rawDefault !== undefined && !isJsonValue(rawDefault)) {
        throw new SchemaError(`${path}.defaultValue`, "Expected a JSON value.");
      }
      return {
        key,
        label,
        ...fields,
        kind,
        ...(rawDefault === undefined ? {} : { defaultValue: rawDefault }),
      };
    }
    case "key-value": {
      const valueKind = record["valueKind"];
      if (valueKind !== "string" && valueKind !== "json") {
        throw new SchemaError(`${path}.valueKind`, 'Expected "string" or "json".');
      }
      const rawDefault = record["defaultValue"];
      if (rawDefault !== undefined && (!isJsonValue(rawDefault) || !isJsonObject(rawDefault))) {
        throw new SchemaError(`${path}.defaultValue`, "Expected an object of JSON values.");
      }
      if (rawDefault !== undefined && valueKind === "string") {
        for (const [name, item] of Object.entries(rawDefault)) {
          if (typeof item !== "string") {
            throw new SchemaError(`${path}.defaultValue.${name}`, "Expected a string value.");
          }
        }
      }
      return {
        key,
        label,
        ...fields,
        kind,
        valueKind,
        ...(rawDefault === undefined ? {} : { defaultValue: rawDefault }),
      };
    }
    case "list": {
      const fieldsValue = readArray(record["fields"], `${path}.fields`);
      if (fieldsValue.length === 0) {
        throw new SchemaError(`${path}.fields`, "Expected at least one field.");
      }
      const childKeys = new Set<string>();
      const childFields = fieldsValue.map((item, index) => {
        const field = parseParameterField(item, `${path}.fields[${index}]`, depth + 1);
        if (childKeys.has(field.key)) {
          throw new SchemaError(
            `${path}.fields[${index}].key`,
            `Duplicate parameter key "${field.key}".`,
          );
        }
        childKeys.add(field.key);
        return field;
      });
      if (record["defaultValue"] !== undefined) {
        throw new SchemaError(`${path}.defaultValue`, "List parameters do not support a default.");
      }
      const itemLabel = readOptionalText(record, "itemLabel", path);
      const minItems = readOptionalNonNegativeInteger(record, "minItems", path);
      const maxItems = readOptionalNonNegativeInteger(record, "maxItems", path);
      if (minItems !== undefined && maxItems !== undefined && minItems > maxItems) {
        throw new SchemaError(path, "Expected minItems to be less than or equal to maxItems.");
      }
      return {
        key,
        label,
        ...fields,
        kind,
        fields: childFields,
        ...(itemLabel === undefined ? {} : { itemLabel }),
        ...(minItems === undefined ? {} : { minItems }),
        ...(maxItems === undefined ? {} : { maxItems }),
      };
    }
    default:
      throw new SchemaError(`${path}.kind`, "Expected a known parameter kind.");
  }
};

const isNodeCategory = (value: unknown): value is NodeCategory =>
  value === "trigger" || value === "flow" || value === "data" || value === "network";

export const parseNodeCatalogEntry = (value: unknown, path = "$"): NodeCatalogEntry => {
  const record = readObject(value, path);
  const type = readPatternText(record, "type", path, NODE_TYPE_PATTERN, "a node type");
  const label = readText(record, "label", path);
  const description = readText(record, "description", path);
  const category = record["category"];
  if (!isNodeCategory(category)) {
    throw new SchemaError(`${path}.category`, 'Expected "trigger", "flow", "data", or "network".');
  }

  const inputs = parseNodePorts(record["inputs"], `${path}.inputs`);
  const outputs = parseNodePorts(record["outputs"], `${path}.outputs`);
  if (outputs.length === 0) {
    throw new SchemaError(`${path}.outputs`, "Expected at least one output port.");
  }

  const dynamicValue = record["dynamicOutputs"];
  const dynamicOutputs =
    dynamicValue === undefined
      ? undefined
      : parseDynamicOutputs(dynamicValue, `${path}.dynamicOutputs`);

  const parameterValues = readArray(record["parameters"], `${path}.parameters`);
  const parameterKeys = new Set<string>();
  const parameters = parameterValues.map((item, index) => {
    const field = parseParameterField(item, `${path}.parameters[${index}]`, 0);
    if (parameterKeys.has(field.key)) {
      throw new SchemaError(
        `${path}.parameters[${index}].key`,
        `Duplicate parameter key "${field.key}".`,
      );
    }
    parameterKeys.add(field.key);
    return field;
  });

  return {
    type,
    label,
    description,
    category,
    inputs,
    outputs,
    ...(dynamicOutputs === undefined ? {} : { dynamicOutputs }),
    parameters,
  };
};

export const parseNodeCatalog = (value: unknown): readonly NodeCatalogEntry[] => {
  const values = readArray(value, "$");
  const types = new Set<string>();
  return values.map((item, index) => {
    const entry = parseNodeCatalogEntry(item, `$[${index}]`);
    if (types.has(entry.type)) {
      throw new SchemaError(`$[${index}].type`, `Duplicate node type "${entry.type}".`);
    }
    types.add(entry.type);
    return entry;
  });
};
