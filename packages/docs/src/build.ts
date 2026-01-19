import * as fs from "fs";
import * as path from "path";

const contentDir = path.resolve(__dirname, "../content");
const distDir = __dirname;

if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir);
}

const files = fs.readdirSync(contentDir);
files.forEach((file) => {
    if (file.endsWith(".md")) {
        const content = fs.readFileSync(path.join(contentDir, file), "utf-8");
        const html = `<html><body><pre>${content}</pre></body></html>`;
        const outFile = path.join(distDir, file.replace(".md", ".html"));
        fs.writeFileSync(outFile, html);
        console.log(`Built ${outFile}`);
    }
});
