import Fastify from 'fastify'
import WebSocket from 'ws'
import dotenv from 'dotenv'
import fastifyFormBody from '@fastify/formbody'
import fastifyWs from '@fastify/websocket'

dotenv.config()

const { OPENAI_API_KEY } = process.env

if (!OPENAI_API_KEY) {
  console.error('Missing OpenAI API key. Please set it in the .env file.')
  process.exit(1)
}

const fastify = Fastify()
fastify.register(fastifyFormBody)
fastify.register(fastifyWs)

const SYSTEM_MESSAGE = `You are a helpful and bubbly AI assistant who loves to chat about anything the user is interested about and is prepared to offer them facts. You have a penchant for dad jokes, owl jokes, and rickrolling – subtly. Always stay positive, but work in a joke when appropriate.

Follow this flowchart closely:
flowchart TD
    %% State definitions
    A([Start])
    C[Greet caller]
    E[Disclose you are an AI voice agent]
    F{User input}
    G[Call capture_user_text with exact transcript]
    X[Respond]
    H{User requests to end call or conversation finished?}
    I[Thank user, say goodbye]
    J[Call end_call]
    K([End])

    %% State transitions
    A --> C
    C --> E
    E --> F
    F --> G
    G --> X
    X --> H
    H -- No --> F
    H -- Yes --> I
    I --> J
    J --> K

    %% Important instructions:
    %% 1. ALWAYS call capture_user_text after EVERY user input
    %% 2. ALWAYS say a proper goodbye message BEFORE calling end_call
    %% 3. When the user says anything like "let's hang up", "goodbye", "end call", or similar:
    %%    - FIRST respond with a friendly goodbye message (e.g., "It was great chatting with you! Thanks for calling, goodbye!")
    %%    - THEN call end_call to terminate the conversation
    %% 4. NEVER end call without saying goodbye`
const VOICE = 'sage'
const PORT = process.env.PORT || 5050

const LOG_EVENT_TYPES = [
  'response.content.done',
  'rate_limits.updated',
  'response.done',
  'input_audio_buffer.committed',
  'input_audio_buffer.speech_stopped',
  'input_audio_buffer.speech_started',
  'session.created',
]

fastify.get('/', async (request, reply) => {
  reply.send({ message: 'Twilio Media Stream Server is running!' })
})

