import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import vue from 'eslint-plugin-vue'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'unpackage/**', 'src/custom-tab-bar/**', '.mockups/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    files: ['src/**/*.{ts,vue}'],
    languageOptions: {
      parserOptions: { parser: tseslint.parser, extraFileExtensions: ['.vue'] },
      globals: { ...globals.browser, uni: 'readonly', uniCloud: 'readonly', wx: 'readonly' },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': ['error', { allowExpressions: true }],
      'vue/multi-word-component-names': 'off',
      'prefer-template': 'error',
    },
  },
  {
    // 云函数是 CommonJS，运行在 uniCloud（Node）里
    files: ['uniCloud-aliyun/**/*.js', 'uniCloud-alipay/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { ...globals.node, uniCloud: 'readonly' },
    },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  prettier
)
