const fs = require("fs");
const path = require("path");

const folderCorrect = "./folderCorrect";        // folder có tên đúng
const folderToRename = "./folderToRename";   // folder cần đổi tên

// Lấy danh sách file
const correctFiles = fs.readdirSync(folderCorrect).filter(f => f.endsWith(".html"));
const renameFiles = fs.readdirSync(folderToRename).filter(f => f.endsWith(".html"));

// Đảm bảo số lượng file khớp nhau
if (correctFiles.length !== renameFiles.length) {
  console.log("⚠️ Số lượng file không khớp!");
  console.log(`Tên đúng: ${correctFiles.length}, cần đổi: ${renameFiles.length}`);
  process.exit(1);
}

// Đổi tên theo thứ tự
renameFiles.forEach((oldName, i) => {
  const newName = correctFiles[i];
  const oldPath = path.join(folderToRename, oldName);
  const newPath = path.join(folderToRename, newName);
  fs.renameSync(oldPath, newPath);
  console.log(`✅ ${oldName} → ${newName}`);
});

console.log("🎉 Hoàn tất đổi tên!");
