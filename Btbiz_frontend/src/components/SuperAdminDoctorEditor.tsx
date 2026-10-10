import { useEffect, useRef, useState, type FC } from 'react'
import { toast } from 'react-toastify'

import { DoctorProfileForm } from './DoctorProfileForm'
import { TextField } from './ui/TextField'
import { Skeleton } from './ui/Skeleton'
import { apiErrorMessage } from '../utils/doctorDirectory'
import {
  authService,
  type DoctorProfileFields,
  type SuperAdminDoctorDetail,
} from '../services/api'

interface Props {
  doctorId: string
  onClose: () => void
  onSaved: () => void
}

function toProfileFields(doctor: SuperAdminDoctorDetail): DoctorProfileFields {
  return {
    department: doctor.department === 'general' ? '' : doctor.department,
    specialization: doctor.specialization ?? '',
    qualification: doctor.qualification ?? '',
    experienceYears: typeof doctor.experienceYears === 'number' ? doctor.experienceYears : '',
    previousHospital: doctor.previousHospital ?? '',
    bio: doctor.bio ?? '',
  }
}

export const SuperAdminDoctorEditor: FC<Props> = ({ doctorId, onClose, onSaved }) => {
  const [doctor, setDoctor] = useState<SuperAdminDoctorDetail | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [isFeatured, setIsFeatured] = useState(false)
  const [displayOrder, setDisplayOrder] = useState<number | ''>('')
  const [profile, setProfile] = useState<DoctorProfileFields>({})
  const [pendingPhoto, setPendingPhoto] = useState<{ blob: Blob; previewUrl: string } | null>(null)
  const [removePhoto, setRemovePhoto] = useState(false)
  const [saving, setSaving] = useState(false)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    let cancelled = false
    authService
      .getSuperAdminDoctor(doctorId)
      .then((d) => {
        if (cancelled) return
        setDoctor(d)
        setName(d.name)
        setEmail(d.email)
        setPhone(d.phone)
        setIsFeatured(Boolean(d.isFeatured))
        setDisplayOrder(typeof d.displayOrder === 'number' ? d.displayOrder : '')
        setProfile(toProfileFields(d))
      })
      .catch((err) => {
        toast.error(apiErrorMessage(err, 'Could not load doctor details.'))
        onCloseRef.current()
      })
    return () => {
      cancelled = true
    }
  }, [doctorId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, saving])

  useEffect(
    () => () => {
      if (pendingPhoto) URL.revokeObjectURL(pendingPhoto.previewUrl)
    },
    [pendingPhoto]
  )

  const handleSave = async () => {
    if (!doctor) return
    if (!name.trim() || !email.trim() || !phone.trim()) {
      toast.warning('Name, email and phone are required.')
      return
    }
    try {
      setSaving(true)
      await authService.updateSuperAdminDoctorProfile(doctor.id, {
        ...profile,
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        isFeatured,
        displayOrder,
      })
      if (pendingPhoto) {
        await authService.uploadSuperAdminDoctorPhoto(doctor.id, pendingPhoto.blob)
      } else if (removePhoto && doctor.photoUrl) {
        await authService.deleteSuperAdminDoctorPhoto(doctor.id)
      }
      toast.success(`${name.trim()} updated. Changes are live on the website and bot.`)
      onSaved()
      onClose()
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to save doctor details.'))
    } finally {
      setSaving(false)
    }
  }

  const photoUrl = pendingPhoto?.previewUrl ?? (removePhoto ? undefined : doctor?.photoUrl)

  return (
    <div className="super-admin-modal-backdrop" role="presentation" onClick={() => !saving && onClose()}>
      <div
        className="super-admin-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Edit doctor"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="super-admin-modal-header">
          <p className="dashboard-kicker">Edit doctor</p>
          <button type="button" className="super-admin-modal-close" onClick={onClose} disabled={saving} aria-label="Close">
            ×
          </button>
        </div>

        {!doctor ? (
          <Skeleton lines={6} />
        ) : (
          <div className="super-admin-modal-body">
            <div className="super-admin-modal-grid">
              <TextField id="sa-doc-name" label="Full name" value={name} onChange={(e) => setName(e.target.value)} disabled={saving} />
              <TextField id="sa-doc-email" label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={saving} />
              <TextField id="sa-doc-phone" label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={saving} />
              <TextField
                id="sa-doc-order"
                label="Landing page order (1 = first)"
                type="number"
                min={0}
                value={displayOrder}
                onChange={(e) => setDisplayOrder(e.target.value === '' ? '' : Number(e.target.value))}
                disabled={saving}
              />
            </div>
            <label className="super-admin-modal-check">
              <input
                type="checkbox"
                checked={isFeatured}
                onChange={(e) => setIsFeatured(e.target.checked)}
                disabled={saving}
              />
              Show as senior / featured doctor on the landing page
            </label>

            <DoctorProfileForm
              idPrefix="sa-doc"
              value={profile}
              onChange={setProfile}
              displayName={name}
              photoUrl={photoUrl}
              disabled={saving}
              onPhotoPicked={(blob, previewUrl) => {
                setPendingPhoto({ blob, previewUrl })
                setRemovePhoto(false)
              }}
              onPhotoRemove={() => {
                setPendingPhoto(null)
                setRemovePhoto(true)
              }}
            />
          </div>
        )}

        <div className="super-admin-modal-footer">
          <button type="button" className="public-cta" disabled={!doctor || saving} onClick={() => void handleSave()}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          <button type="button" className="public-cta-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
