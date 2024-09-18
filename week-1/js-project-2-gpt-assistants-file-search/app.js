import path from 'path'
import express from 'express'
import OpenAI from 'openai'
import dotenv from 'dotenv'
import fs from 'fs'
import multer from 'multer'
import { fileURLToPath } from 'url'

dotenv.config()
const app = express()
app.use(express.static('public'))
app.use(express.json())

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
})

let vectorStoreId = null

function getVectorStoresClient() {
  const vs = openai.vectorStores
  if (!vs) {
    throw new Error('Vector stores API not available in this OpenAI SDK version.')
  }
  return vs
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const uploadDir = path.join(__dirname, 'uploads')
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir)
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/')
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname)
    cb(null, file.fieldname + '-' + Date.now() + ext)
  },
})
const upload = multer({ storage: storage })

async function ensureVectorStore() {
  if (vectorStoreId) return vectorStoreId
  console.log('Creating vector store...')
  const vectorStores = getVectorStoresClient()
  const vectorStore = await vectorStores.create({
    name: 'Document Vector Store',
  })
  vectorStoreId = vectorStore.id
  console.log(`Vector store ready with ID: ${vectorStoreId}`)
  return vectorStoreId
}

async function uploadPDFToVectorStore(filePath) {
  try {
    await ensureVectorStore()

    const vectorStores = getVectorStoresClient()
    if (vectorStores.fileBatches && typeof vectorStores.fileBatches.uploadAndPoll === 'function') {
      await vectorStores.fileBatches.uploadAndPoll(vectorStoreId, {
        files: [fs.createReadStream(filePath)],
      })
    } else if (vectorStores.files && typeof vectorStores.files.createAndPoll === 'function') {
      await vectorStores.files.createAndPoll(vectorStoreId, {
        file: fs.createReadStream(filePath),
      })
    } else {
      throw new Error('No supported upload method found for vector stores.')
    }

    console.log(`File added to Vector Store ID: ${vectorStoreId}`)
    return vectorStoreId
  } catch (error) {
    console.error('Error uploading file or creating vector store:', error.message)
  }
}

app.post('/ask', async (req, res) => {
  const { question } = req.body
  try {
    if (!vectorStoreId) {
      return res.status(400).json({ error: 'No document uploaded yet.' })
    }

    const response = await openai.responses.create({
      model: 'gpt-5-mini',
      input: question,
      instructions:
        'Use the file_search tool to answer strictly based on the uploaded documents. Cross-check facts with the files and include file citations.',
      tools: [
        {
          type: 'file_search',
          vector_store_ids: [vectorStoreId],
          max_num_results: 8,
        },
      ],
      include: ['file_search_call.results'],
    })

    const answerText = (response.output_text || '').trim()

    const citations = []
    let fileSearchCall = null
    if (Array.isArray(response.output)) {
      response.output.forEach(item => {
        if (item.type === 'file_search_call') {
          fileSearchCall = item
        }
        if (item.type === 'message' && Array.isArray(item.content)) {
          item.content.forEach(part => {
            if (part.type === 'output_text' && Array.isArray(part.annotations)) {
              part.annotations.forEach(a => {
                if (a.type === 'file_citation') {
                  citations.push({ file_id: a.file_id, filename: a.filename })
                }
              })
            }
          })
        }
      })
    }
    const uniqueCitations = Array.from(new Map(citations.map(c => [c.file_id, c])).values())

    const usedFileSearch = Boolean(fileSearchCall)
    if (!usedFileSearch) {
      console.warn('Responses API did not perform a file_search_call for this query.')
    }

    const lastAnswer = answerText || 'No answer found.'
    res.json({ answers: [lastAnswer], citations: uniqueCitations, usedFileSearch, fileSearchCall })
  } catch (error) {
    console.error('Error in /ask endpoint:', error.message)
    res.status(500).json({ error: 'Failed to process request.' })
  }
})

app.post('/upload', upload.single('file'), async (req, res) => {
  const file = req.file
  if (!file) {
    return res.status(400).json({ error: 'No file uploaded.' })
  }

  const filePath = path.join(__dirname, file.path)
  console.log(`File uploaded to: ${filePath}`)
  try {
    await uploadPDFToVectorStore(filePath)

    fs.unlinkSync(filePath)

    res.json({ message: 'File uploaded and processed successfully.' })
  } catch (error) {
    console.error('Error processing file:', error)
    res.status(500).json({ error: 'Failed to process file.' })
  }
})

const PORT = process.env.PORT || 3005
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`)
})
