import fs from 'fs'
import mime from 'mime'
import { writeFile, readFile } from 'fs/promises'
import fetch from 'node-fetch'
import { importKey } from '@taquito/signer'
import { char2Bytes } from '@taquito/utils'
import { TezosToolkit, MichelsonMap } from '@taquito/taquito'
import {
  RPC,
  WALLET,
  TZKT_API,
  PICS_DIR,
  TEZID_API,
  BATCH_SIZE,
  TCP_CONTRACT,
  TEZOS_NETWORK,
  TZPROFILES_CODEHASH,
  TZPROFILES_GRAPHQL_API,
  TEZID_DATASTORE_CONTRACT
} from './config.js'
import { timeout, sliceIntoChunks } from './utils.js'

if (process.argv.length < 3) {
  console.error('Too few arguments')
}
const cmd = process.argv[2]

const toolkit = new TezosToolkit(RPC)
importKey(toolkit,
  WALLET.privkey
).catch((e) => console.error(e));

;
 
(async () => {
  switch(cmd) {
    case 'collect_profiles':
      const profiles = {}
      const profiles_tz = await collect_tzprofiles()
      const profiles_tezid = await collect_tezid_profiles()
      Object.assign(profiles, profiles_tezid, profiles_tz)
      await writeFile('profiles.json', JSON.stringify(profiles, null, 2))
      console.log(`Collected a total of ${Object.keys(profiles).length} profiles and wrote them to profiles.json`)
      break
    case 'fetch_pics':
      const rprofiles = await readFile('./profiles.json').then(r => JSON.parse(r.toString()))
      await fetch_pics(rprofiles)
      break
    case 'init_profiles':
      const iprofiles = await readFile('./profiles.json').then(r => JSON.parse(r.toString()))
      await init_profiles(iprofiles)
      break
  }
})()

async function init_profiles(profiles) {
  return console.log(Object.keys(profiles).length)
  let contract = await toolkit.contract.at(TCP_CONTRACT)
//  let methods = storedata.parameterSchema.ExtractSignatures()
//  return console.log(methods)
//  return console.log(storedata.methods.set_item().getSignature())

  const chunks = sliceIntoChunks(profiles, 100)
  console.log(chunks.length)
  for (const chunk of chunks) {
    const batch = toolkit.batch()
    for (const entry of chunk) {
      const { nic, pic, bio } = entry
      const profile = { nic, pic, bio }
      const key = ''
      const address = entry.address 
//      const ipfs_uri = await ipfsDeployProfile(entry)
      const bytes = char2Bytes(JSON.stringify(profile)) // <- Better to byte the entire payload?
//      const bytes = char2Bytes('ipfs://QmbSGHty4HkjotUuVLUreEEY3PKbsuWnW9vKt1CtrZASkn') // TODO: Upload to IPFS 
      batch.withContractCall(contract.methods.init_profile_data(key, bytes, address))
    }
    const op = await batch.send()
    await op.confirmation(1)
    console.log(op.hash) 
  }

}

async function fetch_pics(profiles) {
  const addresses = Object.keys(profiles)
  for (const address of addresses) {
    if (profiles[address].pic.indexOf('http') === 0) {
      try {
        await fetchAndWriteFile(profiles[address].pic, `${PICS_DIR}/${address}`)
        console.log('SUCCESS', profiles[address].pic)
        // Upload to IPFS?
        // Set on profile?
      } catch(e) {
        console.log('ERROR', profiles[address].pic)
        // Set null on profile?
      }
    }
  }
}

async function fetchAndWriteFile(url, outputPath) {
  const response = await Promise.race([
    fetch(url),
    timeout(2000)
  ])
  if (!response.ok) throw new Error('Network response was not ok.');

  const extension = mime.getExtension(response.headers.get('Content-Type')) || 'bin'
  const fileStream = fs.createWriteStream(`${outputPath}.${extension}`);
  response.body.pipe(fileStream);

  response.body.on('error', (err) => {
    throw err;
  });

  return new Promise((resolve, reject) => {
    fileStream.on('finish', resolve);
    fileStream.on('error', (err) => {
      reject(err);
    });
  });
}

