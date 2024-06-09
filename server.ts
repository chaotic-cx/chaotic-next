import express from "express"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

// The Express app is exported so that it can be used by serverless Functions.
export function app(): express.Express {
    const server = express()
    const serverDistFolder = dirname(fileURLToPath(import.meta.url))
    const browserDistFolder = resolve(serverDistFolder, "../browser")
    const indexHtml = join(serverDistFolder, "index.server.html")

    server.set("view engine", "html")
    server.set("views", browserDistFolder)

    // Example Express Rest API endpoints
    // server.get('/api/**', (req, res) => { });
    // Serve static files from /browser
    server.get(
        "**",
        express.static(browserDistFolder, {
            maxAge: "1y",
            index: "index.html",
        }),
    )
    return server
}

function run(): void {
    const port = process.env["PORT"] || 4000

    // Start up the Node server
    const server = app()
    server.listen(port, () => {
        console.log(`Node Express server listening on http://localhost:${port}`)
    })
}

run()
