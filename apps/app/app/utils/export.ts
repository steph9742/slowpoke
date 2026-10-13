export const downloadFile = (content: string, filename: string, mimeType: string) => {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

type LigneExport = Record<string, unknown>

/**
 * Les trois formes réellement reçues : le query builder renvoie `{ rows }`, les widgets un
 * tableau, et certains appels un objet seul.
 */
export type DonneesExport = { rows?: LigneExport[] } | LigneExport[] | LigneExport

/** Ramène les trois formes à une liste de lignes — la logique était dupliquée à l'identique. */
function enLignes(data: DonneesExport): LigneExport[] {
  if (data && typeof data === 'object' && 'rows' in data && Array.isArray(data.rows)) {
    return data.rows
  }
  if (Array.isArray(data)) {
    return data
  }
  return [data as LigneExport]
}

export const exportAsJson = (data: unknown, filename: string = `export_${Date.now()}.json`) => {
  const content = JSON.stringify(data, null, 2)
  downloadFile(content, filename, 'application/json')
}

export const exportAsCsv = (data: DonneesExport, filename: string = `export_${Date.now()}.csv`) => {
  const rows = enLignes(data)

  if (rows.length === 0) {
    return
  }

  const headers = Object.keys(rows[0]!)
  const csvContent = rows.map((row) => {
    return headers.map((header) => {
      let cell = row[header] === null || row[header] === undefined ? '' : String(row[header])
      cell = cell.replace(/"/g, '""')
      if (cell.search(/("|,|\n)/g) >= 0) {
        cell = `"${cell}"`
      }
      return cell
    }).join(',')
  })

  const content = [headers.join(','), ...csvContent].join('\n')
  downloadFile(content, filename, 'text/csv')
}

export const exportAsText = (data: DonneesExport, filename: string = `export_${Date.now()}.txt`) => {
  let content = ''

  enLignes(data).forEach((row, index) => {
    content += `--- Result ${index + 1} ---\n`
    Object.entries(row).forEach(([key, value]) => {
      content += `${key}: ${value}\n`
    })
    content += '\n'
  })

  downloadFile(content, filename, 'text/plain')
}