async function collect_tzprofiles_batch(offset) {
  const tzprofile_contracts_res = await fetch(`${TZKT_API}/v1/contracts?codeHash.eq=${TZPROFILES_CODEHASH}&includeStorage=true&offset=${offset}&limit=${BATCH_SIZE}`)
  const tzprofile_contracts = await tzprofile_contracts_res.json()
  let counter = 0
  const profiles = {}
  for (const contract of tzprofile_contracts.map(c => c.storage)) {
    counter++
    if (contract.contract_type !== 'tzprofiles') continue
    const claims_res = await fetch(`${TZPROFILES_GRAPHQL_API}`, {
      body: JSON.stringify({
        query: `query MyQuery { tzprofiles_by_pk(account: "${contract.owner}") { valid_claims } }`,
        variables: null,
        operationName: 'MyQuery'
      }),
      method: 'POST',
      headers: {
        'Referer': 'https://tzprofiles.com/',
        'Content-Type': 'application/json',
        'Origin': 'https://tzprofiles.com'
      }
    })
    if (!claims_res) continue
    let profile = null
    let claims = await claims_res.json()
    claims = claims?.data?.tzprofiles_by_pk?.valid_claims
    if (!claims) continue
    claims.forEach(claim => {
      claim.forEach(details => {
        try {
          const det = JSON.parse(details)
          if (det.type.indexOf('BasicProfile') < 0) return
          profile = {
            nic: det.credentialSubject.alias,
            pic: det.credentialSubject.logo,
            bio: det.credentialSubject.description,
            web: det.credentialSubject.website,
            from: 'tzprofiles'
          }
        } catch(e) {}
      })
    })
    if (!profile) continue
    profiles[contract.owner] = profile
  }
  process.stdout.write('.')
  return profiles
}

async function collect_tzprofiles() {
  console.log('== TZProfiles ==')
  const tzprofile_contracts_count_res  = await fetch(`${TZKT_API}/v1/contracts/count?codeHash.eq=${TZPROFILES_CODEHASH}`)
  let total_num_contracts = await tzprofile_contracts_count_res.text()
//  if (total_num_contracts > 200) total_num_contracts = 200 // TODO: Remove
  console.log(`Found a total of ${total_num_contracts} tzprofile contracts. Scraping profiles...`)
  let offset = 0
  const profiles = {}
  while (offset < total_num_contracts)  {
    const batch = await collect_tzprofiles_batch(offset)
    Object.assign(profiles, batch)
    offset = offset + BATCH_SIZE
  }
  console.log('')
  return profiles
}

async function collect_tezid_profiles() {
  console.log('== TezID ==')
  const identities_res = await fetch(`${TZKT_API}/v1/contracts/${TEZID_DATASTORE_CONTRACT}/bigmaps/identities/keys?limit=10000`)
  if (!identities_res.ok) throw new Error('Unable to get TEZID identities')
  const identities = await identities_res.json()
  let addresses = identities.map(i => i.key)
  if (addresses.length > 100) addresses = addresses.slice(0,100) // TODO: Remove
  const profiles = {}
//  console.log(`Found a total of ${addresses.length} addresses on TEZID. Checking for profiles...`)
  for (const address of addresses) {
    process.stdout.write('.')
    const profile_res = await fetch(`${TEZID_API}/${TEZOS_NETWORK}/profile/${address}`)
    if (!profile_res.ok) continue
    const profile = await profile_res.json()
    if (Object.keys(profile).length === 0) continue
    profiles[address] = {
      nic: profile.name,
      pic: profile.avatar,
      bio: profile.description,
      web: '',
      from: 'tezid'
    }
  }
  console.log('')
  return profiles
}
