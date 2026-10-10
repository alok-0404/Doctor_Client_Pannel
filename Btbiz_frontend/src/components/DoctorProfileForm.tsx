import { useRef, useState, type FC } from 'react'

import { TextField } from './ui/TextField'
import type { DoctorProfileFields } from '../services/api'
import { compressImageFile } from '../utils/compressImage'
import { doctorInitials, useDepartments } from '../utils/doctorDirectory'

interface DoctorProfileFormProps {
  idPrefix: string
  value: DoctorProfileFields
  onChange: (next: DoctorProfileFields) => void
  /** Existing photo URL or a local preview of a newly picked photo. */
  photoUrl?: string
  onPhotoPicked: (photo: Blob, previewUrl: string) => void
  onPhotoRemove?: () => void
  displayName?: string
  disabled?: boolean
}

export const DoctorProfileForm: FC<DoctorProfileFormProps> = ({
  idPrefix,
  value,
  onChange,
  photoUrl,
  onPhotoPicked,
  onPhotoRemove,
  displayName = '',
  disabled = false,
}) => {
  const departments = useDepartments()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [photoError, setPhotoError] = useState<string | null>(null)

  const set = <K extends keyof DoctorProfileFields>(key: K, next: DoctorProfileFields[K]) => {
    onChange({ ...value, [key]: next })
  }

  const handleFile = async (file: File | undefined) => {
    setPhotoError(null)
    if (!file) return
    try {
      const blob = await compressImageFile(file)
      onPhotoPicked(blob, URL.createObjectURL(blob))
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Could not use this photo.')
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="doctor-profile-form">
      <div className="doctor-profile-photo-row">
        <div className="doctor-profile-photo">
          {photoUrl ? (
            <img src={photoUrl} alt={displayName ? `${displayName} photo` : 'Doctor photo'} />
          ) : (
            <span aria-hidden="true">{doctorInitials(displayName)}</span>
          )}
        </div>
        <div className="doctor-profile-photo-actions">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            disabled={disabled}
            onChange={(e) => void handleFile(e.target.files?.[0])}
          />
          <button
            type="button"
            className="ui-button ui-button-secondary ui-button-sm"
            disabled={disabled}
            onClick={() => fileInputRef.current?.click()}
          >
            {photoUrl ? 'Change photo' : 'Upload photo'}
          </button>
          {photoUrl && onPhotoRemove && (
            <button
              type="button"
              className="ui-button ui-button-danger-outline ui-button-sm"
              disabled={disabled}
              onClick={onPhotoRemove}
            >
              Remove
            </button>
          )}
          <p className="doctor-profile-hint">JPG / PNG / WEBP. Shown on the website and WhatsApp bot.</p>
          {photoError && <p className="doctor-profile-error">{photoError}</p>}
        </div>
      </div>

      <div className="ui-textfield">
        <label htmlFor={`${idPrefix}-department`} className="ui-textfield-label">
          Department
        </label>
        <div className="ui-textfield-input-wrapper">
          <select
            id={`${idPrefix}-department`}
            className="ui-textfield-input"
            value={value.department ?? ''}
            disabled={disabled}
            onChange={(e) => set('department', e.target.value)}
          >
            <option value="">General Medicine (default)</option>
            {departments
              .filter((d) => d.id !== 'general')
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
          </select>
        </div>
      </div>

      <TextField
        id={`${idPrefix}-specialization`}
        label="Speciality"
        placeholder="e.g. Joint replacement, Diabetes care"
        maxLength={80}
        value={value.specialization ?? ''}
        disabled={disabled}
        onChange={(e) => set('specialization', e.target.value)}
      />
      <TextField
        id={`${idPrefix}-qualification`}
        label="Degree / qualification"
        placeholder="e.g. MBBS, MD (Medicine)"
        maxLength={120}
        value={value.qualification ?? ''}
        disabled={disabled}
        onChange={(e) => set('qualification', e.target.value)}
      />
      <TextField
        id={`${idPrefix}-experience`}
        label="Experience (years)"
        type="number"
        min={0}
        max={80}
        placeholder="e.g. 12"
        value={value.experienceYears ?? ''}
        disabled={disabled}
        onChange={(e) => set('experienceYears', e.target.value === '' ? '' : Number(e.target.value))}
      />
      <TextField
        id={`${idPrefix}-previous-hospital`}
        label="Previous hospital"
        placeholder="e.g. AIIMS Delhi"
        maxLength={120}
        value={value.previousHospital ?? ''}
        disabled={disabled}
        onChange={(e) => set('previousHospital', e.target.value)}
      />
      <div className="ui-textfield">
        <label htmlFor={`${idPrefix}-bio`} className="ui-textfield-label">
          Short bio (optional)
        </label>
        <div className="ui-textfield-input-wrapper">
          <textarea
            id={`${idPrefix}-bio`}
            className="ui-textfield-input doctor-profile-bio"
            rows={3}
            maxLength={600}
            value={value.bio ?? ''}
            disabled={disabled}
            onChange={(e) => set('bio', e.target.value)}
          />
        </div>
      </div>
    </div>
  )
}
