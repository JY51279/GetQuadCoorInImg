import { transJson2Str, transStr2Json } from './BasicFuncs.js';
import { formatLossyRepairSummary, formatRepairSummary, getProductSchema, normalizeDataset } from './DatasetSchema.js';
import { toUserErrorMessage } from '../../../shared/UserMessages.js';

const ROOT_KEY = 'Picture';
const IMAGE_SOURCE_KEY = 'Image Source';

// Pure preparation: no active dataset, Vue, IPC or file writes.
export function prepareJsonProcess(jsonData, { allowLossyRepairs = false } = {}) {
  try {
    if (!jsonData || typeof jsonData.str !== 'string' || typeof jsonData.path !== 'string') {
      return { success: false, error: 'JSON 文件信息无效。' };
    }

    const parsedJson = transStr2Json(jsonData.str);
    const normalizedResult = normalizeDataset(parsedJson, { allowLossyRepairs });
    if (!normalizedResult.success) return normalizedResult;

    if (normalizedResult.requiresLossyRepair) {
      return {
        ...normalizedResult,
        success: true,
        path: jsonData.path,
        lossyRepairSummary: formatLossyRepairSummary(normalizedResult.lossyIssues),
      };
    }

    const preparedClassKeys = getProductSchema(normalizedResult.productType);
    const preparedImagePaths = normalizedResult.data[ROOT_KEY].map(picture =>
      picture[IMAGE_SOURCE_KEY].replace(/[\\/]/g, '/'),
    );

    return {
      ...normalizedResult,
      success: true,
      path: jsonData.path,
      imagePaths: preparedImagePaths,
      classKeys: preparedClassKeys,
      fileInfo: {
        str: transJson2Str(normalizedResult.data),
        path: jsonData.path,
      },
      repairSummary: formatRepairSummary(normalizedResult.repairs),
      lossyRepairsApplied: allowLossyRepairs && normalizedResult.lossyIssues.length > 0,
    };
  } catch (err) {
    return { success: false, error: toUserErrorMessage(err, '解析 JSON 数据失败。') };
  }
}
