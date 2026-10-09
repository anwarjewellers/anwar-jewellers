import { STATES } from '../../shared/constants.js';
import { FieldError } from './Ui.jsx';

export const EMPTY_ADDRESS = { full_name: '', mobile: '', house: '', street: '', area: '', city: 'Hyderabad', state: 'Telangana', pincode: '' };

/** Address inputs. `value` / `onChange(newValue)` / `errors` */
export function AddressFields({ value, onChange, errors = {} }) {
  const field = (name, label, props = {}) => (
    <>
      <label className="form-label" htmlFor={`addr-${name}`}>{label}</label>
      <input id={`addr-${name}`} className={`form-control${errors[name] ? ' is-invalid' : ''}`} value={value[name] ?? ''} onChange={(e) => onChange({ ...value, [name]: e.target.value })} {...props} />
      <FieldError msg={errors[name]} />
    </>
  );
  return (
    <div className="row g-3">
      <div className="col-md-6">{field('full_name', 'Full name *', { autoComplete: 'name', required: true })}</div>
      <div className="col-md-6">{field('mobile', 'Mobile number *', { inputMode: 'numeric', maxLength: 10, autoComplete: 'tel-national', required: true, placeholder: '10-digit mobile' })}</div>
      <div className="col-12">{field('house', 'House / flat no., building *', { autoComplete: 'address-line1', required: true })}</div>
      <div className="col-md-6">{field('street', 'Street / road', { autoComplete: 'address-line2' })}</div>
      <div className="col-md-6">{field('area', 'Area / landmark')}</div>
      <div className="col-md-4">{field('city', 'City *', { autoComplete: 'address-level2', required: true })}</div>
      <div className="col-md-4">
        <label className="form-label" htmlFor="addr-state">State *</label>
        <select id="addr-state" className={`form-select${errors.state ? ' is-invalid' : ''}`} value={value.state} onChange={(e) => onChange({ ...value, state: e.target.value })}>
          <option value="">Choose…</option>
          {STATES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <FieldError msg={errors.state} />
      </div>
      <div className="col-md-4">{field('pincode', 'Pincode *', { inputMode: 'numeric', maxLength: 6, autoComplete: 'postal-code', required: true })}</div>
    </div>
  );
}

export const addressLine = (a) => [a.house, a.street, a.area, a.city, a.state, a.pincode].filter(Boolean).join(', ');
