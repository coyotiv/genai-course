import { Agent, run, tool } from '@openai/agents'
import { z } from 'zod'
import { config } from 'dotenv'

config()

// Define tools for agents to use
const searchKnowledgeBaseTool = tool({
  name: 'search_knowledge_base',
  description: 'Search the company knowledge base for solutions to customer issues',
  parameters: z.object({
    query: z.string().describe('The search query for the knowledge base'),
  }),
  execute: async input => {
    // Simulated knowledge base search
    const knowledgeBase = {
      'internet not working': [
        'Check if the modem lights are on',
        'Verify cable connections are secure',
        'Try a different ethernet cable',
        'Check if other devices can connect',
        'Contact ISP if issue persists',
      ],
      router: [
        'Router troubleshooting guide available at kb.example.com/router',
        'Common router issues: power, firmware, overheating',
      ],
      connectivity: ['Network connectivity checklist available', 'WiFi vs Ethernet troubleshooting steps differ'],
      speed: ['Speed issues often caused by: ISP throttling, outdated modem, interference, too many devices'],
      'orange light': [
        'Orange/amber light usually indicates connection problem with ISP',
        'Check service status page for outages',
        'May require technician if persistent',
      ],
    }

    const results = []
    for (const [key, articles] of Object.entries(knowledgeBase)) {
      if (input.query.toLowerCase().includes(key)) {
        results.push(...articles)
      }
    }

    return results.length > 0
      ? `Found ${results.length} articles:\n${results.map((r, i) => `${i + 1}. ${r}`).join('\n')}`
      : 'No relevant articles found in knowledge base.'
  },
})

const checkSystemStatusTool = tool({
  name: 'check_system_status',
  description: 'Check the status of company systems and services',
  parameters: z.object({
    service: z.string().describe('The service to check (e.g., internet, network, servers)'),
  }),
  execute: async input => {
    // Simulated system status check
    const statuses = {
      internet: 'All systems operational. No reported outages in your area.',
      network: 'Network services running normally.',
      servers: 'All servers operational.',
    }

    return statuses[input.service.toLowerCase()] || 'Service status: Unknown. Please specify a valid service.'
  },
})

const createTicketTool = tool({
  name: 'create_support_ticket',
  description: 'Create a support ticket for human intervention',
  parameters: z.object({
    issue: z.string().describe('Description of the issue'),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).describe('Priority level'),
  }),
  execute: async input => {
    // Simulated ticket creation
    const ticketId = `TICKET-${Date.now()}`
    return `Support ticket created: ${ticketId}\nIssue: ${input.issue}\nPriority: ${
      input.priority
    }\nEstimated response time: ${
      input.priority === 'urgent' ? '15 minutes' : input.priority === 'high' ? '1 hour' : '4 hours'
    }`
  },
})

// Knowledge Base Agent - searches documentation and articles
const knowledgeBaseAgent = new Agent({
  name: 'Knowledge_Base_Agent',
  instructions: `You search the knowledge base and report findings.

Steps:
1. Use search_knowledge_base tool for relevant articles
2. Use check_system_status if needed  
3. Report findings in 2-3 sentences
4. Hand off back to Triage_Agent immediately after reporting

You MUST hand off to Triage_Agent after providing findings. Do not continue the conversation yourself.`,
  tools: [searchKnowledgeBaseTool, checkSystemStatusTool],
  handoffDescription: 'Searches the knowledge base for documentation and known solutions',
})

// Troubleshooting Agent - provides step-by-step guidance
const troubleshootingAgent = new Agent({
  name: 'Troubleshooting_Agent',
  instructions: `You provide troubleshooting steps.

Steps:
1. Note what customer already tried
2. Suggest 2-3 next steps in simple terms
3. Keep explanations non-technical
4. Hand off back to Triage_Agent immediately after providing steps

You MUST hand off to Triage_Agent after giving advice. Do not continue the conversation.`,
  handoffDescription: 'Provides step-by-step troubleshooting guidance',
})

// Escalation Agent - determines if human intervention is needed
const escalationAgent = new Agent({
  name: 'Escalation_Agent',
  instructions: `You assess if a technician is needed and create tickets.

When you receive a case:
1. Create a support ticket using create_support_ticket tool with appropriate priority
2. State ONLY the ticket ID and that help is coming (one sentence)
3. Immediately hand off to Triage_Agent

Do NOT say "I'll hand you off" - just DO the handoff. Keep your message to ONE sentence only showing the ticket ID.`,
  tools: [createTicketTool],
  handoffDescription: 'Assesses if human intervention needed',
})

