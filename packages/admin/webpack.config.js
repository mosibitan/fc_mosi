const { resolve, join } = require("path");
const { readFileSync, writeFileSync } = require("fs");
const { EnvironmentPlugin } = require("webpack");
const { InjectManifest } = require("workbox-webpack-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const { CleanWebpackPlugin } = require("clean-webpack-plugin");
const WebpackPwaManifest = require("webpack-pwa-manifest");
const sharp = require("sharp");
const { version } = require("../../package.json");

function removeTrailingSlash(url) {
    return url.replace(/(\/*)$/, "");
}

const out = process.env.PL_ADMIN_DIR || resolve(__dirname, "dist");
const serverUrl = process.env.PL_SERVER_URL || `http://0.0.0.0:${process.env.PL_SERVER_PORT || 3000}`;
const pwaUrl = process.env.PL_PWA_URL || `http://localhost:${process.env.PL_ADMIN_PORT || 9090}`;
const rootDir = resolve(__dirname, "../..");
const assetsDir = resolve(rootDir, process.env.PL_ASSETS_DIR || "assets");
const adminUrlPath = process.env.PL_ADMIN_URL_PATH || "/";
const adminUrl = removeTrailingSlash(process.env.PL_ADMIN_URL || `${pwaUrl}${adminUrlPath}`);

const { name, terms_of_service } = require(join(assetsDir, "manifest.json"));

const isBuildingLocally = pwaUrl.startsWith("http://localhost");

module.exports = {
    entry: resolve(__dirname, "src/index.ts"),
    output: {
        path: out,
        filename: "[name].js",
        chunkFilename: "[name].chunk.js",
        publicPath: adminUrlPath,
    },
    mode: "development",
    devtool: "source-map",
    stats: "minimal",
    resolve: {
        extensions: [".ts", ".js", ".css", ".svg", ".png", ".jpg"],
        alias: {
            assets: assetsDir,
        },
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                loader: "ts-loader",
            },
            {
                test: /\.css$/,
                use: ["style-loader", "css-loader"],
            },
            {
                test: /\.(woff|woff2|eot|ttf|otf|svg)$/,
                use: ["file-loader"],
            },
            {
                test: /\.txt|md$/i,
                use: "raw-loader",
            },
        ],
    },
    plugins: [
        new EnvironmentPlugin({
            PL_APP_NAME: name,
            PL_PWA_URL: pwaUrl,
            PL_SERVER_URL: serverUrl,
            PL_BILLING_ENABLED: null,
            PL_BILLING_DISABLE_PAYMENT: null,
            PL_BILLING_STRIPE_PUBLIC_KEY: null,
            PL_SUPPORT_EMAIL: "support@padloc.app",
            PL_VERSION: version,
            PL_VENDOR_VERSION: version,
            PL_DISABLE_SW: false,
            PL_CLIENT_SUPPORTED_AUTH_TYPES: "email",
            PL_TERMS_OF_SERVICE: terms_of_service,
        }),
        new CleanWebpackPlugin(),
        {
            apply(compiler) {
                compiler.hooks.compilation.tap("Update CSP - dev", (compilation) => {
                    HtmlWebpackPlugin.getHooks(compilation).beforeEmit.tapAsync(
                        "Update CSP - dev",
                        (data, callback) => {
                            if (!isBuildingLocally) {
                                callback(null, data);
                                return;
                            }

                            const builtFilesForCsp = new Map([
                                ["script-src", [""]],
                                ["font-src", [""]],
                                ["img-src", [""]],
                                ["manifest-src", [""]],
                            ]);

                            // Manually add the root for the CSP meta tag
                            for (const cspRule of builtFilesForCsp.keys()) {
                                const files = builtFilesForCsp.get(cspRule);

                                data.html = data.html.replace(
                                    `[REPLACE_${cspRule.replace("-src", "").toUpperCase()}]`,
                                    `${files.map((file) => `${adminUrl}/${file}`).join(" ")}`
                                );
                            }

                            // Add the websocket URL + PWA URL of webpack-dev-server to connect-src when building locally, or nothing otherwise
                            const connectReplacement = `ws://localhost:${
                                process.env.PL_ADMIN_PORT || 9090
                            }/ws ${adminUrl}`;
                            data.html = data.html.replace("[REPLACE_CONNECT]", connectReplacement);

                            callback(null, data);
                        }
                    );

                    return true;
                });
            },
        },
        new HtmlWebpackPlugin({
            title: name,
            template: resolve(__dirname, "src/index.html"),
            meta: {
                "Content-Security-Policy": {
                    "http-equiv": "Content-Security-Policy",
                    content: `default-src 'none'; base-uri 'none'; script-src blob: [REPLACE_SCRIPT]; connect-src ${serverUrl} https://api.pwnedpasswords.com [REPLACE_CONNECT]; style-src 'unsafe-inline'; font-src [REPLACE_FONT]; object-src blob:; frame-src blob:; img-src [REPLACE_IMG] blob: data: https://icons.duckduckgo.com; manifest-src [REPLACE_MANIFEST]; worker-src ${adminUrl}/sw.js;`,
                },
            },
        }),
        new WebpackPwaManifest({
            name: name,
            short_name: name,
            icons: [
                {
                    src: resolve(__dirname, assetsDir, "app-icon.png"),
                    sizes: [96, 128, 192, 256, 384, 512],
                },
            ],
        }),
        new InjectManifest({
            swSrc: resolve(__dirname, "../app/src/sw.ts"),
            swDest: "sw.js",
            exclude: [/favicon\.png$/, /\.map$/],
        }),
        {
            apply(compiler) {
                compiler.hooks.emit.tapPromise("Generate Favicon", async (compilation) => {
                    const icon = await sharp(resolve(__dirname, assetsDir, "app-icon.png"))
                        .resize({
                            width: 256,
                            height: 256,
                        })
                        .toBuffer();

                    Compilation.hooks.processAssets["favicon.png"] = {
                        source: () => icon,
                        size: () => Buffer.byteLength(icon),
                    };

                    return true;
                });
            },
        },
        {
            apply(compiler) {
                compiler.hooks.afterEmit.tapPromise("Store Built Files for CSP - non-dev", async (compilation) => {
                    if (isBuildingLocally) {
                        // Skip
                        return true;
                    }

                    const fileExtensionsToCspRule = new Map([
                        ["js", "script-src"],
                        ["map", "script-src"],
                        ["woff2", "font-src"],
                        ["svg", "img-src"],
                        ["png", "img-src"],
                        ["json", "manifest-src"],
                    ]);
                    const builtFilesForCsp = new Map([
                        ["script-src", []],
                        ["font-src", []],
                        ["img-src", []],
                        ["manifest-src", []],
                    ]);

                    const assets = compilation.getAssets();

                    const htmlFilePath = resolve(out, "index.html");
                    let htmlFileContents = readFileSync(htmlFilePath, "utf-8");

                    for (const asset of assets) {
                        // Skip the file we're writing to!
                        if (asset.name === "index.html") {
                            continue;
                        }

                        const fileExtension = asset.name.split(".").pop();

                        if (!fileExtensionsToCspRule.has(fileExtension)) {
                            // NOTE: Throwing an error in this hook is silently ignored, so we need to just log it and keep going
                            console.error(`No CSP rule found for ".${fileExtension}"! (${asset.name})`);
                            continue;
                        }

                        const cspRule = fileExtensionsToCspRule.get(fileExtension);

                        if (!builtFilesForCsp.has(cspRule)) {
                            // NOTE: Throwing an error in this hook is silently ignored, so we need to just log it and keep going
                            console.error(`No CSP rule found for "${cspRule}"! (${fileExtension})`);
                            continue;
                        }

                        builtFilesForCsp.get(cspRule).push(asset.name);
                    }

                    // Manually add the files in for the CSP meta tag
                    for (const cspRule of builtFilesForCsp.keys()) {
                        // Sort all files first
                        const files = builtFilesForCsp.get(cspRule);
                        files.sort();

                        htmlFileContents = htmlFileContents.replace(
                            `[REPLACE_${cspRule.replace("-src", "").toUpperCase()}]`,
                            `${files.map((file) => `${adminUrl}/${file}`).join(" ")}`
                        );
                    }

                    // Nothing more to connect to, in non-dev
                    htmlFileContents = htmlFileContents.replace("[REPLACE_CONNECT]", "");

                    // Fix favicon path for subpath installs
                    if (adminUrlPath !== "/") {
                        htmlFileContents = htmlFileContents.replaceAll(
                            `"/favicon.png"`,
                            `"${adminUrlPath}favicon.png"`
                        );
                    }

                    writeFileSync(htmlFilePath, htmlFileContents, "utf-8");

                    return true;
                });
            },
        },
    ],
    devServer: {
        historyApiFallback: true,
        host: "0.0.0.0",
        port: process.env.PL_ADMIN_PORT || 9090,
        // hot: false,
        // liveReload: false,
        client: { overlay: false },
    },
};
