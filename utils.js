export const sleep = ms => new Promise(r => setTimeout(r, ms))

export function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('Request timed out')), ms));
}

export const sliceIntoChunks = (obj, size) => {
  const entries = Object.entries(obj).map(([key, value]) => ({ ...value, address: key }));
  const chunks = [];
  for (let i = 0; i < entries.length; i += size) {
    chunks.push(entries.slice(i, i + size));
  }
  return chunks;
};
