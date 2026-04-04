/**
 * src/utils/recipe-cli.ts
 *
 * The recipe CLI — a simple command-line interface for listing and running
 * pre-built polybridge-mcp recipes.
 *
 * Usage :
 *   npm run recipe list
 *   npm run recipe run blender-to-notion
 *   npm run recipe info blender-to-notion
 *
 * What is a recipe ?
 * ------------------
 * A recipe is a JSON file in docs/recipes/ that describes a reusable
 * workflow bundle. Recipes give non-technical users a way to activate
 * common automations with a single command, without writing any code.
 *
 * A recipe file looks like this :
 *
 * {
 *   "id"         : "blender-to-notion",
 *   "name"       : "Blender to Notion",
 *   "description": "Renders a Blender scene and documents it in Notion",
 *   "bridges"    : ["blender", "notion"],
 *   "prompt"     : "Render the current Blender scene and create a Notion page titled '{title}' that documents the scene with the render image.",
 *   "params"     : [
 *     { "name": "title", "description": "Title for the Notion page", "default": "Scene render" }
 *   ]
 * }
 */

import fs   from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname  = path.dirname(__filename)

// Recipes live in docs/recipes/ relative to the project root.
const RECIPES_DIR = path.resolve(__dirname, '../../docs/recipes')

interface RecipeParam {
  name       : string
  description: string
  default   ?: string
}

interface Recipe {
  id         : string
  name       : string
  description: string
  bridges    : string[]
  prompt     : string
  params    ?: RecipeParam[]
}

/** Load all recipe JSON files from the recipes directory. */
function loadRecipes(): Recipe[] {
  if (!fs.existsSync(RECIPES_DIR)) {
    return []
  }

  return fs
    .readdirSync(RECIPES_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const content = fs.readFileSync(path.join(RECIPES_DIR, f), 'utf-8')
      return JSON.parse(content) as Recipe
    })
}

/** Format a recipe for display. */
function formatRecipe(recipe: Recipe): string {
  const lines = [
    `  ${recipe.id.padEnd(28)} ${recipe.name}`,
    `  ${''.padEnd(28)} ${recipe.description}`,
    `  ${''.padEnd(28)} Bridges : ${recipe.bridges.join(', ')}`,
  ]
  return lines.join('\n')
}

/** Main CLI entry point. */
function main(): void {
  const [, , command, ...rest] = process.argv

  switch (command) {
    case 'list': {
      const recipes = loadRecipes()
      if (recipes.length === 0) {
        console.log('No recipes found in docs/recipes/.')
        console.log('See docs/recipes/README.md to create one.')
        break
      }
      console.log(`\nAvailable recipes (${recipes.length}) :\n`)
      for (const r of recipes) {
        console.log(formatRecipe(r))
        console.log()
      }
      break
    }

    case 'info': {
      const id      = rest[0]
      const recipes = loadRecipes()
      const recipe  = recipes.find(r => r.id === id)

      if (!recipe) {
        console.error(`Recipe "${id}" not found. Run "npm run recipe list" to see available recipes.`)
        process.exit(1)
      }

      console.log(`\nRecipe : ${recipe.name}`)
      console.log(`ID     : ${recipe.id}`)
      console.log(`Desc   : ${recipe.description}`)
      console.log(`Bridges: ${recipe.bridges.join(', ')}`)
      console.log(`\nPrompt template :`)
      console.log(recipe.prompt)

      if (recipe.params && recipe.params.length > 0) {
        console.log('\nParameters :')
        for (const p of recipe.params) {
          console.log(`  {${p.name}} — ${p.description}${p.default ? ` (default: ${p.default})` : ''}`)
        }
      }
      break
    }

    case 'run': {
      const id     = rest[0]
      const recipe = loadRecipes().find(r => r.id === id)

      if (!recipe) {
        console.error(`Recipe "${id}" not found.`)
        process.exit(1)
      }

      // Build the final prompt by substituting default parameter values.
      let prompt = recipe.prompt
      for (const param of recipe.params ?? []) {
        const value = param.default ?? `{${param.name}}`
        prompt = prompt.replace(new RegExp(`\\{${param.name}\\}`, 'g'), value)
      }

      console.log(`\nRecipe : ${recipe.name}`)
      console.log(`Bridges required : ${recipe.bridges.join(', ')}`)
      console.log('\nInstruction to send to your LLM :\n')
      console.log('---')
      console.log(prompt)
      console.log('---')
      console.log('\nCopy the instruction above and paste it into Claude Desktop or your LLM client.')
      console.log('Make sure the required bridges are enabled in your config file first.')
      break
    }

    default: {
      console.log('\npolybridge-mcp recipe CLI')
      console.log('\nUsage :')
      console.log('  npm run recipe list           List all available recipes')
      console.log('  npm run recipe info <id>      Show details for a recipe')
      console.log('  npm run recipe run  <id>      Print the recipe prompt to use in your LLM client')
      break
    }
  }
}

main()
