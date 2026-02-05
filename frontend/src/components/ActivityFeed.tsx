import React from 'react'

export default function ActivityFeed() {
  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Recent Activity</h3>
        <button className="text-sm text-gray-600 hover:text-gray-900">
          View All
        </button>
      </div>
      
      <div className="space-y-4">
        <div className="flex items-start space-x-3 p-3 hover:bg-gray-50 rounded-lg">
          <div className="w-2 h-2 bg-green-500 rounded-full mt-2"></div>
          <div className="flex-1">
            <p className="text-sm text-gray-900">
              <span className="font-medium">Doc2Pdf-Bot</span> container started
            </p>
            <p className="text-xs text-gray-500">2 minutes ago</p>
          </div>
          <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
            Success
          </span>
        </div>
        
        <div className="flex items-start space-x-3 p-3 hover:bg-gray-50 rounded-lg">
          <div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
          <div className="flex-1">
            <p className="text-sm text-gray-900">
              <span className="font-medium">Web-App</span> image built
            </p>
            <p className="text-xs text-gray-500">15 minutes ago</p>
          </div>
          <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
            Build
          </span>
        </div>
      </div>
    </div>
  )
}
