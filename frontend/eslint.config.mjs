import path from "node:path"
import { fileURLToPath } from "node:url"
import { FlatCompat } from "@eslint/eslintrc"
import js from "@eslint/js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all,
})
import defaultExport from "../eslint.config.mjs"

export default [
    {
        ignores: ["!**/*"],
    },
    ...defaultExport,
    ...compat
        .extends("plugin:@nx/angular", "plugin:@angular-eslint/template/process-inline-templates")
        .map((config) => ({
            ...config,
            files: ["**/*.ts"],
        })),
    {
        files: ["**/*.ts"],

        rules: {
            "@angular-eslint/directive-selector": [
                "error",
                {
                    type: "attribute",
                    prefix: "app",
                    style: "camelCase",
                },
            ],

            "@angular-eslint/component-selector": [
                "error",
                {
                    type: "element",
                    prefix: "app",
                    style: "kebab-case",
                },
            ],
        },
    },
    ...compat.extends("plugin:@nx/angular-template").map((config) => ({
        ...config,
        files: ["**/*.html"],
    })),
    {
        files: ["**/*.html"],
        rules: {},
    },
]