// Route for Twilio to handle incoming and outgoing calls
// <Say> punctuation to improve text-to-speech translation
fastify.all('/incoming-call', async (request, reply) => {
  const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
                          <Response>
                              <Connect>
                                  <Stream url="wss://${request.headers.host}/media-stream" />
                              </Connect>
                          </Response>`

  reply.type('text/xml').send(twimlResponse)
})

// WebSocket route for media-stream
fastify.register(async fastify => {
  fastify.get('/media-stream', { websocket: true }, (connection, req) => {
    console.log('Client connected')

    const openAiWs = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-realtime', {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'OpenAI-Beta': 'realtime=v1',
      },
    })

    let streamSid = null

    const sendSessionUpdate = () => {
      const sessionUpdate = {
        type: 'session.update',
        session: {
          turn_detection: { type: 'semantic_vad', create_response: true, interrupt_response: true },
          input_audio_format: 'g711_ulaw',
          output_audio_format: 'g711_ulaw',
          voice: VOICE,
          instructions: SYSTEM_MESSAGE,
          modalities: ['text', 'audio'],
          temperature: 0.8,
          tools: [
            {
              type: 'function',
              name: 'capture_user_text',
              description: 'Report the exact transcript of the latest user utterance to the server.',
              parameters: {
                type: 'object',
                properties: {
                  text: {
                    type: 'string',
                    minLength: 1,
                    description: "Exact transcript of the user's utterance in the user's language.",
                  },
                },
                required: ['text'],
                additionalProperties: false,
              },
            },
            {
              type: 'function',
              name: 'end_call',
              description:
                'End the phone call when the user indicates the conversation is finished or requests to end.',
              parameters: {
                type: 'object',
                properties: {
                  reason: {
                    type: 'string',
                    enum: ['user_goodbye', 'explicit_request', 'silence_timeout', 'no_intent', 'completed_task'],
                    description: 'Why the call is ending.',
                  },
                },
                required: ['reason'],
                additionalProperties: false,
              },
            },
          ],
          tool_choice: 'auto',
        },
      }

      console.log('Sending session update:', JSON.stringify(sessionUpdate))
      openAiWs.send(JSON.stringify(sessionUpdate))
    }

    // Open event for OpenAI WebSocket
    openAiWs.on('open', () => {
      console.log('Connected to the OpenAI Realtime API')
      setTimeout(sendSessionUpdate, 250) // Ensure connection stability, send after .25 seconds
    })

    // Listen for messages from the OpenAI WebSocket (and send to Twilio if necessary)
    openAiWs.on('message', data => {
      try {
        const response = JSON.parse(data)

        if (LOG_EVENT_TYPES.includes(response.type)) {
          console.log(`Received event: ${response.type}`, response)
        }

        if (response.type === 'session.updated') {
          console.log('Session updated successfully:', response)
        }

        if (response.type === 'response.audio.delta' && response.delta) {
          const audioDelta = {
            event: 'media',
            streamSid: streamSid,
            media: { payload: Buffer.from(response.delta, 'base64').toString('base64') },
          }
          connection.send(JSON.stringify(audioDelta))
        }

        // Handle speech interruption - stop Twilio audio when user starts speaking
        if (response.type === 'input_audio_buffer.speech_started') {
          console.log('User started speaking - clearing Twilio audio stream')
          const clearMessage = {
            event: 'clear',
            streamSid,
          }
          connection.send(JSON.stringify(clearMessage))
        }

        if (response.type === 'response.done' && response.response && Array.isArray(response.response.output)) {
          for (const output of response.response.output) {
            // Handle capture_user_text function call
            if (output && output.type === 'function_call' && output.name === 'capture_user_text' && output.arguments) {
              try {
                const args = JSON.parse(output.arguments)
                const userUtterance = typeof args.text === 'string' ? args.text.trim() : ''

                console.log('User said:', userUtterance || '(empty)')

                const toolOutput = {
                  type: 'conversation.item.create',
                  item: {
                    type: 'function_call_output',
                    call_id: output.call_id,
                    output: JSON.stringify({ ok: true }),
                  },
                }
                openAiWs.send(JSON.stringify(toolOutput))
                openAiWs.send(JSON.stringify({ type: 'response.create' }))
              } catch (e) {
                console.error('Error processing capture_user_text:', e)
              }
            }

            // Handle end_call function call
            if (output && output.type === 'function_call' && output.name === 'end_call') {
              try {
                const args = JSON.parse(output.arguments || '{}')
                const reason = args.reason || 'user_goodbye'
                console.log(`Model requested to end the call. Reason: ${reason}`)

                // Send function call output back to OpenAI
                const toolOutput = {
                  type: 'conversation.item.create',
                  item: {
                    type: 'function_call_output',
                    call_id: output.call_id,
                    output: JSON.stringify({ success: true }),
                  },
                }
                openAiWs.send(JSON.stringify(toolOutput))

                setTimeout(() => {
                  if (openAiWs.readyState === WebSocket.OPEN) {
                    openAiWs.close()
                  }
                  try {
                    connection.close()
                  } catch (e) {
                    console.error('Error closing connection:', e)
                  }
                }, 5000)
              } catch (e) {
                console.error('Error processing end_call:', e)
              }
            }
          }
        }
      } catch (error) {
        console.error('Error processing OpenAI message:', error, 'Raw message:', data)
      }
    })

    // Handle incoming messages from Twilio
    connection.on('message', message => {
      try {
        const data = JSON.parse(message)

        switch (data.event) {
          case 'media':
            if (openAiWs.readyState === WebSocket.OPEN) {
              const audioAppend = {
                type: 'input_audio_buffer.append',
                audio: data.media.payload,
              }

              openAiWs.send(JSON.stringify(audioAppend))
            }
            break
          case 'start':
            streamSid = data.start.streamSid
            console.log('Incoming stream has started', streamSid)
            break
          default:
            console.log('Received non-media event:', data.event)
            break
        }
      } catch (error) {
        console.error('Error parsing message:', error, 'Message:', message)
      }
    })

    // Handle connection close
    connection.on('close', () => {
      if (openAiWs.readyState === WebSocket.OPEN) openAiWs.close()
      console.log('Client disconnected.')
    })

    // Handle WebSocket close and errors
    openAiWs.on('close', () => {
      console.log('Disconnected from the OpenAI Realtime API')
    })

    openAiWs.on('error', error => {
      console.error('Error in the OpenAI WebSocket:', error)
    })
  })
})

fastify.listen({ port: PORT }, err => {
  if (err) {
    console.error(err)
    process.exit(1)
  }
  console.log(`Server is listening on port ${PORT}`)
})
