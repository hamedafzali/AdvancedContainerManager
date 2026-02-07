# Advanced Container Manager API Documentation

## Overview

The Advanced Container Manager provides a comprehensive REST API for managing Docker containers, images, networks, volumes, projects, and system metrics. This API is designed to be used by frontend applications, monitoring tools, and automation scripts.

## Base URL

```
http://localhost:5003/api
```

## Authentication

Currently, the API does not require authentication. In production deployments, you should implement proper authentication middleware.

## Response Format

All API responses follow a consistent format:

```json
{
  "success": true,
  "data": { ... },
  "message": "Optional message"
}
```

Error responses:
```json
{
  "success": false,
  "message": "Error description"
}
```

## Rate Limiting

The API implements rate limiting to prevent abuse:
- **General API**: 100 requests per 15 minutes per IP
- **Terminal API**: 30 requests per minute per IP
- **Strict endpoints**: 10 requests per 15 minutes per IP

---

# System Endpoints

## Health Check

### GET /health
Basic health check endpoint.

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "checks": [
      {
        "name": "docker",
        "status": "healthy",
        "message": "Docker daemon is running",
        "timestamp": "2026-02-05T18:00:00.000Z",
        "responseTime": 45
      }
    ],
    "uptime": 3600000,
    "version": "1.0.0",
    "timestamp": "2026-02-05T18:00:00.000Z"
  }
}
```

### GET /health/detailed
Detailed system health information.

### GET /health/check/:checkName
Check specific component health.

## System Metrics

### GET /api/system/metrics
Get current system metrics.

**Response:**
```json
{
  "success": true,
  "data": {
    "cpuPercent": 25.5,
    "memoryPercent": 45.2,
    "diskUsage": 60.1,
    "networkIO": {
      "bytesRecv": 1024000,
      "bytesSent": 512000,
      "dropin": 0,
      "dropout": 0,
      "errin": 0,
      "errout": 0,
      "packetsRecv": 1024,
      "packetsSent": 512
    },
    "loadAverage": [0.5, 0.7, 0.6],
    "timestamp": "2026-02-05T18:00:00.000Z",
    "uptime": 3600000
  }
}
```

### GET /api/system/metrics/history
Get historical system metrics.

**Query Parameters:**
- `limit` (number, optional): Number of records to return (default: 100)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "cpuPercent": 25.5,
      "memoryPercent": 45.2,
      "diskUsage": 60.1,
      "networkIO": { ... },
      "loadAverage": [0.5, 0.7, 0.6],
      "timestamp": "2026-02-05T18:00:00.000Z",
      "uptime": 3600000
    }
  ]
}
```

---

# Container Endpoints

## List Containers

### GET /api/containers
List all containers with their current state.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "abc123",
      "name": "my-container",
      "status": "running",
      "image": "nginx:latest",
      "created": "2026-02-05T17:00:00.000Z",
      "startedAt": "2026-02-05T17:30:00.000Z",
      "finishedAt": "",
      "exitCode": 0,
      "ports": {
        "80/tcp": [
          {
            "HostIp": "0.0.0.0",
            "HostPort": "8080"
          }
        ]
      },
      "mountPoints": [],
      "networks": {
        "bridge": {
          "IPAMConfig": {
            "IPv4Address": "172.17.0.2"
          }
        }
      },
      "labels": {},
      "env": [],
      "cmd": ["nginx", "-g", "daemon off;"],
      "entrypoint": [],
      "workingDir": "",
      "restartPolicy": {
        "Name": "unless-stopped",
        "MaximumRetryCount": 0
      },
      "resources": {
        "memoryLimit": 0,
        "cpuShares": 0,
        "cpuQuota": 0,
        "cpuPeriod": 0
      },
      "health": {},
      "logPath": "/var/lib/docker/containers/abc123/abc123-json.log",
      "driver": "overlay2",
      "execIds": []
    }
  ]
}
```

## Container Actions

### POST /api/containers/:id/start
Start a stopped container.

**Parameters:**
- `id` (string): Container ID

**Response:**
```json
{
  "success": true,
  "message": "Container started successfully"
}
```

### POST /api/containers/:id/stop
Stop a running container.

**Response:**
```json
{
  "success": true,
  "message": "Container stopped successfully"
}
```

### POST /api/containers/:id/restart
Restart a container.

**Response:**
```json
{
  "success": true,
  "message": "Container restarted successfully"
}
```

### DELETE /api/containers/:id
Remove a container.

**Response:**
```json
{
  "success": true,
  "message": "Container removed successfully"
}
```

## Container Information

### GET /api/containers/:id/inspect
Get detailed container information.

**Response:**
```json
{
  "success": true,
  "data": {
    // Full Docker container inspection data
  }
}
```

### GET /api/containers/:id/stats
Get container resource usage statistics.

**Response:**
```json
{
  "success": true,
  "data": {
    "cpuPercent": 15.5,
    "memoryUsage": 52428800,
    "memoryLimit": 1073741824,
    "networkIO": {
      "rxBytes": 1024000,
      "txBytes": 512000
    },
    "blockIO": {
      "readBytes": 0,
      "writeBytes": 1024
    }
  }
}
```

### GET /api/containers/:id/logs
Get container logs.

**Query Parameters:**
- `tail` (number, optional): Number of lines from the end (default: 100)
- `since` (string, optional): Timestamp to start from
- `until` (string, optional): Timestamp to end at

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "timestamp": "2026-02-05T18:00:00.000Z",
      "stream": "stdout",
      "message": "Container started"
    }
  ]
}
```

