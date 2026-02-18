type ValueInput = {
  value: bigint;
};

type SelectionResult<T extends ValueInput> = {
  inputs: T[];
  total: bigint;
};

const sumValues = <T extends ValueInput>(inputs: T[]): bigint => {
  return inputs.reduce((left, right) => left + right.value, 0n);
};

const findExactMatch = <T extends ValueInput>(
  inputs: T[],
  target: bigint,
  maxInputs: number,
): T[] | undefined => {
  if (target <= 0n || maxInputs <= 0) return undefined;

  const single = inputs.find((input) => input.value === target);
  if (single) return [single];
  if (maxInputs < 2) return undefined;

  const seen = new Map<bigint, T>();
  for (const input of inputs) {
    const needed = target - input.value;
    const pair = seen.get(needed);
    if (pair) {
      return [pair, input];
    }
    if (!seen.has(input.value)) {
      seen.set(input.value, input);
    }
  }
  return undefined;
};

const selectInputsForTarget = <T extends ValueInput>(
  inputs: T[],
  target: bigint,
  maxInputs: number,
): SelectionResult<T> | undefined => {
  if (target <= 0n || maxInputs <= 0) return undefined;

  const exact = findExactMatch(inputs, target, maxInputs);
  if (exact) {
    return { inputs: exact, total: sumValues(exact) };
  }

  const selected: T[] = [];
  let total = 0n;
  for (const input of inputs) {
    selected.push(input);
    total += input.value;
    if (total >= target) break;
    if (selected.length >= maxInputs) break;
  }

  if (total < target) return undefined;
  return { inputs: selected, total };
};

export { findExactMatch, selectInputsForTarget, sumValues };
