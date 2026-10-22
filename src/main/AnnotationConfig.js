import { readFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_BASE_URL = 'https://api.deepseek.com';
const DEFAULT_MODEL = 'deepseek-flash';

// Read only in the main process, when annotation is requested. Never send this
// configuration (which includes the key) to the renderer or log it.
export function readAnnotationConfig(env = process.env) {
  const apiKey = env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      '未读取到 DEEPSEEK_API_KEY，请从已配置该环境变量的 PowerShell 启动 QuadTool，或配置后重新启动应用。',
    );
  }

  const baseUrl = (env.DEEPSEEK_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, '');
  let parsedUrl;
  try {
    parsedUrl = new URL(baseUrl);
  } catch {
    throw new Error('DEEPSEEK_BASE_URL 必须是有效的 HTTP 或 HTTPS 接口根地址。');
  }
  if (
    !['http:', 'https:'].includes(parsedUrl.protocol) ||
    parsedUrl.username ||
    parsedUrl.password ||
    parsedUrl.search ||
    parsedUrl.hash
  ) {
    throw new Error('DEEPSEEK_BASE_URL 必须是 HTTP 或 HTTPS 接口根地址，不能包含凭据、查询参数或片段。');
  }

  return { apiKey, baseUrl, model: env.DEEPSEEK_MODEL?.trim() || DEFAULT_MODEL };
}

// Pass app.getAppPath() from the Electron main process. resources/** is already
// unpacked by electron-builder. Read on each request so edits take effect next time.
export async function loadAnnotationRules(appPath) {
  const rulesPath = path.join(appPath, 'resources', 'annotation-rules.md');
  let rules;
  try {
    rules = await readFile(rulesPath, 'utf8');
  } catch {
    throw new Error('无法读取图片注解规则文件 resources/annotation-rules.md，请检查文件是否存在且可读。');
  }
  if (!rules.trim()) throw new Error('图片注解规则文件为空，请补充规则后重试。');
  return rules;
}
