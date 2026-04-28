module.exports = {
  default: {
    paths: ['features/**/*.feature'],
    require: ['features/step_definitions/**/*.ts', 'features/support/**/*.ts'],
    requireModule: ['tsx/cjs'],
    format: ['summary', 'progress'],
  },
};