// Feedback Agent - collects customer feedback
const feedbackAgent = new Agent({
  name: 'Feedback_Agent',
  instructions: `You collect feedback on the support experience.

Steps:
1. Thank the customer for using our support
2. Ask 1-2 brief questions about their experience (satisfaction, clarity of information)
3. Acknowledge their feedback
4. Wish them well
5. Do NOT continue after collecting feedback

Keep it brief (2-3 sentences total). Be warm and professional.`,
  handoffDescription: 'Collects customer feedback on the support experience',
})

// Triage Agent - Main orchestrator
const triageAgent = Agent.create({
  name: 'Triage_Agent',
  model: 'gpt-4o',
  temperature: 0.2,
  instructions: `You coordinate specialized agents. Follow this EXACT sequence:

1. First contact → Hand off to Knowledge_Base_Agent
2. KB returns → Hand off to Troubleshooting_Agent  
3. Troubleshooting returns → Hand off to Escalation_Agent
4. Escalation returns (ticket created) → Hand off to Feedback_Agent
5. Feedback returns → Say "Thank you for contacting support." and STOP

Track where you are:
- If you just got info from Knowledge_Base: hand off to Troubleshooting
- If you just got steps from Troubleshooting: hand off to Escalation  
- If Escalation just created a ticket: hand off to Feedback
- If Feedback just finished: say one closing line

Execute handoffs immediately. Don't explain, just do it.`,
  handoffs: [knowledgeBaseAgent, troubleshootingAgent, escalationAgent, feedbackAgent],
})

// Set up bidirectional handoffs (agents can return to triage)
knowledgeBaseAgent.handoffs = [triageAgent]
troubleshootingAgent.handoffs = [triageAgent]
escalationAgent.handoffs = [triageAgent]
feedbackAgent.handoffs = [triageAgent]

// Customer Agent - simulates a realistic customer
const customerAgent = new Agent({
  name: 'Customer',
  model: 'gpt-4o-mini',
  temperature: 0.7,
  instructions: `You are a frustrated customer with an internet connectivity problem. 

BACKGROUND:
- You've had internet issues for 3 days
- Connection drops every 30 minutes
- Speed is very slow (2 Mbps instead of 100 Mbps)
- You've tried rebooting router and modem multiple times
- All your devices (laptop, phone, TV) have the same problem
- Router lights are mostly green, but internet light occasionally flashes orange
- You work from home and have important video calls tomorrow
- You're not very technical

PERSONALITY:
- You're polite but clearly frustrated
- You want clear, simple instructions
- You're worried about your work tomorrow
- You appreciate help but keep emphasizing the urgency

IMPORTANT BEHAVIOR:
- If given troubleshooting steps you've ALREADY tried: politely remind them you already did that
- After 1-2 troubleshooting suggestions: express that you need escalation/technician help
- Show increasing concern about tomorrow's calls
- If a support ticket is created: express relief and gratitude
- If asked for feedback: provide honest, brief feedback

Keep responses 2-4 sentences. Be realistic - if the problem isn't solved, say so.`,
})

