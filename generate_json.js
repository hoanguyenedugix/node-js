// use for run collect postman
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";

const LESSON_DIR = "./syllabus"; // thư mục chứa HTML
const files = fs.readdirSync(LESSON_DIR).filter(f => f.endsWith(".html"));

function cleanHtml(html) {
  return html
    .replace(/\r?\n|\r/g, " ") // bỏ xuống dòng
    .replace(/\s+/g, " ") // gom whitespace
    .replace(/"/g, '\\"'); // escape dấu "
}

const lessons = [];

for (const file of files) {
  const name = path.basename(file, ".html");
  const htmlRaw = fs.readFileSync(path.join(LESSON_DIR, file), "utf8");
  const html = cleanHtml(htmlRaw.trim());

  lessons.push({
    uuid: "4fdcc139-8313-4ddc-bdfd-943a735a4b49",
    name,
    type: "RICH_EDITOR",
    contentResource: html
  });
}

fs.writeFileSync("syllabus.json", JSON.stringify(lessons, null, 2), "utf8");
console.log("✅ lessons.json created successfully!");
