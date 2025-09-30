const express = require('express')
const path = require('path')
const fs = require('fs')
const multer = require('multer')
require('dotenv').config()
const OpenAI = require('openai')

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
})

const app = express()
const port = 3000

const uploadDir = path.join(__dirname, 'uploads')
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir)
}

const generatedImagesDir = path.join(__dirname, 'public', 'generated-images')
if (!fs.existsSync(generatedImagesDir)) {
  fs.mkdirSync(generatedImagesDir, { recursive: true })
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir)
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname)
  },
})
const upload = multer({ storage: storage })

app.use(express.static('public'))
app.use(express.json())

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
})

app.post('/upload-audio', upload.single('file'), async (req, res) => {
  const audioPath = req.file.path

  try {
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(audioPath),
      model: 'gpt-4o-transcribe',
    })

    const transcriptText = transcription.text
    console.log('Transcribed text:', transcriptText)

    // Return transcription immediately
    res.json({ transcription: transcriptText })

    fs.unlinkSync(audioPath)
  } catch (error) {
    console.error('Error processing audio:', error)
    res.status(500).json({ error: 'Failed to process audio.' })
  }
})

app.post('/generate-image', express.json(), async (req, res) => {
  const { prompt } = req.body

  try {
    const image = await openai.images.generate({
      prompt: prompt,
      n: 1,
      size: '1024x1024',
      model: 'gpt-image-1',
      quality: 'high',
    })

    // Save the base64 image data to a local file
    const b64Data = image.data[0].b64_json
    const timestamp = Date.now()
    const imageName = `image-${timestamp}.png`
    const imagePath = path.join(generatedImagesDir, imageName)

    // Decode base64 and write to file
    const imageBuffer = Buffer.from(b64Data, 'base64')
    fs.writeFileSync(imagePath, imageBuffer)

    // Return the local URL that the frontend can access
    const imageUrl = `/generated-images/${imageName}`
    console.log('Generated image saved to:', imagePath)
    res.json({ imageUrl })
  } catch (error) {
    console.error('Error generating image:', error)
    res.status(500).json({ error: 'Failed to generate image.' })
  }
})

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`)
})
