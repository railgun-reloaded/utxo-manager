import type {
  SpendIntent,
  SpendInput,
  SpendTreeOutput,
  SpendTreeSolutions,
  BadSpendOutput,
} from "./models";
import { filterZeroUTXOs, getEfficentSolution, getTreeInputs } from "./util";
import { selectInputsForTarget } from "../solutions/selection";
import { MAX_INPUTS } from "../solutions/nullifiers";

interface ISpendSolutionSolver {
  solve(intent: SpendIntent, utxos: SpendInput[], isComplex?: boolean): SpendTreeOutput[];
}

class SpendSolutionSolver implements ISpendSolutionSolver {
  solve(intent: SpendIntent, utxos: SpendInput[], isComplex = false): SpendTreeOutput[] {
    const rawInputs = this.getSolutionInputs(intent, utxos, isComplex);
    const solutions: (SpendTreeOutput | BadSpendOutput)[] = [];

    rawInputs.forEach((raw: SpendInput[]) => {
      const inputs = filterZeroUTXOs(raw);
      if (inputs.length === 0) return;

      const { availableTrees, sortedInputs } = getTreeInputs(inputs, intent.type);
      const treeSolutions: SpendTreeSolutions = {};
      const currentTokenAddress = inputs[0]?.tokenAddress;
      const filteredRecipients = intent.recipients.filter(
        (recipient) => recipient.tokenAddress === currentTokenAddress,
      );
      const intentTotal = filteredRecipients.reduce((left, right) => left + right.amount, 0n);

      Object.entries(sortedInputs).forEach(([treeNumber, treeInputs]) => {
        const treeValue = availableTrees[treeNumber] ?? 0n;
        if (treeValue < intentTotal) return;

        const selection = selectInputsForTarget(treeInputs, intentTotal, MAX_INPUTS);
        if (!selection) return;

        const treeOutput: SpendTreeOutput = {
          inputs: selection.inputs,
          outputs: filteredRecipients.map((recipient) => ({
            value: recipient.amount,
            railgunAddress: recipient.railgunAddress,
          })),
        };

        const changeAmount = selection.total - intentTotal;
        if (changeAmount > 0n) {
          treeOutput.outputs.push({
            value: changeAmount,
            railgunAddress: intent.changeAddress,
          });
        }

        treeSolutions[treeNumber] = treeOutput;
      });

      const efficientSolution = getEfficentSolution(treeSolutions, intent);
      solutions.push(efficientSolution);
    });

    return this.resolveComplexSolutions(utxos, solutions, isComplex);
  }

  private getSolutionInputs(
    intent: SpendIntent,
    utxos: SpendInput[],
    _isComplex: boolean,
  ): SpendInput[][] {
    const tokens = new Set<string>();
    intent.recipients.forEach((recipient) => tokens.add(recipient.tokenAddress));

    const inputs: SpendInput[][] = [];
    tokens.forEach((token) => {
      inputs.push(utxos.filter((utxo) => utxo.tokenAddress === token));
    });
    return inputs;
  }

  private resolveComplexSolutions(
    utxos: SpendInput[],
    solutions: (SpendTreeOutput | BadSpendOutput)[],
    _isComplex: boolean,
  ): SpendTreeOutput[] {
    solutions.forEach((solution) => {
      if (!("error" in solution)) return;

      const failingIntent = solution.intent;
      const { splitIntent, remainderIntent } = this.splitIntent(failingIntent);

      const firstSolutions = this.solve(splitIntent, utxos, true);
      const usedInputs = new Set<string>();
      firstSolutions.forEach((solutionPart) => {
        solutionPart.inputs.forEach((input) => {
          usedInputs.add(`${input.leafIndex}:${input.treeNumber}`);
        });
        solutions.push(solutionPart);
      });

      const remainingUtxos = utxos.filter(
        (spend) => !usedInputs.has(`${spend.leafIndex}:${spend.treeNumber}`),
      );
      const secondSolutions = this.solve(remainderIntent, remainingUtxos, true);
      secondSolutions.forEach((solutionPart) => {
        solutions.push(solutionPart);
      });
    });

    return solutions.filter((solution) => !("error" in solution)) as SpendTreeOutput[];
  }

  private splitIntent(intent: SpendIntent): { splitIntent: SpendIntent; remainderIntent: SpendIntent } {
    const splitIntent: SpendIntent = {
      changeAddress: intent.changeAddress,
      recipients: [],
      type: intent.type,
    };
    const remainderIntent: SpendIntent = {
      changeAddress: intent.changeAddress,
      recipients: [],
      type: intent.type,
    };

    intent.recipients.forEach((recipient) => {
      const halved = recipient.amount / 2n;
      splitIntent.recipients.push({
        tokenAddress: recipient.tokenAddress,
        railgunAddress: recipient.railgunAddress,
        amount: halved,
      });
      remainderIntent.recipients.push({
        tokenAddress: recipient.tokenAddress,
        railgunAddress: recipient.railgunAddress,
        amount: recipient.amount - halved,
      });
    });

    return { splitIntent, remainderIntent };
  }
}

const defaultSpendSolver = new SpendSolutionSolver();

const calculateSolution = (
  intent: SpendIntent,
  utxos: SpendInput[],
  isComplex = false,
): SpendTreeOutput[] => {
  return defaultSpendSolver.solve(intent, utxos, isComplex);
};

export { calculateSolution, SpendSolutionSolver };
export type { ISpendSolutionSolver };
