/**
 * src/bridges/n8n/index.ts
 *
 * The n8n bridge.
 *
 * What is n8n ?
 * -------------
 * n8n is an open-source workflow automation platform. Think of it as a visual
 * "recipe builder" where each recipe step is a node (HTTP request, send email,
 * query database, etc.). Workflows connect those nodes into sequences.
 *
 * n8n has an enormous library of pre-built nodes — over 1,400 integrations.
 * This means that when an LLM wants to automate something complex (send a
 * Telegram message AND open a calendar event AND log to Airtable), we can push
 * that entire automation to n8n rather than implementing it inline.
 *
 * Role in polybridge-mcp :
 * ------------------------
 * The n8n bridge treats n8n as the "execution backbone". It does two things :
 *   1. It lets the LLM manage existing workflows (list, execute, enable/disable).
 *   2. It lets the LLM create new workflows from a natural-language description.
 *
 * How the REST API works :
 * ------------------------
 * n8n exposes a REST API at /api/v1/. All requests require an API key in the
 * header : "X-N8N-API-KEY: your-key". The key is created in n8n's UI under
 * Settings > API > Create API Key.
 */

import { BaseBridge } from '../../adapters/bridge/base.js'

import type {
  BridgeName,
  ToolDefinition,
  ToolResult,
  N8nWorkflow,
  N8nExecution,
} from '../../types/index.js'

export class N8nBridge extends BaseBridge {
  readonly name       : BridgeName = 'n8n'
  readonly description: string     = 'Connects to an n8n instance for workflow automation'

  // Base URL and API key are read from config during init().
  private baseUrl = ''
  private apiKey  = ''

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async init(): Promise<void> {
    if (!this.isEnabled()) {
      this._status = 'disabled'
      this.log.info('bridge_dispatch', 'n8n bridge is disabled in config')
      return
    }

    this.baseUrl = this.config.bridges.n8n.baseUrl.replace(/\/$/, '')
    this.apiKey  = this.config.bridges.n8n.apiKey

    if (!this.apiKey) {
      this._status = 'error'
      this.log.error('n8n bridge : apiKey is empty. Go to Settings > API in n8n to create one.')
      return
    }

    // Verify connectivity by fetching the n8n instance health endpoint.
    try {
      const res = await this.request('GET', '/healthz')
      if (res.status === 'ok') {
        this._status = 'connected'
        this.log.info('bridge_dispatch', `n8n bridge connected at ${this.baseUrl}`)
      } else {
        this._status = 'error'
        this.log.error(`n8n health check failed : ${JSON.stringify(res)}`)
      }
    } catch (err) {
      this._status = 'error'
      this.log.error(`n8n bridge could not connect to ${this.baseUrl}`, err)
    }
  }

  // ---------------------------------------------------------------------------
  // Tool definitions
  // ---------------------------------------------------------------------------

  getTools(): ToolDefinition[] {
    return [
      {
        name       : 'n8n_list_workflows',
        description: 'List all workflows in the n8n instance with their names, IDs, and active status.',
        inputSchema: {
          type      : 'object',
          properties: {
            activeOnly: {
              type       : 'boolean',
              description: 'If true, only return active (enabled) workflows. Default: false.',
              default    : false,
            },
          },
        },
        bridge             : 'n8n',
        pedagogicalSummary : 'Asks n8n for its list of workflows via GET /api/v1/workflows',
      },
      {
        name       : 'n8n_execute_workflow',
        description: 'Execute a specific n8n workflow by its ID. Optionally pass input data to the workflow.',
        inputSchema: {
          type      : 'object',
          properties: {
            workflowId: {
              type       : 'string',
              description: 'The ID of the workflow to execute. Get IDs from n8n_list_workflows.',
            },
            inputData: {
              type       : 'object',
              description: 'Optional JSON data to pass as input to the workflow trigger.',
            },
          },
          required: ['workflowId'],
        },
        bridge             : 'n8n',
        pedagogicalSummary : 'Triggers a workflow execution via POST /api/v1/workflows/{id}/run',
      },
      {
        name       : 'n8n_get_execution',
        description: 'Get the result and status of a workflow execution by its execution ID.',
        inputSchema: {
          type      : 'object',
          properties: {
            executionId: {
              type       : 'string',
              description: 'The ID returned by n8n_execute_workflow.',
            },
          },
          required: ['executionId'],
        },
        bridge             : 'n8n',
        pedagogicalSummary : 'Fetches execution result via GET /api/v1/executions/{id}',
      },
      {
        name       : 'n8n_activate_workflow',
        description: 'Enable or disable an n8n workflow.',
        inputSchema: {
          type      : 'object',
          properties: {
            workflowId: {
              type       : 'string',
              description: 'The ID of the workflow to activate or deactivate.',
            },
            active: {
              type       : 'boolean',
              description: 'true to activate, false to deactivate.',
            },
          },
          required: ['workflowId', 'active'],
        },
        bridge             : 'n8n',
        pedagogicalSummary : 'Enables or disables a workflow via PATCH /api/v1/workflows/{id}',
      },
    ]
  }

