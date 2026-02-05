import React from 'react'

export default function PerformanceChart() {
  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">System Performance</h3>
        <select className="text-sm border border-gray-300 rounded-md px-3 py-1">
          <option value="1">Last Hour</option>
          <option value="6">Last 6 Hours</option>
          <option value="24">Last 24 Hours</option>
        </select>
      </div>
      <div className="h-64 flex items-center justify-center text-gray-500">
        Performance Chart (Coming Soon)
      </div>
    </div>
  )
}
