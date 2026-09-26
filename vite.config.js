import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const require = createRequire(import.meta.url)

function localNetlifyFunctionsPlugin() {
  function loadEnv() {
    try {
      const envPath = path.resolve(process.cwd(), '.env')
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8')
        for (const line of content.split('\n')) {
          const trimmed = line.trim()
          if (!trimmed || trimmed.startsWith('#')) continue
          const eqIdx = trimmed.indexOf('=')
          if (eqIdx > 0) {
            const k = trimmed.slice(0, eqIdx).trim()
            let v = trimmed.slice(eqIdx + 1).trim()
            if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
              v = v.slice(1, -1)
            }
            process.env[k] = v
          }
        }
      }
    } catch (e) {
      console.warn('[local-netlify-functions] Could not load .env:', e.message)
    }
  }

  return {
    name: 'local-netlify-functions',
    configureServer(server) {
      loadEnv()

      server.middlewares.use(async (req, res, next) => {
        let url = req.url || ''
        if (url.startsWith('/api/releases')) {
          url = url.replace('/api/releases', '/.netlify/functions/releases')
          req.url = url
        }
        if (!url.startsWith('/.netlify/functions/')) {
          return next()
        }

        const rawName = url.split('/.netlify/functions/')[1]?.split('?')[0]?.replace(/\/$/, '')
        if (!rawName) return next()

        // Prevent path traversal: accept only safe alphanumeric, underscore and dash names
        if (!/^[a-zA-Z0-9_-]+$/.test(rawName)) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Invalid function name identifier.' }))
          return
        }

        const functionsDir = path.resolve(process.cwd(), 'netlify/functions')
        const funcFile = path.resolve(functionsDir, `${rawName}.js`)
        if (!funcFile.startsWith(functionsDir) || !fs.existsSync(funcFile)) {
          res.statusCode = 404
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: `Function ${rawName} not found.` }))
          return
        }

        try {
          loadEnv() // ensure latest keys are active

          let rawBody = ''
          if (req.body) {
            rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
          } else {
            const chunks = []
            for await (const chunk of req) {
              chunks.push(chunk)
            }
            rawBody = Buffer.concat(chunks).toString('utf8')
          }

          // Invalidate require cache so function updates take effect immediately
          delete require.cache[require.resolve(funcFile)]
          const { handler } = require(funcFile)

          const parsedUrl = new URL(url, `http://${req.headers.host || 'localhost:5173'}`)
          const queryStringParameters = Object.fromEntries(parsedUrl.searchParams.entries())

          const event = {
            httpMethod: req.method,
            headers: req.headers,
            queryStringParameters,
            body: rawBody || null,
          }

          const result = await handler(event, {})
          res.statusCode = result.statusCode || 200
          if (result.headers) {
            for (const [k, v] of Object.entries(result.headers)) {
              res.setHeader(k, v)
            }
          }
          if (result.isBase64Encoded) {
            res.end(Buffer.from(result.body, 'base64'))
          } else {
            res.end(result.body || '')
          }
        } catch (err) {
          console.error(`[local-netlify-functions] Error running ${rawName}:`, err)
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: err.message || 'Internal serverless function error' }))
        }
      })
    }
  }
}

export default defineConfig({
  plugins: [
    react({
      jsxRuntime: 'automatic',
    }),
    localNetlifyFunctionsPlugin(),
  ],

  define: {
    global: 'globalThis',
  },

  resolve: {
    alias: {
      crypto: path.resolve(process.cwd(), 'src/utils/cryptoPolyfill.js'),
    },
  },

  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react-router-dom',
      'framer-motion',
      'bcryptjs',
      'lucide-react',
    ],
    exclude: ['pdfjs-dist', '@ffmpeg/ffmpeg', '@ffmpeg/util'],
    // Force pre-bundling for faster cold starts
    force: false,
  },

  build: {
    // es2020 — supports BigInt literals needed by onnxruntime-web (AI bg-removal model)
    target: 'es2020',
    minify: 'esbuild',
    cssMinify: 'esbuild',
    sourcemap: false,
    cssCodeSplit: true,
    reportCompressedSize: false,
    chunkSizeWarningLimit: 900,

    // esbuild options for faster + smaller output
    esbuildOptions: {
      legalComments: 'none',
    },

    rollupOptions: {
      output: {
        manualChunks(id) {
          // Core React + Framer Motion in ONE chunk (prevents race conditions)
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/react-router-dom/') ||
            id.includes('node_modules/scheduler/') ||
            id.includes('node_modules/framer-motion/')
          ) return 'vendor'

          // Heavy optional libs — load on demand
          if (id.includes('node_modules/pdf-lib/'))      return 'pdf'
          if (id.includes('node_modules/bcryptjs/'))     return 'crypto'
          if (id.includes('node_modules/lucide-react/')) return 'icons'
          if (id.includes('node_modules/pdfjs-dist/'))   return 'pdfjs'
          if (id.includes('node_modules/jszip/'))        return 'jszip'
          if (id.includes('node_modules/@ffmpeg/'))       return 'ffmpeg'
          if (id.includes('node_modules/mammoth/'))      return 'mammoth'
          if (id.includes('node_modules/tesseract.js/')) return 'tesseract'
          if (id.includes('node_modules/jsqr/'))         return 'qr'
          if (id.includes('node_modules/jsbarcode/'))    return 'barcode'
          if (id.includes('generatorData'))              return 'data'
        },
        // Deterministic file names
        chunkFileNames:  'assets/[name]-[hash].js',
        assetFileNames:  'assets/[name]-[hash].[ext]',
        entryFileNames:  'assets/[name]-[hash].js',
      },
    },
  },

  server: {
    port: 5173,
    strictPort: false,
    // Fast HMR
    hmr: { overlay: true },
    // Better mobile testing
    host: true,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },

  preview: {
    port: 4173,
    host: true,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },
})
