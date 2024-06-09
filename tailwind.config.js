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
    },
    plugins: [require("@catppuccin/tailwindcss"), require("autoprefixer")],
}
