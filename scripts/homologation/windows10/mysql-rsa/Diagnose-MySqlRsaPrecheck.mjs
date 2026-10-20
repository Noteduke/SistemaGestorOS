import fs from 'node:fs';
import path from 'node:path';
import { Socket } from 'node:net';
import { pathToFileURL } from 'node:url';
// This diagnostic must never connect, even if an imported dependency regresses.
Socket.prototype.connect = function () { throw new Error('NETWORK_FORBIDDEN'); };
const safeCodes = new Set(['CONFIG_FORMAT','DUPLICATE_KEY','WRONG_TARGET','CONFLICTING_AUTH_CONFIG',
  'RSA_CONFIG_MISSING','INHERITED_ENV_CONFLICT','PUBLIC_KEY_HASH','PUBLIC_KEY_FORMAT','REPARSE_POINT','NETWORK_FORBIDDEN']);
function fail(stage, error) {
  let code = safeCodes.has(error?.message) ? error.message : 'UNCLASSIFIED_SAFE_FAILURE';
  if (error?.code === 'ENOENT') code='FILE_MISSING';
  if (error?.code === 'EACCES' || error?.code === 'EPERM') code='FILE_READ_DENIED';
  if (error?.code === 'ERR_INVALID_URL') code='DATABASE_URL_INVALID';
  if (error instanceof URIError) code='INVALID_PERCENT_ENCODING';
  console.log('FAIL stage='+stage+' code='+code); process.exitCode=1;
}
let stage='JS_IMPORT';
try {
  const helper=await import(pathToFileURL(path.join(import.meta.dirname,'Check-MySqlRsa.mjs')).href);
  console.log('PASS stage='+stage);
  stage='JS_ENV_READ';
  const text=fs.readFileSync(helper.envPath,'utf8');
  console.log('PASS stage='+stage);
  stage='JS_CONFIG_VALIDATION';
  const values=helper.validateConfig(text,false);
  console.log('PASS stage='+stage);
  stage='JS_INHERITED_ENV'; helper.rejectInherited(values); console.log('PASS stage='+stage);
  stage='JS_PUBLIC_KEY'; helper.verifyPublicKey(); console.log('PASS stage='+stage);
  console.log('PASS stage=JS_OFFLINE_COMPLETE');
} catch(error) { fail(stage,error); }
