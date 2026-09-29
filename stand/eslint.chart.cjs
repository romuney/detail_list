// ESLint для чарта: вызов несуществующей функции (no-undef) и ES5.
// node --check ловит только синтаксис, smoke скилла — только то, до чего дошёл клик.
//
//   node $(npm root -g)/eslint/bin/eslint.js -c stand/eslint.chart.cjs --no-config-lookup proteus/detail-list.chart.js
//
// Нет ESLint — npm i -g eslint. Ошибок должно быть 0; предупреждения — неиспользованные
// параметры catch (в ES5 без них нельзя).
module.exports = [{
  files: ['**/*.js'],
  languageOptions: {
    ecmaVersion: 5,
    sourceType: 'script',
    // Что даёт песочница Proteus (react_sanbbox) и браузер; data / applyCrossFilter / option — контракт чарта.
    globals: {
      window: 'readonly', document: 'readonly', navigator: 'readonly', console: 'readonly',
      getComputedStyle: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly', innerWidth: 'readonly',
      ResizeObserver: 'readonly', Element: 'readonly', atob: 'readonly', TextDecoder: 'readonly',
      Uint8Array: 'readonly', JSON: 'readonly', escape: 'readonly',
      data: 'readonly', applyCrossFilter: 'readonly', option: 'writable'
    }
  },
  rules: {
    'no-undef': 'error',
    'no-unused-vars': ['warn', { vars: 'local', args: 'none' }]
  }
}];
