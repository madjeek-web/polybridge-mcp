/**
 * src/bridges/notion/index.ts
 *
 * The Notion bridge.
 *
 * Notion is a workspace tool used by millions of teams and individuals for
 * notes, databases, project management, and documentation. The Notion API
 * allows programmatic read and write access to your workspace.
 *
 * This bridge uses the official @notionhq/client package, which wraps the
 * Notion REST API with a TypeScript-friendly interface.
 *
 * How to get a Notion API key :
 * ------------------------------
 * 1. Go to https://notion.so/my-integrations
 * 2. Click "New integration"
 * 3. Give it a name (e.g., "polybridge")
 * 4. Copy the "Internal Integration Token" — this is your API key.
 * 5. Share each Notion page/database you want to access : open the page,
 *    click the three dots menu, click "Connections", and add your integration.
 *
 * Notion's block model :
 * ----------------------
 * In Notion, everything is a "block". A page is a block. A paragraph inside
 * a page is a block. A heading is a block. A table row is a block.
 * Understanding this model makes the API much easier to use.
 */

import { Client }      from '@notionhq/client'
import { BaseBridge }  from '../../adapters/bridge/base.js'

import type {
  BridgeName,
  ToolDefinition,
  ToolResult,
} from '../../types/index.js'

export class NotionBridge extends BaseBridge {
  readonly name       : BridgeName = 'notion'
  readonly description: string     = 'Reads and writes Notion pages and databases'

  private client: Client | null = null

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async init(): Promise<void> {
    if (!this.isEnabled()) {
      this._status = 'disabled'
      return
    }

    const apiKey = this.config.bridges.notion.apiKey
    if (!apiKey) {
      this._status = 'error'
      this.log.error('Notion bridge : apiKey is empty. Create an integration at notion.so/my-integrations')
      return
    }

    try {
      this.client = new Client({ auth: apiKey })
      // Verify the key by fetching the current user.
      await this.client.users.me()
      this._status = 'connected'
      this.log.info('bridge_dispatch', 'Notion bridge connected')
    } catch (err) {
      this._status = 'error'
      this.log.error('Notion bridge failed to authenticate. Check your API key.', err)
    }
  }

  // ---------------------------------------------------------------------------
  // Tool definitions
  // ---------------------------------------------------------------------------

  getTools(): ToolDefinition[] {
    return [
      {
        name       : 'notion_create_page',
        description: 'Create a new Notion page inside a parent page or database.',
        inputSchema: {
          type      : 'object',
          properties: {
            parentId: {
              type       : 'string',
              description: 'The ID of the parent page or database. Found in the page URL.',
            },
            title: {
              type       : 'string',
              description: 'Title of the new page.',
            },
            content: {
              type       : 'string',
              description: 'Optional initial text content of the page (plain text, will be added as a paragraph block).',
            },
          },
          required: ['parentId', 'title'],
        },
        bridge             : 'notion',
        pedagogicalSummary : 'Creates a new Notion page via POST /v1/pages',
      },
      {
        name       : 'notion_append_text',
        description: 'Append a text paragraph to an existing Notion page.',
        inputSchema: {
          type      : 'object',
          properties: {
            pageId: {
              type       : 'string',
              description: 'The ID of the page to append to.',
            },
            text: {
              type       : 'string',
              description: 'The text to append.',
            },
            blockType: {
              type       : 'string',
              enum       : ['paragraph', 'heading_1', 'heading_2', 'heading_3', 'bulleted_list_item', 'numbered_list_item', 'code'],
              description: 'The type of block to add. Default: paragraph.',
              default    : 'paragraph',
            },
          },
          required: ['pageId', 'text'],
        },
        bridge             : 'notion',
        pedagogicalSummary : 'Appends a block to a page via PATCH /v1/blocks/{id}/children',
      },
      {
        name       : 'notion_read_page',
        description: 'Read the title and text content of a Notion page.',
        inputSchema: {
          type      : 'object',
          properties: {
            pageId: {
              type       : 'string',
              description: 'The ID of the page to read.',
            },
          },
          required: ['pageId'],
        },
        bridge             : 'notion',
        pedagogicalSummary : 'Fetches page metadata via GET /v1/pages/{id} and blocks via GET /v1/blocks/{id}/children',
      },
    ]
  }

