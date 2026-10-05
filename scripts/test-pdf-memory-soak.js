import {
  mergePdfs,
  splitPdfPages,
  compressPdf,
  redactPdfPages,
  createZipFromFiles,
  convertTextToPdf,
  convertDocxToPdf,
} from '../src/utils/pdfEngine.js'
import fs from 'node:fs'
import v8 from 'node:v8'
import vm from 'node:vm'

// Expose GC dynamically if not already available
if (typeof globalThis.gc !== 'function') {
  try {
    v8.setFlagsFromString('--expose_gc')
    globalThis.gc = vm.runInNewContext('gc')
  } catch {}
}

// Polyfill canvas for Node environment
if (typeof document === 'undefined') {
  globalThis.document = {
    createElement: (tag) => {
      if (tag === 'canvas') {
        const c = {
          width: 0,
          height: 0,
          getContext: () => {
            const dummyCtx = {
              canvas: c,
              fillStyle: '',
              strokeStyle: '',
              measureText: (txt) => ({ width: (txt || '').length * 7 }),
              getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
              getLineDash: () => [],
              createImageData: () => ({ data: [] }),
              getImageData: () => ({ data: [] }),
            }
            return new Proxy(dummyCtx, {
              get: (target, prop) => (prop in target ? target[prop] : () => {})
            })
          },
          toDataURL: () => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
          toBlob: (cb) => cb(new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')], { type: 'image/png' }))
        }
        return c
      }
      return {}
    }
  }
}

async function runMemorySoakTest() {
  console.log('\n════════════════════════════════════════════════════════════════════════')
  console.log('🧪 TOOLDESK PDF STUDIO — 25X REPEATED MEMORY SOAK TEST')
  console.log('════════════════════════════════════════════════════════════════════════\n')

  // Warmup GC if available
  if (global.gc) global.gc()
  const initialMem = process.memoryUsage()
  console.log(`Baseline Heap Used: ${Math.round(initialMem.heapUsed / 1024 / 1024)} MB`)

  // Prepare test inputs
  const sampleDocx = fs.readFileSync('tests/fixtures/Tax_Invoice_36-6.docx')
  const { bytes: basePdfBytes } = await convertDocxToPdf(sampleDocx)
  console.log(`Base PDF generated from Tax Invoice fixture: ${basePdfBytes.length} bytes\n`)

  const CYCLES = 25
  const snapshots = []

  for (let cycle = 1; cycle <= CYCLES; cycle++) {
    // 1. Text conversion
    const textPdf = await convertTextToPdf(`Test memory soak document cycle ${cycle}\n`.repeat(50))

    // 2. Merge operation
    const merged = await mergePdfs([basePdfBytes, textPdf.bytes])

    // 3. Split operation
    const splits = await splitPdfPages(merged.bytes)

    // 4. Redaction
    const redacted = await redactPdfPages(splits[0].blob, {
      1: [{ x: 50, y: 100, width: 200, height: 30 }]
    })

    // 5. Compression
    const compressed = await compressPdf(redacted.bytes, { preset: 'lossless' })

    // 6. ZIP packaging
    const zip = await createZipFromFiles([
      { name: `cycle_${cycle}_doc.pdf`, bytes: compressed.bytes }
    ])

    if (cycle % 5 === 0 || cycle === 1 || cycle === CYCLES) {
      if (global.gc) global.gc()
      const mem = process.memoryUsage()
      const heapMB = Math.round(mem.heapUsed / 1024 / 1024)
      const diffMB = Math.round((mem.heapUsed - initialMem.heapUsed) / 1024 / 1024)
      console.log(`Cycle ${String(cycle).padStart(2)}/${CYCLES}: Heap Used = ${heapMB} MB (Δ: ${diffMB >= 0 ? '+' : ''}${diffMB} MB) | Zip Size = ${zip.size} B`)
      snapshots.push({ cycle, heapMB, diffMB })
    }
  }

  if (global.gc) global.gc()
  const finalMem = process.memoryUsage()
  const finalHeapMB = Math.round(finalMem.heapUsed / 1024 / 1024)
  const totalGrowthMB = Math.round((finalMem.heapUsed - initialMem.heapUsed) / 1024 / 1024)

  console.log(`\nFinal Heap Used: ${finalHeapMB} MB (Total growth over 25 intensive cycles: ${totalGrowthMB} MB)`)

  // Ensure heap growth is bounded (under 35MB growth after 25 intensive multi-stage cycles)
  if (totalGrowthMB > 35) {
    throw new Error(`Memory leak detected: heap grew by ${totalGrowthMB} MB (> 35MB threshold)!`)
  }

  console.log('\n✅ MEMORY SOAK TEST PASSED: Heap is stable and bounded across 25 cycles.\n')
}

runMemorySoakTest().catch(err => {
  console.error('Fatal Memory Soak Error:', err)
  process.exit(1)
})
