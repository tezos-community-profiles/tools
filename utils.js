import btoa from 'btoa'
import fetch from 'node-fetch'

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
}

//export async function ipfsDeployProfile(profile) {
//  const res = await fetch(`${IPFS_API}/api/v0/add`, {
//    method: 'POST',
//    headers: {
//      'Content-Type': 'application/json',
//      Authorization: `Basic ${btoa(INFURA_PROJECT_ID+":"+INFURA_PROJECT_SECRET)}`
//    },
//    body: JSON.stringify(profile)
//  })
//  console.log(profile, res)
//}
