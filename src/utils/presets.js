/**
 * ToolDesk Tool Presets Engine
 * 
 * Manages standard and custom configurations for tools:
 * - Image compression presets (Web Optimized, Social Media, Small File, High Quality)
 * - PDF presets (Print, Web, Compressed)
 * - Image resize presets (Social, Thumbnail, Full HD)
 * - Text formatting presets
 * 
 * Custom presets are stored safely in IndexedDB ('presets' store).
 * Strict security: Presets never store passwords, secrets, or authentication tokens.
 */

import { dbPut, dbGetAll, dbDelete } from './storage.js'

// Standard Built-in Presets by Tool
export const BUILTIN_PRESETS = {
  imgcompress: [
    { id: 'web-opt', name: 'Web Optimized', options: { quality: 80, fmt: 'webp', scale: 100 } },
    { id: 'social', name: 'Social Media', options: { quality: 85, fmt: 'jpeg', scale: 90 } },
    { id: 'small-file', name: 'Smallest File Size', options: { quality: 50, fmt: 'webp', scale: 75 } },
    { id: 'high-quality', name: 'High Fidelity', options: { quality: 92, fmt: 'png', scale: 100 } }
  ],
  pdf: [
    { id: 'pdf-web', name: 'Web & Mobile', options: { quality: 0.75, imageDpi: 150 } },
    { id: 'pdf-print', name: 'High-Res Print', options: { quality: 0.95, imageDpi: 300 } },
    { id: 'pdf-compress', name: 'Maximum Compression', options: { quality: 0.50, imageDpi: 96 } }
  ],
  imgresizer: [
    { id: 'res-avatar', name: 'Square Avatar (512×512)', options: { width: 512, height: 512, maintainAspect: false } },
    { id: 'res-yt', name: 'YouTube Cover (1280×720)', options: { width: 1280, height: 720, maintainAspect: false } },
    { id: 'res-fhd', name: 'Full HD (1920×1080)', options: { width: 1920, height: 1080, maintainAspect: false } },
    { id: 'res-story', name: 'Mobile Story (1080×1920)', options: { width: 1080, height: 1920, maintainAspect: false } }
  ]
}

/**
 * Synchronous read of builtin presets
 */
export function getPresets(toolId) {
  return (BUILTIN_PRESETS[toolId] || []).map(p => ({
    ...p,
    values: p.options || p.values
  }))
}

/**
 * Returns all presets for a specific tool (built-ins + custom)
 */
export async function getPresetsForTool(toolId) {
  const builtins = getPresets(toolId)
  try {
    const all = await dbGetAll('presets')
    const custom = (all || []).filter(p => p.toolId === toolId)
    return [...builtins, ...custom]
  } catch {
    return builtins
  }
}

/**
 * Saves a new custom preset for a tool
 */
export async function saveCustomPreset({ toolId, name, options, values }) {
  const opts = options || values
  if (!toolId || !name || !opts) return null

  // Ensure no sensitive content
  const cleanOptions = {}
  for (const [k, v] of Object.entries(opts)) {
    if (/password|secret|key|vault|token|credential/i.test(k)) {
      continue
    }
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      const str = String(v)
      if (!/password|secret|key|vault|token|credential/i.test(str)) {
        cleanOptions[k] = v
      }
    }
  }

  if (Object.keys(cleanOptions).length === 0) {
    return null
  }

  const preset = {
    id: `preset_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    toolId,
    name: String(name).trim().slice(0, 50),
    options: cleanOptions,
    isCustom: true,
    createdAt: Date.now()
  }

  try {
    await dbPut('presets', preset)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tooldesk-presets-changed', { detail: { toolId } }))
    }
    return preset
  } catch (e) {
    console.warn('[Presets] Save failed:', e)
    return null
  }
}

/**
 * Deletes a custom preset
 */
export async function deleteCustomPreset(presetId) {
  if (!presetId) return false
  try {
    await dbDelete('presets', presetId)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tooldesk-presets-changed', { detail: { presetId } }))
    }
    return true
  } catch (e) {
    return false
  }
}
