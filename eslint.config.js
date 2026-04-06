export default [
  {
    ignores: ["node_modules/**", "coverage/**"],
  },
  {
    files: ["src/**/*.js"],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: "module",
      globals: {
        // Browser
        document: "readonly",
        window: "readonly",
        requestAnimationFrame: "readonly",
        console: "readonly",
        // Node
        process: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        Date: "readonly",
        Math: "readonly",
        Uint32Array: "readonly",
        Int16Array: "readonly",
        Float32Array: "readonly",
        Uint8Array: "readonly",
        Array: "readonly",
        String: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["error", { args: "none", varsIgnorePattern: "^_" }],
      "no-undef": "error",
      "no-redeclare": "off",
      "no-var": "error",
      "prefer-const": ["error", { destructuring: "all" }],
      eqeqeq: ["error", "always"],
      "no-eval": "error",
      "no-unreachable": "error",
      "no-dupe-keys": "error",
      "no-duplicate-case": "error",
      "valid-typeof": "error",
    },
  },
];
