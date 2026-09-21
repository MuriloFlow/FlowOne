import type { SorteioClient } from '../../../shared/sorteio'
import { exportFile } from '@/lib/native-export'

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Planilha Excel (.xls SpreadsheetML) — abre no Excel/Sheets sem dependência extra. */
export async function exportSorteioPhonesExcel(clients: SorteioClient[]): Promise<void> {
  if (!clients.length) throw new Error('Não há clientes para exportar.')

  const rows = clients
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    .map((client, index) => {
      const cells = [
        String(index + 1),
        client.name,
        client.phoneFormatted,
        client.phoneDigits,
        client.cpfFormatted,
        String(client.chances)
      ]
      return `<Row>${cells
        .map(
          (value, cellIndex) =>
            `<Cell${cellIndex === 0 || cellIndex === 5 ? ' ss:StyleID="Number"' : ''}><Data ss:Type="${
              cellIndex === 0 || cellIndex === 5 ? 'Number' : 'String'
            }">${escapeXml(value)}</Data></Cell>`
        )
        .join('')}</Row>`
    })
    .join('')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="Header">
   <Font ss:Bold="1"/>
  </Style>
  <Style ss:ID="Number">
   <NumberFormat ss:Format="0"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="Telefones">
  <Table>
   <Column ss:Width="40"/>
   <Column ss:Width="180"/>
   <Column ss:Width="120"/>
   <Column ss:Width="110"/>
   <Column ss:Width="120"/>
   <Column ss:Width="60"/>
   <Row ss:StyleID="Header">
    <Cell><Data ss:Type="String">#</Data></Cell>
    <Cell><Data ss:Type="String">Nome</Data></Cell>
    <Cell><Data ss:Type="String">Telefone</Data></Cell>
    <Cell><Data ss:Type="String">Telefone (só números)</Data></Cell>
    <Cell><Data ss:Type="String">CPF</Data></Cell>
    <Cell><Data ss:Type="String">Vales</Data></Cell>
   </Row>
   ${rows}
  </Table>
 </Worksheet>
</Workbook>`

  const stamp = new Date().toISOString().slice(0, 10)
  const blob = new Blob([xml], { type: 'application/vnd.ms-excel' })
  await exportFile(blob, `sorteio-telefones-${stamp}.xls`, 'Exportar telefones do sorteio')
}
