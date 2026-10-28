/** A DOCX zip bomb for tests: a small file whose `word/document.xml` inflates to a very large text run. */
import { constants, crc32, deflateRawSync } from 'node:zlib'

interface Entry {
  readonly name: string
  readonly size: number
  readonly crc: number
  readonly data: Buffer
}

function entry(name: string, content: Buffer): Entry {
  return { name, size: content.length, crc: crc32(content), data: deflateRawSync(content, { level: 9 }) }
}

/** Deflate `head`, `repeat` copies of `chunk`, then `tail`, without holding the whole inflated text. */
function repeated(name: string, head: string, chunk: Buffer, repeat: number, tail: string): Entry {
  let crc = crc32(head)
  for (let index = 0; index < repeat; index++) crc = crc32(chunk, crc)
  crc = crc32(tail, crc)
  // A deflate stream of identical blocks: each block compresses one chunk, and the blocks join without a final bit.
  const block = deflateRawSync(chunk, { level: 9, finishFlush: constants.Z_SYNC_FLUSH })
  const parts = [
    deflateRawSync(Buffer.from(head), { finishFlush: constants.Z_SYNC_FLUSH }),
    ...Array.from({ length: repeat }, () => block),
    deflateRawSync(Buffer.from(tail)),
  ]
  return { name, size: head.length + chunk.length * repeat + tail.length, crc, data: Buffer.concat(parts) }
}

function zip(entries: readonly Entry[]): Uint8Array {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const file of entries) {
    const name = Buffer.from(file.name)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(8, 8)
    local.writeUInt32LE(file.crc, 14)
    local.writeUInt32LE(file.data.length, 18)
    local.writeUInt32LE(file.size, 22)
    local.writeUInt16LE(name.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(8, 10)
    central.writeUInt32LE(file.crc, 16)
    central.writeUInt32LE(file.data.length, 20)
    central.writeUInt32LE(file.size, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)
    locals.push(local, name, file.data)
    centrals.push(central, name)
    offset += local.length + name.length + file.data.length
  }
  const directory = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  return new Uint8Array(Buffer.concat([...locals, directory, end]))
}

/**
 * A DOCX whose document text inflates to `megabytes` MB.
 * @param megabytes - the inflated text size.
 * @returns the DOCX bytes, a few hundred KB.
 */
export function docxBomb(megabytes: number): Uint8Array {
  const types = '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
  const rels = '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
  const head = '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>'
  const tail = '</w:t></w:r></w:p></w:body></w:document>'
  return zip([
    entry('[Content_Types].xml', Buffer.from(types)),
    entry('_rels/.rels', Buffer.from(rels)),
    repeated('word/document.xml', head, Buffer.alloc(1024 * 1024, 'a'), megabytes, tail),
  ])
}