### GET /api/containers/:id/processes
Get processes running inside a container.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "pid": 1,
      "ppid": 0,
      "name": "nginx",
      "cmd": ["nginx", "-g", "daemon off;"],
      "status": "R",
      "cpu": 0.1,
      "mem": 2048,
      "vsz": 2048,
      "rss": 1024,
      "etime": "00:00:30"
    }
  ]
}
```

---

# Image Endpoints

## List Images

### GET /api/images
List all Docker images.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "sha256:abc123",
      "name": "nginx",
      "tag": "latest",
      "size": 142000000,
      "created": "2026-02-05T16:00:00.000Z",
      "labels": {},
      "repoTags": ["nginx:latest"],
      "virtualSize": 142000000
    }
  ]
}
```

## Image Actions

### POST /api/images/pull
Pull an image from a registry.

**Request Body:**
```json
{
  "image": "nginx:latest"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Image pulled successfully"
}
```

### DELETE /api/images/:id
Remove an image.

**Response:**
```json
{
  "success": true,
  "message": "Image removed successfully"
}
```

---

# Network Endpoints

## List Networks

### GET /api/networks
List all Docker networks.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "abc123",
      "name": "bridge",
      "driver": "bridge",
      "scope": "local",
      "internal": false,
      "enableIPv6": false,
      "ipam": {
        "Driver": "default",
        "Config": [
          {
            "Subnet": "172.17.0.0/16",
            "Gateway": "172.17.0.1"
          }
        ]
      },
      "containers": {},
      "options": {},
      "labels": {}
    }
  ]
}
```

## Network Actions

### POST /api/networks
Create a new network.

**Request Body:**
```json
{
  "name": "my-network",
  "driver": "bridge",
  "internal": false,
  "enableIPv6": false
}
```

**Response:**
```json
{
  "success": true,
  "message": "Network created successfully"
}
```

### DELETE /api/networks/:id
Remove a network.

**Response:**
```json
{
  "success": true,
  "message": "Network removed successfully"
}
```

---

# Volume Endpoints

## List Volumes

### GET /api/volumes
List all Docker volumes.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "name": "my-volume",
      "driver": "local",
      "mountpoint": "/var/lib/docker/volumes/my-volume/_data",
      "created": "2026-02-05T16:00:00.000Z",
      "labels": {},
      "options": {},
      "usage": {
        "size": 1048576,
        "refCount": 2
      }
    }
  ]
}
```

## Volume Actions

### POST /api/volumes
Create a new volume.

**Request Body:**
```json
{
  "name": "my-volume",
  "driver": "local",
  "labels": {},
  "options": {}
}
```

**Response:**
```json
{
  "success": true,
  "message": "Volume created successfully"
}
```

### DELETE /api/volumes/:name
Remove a volume.

**Response:**
```json
{
  "success": true,
  "message": "Volume removed successfully"
}
```

---

# Project Endpoints

## List Projects

### GET /api/projects
List all projects.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "name": "my-project",
      "repoUrl": "https://github.com/user/repo",
      "branch": "main",
      "path": "/tmp/advanced_manager_projects/my-project",
      "dockerfile": "Dockerfile",
      "composeFile": "docker-compose.yml",
      "environmentVars": {},
      "containers": [],
      "status": "configured",
      "createdAt": "2026-02-05T16:00:00.000Z",
      "lastUpdated": "2026-02-05T16:00:00.000Z",
      "buildHistory": [],
      "deployHistory": [],
      "healthChecks": [],
      "autoRestart": false,
      "resourceLimits": {
        "memory": "512m",
        "cpu": "0.5"
      }
    }
  ]
}
```

## Project Actions

### POST /api/projects
Create a new project.

**Request Body:**
```json
{
  "name": "my-project",
  "repoUrl": "https://github.com/user/repo",
  "branch": "main"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Project created successfully"
}
```

### POST /api/projects/:name/build
Build a project.

**Response:**
```json
{
  "success": true,
  "message": "Project build started"
}
```

### POST /api/projects/:name/deploy
Deploy a project.

**Response:**
```json
{
  "success": true,
  "message": "Project deployed successfully"
}
```

### POST /api/projects/:name/stop
Stop a project.

**Response:**
```json
{
  "success": true,
  "message": "Project stopped successfully"
}
```

### DELETE /api/projects/:name
Delete a project.

**Response:**
```json
{
  "success": true,
  "message": "Project deleted successfully"
}
```

### GET /api/projects/:name/logs
Get recent logs for all containers in a project (via Docker Compose).

**Query Parameters:**
- `tail` (number, optional): Number of lines per container (default: 200)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "containerId": "abc123",
      "logs": "..."
    }
  ]
}
```

