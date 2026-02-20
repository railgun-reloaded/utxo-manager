import test from "brittle";
import type { SpendInput, SpendIntent } from "../src/spend";
import { calculateSolution } from "../src/spend/solution";
import { SpendingSolution } from "../src";


const getRandomTokenAddress = () => '0x' + BigInt(Math.floor(Math.random() * 2 ** 23)).toString(16).padStart(40, '0');
const generateRandom0zkAddress = () => `0zkaddress${Math.random().toString(36).substring(2, 10)}`;
const createRandomTestInputs = (count: number, tokenAddress: string): SpendInput[] => {
  const inputs: SpendInput[] = [];
  // for (let t = 0; t < 16; t++)
  for (let i = 0; i < count; i++) {
    inputs.push({
      tokenAddress,
      leafIndex: BigInt(i),
      // treeNumber: BigInt(t),
      treeNumber: BigInt(Math.floor(Math.random() * 16) + 1),
      value: BigInt(Math.floor(Math.random() * 5_000) + 1)
    });
  }
  return inputs;
}

const runRandomTestCases = (count: number, feeTokenDifferent = false): void => {
  const inputs = []
  const tokenAddresses = [];
  for (let t = 0; t < 5; t++) {
    const tokenAddress = getRandomTokenAddress();
    tokenAddresses.push(tokenAddress);
    const testInputs = createRandomTestInputs(100, tokenAddress);
    // for (let i = 0; i < count; i++) {
    inputs.push(...testInputs);
    // }
  }

  // now we go through the cases.
  const changeAddress = generateRandom0zkAddress() + 'CHANGE';
  const destination = generateRandom0zkAddress() + '';
  const feeRecipient = generateRandom0zkAddress() + 'FEE_RECIPIENT';

  for (let i = 0; i < count; i++) {
    // select payment token, and broadcast-fee token, could be the same.
    const paymentToken = tokenAddresses[Math.floor(Math.random() * tokenAddresses.length)];
    // simulate as same for now.
    const broadcastFeeToken = tokenAddresses[Math.floor(Math.random() * tokenAddresses.length)];

    const intent: SpendIntent = {
      type: SpendingSolution.Simple,
      changeAddress,
      recipients: [
        // broadcast fee is always first in the expendature
        {
          tokenAddress: feeTokenDifferent ? broadcastFeeToken! : paymentToken!,
          railgunAddress: feeRecipient,
          amount: BigInt(Math.floor(Math.random() * 500) + 1),
        },
        {
          tokenAddress: paymentToken!,
          railgunAddress: destination,
          amount: BigInt(Math.floor(Math.random() * 50_000) + 1),
        },
      ]
    }
    const solution = calculateSolution(intent, inputs)
    console.log("Test Completed", i)
    solution.forEach((s, i) => console.log('SOLUTION', i, 'inputs', s?.inputs.length, 'outputs', s?.outputs.length))
  }
}


test("Should generate valid solution for spendIntent", () => {
  // const randomToken = getRandomTokenAddress();
  // const inputs = createRandomTestInputs(10, randomToken);
  runRandomTestCases(10);
  // console.log(inputs)

})

test("Should generate valid solution for spendIntent with different feeToken", () => {
  // const randomToken = getRandomTokenAddress();
  // const inputs = createRandomTestInputs(10, randomToken);
  runRandomTestCases(10, true);
  // console.log(inputs)

})