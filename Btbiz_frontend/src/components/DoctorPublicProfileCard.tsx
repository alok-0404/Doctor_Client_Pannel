import { useEffect, useState } from 'react'
import { toast } from 'react-toastify'

import { Card } from './ui/Card'
import { DoctorProfileForm } from './DoctorProfileForm'
import { authService, type DoctorProfileFields, type PublicDoctor } from '../services/api'
import { apiErrorMessage } from '../utils/doctorDirectory'

function toFields(profile: PublicDoctor | undefined): DoctorProfileFields {
  return {
    department: profile?.department && profile.department !== 'general' ? profile.department : '',
    specialization: profile?.specialization ?? '',
    qualification: profile?.qualification ?? '',
    experienceYears: typeof profile?.experienceYears === 'number' ? profile.experienceYears : '',
    previousHospital: profile?.previousHospital ?? '',
    bio: profile?.bio ?? '',
  }
}

/** Doctor's own public profile (website + WhatsApp bot): department, speciality, degree, experience, photo. */
export const DoctorPublicProfileCard = ({ doctorName }: { doctorName: string }) => {
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState<PublicDoctor | undefined>(undefined)
  const [fields, setFields] = useState<DoctorProfileFields>({})
  const [saving, setSaving] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)

  useEffect(() => {
    if (!open || loaded) return
    let cancelled = false
    authService
      .getProfile()
      .then(({ doctor }) => {
        if (cancelled) return
        setLoaded(doctor.publicProfile)
        setFields(toFields(doctor.publicProfile))
      })
      .catch(() => toast.error('Could not load your profile.'))
    return () => {
      cancelled = true
    }
  }, [open, loaded])

  const save = async () => {
    try {
      setSaving(true)
      const updated = await authService.updateDoctorPublicProfile(fields)
      if (updated) {
        setLoaded(updated)
        setFields(toFields(updated))
      }
      toast.success('Profile saved. It now shows on the website and WhatsApp bot.')
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not save profile.'))
    } finally {
      setSaving(false)
    }
  }

  const uploadPhoto = async (blob: Blob, previewUrl: string) => {
    try {
      setPhotoBusy(true)
      const updated = await authService.uploadDoctorPhoto(blob)
      if (updated) setLoaded(updated)
      toast.success('Photo updated.')
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not upload photo.'))
    } finally {
      URL.revokeObjectURL(previewUrl)
      setPhotoBusy(false)
    }
  }

  const removePhoto = async () => {
    try {
      setPhotoBusy(true)
      const updated = await authService.deleteDoctorPhoto()
      if (updated) setLoaded(updated)
      toast.success('Photo removed.')
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not remove photo.'))
    } finally {
      setPhotoBusy(false)
    }
  }

  return (
    <Card className="dashboard-overview-card doctor-public-profile-card">
      <div className="doctor-public-profile-head">
        <div>
          <p className="dashboard-kicker">Public profile</p>
          <p className="dashboard-daily-caps-hint">
            Photo, department, speciality, degree and experience shown to patients on the website and WhatsApp bot.
          </p>
        </div>
        <button
          type="button"
          className="ui-button ui-button-secondary ui-button-sm"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          {open ? 'Close' : 'Edit profile'}
        </button>
      </div>

      {open && (
        <div className="doctor-public-profile-body">
          <DoctorProfileForm
            idPrefix="my-profile"
            value={fields}
            onChange={setFields}
            displayName={doctorName}
            photoUrl={loaded?.photoUrl}
            disabled={saving || photoBusy}
            onPhotoPicked={(blob, previewUrl) => void uploadPhoto(blob, previewUrl)}
            onPhotoRemove={() => void removePhoto()}
          />
          <button
            type="button"
            className="ui-button ui-button-primary"
            disabled={saving || photoBusy}
            onClick={() => void save()}
          >
            {saving ? 'Saving…' : 'Save profile'}
          </button>
        </div>
      )}
    </Card>
  )
}
