/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./src/**/*.{html,ts}",
        "./node_modules/flowbite/**/*.js", // add this line
    ],
    theme: {
        container: {
            center: true,
        },
        extend: {
            screens: {
                "3xl": "1600px",
                "4xl": "1920px",
                "5xl": "2200px",
            },
        },
        fontFamily: {
            sans: ["Fira Sans", "ui-sans-serif", "system-ui"],
            serif: ["Fira Sans", "ui-serif", "Georgia"],
            mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular"],
            display: ["Fira Sans"],
            body: ['"Fira Sans"'],
        },
    },
    plugins: [require("flowbite/plugin"), require("@catppuccin/tailwindcss")],
};