  // ---------------------------------------------------------------------------
  // Tool execution
  // ---------------------------------------------------------------------------

  async executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    if (this._status !== 'connected' || !this.client) {
      return this.fail(`Notion bridge is not connected (status: ${this._status}).`)
    }

    try {
      switch (toolName) {
        case 'notion_create_page':  return await this.createPage(args)
        case 'notion_append_text':  return await this.appendText(args)
        case 'notion_read_page':    return await this.readPage(args)
        default:
          return this.fail(`Unknown Notion tool : ${toolName}`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return this.fail(`Notion error : ${msg}`)
    }
  }

  // ---------------------------------------------------------------------------
  // Individual tool handlers
  // ---------------------------------------------------------------------------

  private async createPage(args: Record<string, unknown>): Promise<ToolResult> {
    const parentId = String(args['parentId'])
    const title    = String(args['title'])
    const content  = args['content'] ? String(args['content']) : null

    const children = content
      ? [{
          object   : 'block' as const,
          type     : 'paragraph' as const,
          paragraph: { rich_text: [{ type: 'text' as const, text: { content } }] },
        }]
      : []

    const page = await this.client!.pages.create({
      parent  : { page_id: parentId },
      properties: {
        title: {
          title: [{ text: { content: title } }],
        },
      },
      children,
    })

    return this.ok(
      `Page "${title}" created.\nPage ID : ${page.id}\nURL : ${'url' in page ? page.url : '(not available)'}`
    )
  }

  private async appendText(args: Record<string, unknown>): Promise<ToolResult> {
    const pageId    = String(args['pageId'])
    const text      = String(args['text'])
    const blockType = (args['blockType'] as string) ?? 'paragraph'

    // Build the block payload dynamically based on blockType.
    // All text-based blocks share the same rich_text structure.
    const block = {
      object: 'block' as const,
      type  : blockType as 'paragraph',
      // Dynamic key — TypeScript requires this cast for Notion SDK compatibility.
      [blockType]: {
        rich_text: [{ type: 'text' as const, text: { content: text } }],
      },
    }

    await this.client!.blocks.children.append({
      block_id: pageId,
      children: [block],
    })

    return this.ok(`Text appended to page ${pageId}.`)
  }

  private async readPage(args: Record<string, unknown>): Promise<ToolResult> {
    const pageId = String(args['pageId'])

    // Fetch page metadata (includes title).
    const page = await this.client!.pages.retrieve({ page_id: pageId })

    // Fetch the page's child blocks (the actual content).
    const blocks = await this.client!.blocks.children.list({ block_id: pageId })

    // Extract the title from page properties.
    let title = '(untitled)'
    if ('properties' in page && page.properties['title']) {
      const titleProp = page.properties['title'] as { title: Array<{ plain_text: string }> }
      title = titleProp.title.map(t => t.plain_text).join('')
    }

    // Extract plain text from blocks.
    const contentLines: string[] = []
    for (const block of blocks.results) {
      if (!('type' in block)) continue

      const b = block as Record<string, unknown>
      const blockData = b[block.type as string] as { rich_text?: Array<{ plain_text: string }> } | undefined

      if (blockData?.rich_text) {
        const text = blockData.rich_text.map(t => t.plain_text).join('')
        if (text) contentLines.push(text)
      }
    }

    return this.ok(
      `Page : ${title}\n` +
      `ID   : ${pageId}\n\n` +
      (contentLines.length > 0
        ? contentLines.join('\n')
        : '(empty page)')
    )
  }
}
