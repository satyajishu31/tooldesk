/**
 * ToolDesk Workflow & Tool Chaining Engine
 * 
 * Enables multi-step tool pipelines:
 * - Image Pipeline: Resize -> Compress -> Convert -> Download
 * - Document Pipeline: Images -> PDF -> OCR -> Translate -> TXT
 * - Video Pipeline: Video -> Extract Frames -> Package ZIP
 * 
 * Features:
 * - Deterministic input/output parameter validation between steps
 * - Step cancellation, step retry, and non-destructive execution
 * - Safe persistence in IndexedDB ('workflows' store)
 */

import { dbPut, dbGetAll, dbDelete } from './storage.js'
import { setChainedPayload } from './toolChaining.js'

export const STANDARD_WORKFLOWS = [
  {
    id: 'wf_image_opt',
    name: 'Image Optimization & Format Pipeline',
    desc: 'Resize dimensions, compress file size, and convert to WebP.',
    category: 'Image',
    steps: [
      { id: 'step_resize', toolId: 'imgresizer', title: 'Resize Image', path: '/tools/imgresizer', outputType: 'image' },
      { id: 'step_compress', toolId: 'imgcompress', title: 'Compress Image', path: '/tools/imgcompress', outputType: 'image' },
      { id: 'step_convert', toolId: 'imgconvert', title: 'Convert Format', path: '/tools/imgconvert', outputType: 'image' }
    ]
  },
  {
    id: 'wf_doc_ocr',
    name: 'Document Scanner & OCR Pipeline',
    desc: 'Assemble images into PDF, run OCR text extraction, and translate.',
    category: 'Document',
    steps: [
      { id: 'step_pdf', toolId: 'pdf', title: 'PDF Studio', path: '/tools/pdf', outputType: 'pdf' },
      { id: 'step_ocr', toolId: 'imagetools', title: 'OCR & Extract Text', path: '/tools/image-tools', outputType: 'text' },
      { id: 'step_translate', toolId: 'translator', title: 'Translate Text', path: '/tools/translator', outputType: 'text' }
    ]
  },
  {
    id: 'wf_video_frames',
    name: 'Video Frame Capture to ZIP',
    desc: 'Extract screenshot frames at intervals and bundle as a ZIP archive.',
    category: 'Video',
    steps: [
      { id: 'step_video', toolId: 'videoscreenshot', title: 'Extract Frames', path: '/tools/video-screenshot', outputType: 'zip' }
    ]
  }
]

/**
 * Returns available workflows (built-in + saved)
 */
export async function getWorkflows() {
  try {
    const saved = await dbGetAll('workflows')
    return [...STANDARD_WORKFLOWS, ...(saved || [])]
  } catch {
    return STANDARD_WORKFLOWS
  }
}

/**
 * Saves a custom workflow definition
 */
export async function saveWorkflow(workflow) {
  if (!workflow || !workflow.name || !Array.isArray(workflow.steps)) return null

  const id = workflow.id || `wf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  const record = {
    id,
    name: String(workflow.name).trim().slice(0, 80),
    desc: String(workflow.desc || '').trim().slice(0, 160),
    category: String(workflow.category || 'Custom').trim(),
    steps: workflow.steps.map((s, idx) => ({
      id: s.id || `s_${idx}_${Date.now()}`,
      toolId: s.toolId,
      title: s.title,
      path: s.path,
      outputType: s.outputType || 'any'
    })),
    updatedAt: Date.now()
  }

  try {
    await dbPut('workflows', record)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tooldesk-workflows-updated'))
    }
    return record
  } catch (e) {
    console.warn('[WorkflowEngine] Save failed:', e)
    return null
  }
}

/**
 * Deletes a custom workflow
 */
export async function deleteWorkflow(id) {
  if (!id || STANDARD_WORKFLOWS.some(w => w.id === id)) return false
  try {
    await dbDelete('workflows', id)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tooldesk-workflows-updated'))
    }
    return true
  } catch {
    return false
  }
}

/**
 * Advances workflow execution to next step with payload handoff
 */
export function advanceWorkflowStep({ currentStepIndex, workflow, payload, navigate }) {
  if (!workflow || !workflow.steps || !navigate) return false

  const nextIndex = currentStepIndex + 1
  if (nextIndex < workflow.steps.length) {
    const nextStep = workflow.steps[nextIndex]
    if (payload) {
      setChainedPayload({
        ...payload,
        sourceTool: workflow.steps[currentStepIndex]?.title || 'Workflow'
      })
    }
    navigate(nextStep.path)
    return true
  }
  return false
}
