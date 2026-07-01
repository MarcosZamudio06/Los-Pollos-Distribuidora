import type { CustomerType } from '../types'

type Props = { value?: CustomerType | ''; onChange: (value: CustomerType | '') => void }

export function CustomerTypeFilter({ onChange, value = '' }: Props) {
  return (
    <select className="rounded-xl border border-[#20211f]/15 bg-white p-3" value={value} onChange={(event) => onChange(event.target.value as CustomerType | '')}>
      <option value="">Tipo de cliente</option>
      <option value="RETAIL">Minorista</option>
      <option value="WHOLESALE">Mayorista</option>
      <option value="INSTITUTIONAL">Institucional</option>
    </select>
  )
}
