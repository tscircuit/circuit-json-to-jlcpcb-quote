import {
  convertCircuitJsonToJlcpcbQuote,
  type FetchLike,
  type JlcpcbQuote,
  type PartLookupProgress,
  quoteFabricationFiles,
} from "../lib/index"
import { checkOrderQuantities } from "./check-order-quantities"
import { createCachingFetch } from "./create-caching-fetch"
import { type QuoteInput, readDroppedFiles } from "./read-dropped-files"
import { readOrderForm } from "./read-order-form"
import { renderQuote } from "./render-quote"

const getElement = <Element extends HTMLElement>(
  id: string,
  elementType: new () => Element,
): Element => {
  const element = document.getElementById(id)
  if (!(element instanceof elementType)) {
    throw new Error(`Page is missing #${id}`)
  }
  return element
}

const dropZone = getElement("drop-zone", HTMLLabelElement)
const fileInput = getElement("file-input", HTMLInputElement)
const orderForm = getElement("order-form", HTMLFormElement)
const statusLine = getElement("status", HTMLDivElement)
const progressBar = getElement("progress", HTMLProgressElement)
const formError = getElement("form-error", HTMLParagraphElement)
const results = getElement("results", HTMLDivElement)

const cachingFetch = createCachingFetch((url, init) => fetch(url, init))

let quoteInput: QuoteInput | null = null
/** Bumped on every quote, so a slow, outdated quote cannot overwrite a newer one */
let quoteRunId = 0

const showStatus = (status: { text: string; isError?: boolean }) => {
  statusLine.textContent = status.text
  statusLine.className = status.isError ? "status error" : "status"
}

const quoteInputWithOptions = async (
  input: QuoteInput,
  onProgress: (progress: PartLookupProgress) => void,
): Promise<JlcpcbQuote> => {
  const { options, board } = readOrderForm(orderForm)
  const fetchJson: FetchLike = cachingFetch
  if (input.kind === "circuit_json") {
    return convertCircuitJsonToJlcpcbQuote({
      circuitJson: input.circuitJson,
      ...options,
      fetch: fetchJson,
      onProgress,
    })
  }
  return quoteFabricationFiles({
    files: input.files,
    board,
    options: { ...options, fetch: fetchJson, onProgress },
  })
}

const getFormInput = (name: string) => {
  const field = orderForm.elements.namedItem(name)
  if (
    !(field instanceof HTMLInputElement || field instanceof HTMLSelectElement)
  ) {
    throw new Error(`Order form has no "${name}" field`)
  }
  return field
}

/** Keep the form consistent; returns false when it cannot be quoted. */
const checkOrderForm = () => {
  const quantityInput = getFormInput("quantity")
  const assembledInput = getFormInput("assembledQuantity")
  const isAssembled = getFormInput("assembly").value !== "none"
  assembledInput.disabled = !isAssembled
  if (assembledInput instanceof HTMLInputElement) {
    assembledInput.max = quantityInput.value
  }
  const problem = checkOrderQuantities({
    quantityText: quantityInput.value,
    assembledQuantityText: assembledInput.value,
    isAssembled,
  })
  formError.textContent = problem ?? ""
  formError.hidden = problem === null
  return problem === null
}

const showProgress = (progress: PartLookupProgress | null) => {
  progressBar.hidden = progress === null
  if (!progress) return
  progressBar.max = progress.totalLines
  progressBar.value = progress.completedLines
}

const runQuote = async () => {
  if (!checkOrderForm()) {
    quoteRunId++
    showProgress(null)
    return
  }
  if (!quoteInput) return
  const runId = ++quoteRunId
  const input = quoteInput
  showStatus({ text: `Quoting ${input.sourceName}…` })
  try {
    const quote = await quoteInputWithOptions(input, (progress) => {
      if (runId !== quoteRunId) return
      showProgress(progress)
      showStatus({
        text: `Looking up parts on jlcsearch: ${progress.completedLines} of ${progress.totalLines}`,
      })
    })
    if (runId !== quoteRunId) return
    showProgress(null)
    results.innerHTML = renderQuote(quote)
    showStatus({
      text: `Quoted ${input.sourceName} (${input.kind === "circuit_json" ? "Circuit JSON" : "fabrication files"})`,
    })
  } catch (error) {
    if (runId !== quoteRunId) return
    showProgress(null)
    results.innerHTML = ""
    showStatus({
      text: error instanceof Error ? error.message : String(error),
      isError: true,
    })
  }
}

const loadFiles = async (fileList: FileList | null) => {
  if (!fileList || fileList.length === 0) return
  try {
    const droppedFiles = await Promise.all(
      [...fileList].map(async (file) => ({
        path: file.webkitRelativePath || file.name,
        bytes: new Uint8Array(await file.arrayBuffer()),
      })),
    )
    quoteInput = readDroppedFiles(droppedFiles)
    await runQuote()
  } catch (error) {
    quoteInput = null
    results.innerHTML = ""
    showStatus({
      text: error instanceof Error ? error.message : String(error),
      isError: true,
    })
  }
}

fileInput.addEventListener("change", () => {
  void loadFiles(fileInput.files)
  fileInput.value = ""
})
dropZone.addEventListener("dragover", (event) => {
  event.preventDefault()
  dropZone.classList.add("dragging")
})
dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("dragging")
})
dropZone.addEventListener("drop", (event) => {
  event.preventDefault()
  dropZone.classList.remove("dragging")
  void loadFiles(event.dataTransfer?.files ?? null)
})
orderForm.addEventListener("change", () => {
  void runQuote()
})
orderForm.addEventListener("submit", (event) => {
  event.preventDefault()
  void runQuote()
})

checkOrderForm()
showStatus({ text: "Drop files to get a quote." })
