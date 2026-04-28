module.exports = {
  default: {
    requireModule: ['tsx/cjs'],
    require: ['features/step_definitions/hooks.ts', 'features/step_definitions/steps.ts'],
    paths: ['features/*.feature'],
    format: ['progress-bar'],
    parallel: 0,
  },
};
