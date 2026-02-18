# @railgun-reloaded/utxo-solver

A simple module for UTXO selection and spend intent solving in RAILGUN Reloaded.

## Install

```bash
npm install @railgun-reloaded/utxo-solver
```

## Example Usage

### Greedy Solver (single-token)

```ts
import { GreedySolver, SpendingSolution } from "@railgun-reloaded/utxo-solver";

function main() {
  const solver = new GreedySolver();
  const result = solver.solve({
    kind: "greedy",
    solution: {
      changeAddress: "0zkaddr-change",
      recipientAddress: "0zkaddr-recipient",
      inputs: [
        { commitmentIndex: 0n, treeNumber: 1n, value: 100n },
        { commitmentIndex: 1n, treeNumber: 1n, value: 50n },
      ],
      amount: 120n,
      type: SpendingSolution.Simple,
    },
  });

  console.log("result", result);
}

main();
```

### Railgun Solver (multi-recipient)

```ts
import { RailgunSolver, SpendingSolution } from "@railgun-reloaded/utxo-solver";

function main() {
  const solver = new RailgunSolver();
  const result = solver.solve({
    kind: "railgun",
    intent: {
      changeAddress: "0zkaddr-change",
      recipients: [
        { tokenAddress: "0xToken", railgunAddress: "0zkaddr-a", amount: 40n },
        { tokenAddress: "0xToken", railgunAddress: "0zkaddr-b", amount: 60n },
      ],
      type: SpendingSolution.Simple,
    },
    utxos: [
      { tokenAddress: "0xToken", treeNumber: 1n, leafIndex: 0n, value: 120n },
    ],
  });

  console.log("result", result);
}

main();
```

## License

MIT
