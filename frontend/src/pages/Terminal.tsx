import React from 'react'
import { useParams } from 'react-router-dom'

export default function Terminal() {
  const { containerId } = useParams()

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Terminal {containerId && `- ${containerId}`}
        </h2>
        <div className="terminal-container">
          <div className="text-green-400">
            $ Terminal Access (Coming Soon)
          </div>
          <div className="text-gray-400 mt-2">
            Container ID: {containerId || 'No container selected'}
          </div>
        </div>
      </div>
    </div>
  )
}
