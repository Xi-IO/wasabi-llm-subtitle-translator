import path from "path";

const testFile = 'Rush Hour 1998 1080p BluRay HEVC x265 5.1 BONE.extracted.srt';
const fileName = path.basename(testFile);
const fileExt = path.extname(fileName).toLowerCase();
const baseName = path.parse(fileName).name;

console.log(`文件名: ${fileName}`);
console.log(`扩展名: ${fileExt}`);
console.log(`基础名: ${baseName}`);

const isMkv = fileExt === '.mkv';
const isSrt = fileExt === '.srt';
const isAss = fileExt === '.ass' || fileExt === '.ssa';

console.log(`isMkv=${isMkv}, isSrt=${isSrt}, isAss=${isAss}`);
