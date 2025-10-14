# Multi-Agent Customer Support System

A sophisticated multi-agent customer support system built with the [OpenAI Agents SDK](https://github.com/openai/openai-agents-js). This project demonstrates how multiple AI agents can collaborate to handle customer inquiries through a structured workflow using the official SDK.

## Overview

This system implements a customer support workflow similar to AutoGen's multi-agent architecture, leveraging the OpenAI Agents SDK's native features like handoffs, tools, and multi-agent orchestration. Multiple specialized agents work together to:

1. **Classify and understand** customer inquiries
2. **Search knowledge bases** for relevant solutions
3. **Provide troubleshooting** guidance
4. **Collect feedback** on the resolution process
5. **Escalate to humans** when necessary

## Architecture

### Agents

The system consists of 6 specialized agents using the SDK's handoff mechanism:

- **Inquiry Agent** (Main Orchestrator): Coordinates the entire support workflow and routes to appropriate agents
- **Response Agent**: Provides initial response and classifies customer inquiries
- **Knowledge Base Agent**: Searches documentation using the `search_knowledge_base` tool
- **Troubleshooting Agent**: Guides customers through step-by-step problem resolution
- **Escalation Agent**: Determines if human intervention is needed and creates support tickets
- **Feedback Agent**: Collects customer feedback on the support experience

### Tools

- **`search_knowledge_base`**: Searches company documentation for solutions
- **`check_system_status`**: Checks the status of company systems and services
- **`create_support_ticket`**: Creates tickets for human support escalation

### Workflow

1. Customer submits inquiry to **Inquiry Agent**
2. **Inquiry Agent** hands off to **Response Agent** for classification
3. **Response Agent** may hand off to **Knowledge Base Agent** or **Troubleshooting Agent**
4. **Inquiry Agent** compiles information and hands off to **Escalation Agent**
5. If no escalation needed, **Inquiry Agent** hands off to **Feedback Agent**
6. **Inquiry Agent** provides final comprehensive response

## Installation

1. Clone or navigate to this directory:

```bash
cd week-4/js-project-1-multi-agent-support
```

2. Install dependencies:

```bash
npm install
```

3. Create a `.env` file from the example:

```bash
cp .env.example .env
```

4. Add your OpenAI API key to the `.env` file:

```
OPENAI_API_KEY=your_actual_api_key_here
```

## Usage

Run the application:

```bash
npm start
```

Or:

```bash
node app.js
```

## Example Output

The system will process a sample customer inquiry:

```
Initial Customer Inquiry:
"My internet is not working, and I have already tried rebooting the router."
```

The Inquiry Agent will orchestrate handoffs to specialized agents:

- **Response Agent**: Classifies the connectivity issue
- **Knowledge Base Agent**: Searches for relevant troubleshooting articles
- **Troubleshooting Agent**: Provides step-by-step diagnostic steps
- **Escalation Agent**: Determines if human support is needed
- **Feedback Agent**: Collects feedback (if no escalation)

## Customization

### Modify the Initial Inquiry

Edit the `initialInquiry` variable in `app.js`:

```javascript
const initialInquiry = 'Your custom customer inquiry here'
```

### Adjust Agent Behavior

Modify agent instructions when creating agents:

```javascript
const inquiryAgent = Agent.create({
  name: 'Inquiry_Agent',
  instructions: 'Your custom instructions here',
  handoffs: [responseAgent, escalationAgent, feedbackAgent],
  model: 'gpt-4o-mini',
  temperature: 0.4,
})
```

### Add Custom Tools

Create new tools using the `tool()` function:

```javascript
const myCustomTool = tool({
  name: 'my_tool',
  description: 'What this tool does',
  parameters: z.object({
    param: z.string().describe('Parameter description'),
  }),
  execute: async input => {
    // Your tool logic here
    return 'Tool result'
  },
})
```

### Modify Agent Handoffs

Update the handoffs array when creating agents:

```javascript
const agent = Agent.create({
  name: 'My_Agent',
  instructions: 'Agent instructions',
  handoffs: [agent1, agent2, agent3], // Add or remove agents
})
```

### Change LLM Settings

Adjust model and temperature in the main agent:

```javascript
const inquiryAgent = Agent.create({
  name: 'Inquiry_Agent',
  instructions: '...',
  model: 'gpt-4o', // or 'gpt-4', 'gpt-4o-mini'
  temperature: 0.7, // 0.0 (focused) to 2.0 (creative)
  handoffs: [...],
})
```

## Key Features

- **Native SDK Handoffs**: Uses OpenAI Agents SDK's built-in handoff mechanism
- **Tool Integration**: Agents can call specialized tools for data access
- **Automatic Orchestration**: SDK handles agent coordination and message passing
- **Flexible Workflow**: Easy to add, remove, or modify agents
- **Type Safety**: Full TypeScript support with Zod schema validation
- **Conversation Tracking**: Built-in turn tracking and agent history

## SDK Features Used

- **Agent**: Core agent class with instructions and capabilities
- **Agent.create**: Creates agents with proper handoff type inference
- **run()**: Executes agent workflows with configurable options
- **tool()**: Defines callable tools with schema validation
- **Handoffs**: Native agent-to-agent delegation
- **maxTurns**: Controls workflow iteration limits

## Dependencies

- `@openai/agents`: Official OpenAI Agents SDK
- `zod`: Schema validation for tools
- `dotenv`: Environment variable management

## Resources

- [OpenAI Agents SDK Documentation](https://openai.github.io/openai-agents-js/)
- [OpenAI Agents SDK GitHub](https://github.com/openai/openai-agents-js)
- [SDK Examples](https://github.com/openai/openai-agents-js/tree/main/examples)

## License

ISC

## Notes

- Ensure you have sufficient OpenAI API credits
- The SDK manages agent state and conversation history automatically
- Use `maxTurns` to prevent infinite loops in complex workflows
- Consider implementing streaming for better user experience in production
- The SDK supports advanced features like guardrails, structured outputs, and tracing
