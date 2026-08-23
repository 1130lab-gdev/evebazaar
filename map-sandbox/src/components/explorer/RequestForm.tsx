import { useRegions } from '../../api/map/useRegions';
import type { EndpointDef } from './endpoints';

interface Props {
  endpoint: EndpointDef;
  values: Record<string, string>;
  onChange: (name: string, value: string) => void;
}

export function RequestForm({ endpoint, values, onChange }: Props) {
  const { regions } = useRegions();

  if (endpoint.fields.length === 0) {
    return <p className="text-muted mono">No parameters.</p>;
  }

  return (
    <div>
      {endpoint.fields.map((field) => (
        <div className="field" key={field.name}>
          <label htmlFor={field.name}>
            {field.name}
            {field.location === 'path' ? ' (path)' : ''}
            {field.required ? ' *' : ''}
          </label>
          {field.kind === 'region-select' ? (
            <select id={field.name} value={values[field.name] ?? ''} onChange={(e) => onChange(field.name, e.target.value)}>
              <option value="">(any)</option>
              {regions.map((r) => (
                <option key={r.region_id} value={r.region_id}>
                  {r.region_id} — {r.name}
                </option>
              ))}
            </select>
          ) : field.kind === 'select' ? (
            <select id={field.name} value={values[field.name] ?? ''} onChange={(e) => onChange(field.name, e.target.value)}>
              {(field.options ?? []).map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              id={field.name}
              type="number"
              step={field.step}
              placeholder={field.placeholder}
              value={values[field.name] ?? ''}
              onChange={(e) => onChange(field.name, e.target.value)}
            />
          )}
        </div>
      ))}
    </div>
  );
}
