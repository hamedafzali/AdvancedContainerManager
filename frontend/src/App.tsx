import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useSocket } from '@/hooks/useSocket'
import Layout from '@/components/Layout'
import Dashboard from '@/pages/Dashboard'
import Containers from '@/pages/Containers'
import Projects from '@/pages/Projects'
import Images from '@/pages/Images'
import Networks from '@/pages/Networks'
import Volumes from '@/pages/Volumes'
import Terminal from '@/pages/Terminal'
import Settings from '@/pages/Settings'
import { NotificationProvider } from '@/components/NotificationProvider'

function App() {
  useSocket()

  return (
    <NotificationProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/containers" element={<Containers />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/images" element={<Images />} />
          <Route path="/networks" element={<Networks />} />
          <Route path="/volumes" element={<Volumes />} />
          <Route path="/terminal/:containerId?" element={<Terminal />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </Layout>
    </NotificationProvider>
  )
}

export default App
