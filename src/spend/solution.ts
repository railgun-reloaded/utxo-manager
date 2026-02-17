// we start off with a spend intent, this is used to determine the solution goal.
// lets say we start off with ALL utxos (all tokens, and need to pick through);

import type { BadSpendOutput, SpendInput, SpendIntent, SpendTreeOutput, SpendTreeSolutions } from './models'
import { filterZeroUTXOs, getEfficentSolution, getTreeInputs } from './util'

// alter this function to handle same token, 'new solution'
// technically each 'input' becomes a desired 'output solution'
/**
 *
 * @param intent
 * @param utxos
 * @param isComplex
 */
const getSolutionInputs = (intent: SpendIntent, utxos: SpendInput[], isComplex = false) => {
  // NEED TO RETHINK THIS, so if we are now handling 'duplicates' as extra solutions, we need to think or restructure that idea.
  // as the 'first solution' needs to reduce the inputs from the incoming utxos, otherwise they both could spend
  // from the same tree?
  const tokens = new Set('')
  intent.recipients.forEach(r => tokens.add(r.tokenAddress))

  const inputs: SpendInput[][] = []
  tokens.forEach(token => {
    const _inputs = utxos.filter(utxo => utxo.tokenAddress === token)
    inputs.push(_inputs)
  })
  // utxos.filter(utxo => tokens.has(utxo.tokenAddress));
  return inputs
}

// const calculateSolutions = (intent: SpendIntent, utxos: SpendInput[]) => {

//   // find the different tokens and create solutions for each
//   const tokens = new Set();
//   intent.recipients.forEach(r => tokens.add(r.tokenAddress));

// }

// tmp solution for checking used commitments.
/**
 *
 * @param intent
 * @param utxos
 * @param isComplex
 */
