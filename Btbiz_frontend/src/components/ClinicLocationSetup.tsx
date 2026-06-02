import { useState } from 'react'
import { toast } from 'react-toastify'
import { authService } from '../services/api'
import { Button } from './ui/Button'

type Props = {
  label?: string
}

/** Lets pharmacy / lab save GPS so patients see km distance on their profile. */
export function ClinicLocationSetup({
  label = 'Save shop location (patients see distance in km)',
}: Props) {
  const [saving, setSaving] = useState(false)

  const handleSave = () => {
    if (!navigator.geolocation) {
      toast.error('Location is not supported in this browser.')
      return
    }
    setSaving(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await authService.updateDoctorClinic({
            clinicLatitude: pos.coords.latitude,
            clinicLongitude: pos.coords.longitude,
          })
          toast.success('Shop location saved. Patients will see distance in km.')
        } catch {
          toast.error('Could not save location. Try again.')
        } finally {
          setSaving(false)
        }
      },
      () => {
        setSaving(false)
        toast.error('Allow location access to save your shop on the map.')
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    )
  }

  return (
    <Button type="button" variant="secondary" disabled={saving} onClick={handleSave}>
      {saving ? 'Saving…' : label}
    </Button>
  )
}
