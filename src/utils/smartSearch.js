/**
 * ToolDesk Smart Search & Intent Matching Engine
 * 
 * Provides instant, zero-latency local intent matching for Command Palette and search:
 * - Common intent phrases ("make image smaller", "extract text from image", "pictures to pdf")
 * - Tool aliases, keywords, file extensions, and output types
 * - Case-insensitive fast ranking
 */

import { TOOLS } from '../constants.js'

export const TOOL_INTENTS = {
  imgcompress: [
    'make image smaller', 'reduce file size', 'shrink photo', 'compress picture',
    'compress image', 'optimize image', 'kb to mb', 'small picture', 'tinypng', 'compress'
  ],
  imgconvert: [
    'convert webp', 'png to jpg', 'jpg to png', 'convert png', 'convert format',
    'change file format', 'image to webp', 'convert photo'
  ],
  imgresizer: [
    'resize image', 'change dimensions', 'crop dimensions', 'scale photo',
    'width and height', 'pixel size', 'change image size'
  ],
  bgremove: [
    'remove background', 'transparent background', 'cutout', 'isolate subject',
    'white background', 'clear background', 'png background'
  ],
  imagetools: [
    'extract text from image', 'ocr', 'optical character recognition', 'read text',
    'image redactor', 'blur image', 'pixelate', 'dpi checker', 'round corners', 'image border'
  ],
  pdf: [
    'pictures to pdf', 'images to pdf', 'merge pdf', 'split pdf', 'compress pdf',
    'pdf tools', 'combine pdf', 'convert to pdf', 'docx to pdf', 'pdf editor', 'watermark pdf'
  ],
  password: [
    'generate password', 'create password', 'strong password', 'secure password',
    'random password', 'password generator', 'pin generator', 'passphrase'
  ],
  vault: [
    'store password', 'password manager', 'save credentials', 'locker',
    'password vault', 'login vault', 'encrypted passwords'
  ],
  bcrypt: [
    'hash password', 'bcrypt hash', 'verify hash', 'blowfish', 'generate hash',
    'salt rounds', 'hash check'
  ],
  wordcount: [
    'count words', 'character count', 'reading time', 'sentence count',
    'word counter', 'text statistics', 'word analytics'
  ],
  textcase: [
    'uppercase', 'lowercase', 'camelcase', 'snakecase', 'kebab case',
    'title case', 'capitalize text', 'convert text case'
  ],
  wordreplace: [
    'find and replace', 'replace word', 'text replacer', 'swap words',
    'substitute text', 'batch replace'
  ],
  translator: [
    'translate text', 'language translation', 'deepl', 'spanish', 'french',
    'german', 'japanese', 'translate words'
  ],
  units: [
    'convert units', 'km to miles', 'kg to pounds', 'celsius to fahrenheit',
    'meters to feet', 'unit converter', 'metric to imperial'
  ],
  currency: [
    'currency exchange', 'usd to eur', 'dollar to euro', 'usd to inr',
    'crypto rate', 'forex', 'currency rates', 'money conversion'
  ],
  gradient: [
    'css gradient', 'color gradient', 'linear gradient', 'radial gradient',
    'background gradient', 'gradient generator', 'palette gradient'
  ],
  colorpicker: [
    'pick color', 'hex to rgb', 'hsl color', 'color contrast', 'wcag contrast',
    'color palette', 'eyedropper', 'color converter'
  ],
  qrcode: [
    'create qr', 'make qr code', 'wifi qr', 'vcard qr', 'scan barcode',
    'barcode generator', 'qr code studio', 'upc', 'ean'
  ],
  thumbnail: [
    'youtube thumbnail', 'video cover', 'get thumbnail', 'download thumbnail',
    'social media thumbnail'
  ],
  aspectratio: [
    'calculate aspect ratio', '16:9', '4:3', 'aspect ratio calculator',
    'screen ratio', 'video ratio'
  ],
  fileconvert: [
    'convert file', 'file converter', 'audio convert', 'video convert',
    'document convert', 'mp3', 'mp4', 'wav'
  ],
  videoscreenshot: [
    'video to frames', 'extract frames', 'video screenshot', 'video to images',
    'video to gif', 'capture video frame'
  ],
  videotranscriber: [
    'video to text', 'audio to text', 'transcribe audio', 'whisper',
    'subtitles', 'generate srt', 'video transcription'
  ],
  websiteanalyzer: [
    'analyze website', 'seo audit', 'check meta tags', 'website speed',
    'tech stack detection', 'security headers'
  ],
  breachcheck: [
    'check email breach', 'have i been pwned', 'email leak', 'data dump',
    'security check', 'compromised account'
  ],
  iplookup: [
    'ip lookup', 'my ip', 'geolocation', 'whois ip', 'ip location',
    'find isp', 'ip address'
  ],
  systeminfo: [
    'system info', 'browser audit', 'hardware specs', 'screen resolution',
    'os detection', 'client scan'
  ],
  countryfinder: [
    'country data', 'world facts', 'country flags', 'country population',
    'country search', 'capital city'
  ],
  randname: [
    'random name', 'generate name', 'fake persona', 'name generator',
    'character name', 'test user data'
  ],
  randaddress: [
    'random address', 'fake address', 'test address', 'address generator',
    'street address', 'zip code generator'
  ],
  favicon: [
    'generate favicon', 'create icon', 'website icon', 'favicon.ico',
    'png to ico', 'app icon'
  ],
  quote: [
    'random quote', 'inspirational quotes', 'quote generator', 'wisdom',
    'daily motivation'
  ]
}

/**
 * Searches tools using fuzzy scoring across titles, descriptions, categories, and natural language intents
 */
export function smartSearchTools(query, limit = 8) {
  if (!query || !query.trim()) return []
  const cleanQ = query.trim().toLowerCase()

  const scored = TOOLS.map(tool => {
    let score = 0
    const lowerTitle = tool.title.toLowerCase()
    const lowerCat = tool.cat.toLowerCase()
    const lowerDesc = tool.desc.toLowerCase()
    const toolId = tool.id.toLowerCase()

    // 1. Exact or prefix title match (highest score)
    if (lowerTitle === cleanQ) score += 100
    else if (lowerTitle.startsWith(cleanQ)) score += 60
    else if (lowerTitle.includes(cleanQ)) score += 40

    // 2. Intent matching
    const intents = TOOL_INTENTS[toolId] || []
    for (const intent of intents) {
      if (intent === cleanQ) {
        score += 80
        break
      } else if (cleanQ.includes(intent) || intent.includes(cleanQ)) {
        score += 50
        break
      }
    }

    // 3. Category match
    if (lowerCat === cleanQ) score += 35
    else if (lowerCat.includes(cleanQ)) score += 20

    // 4. Description match
    if (lowerDesc.includes(cleanQ)) score += 15

    return { tool, score }
  })

  return scored
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(item => item.tool)
}
