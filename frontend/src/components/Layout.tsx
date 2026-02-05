import React, { useState } from 'react'
import { Outlet, Link, useLocation } from 'react-router-dom'
import { 
  LayoutDashboard, 
  Package2, 
  Folder, 
  Image, 
  Network, 
  HardDrive, 
  Terminal, 
  Settings,
  Layers,
  Search,
  Plus
} from 'lucide-react'

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Containers', href: '/containers', icon: Package2 },
  { name: 'Projects', href: '/projects', icon: Folder },
  { name: 'Images', href: '/images', icon: Image },
  { name: 'Networks', href: '/networks', icon: Network },
  { name: 'Volumes', href: '/volumes', icon: HardDrive },
  { name: 'Terminal', href: '/terminal', icon: Terminal },
  { name: 'Settings', href: '/settings', icon: Settings },
]

export default function Layout() {
  const [searchQuery, setSearchQuery] = useState('')
  const location = useLocation()

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <nav className="w-64 bg-white shadow-lg flex flex-col">
        <div className="flex items-center p-6 border-b border-gray-200">
          <div className="flex items-center">
            <div className="w-10 h-10 bg-gradient-to-r from-primary-500 to-primary-600 rounded-lg flex items-center justify-center">
              <Layers className="w-6 h-6 text-white" />
            </div>
            <div className="ml-3">
              <h1 className="text-lg font-bold text-gray-900">Container Manager</h1>
              <p className="text-xs text-gray-500">Advanced Edition</p>
            </div>
          </div>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href
            return (
              <Link
                key={item.name}
                to={item.href}
                className={`sidebar-item flex items-center px-4 py-3 rounded-lg ${
                  isActive ? 'active' : ''
                }`}
              >
                <item.icon className="w-5 h-5 mr-3" />
                {item.name}
              </Link>
            )
          })}
        </nav>
        
        {/* System Status */}
        <div className="p-4 border-t border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-600">System Status</span>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-500 rounded-full pulse-dot"></div>
              <span className="text-xs text-green-600">Online</span>
            </div>
          </div>
          <div className="flex items-center justify-between text-xs text-gray-500">
            <div>Docker: <span className="text-green-600">Connected</span></div>
            <div>Uptime: <span id="system-uptime">0m 0s</span></div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-white shadow-sm border-b border-gray-200">
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex items-center space-x-4">
              <h2 className="text-2xl font-bold text-gray-900">
                {navigation.find(item => item.href === location.pathname)?.name || 'Dashboard'}
              </h2>
              <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                Live
              </span>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search containers..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-64 px-4 py-2 pl-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
              </div>
              
              <button className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg shadow-md transition duration-300 flex items-center">
                <Plus className="w-4 h-4 mr-2" />
                Add Project
              </button>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto">
          <div className="p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
