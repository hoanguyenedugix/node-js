import fs from "fs";
import path from "path";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();


// ======================================================
// 🔧 1️⃣ Đọc ENV
// ======================================================
const ENV = process.env.ENV || "dev";

const BASE_URL =
  ENV === "prod" ? process.env.BASE_URL_PROD : process.env.BASE_URL_DEV;
const BASIC_AUTH =
  ENV === "prod" ? process.env.BASIC_AUTH_PROD : process.env.BASIC_AUTH_DEV;
const LOGIN_URL = `${BASE_URL}${process.env.LOGIN_PATH}`;
const PRE_SIGN_PATH = `${BASE_URL}${process.env.PRE_SIGN_PATH}`;
const CONTENT_PATH = `${BASE_URL}${process.env.CONTENT_PATH}`;
const TOKEN_CACHE = process.env.TOKEN_CACHE || "./token_cache.json";
const LESSON_DIR = process.env.LESSON_DIR || "./html_syllabus";

console.log(`🌍 Environment: ${ENV.toUpperCase()} (${BASE_URL})`);

// ======================================================
// 🔑 2️⃣ Đăng nhập & lấy token
// ======================================================

async function loginAndGetToken() {
  console.log(`🔑 Logging in to get new token (${ENV.toUpperCase()})...`);

  const config = {
    method: "POST",
    url: LOGIN_URL,
    headers: {
      Authorization: BASIC_AUTH,
      Accept: "application/json, text/plain, */*",
    },
    validateStatus: (s) => true,
  };

  if (ENV === "dev") {
    // ✅ DEV cần gửi data "null" và thêm headers
    config.headers["Content-Type"] = "application/json";
    config.headers["Origin"] = BASE_URL;
    config.headers["Referer"] = `${BASE_URL}/ui/login`;
    config.data = "null"; // quan trọng
  } else {
    // ✅ PROD: chỉ gửi Authorization, không có body
  }

  const res = await axios(config);

  if (res.status !== 200) {
    console.error("❌ Login failed:", res.status, res.data);
    throw new Error(`Login failed with status ${res.status}`);
  }

  const accessToken = res.data?.accessToken;
  if (!accessToken) throw new Error("Login response missing accessToken");

  const [, payloadB64] = accessToken.split(".");
  const payload = JSON.parse(Buffer.from(payloadB64, "base64").toString("utf8"));
  const expiresAt = payload.exp * 1000;

  const tokenData = { accessToken, expiresAt, fetchedAt: Date.now(), ENV };
  fs.writeFileSync(TOKEN_CACHE, JSON.stringify(tokenData, null, 2));
  console.log("✅ Token saved to cache");
  return `Bearer ${accessToken}`;
}

async function getToken() {
  if (fs.existsSync(TOKEN_CACHE)) {
    try {
      const data = JSON.parse(fs.readFileSync(TOKEN_CACHE, "utf8"));
      const sameEnv = data.ENV === ENV;

      // ⚡ Nếu ENV khác → buộc login lại
      if (!sameEnv) {
        console.log(`🌐 ENV changed (${data.ENV} → ${ENV}) — re-login required...`);
        return await loginAndGetToken();
      }

      // ⚡ Token còn hạn ít nhất 1 phút
      if (Date.now() < data.expiresAt - 60_000) {
        return `Bearer ${data.accessToken}`;
      } else {
        console.log("⌛ Token expired — refreshing...");
        return await loginAndGetToken();
      }
    } catch (err) {
      console.warn("⚠️ Failed to read token cache:", err.message);
      return await loginAndGetToken();
    }
  } else {
    // ⚡ Chưa có file cache → login lần đầu
    return await loginAndGetToken();
  }
}


// ======================================================
// 🧩 3️⃣ Utility: Bọc HTML
// ======================================================
function wrapHtmlIfNeeded(content) {
  const hasHtmlTag = /<html[^>]*>/i.test(content);
  const hasMeta = /<meta[^>]*charset/i.test(content);

  if (hasHtmlTag) {
    if (!hasMeta) {
      return content.replace(/<head[^>]*>/i, '<head>\n<meta charset="UTF-8">');
    }
    return content;
  }

  return `<html>
  <head><meta charset="UTF-8"></head>
  <body>
${content.trim()}
  </body>
</html>`;
}

// ======================================================
// 🧩 4️⃣ Gọi API Upload
// ======================================================
async function getPreSignS3(name, token) {
  const body = { name, paths: ["index.html"], type: "RICH_EDITOR" };
  const res = await axios.post(PRE_SIGN_PATH, body, {
    headers: { Authorization: token, "Content-Type": "application/json" },
  });
  return res.data?.data;
}

async function uploadToS3(preSignedUrl, html) {
  await axios.put(preSignedUrl, html, {
    headers: { "Content-Type": "text/html" },
    maxBodyLength: Infinity,
  });
}

async function createLessonResource(uuid, name, html, token) {
  const body = { uuid, name, type: "RICH_EDITOR", contentResource: html.trim() };
  const res = await axios.post(CONTENT_PATH, body, {
    headers: {
      Authorization: token,
      "Content-Type": "application/json; charset=utf-8",
      Origin: BASE_URL,
      Referer: `${BASE_URL}/ui/content-resource/add-rich-editor`,
    },
    maxBodyLength: Infinity,
  });

  console.log(`✅ Created lesson: ${name} (${res.status})`);
  return res.data;
}

// ======================================================
// 🚀 5️⃣ Quy trình chính
// ======================================================
async function main() {
  const token = await getToken();
  console.log("🔐 Using token:", token.slice(0, 30) + "....");

  const files = fs.readdirSync(LESSON_DIR).filter((f) => f.endsWith(".html"));
  console.log(`📦 Found ${files.length} HTML lessons`);

  for (const file of files) {
    const filePath = path.join(LESSON_DIR, file);
    let html = fs.readFileSync(filePath, "utf8");
    html = wrapHtmlIfNeeded(html);

    const name = path.basename(file, ".html");
    try {
      console.log(`🚀 Processing: ${name}`);
      const preSign = await getPreSignS3(name, token);
      const { uuid, preSignedUrlDTOS } = preSign;
      const uploadUrl = preSignedUrlDTOS?.[0]?.url;
      if (!uploadUrl) throw new Error("Missing pre-signed URL");

      await uploadToS3(uploadUrl, html);
      await createLessonResource(uuid, name, html, token);

      console.log(`🎉 Done: ${name}`);
    } catch (err) {
      console.error(`❌ Error for ${name}:`, err.response?.data || err.message);
      if (err.response?.status === 401 && fs.existsSync(TOKEN_CACHE)) {
        fs.unlinkSync(TOKEN_CACHE);
      }
    }

    await new Promise((r) => setTimeout(r, 1000)); // tránh rate limit
  }

  console.log("✅ All lessons uploaded successfully!");
}

// ======================================================
main().catch((err) => console.error("🚨 Fatal error:", err.message));