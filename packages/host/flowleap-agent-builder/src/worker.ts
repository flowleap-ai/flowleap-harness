/** Worker Thread entry that parses one uploaded file and posts the result to its parent. */
import { parentPort, workerData } from 'node:worker_threads'
import { parseFile, type ParseRequest } from './parse.ts'

const request = workerData as Partial<ParseRequest> | null
if (typeof request?.name !== 'string' || !(request.bytes instanceof Uint8Array) || typeof request.maxPages !== 'number') {
  throw new Error('file parser request is malformed')
}
void parseFile({ name: request.name, bytes: request.bytes, maxPages: request.maxPages }).then((result) => {
  parentPort?.postMessage(result)
})
