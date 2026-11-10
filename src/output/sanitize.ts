export function sanitizeErrorMessage(message: string): string {
  return message
    .replace(/([?&](?:api[-_]?key|apikey|key|token|auth)=)[^&\s"'`]+/gi, '$1***')
    .replace(/(\/v2\/)[A-Za-z0-9_-]{8,}/g, '$1***')
    .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, '$1***')
    .replace(/\s+/g, ' ')
    .trim();
}