---

# Terminal Endpoints

> Note: Terminal execution is non-interactive. Commands are executed via `docker exec` and return output/error.

## Create Terminal Session

### POST /api/terminal/:containerId/session
Create a terminal session for a container.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "session-abc123",
    "containerId": "container-xyz"
  }
}
```

## Session Management

### GET /api/terminal/sessions
List all active terminal sessions.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "session-abc123",
      "containerId": "container-xyz",
      "containerName": "my-container",
      "createdAt": "2026-02-05T18:00:00.000Z",
      "isActive": true
    }
  ]
}
```

### POST /api/terminal/sessions/:sessionId/execute
Execute a command in a terminal session.

**Request Body:**
```json
{
  "command": "ls -la"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "output": "total 8\ndrwxr-xr-x 2 root root 4096 Feb 5 18:00 .",
    "error": null
  }
}
```

### DELETE /api/terminal/sessions/:sessionId
Close a terminal session.

**Response:**
```json
{
  "success": true,
  "message": "Session closed successfully"
}
```

---

# Settings Endpoints

## Get Settings

### GET /api/settings
Get current application settings.

**Response:**
```json
{
  "success": true,
  "data": {
    "theme": "light",
    "language": "en",
    "notifications": {
      "enabled": true,
      "email": "user@example.com"
    },
    "docker": {
      "defaultRegistry": "docker.io",
      "autoPull": true
    },
    "ui": {
      "refreshInterval": 5000,
      "itemsPerPage": 20
    }
  }
}
```

## Update Settings

### PUT /api/settings
Update application settings.

**Request Body:**
```json
{
  "theme": "dark",
  "notifications": {
    "enabled": true
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Settings updated successfully"
}
```

---

# Backup Endpoints

## Create Backup

### POST /api/backup/create
Create a system backup.

**Request Body:**
```json
{
  "includeContainers": true,
  "includeImages": true,
  "includeNetworks": true,
  "includeVolumes": true,
  "includeProjects": true,
  "includeSettings": true,
  "includeLogs": true,
  "compressionEnabled": true
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "backupId": "backup-2026-02-05-18-00-00"
  }
}
```

## List Backups

### GET /api/backup/list
List all available backups.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "backup-2026-02-05-18-00-00",
      "timestamp": "2026-02-05T18:00:00.000Z",
      "size": 1048576,
      "metadata": {
        "version": "1.0.0",
        "config": { ... },
        "stats": { ... }
      }
    }
  ]
}
```

## Restore Backup

### POST /api/backup/:backupId/restore
Restore from a backup.

**Response:**
```json
{
  "success": true,
  "message": "Backup restored successfully"
}
```

## Delete Backup

### DELETE /api/backup/:backupId
Delete a backup.

**Response:**
```json
{
  "success": true,
  "message": "Backup deleted successfully"
}
```

## Backup Statistics

### GET /api/backup/stats
Get backup statistics.

**Response:**
```json
{
  "success": true,
  "data": {
    "totalBackups": 5,
    "totalSize": 5242880,
    "oldestBackup": "2026-02-01T18:00:00.000Z",
    "newestBackup": "2026-02-05T18:00:00.000Z",
    "averageSize": 1048576
  }
}
```

---

# Audit Endpoints

## Get Audit Logs

### GET /api/audit/logs
Get audit logs with filtering options.

**Query Parameters:**
- `startDate` (string, optional): Start date filter
- `endDate` (string, optional): End date filter
- `userId` (string, optional): User ID filter
- `action` (string, optional): Action filter
- `resource` (string, optional): Resource filter
- `limit` (number, optional): Number of records to return
- `offset` (number, optional): Number of records to skip

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "audit-abc123",
      "timestamp": "2026-02-05T18:00:00.000Z",
      "userId": "user-123",
      "user": "admin",
      "action": "container_start",
      "resource": "container",
      "resourceId": "container-xyz",
      "details": {},
      "ip": "127.0.0.1",
      "userAgent": "Mozilla/5.0...",
      "success": true,
      "error": null,
      "level": "info"
    }
  ]
}
```

