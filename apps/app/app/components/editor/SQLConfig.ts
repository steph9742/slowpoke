import { sql, PostgreSQL } from '@codemirror/lang-sql'
import { linter, type Diagnostic } from '@codemirror/lint'
import { columns } from '@slowpoke/database/columns'

export const sqlConfig = sql({
  dialect: PostgreSQL,
  schema: columns,
})

export const sqlLinter = linter((view) => {
  const diagnostics: Diagnostic[] = []
  const tree = sqlConfig.language.parser.parse(view.state.doc.toString())

  tree.iterate({
    enter: (node) => {
      if (node.type.isError) {
        diagnostics.push({
          from: node.from,
          to: node.to,
          severity: 'error',
          message: 'Syntax error',
        })
      }
    },
  })

  return diagnostics
})