// Main execution function with dynamic multi-turn conversation
async function main() {
  const initialCustomerMessage = `Hi, I've been having serious internet problems for the past 3 days. My connection keeps dropping every 30 minutes, and when it works, the speed is extremely slow. Can you help?`

  console.log(`
${'='.repeat(80)}
🤖 Multi-Agent Customer Support System (OpenAI Agents SDK)
Dynamic Multi-Agent Conversation with Customer Simulation
${'='.repeat(80)}
`)

  try {
    let supportHistory = []
    let customerHistory = [{ role: 'system', content: 'Start the conversation with your internet problem.' }]
    let currentSupportAgent = triageAgent
    let totalHandoffs = 0
    const allInvolvedAgents = new Set()
    let turnCount = 0
    const maxTurns = 8
    let conversationComplete = false

    // Initial customer message
    let customerMessage = initialCustomerMessage

    while (turnCount < maxTurns && !conversationComplete) {
      turnCount++

      console.log(`
${'─'.repeat(80)}
📞 TURN ${turnCount}
${'─'.repeat(80)}

Customer: "${customerMessage}"
`)

      // Add customer message to support history
      supportHistory.push({ role: 'user', content: customerMessage })

      console.log('Processing...\n')

      // Run the support agent
      const supportResult = await run(currentSupportAgent, supportHistory, {
        maxTurns: 15,
        stream: false,
      })

      // Track handoffs and agents
      const turnHandoffs = []
      const turnAgents = new Set()
      const toolCalls = []

      if (supportResult.newItems) {
        supportResult.newItems.forEach(item => {
          if (item.type === 'handoff_output_item') {
            turnHandoffs.push(`${item.sourceAgent.name} → ${item.targetAgent.name}`)
            turnAgents.add(item.sourceAgent.name)
            turnAgents.add(item.targetAgent.name)
            allInvolvedAgents.add(item.sourceAgent.name)
            allInvolvedAgents.add(item.targetAgent.name)
            totalHandoffs++
          } else if (item.type === 'tool_call_item') {
            const toolName = item.rawItem?.name || 'unknown tool'
            toolCalls.push(toolName)
          }
        })

        if (turnHandoffs.length > 0) {
          console.log(`Agent handoffs:\n${turnHandoffs.map(h => `  ↪ ${h}`).join('\n')}\n`)
        }

        if (toolCalls.length > 0) {
          console.log(`Tools called: ${toolCalls.map(t => `🔧 ${t}`).join(', ')}\n`)
        }
      }

      const agentResponse = supportResult.finalOutput

      // Show ALL agent messages from this turn (intermediate + final)
      const agentMessages = supportResult.newItems?.filter(item => item.type === 'message_output_item') || []

      if (agentMessages.length > 0) {
        console.log('Agent Messages:')
        agentMessages.forEach(msg => {
          const agentName = msg.agent?.name || 'Agent'
          const content = msg.content || msg.rawItem?.content?.[0]?.text || '(no content)'
          console.log(`  ${agentName}: "${content}"`)
        })
        console.log()
      }

      console.log(`Final Response: "${agentResponse}"\n`)

      // Update support history
      if (supportResult.history) {
        supportHistory = supportResult.history
      }

      // Update current agent
      if (supportResult.lastAgent) {
        currentSupportAgent = supportResult.lastAgent
      }

      // Check if conversation should end (feedback collected)
      const feedbackCollected =
        supportResult.history?.some(msg => msg.name === 'Feedback_Agent') ||
        currentSupportAgent.name === 'Feedback_Agent'

      if (feedbackCollected || turnCount >= maxTurns) {
        conversationComplete = true
        console.log(`📊 Turn ${turnCount} Summary:
   - Handoffs: ${turnHandoffs.length}
   - Agents: ${turnAgents.size > 0 ? Array.from(turnAgents).join(', ') : currentSupportAgent.name}
   - Current agent: ${currentSupportAgent.name}
   - Status: ${feedbackCollected ? '✅ Feedback collected' : '⏱️ Max turns reached'}`)
        break
      }

      // Generate customer response using Customer Agent
      const customerPrompt = `The support agent just said: "${agentResponse}"\n\nRespond naturally as the customer with the internet problem. Keep it brief (2-4 sentences).`

      const customerResult = await run(customerAgent, customerPrompt, {
        maxTurns: 1,
        stream: false,
      })

      customerMessage = customerResult.finalOutput

      // Track metrics for this turn
      console.log(`📊 Turn ${turnCount} Summary:
   - Handoffs: ${turnHandoffs.length}
   - Agents: ${turnAgents.size > 0 ? Array.from(turnAgents).join(', ') : currentSupportAgent.name}
   - Current agent: ${currentSupportAgent.name}`)
    }

    // Final summary
    console.log(`
${'='.repeat(80)}
✓ CONVERSATION COMPLETED
${'='.repeat(80)}

📊 Overall Conversation Statistics:
- Total conversation turns: ${turnCount}
- Total handoffs across all turns: ${totalHandoffs}
- Unique agents involved: ${allInvolvedAgents.size}
- Agents: ${Array.from(allInvolvedAgents).join(', ')}
- Total messages in history: ${supportHistory.length}

📝 Key Observations:
✓ Dynamic customer responses via Customer Agent
✓ Agents collaborated through handoffs
✓ Conversation history preserved all interactions
✓ System demonstrated stateful, multi-agent workflow
`)
  } catch (error) {
    console.error('\n❌ Error during conversation:', error.message)
    if (error.stack) {
      console.error('\nStack trace:', error.stack)
    }
  }
}

// Run the application
main()
