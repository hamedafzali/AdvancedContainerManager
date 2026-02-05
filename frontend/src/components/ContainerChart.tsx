import React from 'react'

export default function ContainerChart() {
  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Container Distribution</h3>
        <button className="text-sm text-primary-600 hover:text-primary-800">
          View Details
        </button>
      </div>
      <div className="h-64 flex items-center justify-center text-gray-500">
        Container Chart (Coming Soon)
      </div>
    </div>
  )
}
