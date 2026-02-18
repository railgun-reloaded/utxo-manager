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

  const seen = new Map<bigint, T[]>();
  for (const input of inputs) {
    const needed = target - input.value;
    const bucket = seen.get(needed);
    if (bucket && bucket.length > 0) {
      return [bucket[0]!, input];
    }
    const sameBucket = seen.get(input.value);
    if (sameBucket) {
      sameBucket.push(input);
    } else {
      seen.set(input.value, [input]);
    }
  }
  return undefined;
};

/**
 * Select inputs that cover the target value.
 * If sortFn is provided, inputs are ordered deterministically before selection.
 */
const selectInputsForTarget = <T extends ValueInput>(
  inputs: T[],
  target: bigint,
  maxInputs: number,
  sortFn?: (left: T, right: T) => number,
): SelectionResult<T> | undefined => {
  if (target <= 0n || maxInputs <= 0) return undefined;

  const orderedInputs = sortFn ? [...inputs].sort(sortFn) : inputs;
  const exact = findExactMatch(orderedInputs, target, maxInputs);
  if (exact) {
    return { inputs: exact, total: sumValues(exact) };
  }

  const selected: T[] = [];
  let total = 0n;
  for (const input of orderedInputs) {
    selected.push(input);
    total += input.value;
    if (total >= target) break;
    if (selected.length >= maxInputs) break;
  }

  if (total < target) return undefined;
  return { inputs: selected, total };
};

export { findExactMatch, selectInputsForTarget, sumValues };
