import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { io } from 'socket.io-client'
import { API_BASE_URL, authService, notificationService } from '../services/api'
import { authStorage } from '../utils/authStorage'

export const DoctorNotificationListener = () => {
  const navigate = useNavigate()
  const [notification, setNotification] = useState<{
    notificationId: string
    patientId: string
    patientName: string
  } | null>(null)

  // Only run socket and show notification for DOCTOR role – never for assistant
  const role = authStorage.getRole()
  const isDoctor = role === 'DOCTOR'

  useEffect(() => {
    if (!isDoctor) return

    let socket: ReturnType<typeof io> | null = null
    let mounted = true

    const connect = async () => {
      try {
        const { doctor } = await authService.getProfile()
        const doctorId = doctor?.id
        if (!doctorId || !mounted) return

        const socketUrl = API_BASE_URL || window.location.origin
        socket = io(socketUrl, {
          query: { doctorId },
          transports: ['websocket', 'polling']
        })

        socket.on('patientReferred', (data: { notificationId?: string; patientId: string; patientName: string }) => {
          if (mounted) {
            setNotification({
              notificationId: data.notificationId || '',
              patientId: data.patientId,
              patientName: data.patientName || 'Patient'
            })
          }
        })

        socket.on('doctorAvailabilityChanged', (data: { availabilityStatus?: string; unavailableReason?: string; unavailableUntil?: string }) => {
          if (mounted && data.availabilityStatus) {
            window.dispatchEvent(new CustomEvent('doctor-availability-changed', {
              detail: {
                availabilityStatus: data.availabilityStatus,
                unavailableReason: data.unavailableReason,
                unavailableUntil: data.unavailableUntil
              }
            }))
          }
        })
      } catch {
        // ignore
      }
    }

    void connect()

    return () => {
      mounted = false
      if (socket) {
        socket.disconnect()
      }
    }
  }, [isDoctor])

  const handleOpenPatient = async () => {
    if (!notification) return
    const { notificationId, patientId } = notification
    setNotification(null)
    if (notificationId) {
      try {
        await notificationService.updateNotificationStatus(notificationId, 'read')
      } catch {
        // ignore
      }
    }
    navigate(`/patient/${patientId}`, { replace: true })
  }

  const handleDismiss = async () => {
    if (!notification) return
    const { notificationId } = notification
    setNotification(null)
    if (notificationId) {
      try {
        await notificationService.updateNotificationStatus(notificationId, 'dismissed')
        window.dispatchEvent(new CustomEvent('doctor-notification-dismissed'))
      } catch {
        // ignore
      }
    }
  }

  // Do not show notification at all for assistant (or if no notification)
  if (!notification || !isDoctor) return null

  return (
    <div
      role="alert"
      style={{
        position: 'fixed',
        top: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        maxWidth: 420,
        width: 'calc(100% - 32px)',
        padding: '14px 18px',
        background: 'linear-gradient(135deg, #0d47a1 0%, #1565c0 100%)',
        color: '#fff',
        borderRadius: 12,
        boxShadow: '0 8px 24px rgba(13, 71, 161, 0.4)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap'
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>
          Next patient
        </p>
        <p style={{ margin: '4px 0 0', fontSize: 15 }}>
          <strong>{notification.patientName}</strong> is here. Open details?
        </p>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={handleOpenPatient}
          style={{
            padding: '8px 16px',
            background: '#fff',
            color: '#0d47a1',
            border: 'none',
            borderRadius: 8,
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: 13
          }}
        >
          Open details
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          style={{
            padding: '8px 12px',
            background: 'rgba(255,255,255,0.2)',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: 13
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
