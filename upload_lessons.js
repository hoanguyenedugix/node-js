import fs from "fs";
import path from "path";
import axios from "axios";

const BASE_URL_DEV = "https://icms.schoolux.ai";
const BASE_URL_PROD = "https://icms.knowylab.io";
const TOKEN =
"Bearer eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiUk9MRV9DT05URU5UX01BTkFHRVIiLCJ1c2VybmFtZSI6InR1eWVuLm5ndXllbkBlZHVnaXguY29tIiwic3ViIjoidHV5ZW4ubmd1eWVuQGVkdWdpeC5jb20iLCJpYXQiOjE3NjE3OTY0MTksImV4cCI6MTc2MTgwMDAxOX0.AoFFFBUJbMa4E-FUkdreBUCc17milJLyL7LHL_l2K_s"
const LESSON_DIR = "./html_lesson_plan"; // thư mục chứa HTML

// 🧩 Hàm bổ sung — tự động bọc HTML + meta charset nếu thiếu
function wrapHtmlIfNeeded(content) {
    const hasHtmlTag = /<html[^>]*>/i.test(content);
    const hasMeta = /<meta[^>]*charset/i.test(content);

    if (hasHtmlTag) {
        // Nếu có <html> rồi nhưng thiếu meta => thêm vào
        if (!hasMeta) {
            return content.replace(
                /<head[^>]*>/i,
                '<head>\n<meta charset="UTF-8">'
            );
        }
        return content;
    }

    // Nếu chỉ là fragment thì bọc đầy đủ
    return `<html>
  <head>
    <meta charset="UTF-8">
  </head>
  <body>
${content.trim()}
  </body>
</html>`;
}

// 🧩 1️⃣ Lấy pre-signed URL
async function getPreSignS3(name) {
    const body = {
        name,
        paths: ["index.html"],
        type: "RICH_EDITOR",
    };
    const res = await axios.post(`${BASE_URL_PROD}/lms/secure/content/v1/pre-sign-s3`, body, {
        headers: {
            Authorization: TOKEN,
            "Content-Type": "application/json",
        },
    });
    return res.data?.data;
}

// 🧩 2️⃣ Upload HTML lên S3 (fix charset)
async function uploadToS3(preSignedUrl, html) {
    await axios.put(preSignedUrl, html, {
        headers: {
            "Content-Type": "text/html",
        },
        maxBodyLength: Infinity,
    });
}

// 🧩 3️⃣ Tạo resource CMS
async function createLessonResource(uuid, name, html) {
    const body = {
        uuid,
        name,
        type: "RICH_EDITOR",
        contentResource: html.trim(),
    };

    const res = await axios.post(`${BASE_URL_PROD}/lms/secure/content/v1`, body, {
        headers: {
            Authorization: TOKEN,
            "Content-Type": "application/json; charset=utf-8", // ✅ thêm charset ở đây luôn
            Origin: BASE_URL_PROD,
            Referer: `${BASE_URL_PROD}/ui/content-resource/add-rich-editor`,
            // Referer: `${BASE_URL_PROD}/ui/content-resource/add-rich-editor`,
        },
        maxBodyLength: Infinity,
    });

    console.log(`✅ Created lesson: ${name} (${res.status})`);
    return res.data;
}

// 🧩 4️⃣ Quy trình chính
async function main() {
    const files = fs.readdirSync(LESSON_DIR).filter((f) => f.endsWith(".html"));
    console.log(`📦 Found ${files.length} HTML lessons`);

    for (const file of files) {
        let html = fs.readFileSync(path.join(LESSON_DIR, file), "utf8");

        // ✅ Bổ sung <html> + <meta charset="UTF-8"> nếu thiếu
        html = wrapHtmlIfNeeded(html);

        const name = path.basename(file, ".html");

        try {
            console.log(`🚀 Processing: ${name}`);

            const preSign = await getPreSignS3(name);
            const { uuid, preSignedUrlDTOS } = preSign;
            const uploadUrl = preSignedUrlDTOS?.[0]?.url;
            if (!uploadUrl) throw new Error("Missing pre-signed URL");

            await uploadToS3(uploadUrl, html);
            await createLessonResource(uuid, name, html);

            console.log(`🎉 Done: ${name}`);
        } catch (err) {
            console.error(`❌ Error for ${name}:`, err.response?.data || err.message);
        }

        await new Promise((r) => setTimeout(r, 1000)); // tránh rate limit
    }

    console.log("✅ All lessons uploaded successfully!");
}

main();