  // ---------------------------------------------------------------------------
  // Tool execution
  // ---------------------------------------------------------------------------

  async executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    if (this._status !== 'connected') {
      return this.fail(`n8n bridge is not connected (status: ${this._status}). Check your config.`)
    }

    this.log.emit({
      timestamp: new Date(),
      level    : 'info',
      phase    : 'bridge_dispatch',
      bridge   : 'n8n',
      toolName,
      message  : `Dispatching tool call`,
      data     : args,
    })

    try {
      switch (toolName) {
        case 'n8n_list_workflows':     return await this.listWorkflows(args)
        case 'n8n_execute_workflow':   return await this.executeWorkflow(args)
        case 'n8n_get_execution':      return await this.getExecution(args)
        case 'n8n_activate_workflow':  return await this.activateWorkflow(args)
        default:
          return this.fail(`Unknown n8n tool : ${toolName}`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.log.error(`n8n tool ${toolName} failed`, err)
      return this.fail(`n8n error : ${msg}`)
    }
  }

  // ---------------------------------------------------------------------------
  // Individual tool handlers
  // ---------------------------------------------------------------------------

  private async listWorkflows(args: Record<string, unknown>): Promise<ToolResult> {
    const activeOnly = args['activeOnly'] === true

    this.log.emit({
      timestamp: new Date(),
      level    : 'info',
      phase    : 'external_call',
      bridge   : 'n8n',
      message  : `GET ${this.baseUrl}/api/v1/workflows`,
    })

    const data = await this.request<{ data: N8nWorkflow[] }>('GET', '/api/v1/workflows')
    let workflows = data.data

    if (activeOnly) {
      workflows = workflows.filter(w => w.active)
    }

    if (workflows.length === 0) {
      return this.ok('No workflows found in n8n.')
    }

    const lines = workflows.map(w =>
      `- [${w.id}] "${w.name}" — ${w.active ? 'active' : 'inactive'}`
    )

    return this.ok(`Found ${workflows.length} workflow(s) :\n\n${lines.join('\n')}`)
  }

  private async executeWorkflow(args: Record<string, unknown>): Promise<ToolResult> {
    const workflowId = String(args['workflowId'])
    const inputData  = args['inputData'] as Record<string, unknown> | undefined

    this.log.emit({
      timestamp: new Date(),
      level    : 'info',
      phase    : 'external_call',
      bridge   : 'n8n',
      message  : `Triggering workflow ${workflowId}`,
    })

    const body    = inputData ? { data: inputData } : {}
    const result  = await this.request<{ data: { executionId: string } }>(
      'POST',
      `/api/v1/workflows/${workflowId}/run`,
      body
    )

    const execId = result?.data?.executionId ?? 'unknown'

    this.log.emit({
      timestamp: new Date(),
      level    : 'info',
      phase    : 'external_response',
      bridge   : 'n8n',
      message  : `Workflow triggered. Execution ID : ${execId}`,
    })

    return this.ok(
      `Workflow ${workflowId} triggered successfully.\nExecution ID : ${execId}\n\n` +
      `Use n8n_get_execution with this ID to fetch the result.`
    )
  }

  private async getExecution(args: Record<string, unknown>): Promise<ToolResult> {
    const executionId = String(args['executionId'])

    const data = await this.request<{ data: N8nExecution }>('GET', `/api/v1/executions/${executionId}`)
    const exec = data.data

    const lines = [
      `Execution ID   : ${exec.id}`,
      `Workflow ID    : ${exec.workflowId}`,
      `Status         : ${exec.status}`,
      `Started at     : ${exec.startedAt}`,
      `Finished at    : ${exec.stoppedAt ?? 'still running'}`,
    ]

    if (exec.status === 'error') {
      lines.push(`\nThe workflow encountered an error. Check n8n's execution logs for details.`)
    }

    return this.ok(lines.join('\n'))
  }

  private async activateWorkflow(args: Record<string, unknown>): Promise<ToolResult> {
    const workflowId = String(args['workflowId'])
    const active     = Boolean(args['active'])

    await this.request('PATCH', `/api/v1/workflows/${workflowId}`, { active })

    const action = active ? 'activated' : 'deactivated'
    return this.ok(`Workflow ${workflowId} has been ${action}.`)
  }

  // ---------------------------------------------------------------------------
  // HTTP helper
  // ---------------------------------------------------------------------------

  /**
   * Generic HTTP request to the n8n REST API.
   *
   * We use the built-in Node.js fetch() here (available since Node 18).
   * No external HTTP libraries needed.
   */
  private async request<T = unknown>(
    method : 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path   : string,
    body  ?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-N8N-API-KEY': this.apiKey,
    }

    const options: RequestInit = {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    }

    const res = await fetch(url, options)

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`n8n API ${method} ${path} returned ${res.status} : ${text}`)
    }

    // Some n8n endpoints return empty bodies.
    const text = await res.text()
    return text ? JSON.parse(text) : ({} as T)
  }
}
