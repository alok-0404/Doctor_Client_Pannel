import { COUNTRY_CODE_OPTIONS } from '../constants/countryCodes'

interface CountryCodePhoneInputProps {
  id: string
  label: string
  countryCode: string
  onCountryCodeChange: (value: string) => void
  phoneDigits: string
  onPhoneDigitsChange: (digits: string) => void
  placeholder?: string
  maxDigits?: number
}

export const CountryCodePhoneInput = ({
  id,
  label,
  countryCode,
  onCountryCodeChange,
  phoneDigits,
  onPhoneDigitsChange,
  placeholder = 'Enter mobile number',
  maxDigits = 14,
}: CountryCodePhoneInputProps) => {
  return (
    <div className="ui-field">
      <label htmlFor={id} className="ui-label">{label}</label>
      <div style={{ display: 'grid', gridTemplateColumns: '125px 1fr', gap: 8 }}>
        <select
          aria-label={`${label} country code`}
          value={countryCode}
          onChange={(e) => onCountryCodeChange(e.target.value)}
          style={{
            border: '1px solid #d7dee9',
            borderRadius: 10,
            padding: '10px 10px',
            background: '#fff',
            color: '#2f3b52',
            fontSize: 14,
          }}
        >
          {COUNTRY_CODE_OPTIONS.map((opt) => (
            <option key={opt.code} value={opt.code}>{opt.label}</option>
          ))}
        </select>
        <input
          id={id}
          type="tel"
          value={phoneDigits}
          placeholder={placeholder}
          onChange={(e) => {
            const onlyDigits = e.target.value.replace(/\D/g, '').slice(0, maxDigits)
            onPhoneDigitsChange(onlyDigits)
          }}
          style={{
            border: '1px solid #d7dee9',
            borderRadius: 10,
            padding: '10px 12px',
            background: '#fff',
            color: '#2f3b52',
            fontSize: 14,
          }}
        />
      </div>
    </div>
  )
}

