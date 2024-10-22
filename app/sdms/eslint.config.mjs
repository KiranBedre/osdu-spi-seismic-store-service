// eslint-disable-file
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import stylistic from '@stylistic/eslint-plugin';

export default tseslint.config(
  // plugins
  {
    /* eslint-disable no-useless-computed-key */
    plugins: {
      '@stylistic': stylistic,
    },
    /* eslint-enable no-useless-computed-key */
  },
  // include files
  {
    files: ['src/**/*.ts'],
  },
  // ignores
  {
    // config with just ignores is the replacement for `.eslintignore`
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/tests/**',
      '**/devops/scripts/**',
      'eslint.config.mjs',
    ],
  },
  // extends
  eslint.configs.recommended,
  // recommended code rules for typescript projects
  ...tseslint.configs.recommendedTypeChecked,
  // recommended style rules for typescript projects
  ...tseslint.configs.stylisticTypeChecked,
  // basic config
  {
    languageOptions: {
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        projectService: true,
        warnOnUnsupportedTypeScriptVersion: false,
      }
    },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    // rules specific customization
    rules: {
      // style rules
      // disabled rules
      'max-classes-per-file': ['off'],
      'member-ordering': ['off'],
      'no-string-literal': ['off'],
      'object-literal-shorthand': ['off'],
      // enabled rules
      '@stylistic/no-trailing-spaces': ['error'],
      // enabled with custom rules
      '@stylistic/max-len': ['error', { 'code': 120 }],
      'no-console': ['warn', { allow: ['debug', 'info', 'log', 'time', 'timeEnd', 'trace'] }],
      // rules disabled but later need to be addressed and switched to 'quotes': ['error', 'single'],
      'quotes': ['off'],
      // code rules
      // disabled rules
      '@typescript-eslint/prefer-nullish-coalescing': ['off'],
      // rules disabled but later need to be addressed and switched to '@typescript-eslint/no-floating-promises': ['error'],
      '@typescript-eslint/no-floating-promises': ['off'],
      // rules disabled but later need to be addressed and removed from this file
      'no-case-declarations': ['off'],
      'no-constant-binary-expression': ['off'],
      'no-extra-boolean-cast': ['off'],
      'no-prototype-builtins': ['off'],
      'no-unsafe-optional-chaining': ['off'],
      'no-useless-escape': ['off'],
      'prefer-const': ['off'],
      '@typescript-eslint/await-thenable': ['off'],
      '@typescript-eslint/consistent-generic-constructors': ['off'],
      '@typescript-eslint/consistent-indexed-object-style': ['off'],
      '@typescript-eslint/dot-notation': ['off'],
      '@typescript-eslint/no-array-constructor': ['off'],
      '@typescript-eslint/no-base-to-string': ['off'],
      '@typescript-eslint/no-empty-object-type': ['off'],
      '@typescript-eslint/no-explicit-any': ['off'],
      '@typescript-eslint/no-inferrable-types': ['off'],
      '@typescript-eslint/no-misused-promises': ['off'],
      '@typescript-eslint/no-redundant-type-constituents': ['off'],
      '@typescript-eslint/no-require-imports': ['off'],
      '@typescript-eslint/no-this-alias': ['off'],
      '@typescript-eslint/no-unnecessary-type-assertion': ['off'],
      '@typescript-eslint/no-unsafe-argument': ['off'],
      '@typescript-eslint/no-unsafe-assignment': ['off'],
      '@typescript-eslint/no-unsafe-call': ['off'],
      '@typescript-eslint/no-unsafe-enum-comparison': ['off'],
      '@typescript-eslint/no-unsafe-member-access': ['off'],
      '@typescript-eslint/no-unsafe-return': ['off'],
      '@typescript-eslint/no-unused-expressions': ['off'],
      '@typescript-eslint/no-unused-vars': ['off'],
      '@typescript-eslint/only-throw-error': ['off'],
      '@typescript-eslint/prefer-find': ['off'],
      '@typescript-eslint/prefer-includes': ['off'],
      '@typescript-eslint/prefer-optional-chain': ['off'],
      '@typescript-eslint/prefer-promise-reject-errors': ['off'],
      '@typescript-eslint/prefer-regexp-exec': ['off'],
      '@typescript-eslint/require-await': ['off'],
      '@typescript-eslint/restrict-plus-operands': ['off'],
      '@typescript-eslint/unbound-method': ['off'],
    }
  }
);