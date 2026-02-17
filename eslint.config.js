module.exports = [
  ...require('@railgun-reloaded/eslint-config')(),
  {
    name: 'utxo-solver/disable-jsdoc',
    rules: {
      'jsdoc/require-jsdoc': 'off',
      'jsdoc/require-description': 'off',
      'jsdoc/require-returns': 'off',
      'jsdoc/require-param-description': 'off',
    },
  },
]
