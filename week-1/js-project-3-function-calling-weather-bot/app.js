import OpenAI from 'openai'
import express from 'express'
import dotenv from 'dotenv'

dotenv.config()
const app = express()
app.use(express.json())

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
})

function buildTools() {
  return [
    {
      type: 'function',
      name: 'getCurrentTemperature',
      description: 'Get the current temperature for a specific location',
      parameters: {
        type: 'object',
        properties: {
          location: {
            type: 'string',
            description: 'The city and state, e.g., San Francisco, CA',
          },
          unit: {
            type: 'string',
            enum: ['Celsius', 'Fahrenheit'],
            description: 'The temperature unit to use.',
          },
        },
        required: ['location', 'unit'],
      },
    },
    {
      type: 'function',
      name: 'getRainProbability',
      description: 'Get the probability of rain for a specific location',
      parameters: {
        type: 'object',
        properties: {
          location: {
            type: 'string',
            description: 'The city and state, e.g., San Francisco, CA',
          },
        },
        required: ['location'],
      },
    },
  ]
}

// Fake tool implementations
async function getCurrentTemperature({ location, unit }) {
  // Replace with real weather API call
  return unit === 'Fahrenheit' ? '57' : '14'
}
async function getRainProbability({ location }) {
  // Replace with real weather API call
  return '0.06'
}

function parseArgs(args) {
  if (!args) return {}
  if (typeof args === 'string') {
    try {
      return JSON.parse(args)
    } catch {
      return {}
    }
  }
  return args
}

app.post('/ask', async (req, res) => {
  const { question } = req.body

  if (!question) {
    return res.status(400).json({ error: 'No question provided' })
  }

  try {
    // Build initial input as a list (so we can append tool interactions)
    let input = [{ role: 'user', content: question }]

    // 1) Ask the model with tools
    let response = await openai.responses.create({
      model: 'gpt-5-mini',
      input,
      tools: buildTools(),
    })

    // 2) Append model output (may include function_call items)
    if (Array.isArray(response.output)) {
      input = input.concat(response.output)
    }

    // 3) Execute any function calls and append function_call_output items
    const functionCallOutputs = []
    if (Array.isArray(response.output)) {
      for (const item of response.output) {
        if (item.type === 'function_call') {
          const toolName = item.name
          const args = parseArgs(item.arguments)
          if (toolName === 'getCurrentTemperature') {
            const output = await getCurrentTemperature(args)
            functionCallOutputs.push({
              type: 'function_call_output',
              call_id: item.call_id,
              output: JSON.stringify({ temperature: output }),
            })
          } else if (toolName === 'getRainProbability') {
            const output = await getRainProbability(args)
            functionCallOutputs.push({
              type: 'function_call_output',
              call_id: item.call_id,
              output: JSON.stringify({ rain_probability: output }),
            })
          }
        }
      }
    }

    if (functionCallOutputs.length > 0) {
      input = input.concat(functionCallOutputs)
      // 4) Ask the model again with function outputs included
      response = await openai.responses.create({
        model: 'gpt-5-mini',
        input,
        tools: buildTools(),
      })
    }

    const answer = (response.output_text || '').trim()
    res.json({ result: answer })
  } catch (error) {
    console.error('Error handling question:', error)
    res.status(500).json({ error: 'Failed to process question' })
  }
})

app.listen(3002, () => {
  console.log('Server is running on port 3002')
})
