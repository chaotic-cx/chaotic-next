import { default as eslint, default as eslintPluginDeprecation } from "@eslint/js"
import eslintConfigPrettier from "eslint-config-prettier"
import tseslint from "typescript-eslint"

export default tseslint.config(
    {
        files: ["src/**.ts"],
        extends: [
            eslint.configs.recommended,
            ...tseslint.configs.recommended,
            ...tseslint.configs.stylistic,
            eslintConfigPrettier,
        ],
        languageOptions: {
            parser: tseslint.parser,
            parserOptions: {
                project: "./tsconfig.json",
                tsconfigRootDir: import.meta.dirname,
            },
        },
        linterOptions: {
            reportUnusedDisableDirectives: true,
        },
        plugins: {
            deprecation: eslintPluginDeprecation,
        },
        rules: {
            ...eslintPluginDeprecation.configs.recommended.rules,
            "no-undef": "off",
        },
    },
    {
        // disable type-aware linting on JS files
        files: ["**/*.js"],
        ...tseslint.configs.disableTypeChecked,
    },
)