const calculateSolution = (intent: SpendIntent, utxos: SpendInput[], isComplex = false): (SpendTreeOutput | undefined)[] => {
  // need to filter out 'used' utxos
  const _raw = getSolutionInputs(intent, utxos, isComplex)

  const solutions: (SpendTreeOutput | BadSpendOutput)[] = []
  _raw.forEach((raw: SpendInput[]) => {
    const inputs = filterZeroUTXOs(raw)
    const { availableTrees, sortedInputs } = getTreeInputs(inputs, intent.type)

    const treeSolutions: SpendTreeSolutions = {}
    const currentTokenAddress = inputs[0]?.tokenAddress
    Object.entries(sortedInputs).forEach(([treeNumber, treeInputs]) => {
      const treeValue = availableTrees[treeNumber] ?? 0n

      const filteredRecipients = intent.recipients.filter(r => r.tokenAddress === currentTokenAddress)
      const intentTotal = filteredRecipients.reduce((left, right) => left + right.amount, 0n)
      if (treeValue > 0n) {
        // console.log("TREE HAS VALUE", treeValue)
        const treeOutput: SpendTreeOutput = {
          inputs: [],
          outputs: [],
        }
        // const diff = treeValue - intentTotal;
        if (treeValue > intentTotal) {
          // we have enough in this tree lets calculate.
          let filledAmount = 0n
          while (filledAmount < intentTotal) {
            const input = treeInputs.pop()
            if (!input) {
              throw new Error(`No more input UTXO in tree ${treeNumber}, solution not found.`)
            }
            filledAmount += input.value
            treeOutput.inputs.push(input)
          }
          // if we get here, it means we have enough to fill the spendIntent, lets add the recipients to the outputs,
          // and handle any change.

          filteredRecipients.forEach(recipient => {
            treeOutput.outputs.push({
              value: recipient.amount,
              railgunAddress: recipient.railgunAddress
            })
          })
          const changeAmount = filledAmount - intentTotal
          if (changeAmount > 0n) {
            treeOutput.outputs.push({
              value: changeAmount,
              railgunAddress: intent.changeAddress
            })
          }
          treeSolutions[treeNumber] = treeOutput
        }
        //  else {
        //   // console.log('Diff', diff)

        // }
      }
    })

    // if we get here and solution is undefined, we should see if
    const efficienctSolution =
      getEfficentSolution(treeSolutions, intent)
    // if (!efficienctSolution) {
    //   // if we are here, we dont have enough funds across a single tree.
    //   // we should complex-spend across multi-tree

    //   // there is a condition prior to reaching this stage,
    //   // and that is 'enough funds on a single tree' but not within the correct limitations of nullifier count.
    //   // so we then preceed this current phase: detection with handling these.
    //   // we will need to create multiple solutions per tree first, and if this fails we attempt:
    //   // max single solution per tree & multi-trees first; if we cant, try multi-solution per tree /multi-tree

    //   // console.log(treeSolutions)

    //   // split the intents up for now by 2n
    //   // hack it for now... and uhm we now just submit it twice and
    //   const newIntent: SpendIntent = {
    //     changeAddress: intent.changeAddress,
    //     recipients: [],
    //     type: intent.type
    //   }
    //   const secondIntent: SpendIntent = {
    //     changeAddress: intent.changeAddress,
    //     recipients: [],
    //     type: intent.type
    //   }
    //   intent.recipients.forEach((r) => {
    //     const halved = r.amount / 2n;
    //     const halvedRecipient = {
    //       tokenAddress: r.tokenAddress,
    //       railgunAddress: r.railgunAddress,
    //       amount: halved
    //       // TODO: THIS IS IMPORTANT TO COME BACK TO, this logic is not sound. need to amount - halved, to find actual remainder.
    //     }
    //     const secondRecipient = {
    //       tokenAddress: r.tokenAddress,
    //       railgunAddress: r.railgunAddress,
    //       amount: r.amount - halved
    //       // TODO: THIS IS IMPORTANT TO COME BACK TO, this logic is not sound. need to amount - halved, to find actual remainder.
    //     }
    //     newIntent.recipients.push(halvedRecipient);
    //     secondIntent.recipients.push(secondRecipient);
    //   })
    //   // return this file with new intent.

    //   const a = calculateSolution(newIntent, utxos, true);
    //   // check for solution,
    //   const usedInputs = new Set("")
    //   for (const ab of a) {

    //     if (!ab) {
    //       throw new Error("No AA solution found");
    //     }
    //     ab.inputs.forEach(i => usedInputs.add(`${i.leafIndex}:${i.treeNumber}`))
    //     // usedInputs.add(...ab.inputs)
    //     solutions.push(ab)
    //   }
    //   // filter out the used inputs into the new utxos
    //   const futxos = utxos.filter(spend => {
    //     return !usedInputs.has(`${spend.leafIndex}:${spend.treeNumber}`);
    //   })
    //   const b = calculateSolution(secondIntent, futxos, true)

    //   for (const bb of b) {
    //     if (!bb) {
    //       throw new Error("No BB solution found");
    //     }
    //     solutions.push(bb)
    //   }

    //   console.log('COMPLEX FOUND')
    //   solutions.forEach(s => {
    //     console.log('solution', s)
    //   })
    //   // return _solutions;
    //   // newIntent.recipients
    //   // solutions.push(..._solutions);
    //   // throw new Error("We need to create complex solution.")
    // } else {
    // if (!('error' in efficienctSolution))
    solutions.push(efficienctSolution!)
    // }
    // return efficienctSolution;
  })
  // let undefinedfound = false;
  solutions.forEach(_a => {
    if ('error' in _a) {
      const _intent = _a.intent

      // console.log("ERROR IN ", _intent)

      // if (typeof a == 'undefined') {
      // undefinedfound = true

      const newIntent: SpendIntent = {
        changeAddress: _intent.changeAddress,
        recipients: [],
        type: _intent.type
      }
      const secondIntent: SpendIntent = {
        changeAddress: intent.changeAddress,
        recipients: [],
        type: intent.type
      }
      _intent.recipients.forEach((r) => {
        const halved = r.amount / 2n
        const halvedRecipient = {
          tokenAddress: r.tokenAddress,
          railgunAddress: r.railgunAddress,
          amount: halved
          // TODO: THIS IS IMPORTANT TO COME BACK TO, this logic is not sound. need to amount - halved, to find actual remainder.
        }
        const secondRecipient = {
          tokenAddress: r.tokenAddress,
          railgunAddress: r.railgunAddress,
          amount: r.amount - halved
          // TODO: THIS IS IMPORTANT TO COME BACK TO, this logic is not sound. need to amount - halved, to find actual remainder.
        }
        newIntent.recipients.push(halvedRecipient)
        secondIntent.recipients.push(secondRecipient)
      })
      const a = calculateSolution(newIntent, utxos, true)
      // check for solution,
      const usedInputs = new Set('')
      for (const ab of a) {
        if (!ab) {
          throw new Error('No AA solution found')
        }
        ab.inputs.forEach(i => usedInputs.add(`${i.leafIndex}:${i.treeNumber}`))
        // usedInputs.add(...ab.inputs)
        solutions.push(ab)
      }
      // filter out the used inputs into the new utxos
      const futxos = utxos.filter(spend => {
        return !usedInputs.has(`${spend.leafIndex}:${spend.treeNumber}`)
      })
      const b = calculateSolution(secondIntent, futxos, true)

      for (const bb of b) {
        if (!bb) {
          throw new Error('No BB solution found')
        }
        solutions.push(bb)
      }

      console.log('COMPLEX FOUND')
      console.log(solutions)
    }
  })

  // if (undefinedfound) {
  //   // if we are here, we dont have enough funds across a single tree.
  //   // we should complex-spend across multi-tree

  //   // there is a condition prior to reaching this stage,
  //   // and that is 'enough funds on a single tree' but not within the correct limitations of nullifier count.
  //   // so we then preceed this current phase: detection with handling these.
  //   // we will need to create multiple solutions per tree first, and if this fails we attempt:
  //   // max single solution per tree & multi-trees first; if we cant, try multi-solution per tree /multi-tree

  //   // console.log(treeSolutions)

  //   // split the intents up for now by 2n
  //   // hack it for now... and uhm we now just submit it twice and
  //   const newIntent: SpendIntent = {
  //     changeAddress: intent.changeAddress,
  //     recipients: [],
  //     type: intent.type
  //   }
  //   const secondIntent: SpendIntent = {
  //     changeAddress: intent.changeAddress,
  //     recipients: [],
  //     type: intent.type
  //   }
  //   intent.recipients.forEach((r) => {
  //     const halved = r.amount / 2n;
  //     const halvedRecipient = {
  //       tokenAddress: r.tokenAddress,
  //       railgunAddress: r.railgunAddress,
  //       amount: halved
  //       // TODO: THIS IS IMPORTANT TO COME BACK TO, this logic is not sound. need to amount - halved, to find actual remainder.
  //     }
  //     const secondRecipient = {
  //       tokenAddress: r.tokenAddress,
  //       railgunAddress: r.railgunAddress,
  //       amount: r.amount - halved
  //       // TODO: THIS IS IMPORTANT TO COME BACK TO, this logic is not sound. need to amount - halved, to find actual remainder.
  //     }
  //     newIntent.recipients.push(halvedRecipient);
  //     secondIntent.recipients.push(secondRecipient);
  //   })
  //   // return this file with new intent.

  //   const a = calculateSolution(newIntent, utxos, true);
  //   // check for solution,
  //   const usedInputs = new Set("")
  //   for (const ab of a) {

  //     if (!ab) {
  //       throw new Error("No AA solution found");
  //     }
  //     ab.inputs.forEach(i => usedInputs.add(`${i.leafIndex}:${i.treeNumber}`))
  //     // usedInputs.add(...ab.inputs)
  //     solutions.push(ab)
  //   }
  //   // filter out the used inputs into the new utxos
  //   const futxos = utxos.filter(spend => {
  //     return !usedInputs.has(`${spend.leafIndex}:${spend.treeNumber}`);
  //   })
  //   const b = calculateSolution(secondIntent, futxos, true)

  //   for (const bb of b) {
  //     if (!bb) {
  //       throw new Error("No BB solution found");
  //     }
  //     solutions.push(bb)
  //   }

  //   console.log('COMPLEX FOUND')

  //   // return _solutions;
  //   // newIntent.recipients
  //   // solutions.push(..._solutions);
  //   // throw new Error("We need to create complex solution.")

  // }
  // filter undefineds
  const filteredSolutions = solutions.filter(s => !('error' in s))
  // filteredSolutions.forEach(s => {
  //   console.log('solution', s)
  // })
  return filteredSolutions as SpendTreeOutput[]
}

export { calculateSolution }
