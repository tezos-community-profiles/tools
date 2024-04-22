export const sleep = ms => new Promise(r => setTimeout(r, ms))
export function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('Request timed out')), ms));
}
