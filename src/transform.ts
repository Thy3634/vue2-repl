import { Store, File } from './store'
import {
  SFCDescriptor,
  BindingMetadata,
  shouldTransformRef,
  transformRef,
  // CompilerOptions,
  parse,
compileStyleAsync,
compileScript,
rewriteDefault
// compileTemplate
} from 'vue/compiler-sfc'
import { transform } from 'sucrase'
// @ts-ignore
import hashId from 'hash-sum'

export const COMP_IDENTIFIER = `__sfc__`

async function transformTS(src: string) {
  return transform(src, {
    transforms: ['typescript']
  }).code
}

export async function compileFile(
  store: Store,
  { filename, code, compiled }: File
) {
  if (!code.trim()) {
    store.state.errors = []
    return
  }

  if (filename.endsWith('.css')) {
    compiled.css = code
    store.state.errors = []
    return
  }

  if (filename.endsWith('.js') || filename.endsWith('.ts')) {
    if (shouldTransformRef(code)) {
      code = transformRef(code, { filename }).code
    }
    if (filename.endsWith('.ts')) {
      code = await transformTS(code)
    }
    compiled.js = compiled.ssr = code
    store.state.errors = []
    return
  }

  if (!filename.endsWith('.vue')) {
    store.state.errors = []
    return
  }

  const id = hashId(filename)
  
  const { errors, descriptor } = parse(code, {
    filename,
    sourceMap: true
  })
  // if (descriptor.scriptSetup) {
  //   store.state.errors = ['<script setup> is not supported']
  //   return
  // }
  if (errors.length) {
    store.state.errors = errors
    return
  }

  if (
    descriptor.styles.some((s) => s.lang) ||
    (descriptor.template && descriptor.template.lang)
  ) {
    store.state.errors = [
      `lang="x" pre-processors for <template> or <style> are currently not ` +
        `supported.`
    ]
    return
  }

  const scriptLang =
    (descriptor.script && descriptor.script.lang)
  const isTS = scriptLang === 'ts'
  if (scriptLang && !isTS) {
    store.state.errors = [`Only lang="ts" is supported for <script> blocks.`]
    return
  }

  const hasScoped = descriptor.styles.some((s) => s.scoped)
  let clientCode = ''

  const clientScriptResult = await doCompileScript(
    store,
    descriptor,
    id,
    isTS
  )
  if (!clientScriptResult) {
    return
  }
  const [clientScript, bindings] = clientScriptResult
  clientCode += clientScript

  // template
  // only need dedicated compilation if not using <script setup>
  if (
    descriptor.template &&
    (!descriptor.scriptSetup || store.options?.script?.inlineTemplate === false)
  ) {
    const clientTemplateResult = await doCompileTemplate(
      store,
      descriptor,
      id,
      bindings,
      isTS,
      hasScoped
    )
    if (!clientTemplateResult) {
      return
    }
    clientCode += clientTemplateResult
  }
  
  if (hasScoped) {
    clientCode += `\n${COMP_IDENTIFIER}.__scopeId = ${JSON.stringify(`data-v-${id}`)}`
  }

  if (clientCode) {
    clientCode += `\n${COMP_IDENTIFIER}.__file = ${JSON.stringify(filename)}` +
        `\nexport default ${COMP_IDENTIFIER}`
    compiled.js = clientCode.trimStart()
  }

  // styles
  let css = ''
  for (const style of descriptor.styles) {
    if (style.module) {
      store.state.errors = [
        `<style module> is not supported in the playground.`
      ]
      return
    }

    const styleResult = await compileStyleAsync({
      ...store.options?.style,
      source: style.content,
      filename,
      id,
      scoped: style.scoped,
      modules: !!style.module
    })
    if (styleResult.errors.length) {
      // postcss uses pathToFileURL which isn't polyfilled in the browser
      // ignore these errors for now
      if (!styleResult.errors[0].message.includes('pathToFileURL')) {
        store.state.errors = styleResult.errors
      }
      // proceed even if css compile errors
    } else {
      css += styleResult.code + '\n'
    }
  }
  if (css) {
    compiled.css = css.trim()
  } else {
    compiled.css = '/* No <style> tags present */'
  }

  // clear errors
  store.state.errors = []
}

async function doCompileScript(
  store: Store,
  descriptor: SFCDescriptor,
  id: string,
  isTS: boolean
): Promise<[string, BindingMetadata | undefined] | undefined> {
  try {
    if (descriptor.script) {
        const compiledScript = compileScript(descriptor, {
          inlineTemplate: true,
          ...store.options?.script,
          id,
          templateOptions: {
            ...store.options?.template,
            ssrCssVars: descriptor.cssVars,
            compilerOptions: {
              ...store.options?.template?.compilerOptions,
              expressionPlugins: isTS ? ['typescript'] : undefined
            }
          }
        })

        let code = ''
        if (compiledScript.bindings) {
          code += `\n/* Analyzed bindings: ${JSON.stringify(
            compiledScript.bindings,
            null,
            2
          )} */`
        }
        code +=
          `\n` +
          rewriteDefault(
            compiledScript.content,
            COMP_IDENTIFIER,
            isTS ? ['typescript'] : undefined
          )

        if (descriptor.script.lang === 'ts') {
          code = await transformTS(code)
        }

        return [code, compiledScript.bindings]
    } else if (descriptor.scriptSetup) {
      throw new Error('<script setup> is not supported')
    } else {
      return [`\nconst ${COMP_IDENTIFIER} = {}`, undefined]
    }
  } catch (e: any) {
      store.state.errors = [e.stack.split('\n').slice(0, 12).join('\n')]
      return
  }
}

async function doCompileTemplate(
  store: Store,
  descriptor: SFCDescriptor,
  id: string,
  bindingMetadata: BindingMetadata | undefined,
  isTS: boolean,
  hasScoped: boolean
) {
  let code = descriptor.template?.content

  if (hasScoped) {
    const node = document.createElement('div')
    node.innerHTML = descriptor.template?.content || ''
    if (node.childElementCount !== 1) {
      store.state.errors = ['only one element on template toot allowed']
    }
    node.querySelectorAll('*').forEach(it => it.setAttribute(`data-v-${id}`, ''))
    code = new XMLSerializer().serializeToString(node.firstElementChild!)
  }

  code = `\n${COMP_IDENTIFIER}.template = \`${code}\``

  if (isTS) {
    code = await transformTS(code)
  }

  return code
}
