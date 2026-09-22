import { toUserErrorMessage } from './UserMessages.js';

export const SERVICE_ERROR_KIND = Object.freeze({
  INVALID_REQUEST: 'invalid-request',
  INVALID_RESPONSE: 'invalid-response',
  OPERATION: 'operation',
  TRANSPORT: 'transport',
});

export function normalizeServiceErrorKind(value) {
  return Object.values(SERVICE_ERROR_KIND).includes(value) ? value : SERVICE_ERROR_KIND.OPERATION;
}

export function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isFilePath(value) {
  return typeof value === 'string' && value.trim().length > 0 && !value.includes('\0');
}

export function isRequestId(value) {
  return Number.isSafeInteger(value) && value > 0;
}

// User-facing text stays separate from the raw error logged at the service boundary.
export function serviceFailure(error, fallback, errorKind = SERVICE_ERROR_KIND.OPERATION) {
  return { success: false, error: toUserErrorMessage(error, fallback), errorKind };
}
