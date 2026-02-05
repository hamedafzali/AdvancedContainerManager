import React, { useState, useEffect } from 'react'
import { Cpu, MemoryStick, Package2, Folder, TrendingUp, TrendingDown } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/services/api'
import MetricCard from '@/components/MetricCard'
import PerformanceChart from '@/components/PerformanceChart'
import ContainerChart from '@/components/ContainerChart'
import ActivityFeed from '@/components/ActivityFeed'
import QuickActions from '@/components/QuickActions'

interface SystemMetrics {
  cpuPercent: number
  memoryPercent: number
  diskUsage: number
  networkIO: {
    bytesRecv: number
    bytesSent: number
  }
}

interface ContainerStats {
  running: number
  total: number
}

interface ProjectStats {
  total: number
  healthy: number
}

export default function Dashboard() {
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics | null>(null)
  const [containerStats, setContainerStats] = useState<ContainerStats>({ running: 0, total: 0 })
  const [projectStats, setProjectStats] = useState<ProjectStats>({ total: 0, healthy: 0 })

  const { data: systemStatus } = useQuery({
    queryKey: ['system-status'],
    queryFn: () => api.get('/system/status'),
    refetchInterval: 5000,
  })

  const { data: metrics } = useQuery({
    queryKey: ['system-metrics'],
    queryFn: () => api.get('/system/metrics'),
    refetchInterval: 5000,
  })

  useEffect(() => {
    if (metrics?.data) {
      setSystemMetrics(metrics.data)
    }
  }, [metrics])

  useEffect(() => {
    if (systemStatus?.data) {
      setContainerStats({
        running: systemStatus.data.metricsSummary.runningContainers || 0,
        total: systemStatus.data.metricsSummary.containersCount || 0,
      })
      setProjectStats({
        total: systemStatus.data.metricsSummary.projectsCount || 0,
        healthy: systemStatus.data.metricsSummary.projectsCount || 0,
      })
    }
  }, [systemStatus])

  return (
    <div className="space-y-6">
      {/* System Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="CPU Usage"
          value={systemMetrics?.cpuPercent.toFixed(1) || '0'}
          unit="%"
          icon={Cpu}
          trend={systemMetrics?.cpuPercent > 50 ? 'up' : 'down'}
          color="from-blue-500 to-blue-600"
        />
        
        <MetricCard
          title="Memory Usage"
          value={systemMetrics?.memoryPercent.toFixed(1) || '0'}
          unit="%"
          icon={MemoryStick}
          trend={systemMetrics?.memoryPercent > 70 ? 'up' : 'down'}
          color="from-purple-500 to-purple-600"
        />
        
        <MetricCard
          title="Running Containers"
          value={containerStats.running.toString()}
          unit={`/ ${containerStats.total}`}
          icon={Package2}
          trend="up"
          color="from-green-500 to-green-600"
        />
        
        <MetricCard
          title="Active Projects"
          value={projectStats.total.toString()}
          unit="projects"
          icon={Folder}
          trend="up"
          color="from-orange-500 to-orange-600"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PerformanceChart />
        <ContainerChart />
      </div>

      {/* Activity and Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <ActivityFeed />
        </div>
        <div>
          <QuickActions />
        </div>
      </div>
    </div>
  )
}
