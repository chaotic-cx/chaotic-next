/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./src/**/*.{html,ts}",
        "./node_modules/flowbite/**/*.js", // add this line
    ],
    theme: {
        fontFamily: {
            sans: ["Fira Sans", "ui-sans-serif", "system-ui"],
            serif: ["Fira Sans", "ui-serif", "Georgia"],
            mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular"],
            display: ["Fira Sans"],
            body: ['"Fira Sans"'],
        },
        extend: {},
    },
    plugins: [require("flowbite/plugin"), require("@catppuccin/tailwindcss")],
};
