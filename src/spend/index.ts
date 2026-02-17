export type * from './models'

/*
  so we generate spend intents, from there the solver is passed these, and utxo's to attempt to fulfill the intent.
  each railgun transaction can have a single token, but many outputs(recipients). ie max ratio input + output = 14.

  so this means we can have a number of different spending solutions.

  ideally we would like to create a transaction with the lowest inputs/outputs but this might not be solvable,
  need to potentially break down into many railgun transactions. ie: max inputs filled for dest + change (2)
  and we sill have X+n recipients to add.

*/
