import { useEffect } from 'react'
import { io, Socket } from 'socket.io-client'
import { useNotifications } from '@/hooks/useNotifications'

export function useSocket() {
  const { addNotification } = useNotifications()

  useEffect(() => {
    const socket: Socket = io()

    socket.on('connect', () => {
      console.log('Connected to Advanced Container Manager')
    })

    socket.on('system_status_update', (data) => {
      console.log('System status update:', data)
    })

    socket.on('container_metrics_update', (data) => {
      console.log('Container metrics update:', data)
    })

    socket.on('notification', (notification) => {
      addNotification(notification)
    })

    socket.on('disconnect', () => {
      console.log('Disconnected from Advanced Container Manager')
    })

    return () => {
      socket.disconnect()
    }
  }, [addNotification])

  return null
}
