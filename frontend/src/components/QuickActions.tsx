import React from 'react'
import { Plus, Rocket, Download, Settings } from 'lucide-react'

export default function QuickActions() {
  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
      
      <div className="space-y-3">
        <button className="w-full flex items-center justify-center px-4 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition duration-300 flex items-center">
          <Plus className="w-4 h-4 mr-2" />
          Add Project
        </button>
        
        <button className="w-full flex items-center justify-center px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg transition duration-300 flex items-center">
          <Rocket className="w-4 h-4 mr-2" />
          Quick Deploy
        </button>
        
        <button className="w-full flex items-center justify-center px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition duration-300 flex items-center">
          <Download className="w-4 h-4 mr-2" />
          Create Backup
        </button>
        
        <button className="w-full flex items-center justify-center px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition duration-300 flex items-center">
          <Settings className="w-4 h-4 mr-2" />
          System Settings
        </button>
      </div>
      
      {/* Storage Info */}
      <div className="mt-6 p-4 bg-gray-50 rounded-lg">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">Storage Usage</span>
          <span className="text-sm text-gray-500">45%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div className="bg-gradient-to-r from-primary-500 to-primary-600 h-2 rounded-full" style={{width: '45%'}}></div>
        </div>
        <p className="text-xs text-gray-500 mt-2">23GB used of 50GB</p>
      </div>
    </div>
  )
}