## Audit Statistics

### GET /api/audit/stats
Get audit statistics.

**Response:**
```json
{
  "success": true,
  "data": {
    "totalLogs": 1000,
    "logsByLevel": {
      "info": 800,
      "warn": 150,
      "error": 50
    },
    "logsByAction": {
      "container_start": 200,
      "container_stop": 180,
      "image_pull": 150
    },
    "logsByResource": {
      "container": 400,
      "image": 300,
      "network": 200
    },
    "recentErrors": 5,
    "recentSecurityEvents": 2
  }
}
```

---

# WebSocket Events

## Connection

Connect to WebSocket server at `ws://localhost:5003`.

## Client to Server Events

### get_system_metrics
Request current system metrics.

```javascript
socket.emit('get_system_metrics');
```

### get_container_metrics
Request container metrics.

```javascript
socket.emit('get_container_metrics');
```

### get_system_metrics_history
Request metrics history.

```javascript
socket.emit('get_system_metrics_history', { limit: 100 });
```

### subscribe_container
Subscribe to container updates.

```javascript
socket.emit('subscribe_container', { containerId: 'container-xyz' });
```

### unsubscribe_container
Unsubscribe from container updates.

```javascript
socket.emit('unsubscribe_container', { containerId: 'container-xyz' });
```

## Server to Client Events

### system_metrics_update
System metrics update.

```javascript
socket.on('system_metrics_update', (data) => {
  console.log('System metrics:', data);
});
```

### container_event
Container event update.

```javascript
socket.on('container_event', (data) => {
  console.log('Container event:', data);
});
```

### notification
System notification.

```javascript
socket.on('notification', (data) => {
  console.log('Notification:', data);
});
```

### docker_event
Docker event.

```javascript
socket.on('docker_event', (data) => {
  console.log('Docker event:', data);
});
```

### terminal_output
Terminal output.

```javascript
socket.on('terminal_output', (data) => {
  console.log('Terminal output:', data);
});
```

---

# Error Codes

| Status Code | Description |
|-------------|-------------|
| 200 | Success |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 429 | Too Many Requests |
| 500 | Internal Server Error |
| 503 | Service Unavailable |

---

# Rate Limiting

The API implements rate limiting to prevent abuse:

| Endpoint | Limit | Window |
|----------|-------|--------|
| General API | 100 requests | 15 minutes |
| Terminal API | 30 requests | 1 minute |
| Strict endpoints | 10 requests | 15 minutes |

Rate limit headers are included in responses:
- `X-RateLimit-Limit`: Request limit
- `X-RateLimit-Remaining`: Remaining requests
- `X-RateLimit-Reset`: Reset time

---

# Examples

## Start a Container

```bash
curl -X POST http://localhost:5003/api/containers/container-123/start
```

## Get Container Logs

```bash
curl "http://localhost:5003/api/containers/container-123/logs?tail=50"
```

## Create a Project

```bash
curl -X POST http://localhost:5003/api/projects \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-project",
    "repoUrl": "https://github.com/user/repo",
    "branch": "main"
  }'
```

## Create a Backup

```bash
curl -X POST http://localhost:5003/api/backup/create \
  -H "Content-Type: application/json" \
  -d '{
    "includeContainers": true,
    "includeImages": true,
    "compressionEnabled": true
  }'
```

---

# SDK Examples

## JavaScript/Node.js

```javascript
const axios = require('axios');

// Get containers
const containers = await axios.get('http://localhost:5003/api/containers');
console.log(containers.data);

// Start a container
await axios.post(`http://localhost:5003/api/containers/${containerId}/start`);
```

## Python

```python
import requests

# Get containers
response = requests.get('http://localhost:5003/api/containers')
containers = response.json()

# Start a container
requests.post(f'http://localhost:5003/api/containers/{container_id}/start')
```

## Go

```go
package main

import (
    "encoding/json"
    "net/http"
)

type Container struct {
    ID     string `json:"id"`
    Name   string `json:"name"`
    Status string `json:"status"`
}

func main() {
    resp, err := http.Get("http://localhost:5003/api/containers")
    if err != nil {
        panic(err)
    }
    defer resp.Body.Close()
    
    var containers []Container
    json.NewDecoder(resp.Body).Decode(&containers)
    
    fmt.Printf("Found %d containers\n", len(containers))
}
```

---

# Support

For API support and questions:
- Check the application logs for detailed error information
- Use the health check endpoint to verify service status
- Review the audit logs for troubleshooting
- Contact support at support@advancedcontainermanager.com
