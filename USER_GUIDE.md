# Advanced Container Manager User Guide

## Table of Contents

1. [Getting Started](#getting-started)
2. [Dashboard Overview](#dashboard-overview)
3. [Container Management](#container-management)
4. [Image Management](#image-management)
5. [Network Management](#network-management)
6. [Volume Management](#volume-management)
7. [Project Management](#project-management)
8. [Terminal Access](#terminal-access)
9. [Settings Configuration](#settings-configuration)
10. [Monitoring and Metrics](#monitoring-and-metrics)
11. [Backup and Restore](#backup-and-restore)
12. [Troubleshooting](#troubleshooting)

---

## Getting Started

### Prerequisites

- Docker installed and running
- Node.js 18+ (for development)
- Modern web browser (Chrome, Firefox, Safari, Edge)

### Quick Start

1. **Clone the repository:**
   ```bash
   git clone https://github.com/hamedafzali/AdvancedContainerManager.git
   cd AdvancedContainerManager
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the application:**
   ```bash
   npm run dev
   ```

4. **Access the application:**
   Open your browser and navigate to `http://localhost:3000`

### Production Deployment

For production deployment, use the provided deployment script:

```bash
./deploy.sh
```

This will:
- Build the application
- Start all services (app, Redis, Nginx)
- Run health checks
- Set up proper data directories

---

## Dashboard Overview

The dashboard provides a comprehensive overview of your Docker environment:

### Key Components

1. **System Metrics Card**
   - CPU usage percentage
   - Memory usage percentage
   - Disk usage
   - Network activity
   - System uptime

2. **Container Statistics**
   - Running containers count
   - Total containers count
   - Stopped containers count
   - Paused containers count

3. **Project Statistics**
   - Total projects
   - Healthy projects
   - Building projects
   - Failed projects

4. **Performance Charts**
   - Real-time CPU usage graph
   - Memory usage over time
   - Network traffic visualization
   - Container distribution pie chart

5. **Recent Activity Feed**
   - Container start/stop events
   - Image build events
   - System notifications
   - Error alerts

### Navigation

Use the sidebar navigation to access different sections:
- **Dashboard** - System overview
- **Containers** - Container management
- **Images** - Image management
- **Networks** - Network management
- **Volumes** - Volume management
- **Projects** - Project management
- **Terminal** - Container terminal access
- **Settings** - Application configuration

---

## Container Management

### Container List

The Containers page displays all Docker containers with their current status:

**Columns:**
- **Status** - Running, stopped, paused, or restarting
- **Name** - Container name
- **Image** - Container image
- **Ports** - Published ports
- **Created** - Creation time
- **Actions** - Start, stop, restart, delete, logs, terminal

### Container Actions

#### Start/Stop Containers
1. Click the **Play** button to start a stopped container
2. Click the **Square** button to stop a running container
3. The status will update in real-time

#### Restart Containers
1. Click the **RefreshCw** button to restart a container
2. The container will stop and start automatically

#### Delete Containers
1. Click the **Trash** button to remove a container
2. Confirm the deletion in the dialog
3. The container will be permanently removed

#### View Logs
1. Click the **FileText** button to view container logs
2. Use the **Copy** button to copy logs to clipboard
3. Use the **Download** button to download logs as a file
4. Use the **Search** field to filter logs

#### Terminal Access
1. Click the **Terminal** button to open a terminal session
2. Select the container from the dropdown
3. Click **Connect** to establish the connection
4. Execute commands in the terminal

### Container Details

Click on any container row to see detailed information:
- **Configuration** - Environment variables, ports, volumes
- **Resource Usage** - CPU, memory, network statistics
- **Health Status** - Container health check results
- **Network Settings** - Connected networks and IP addresses

---

## Image Management

### Image List

The Images page shows all Docker images available on the system:

**Columns:**
- **Repository** - Image name and tag
- **Size** - Image size
- **Created** - Creation time
- **Actions** - Pull, remove, inspect

### Image Actions

#### Pull Images
1. Click the **Download** button
2. Enter the image name (e.g., `nginx:latest`)
3. Click **Pull** to download the image
4. Progress will be shown in the status bar

#### Remove Images
1. Click the **Trash** button
2. Confirm the deletion
3. The image will be removed from the system

#### Inspect Images
1. Click the **Info** button
2. View detailed image information including layers, labels, and configuration

### Image Search

Use the search bar to filter images by name:
- Type to search for specific images
- Results update in real-time
- Clear the search to show all images

---

## Network Management

### Network List

The Networks page displays all Docker networks:

**Columns:**
- **Name** - Network name
- **Driver** - Network driver (bridge, overlay, etc.)
- **Scope** - Network scope (local, swarm)
- **Containers** - Connected containers
- **Actions** - Create, inspect, remove

### Network Actions

#### Create Networks
1. Click the **Plus** button
2. Enter network details:
   - **Name** - Network name
   - **Driver** - Network driver
   - **Internal** - Whether network is internal
3. Click **Create** to create the network

#### Remove Networks
1. Click the **Trash** button
2. Confirm the deletion
3. The network will be removed

#### Inspect Networks
1. Click the **Info** button
2. View detailed network information including IPAM configuration and connected containers

---

## Volume Management

### Volume List

The Volumes page shows all Docker volumes:

**Columns:**
- **Name** - Volume name
- **Driver** - Volume driver
- **Mount Point** - Volume location
- **Size** - Volume size (if available)
- **Usage** - Number of containers using the volume
- **Actions** - Create, inspect, remove

### Volume Actions

#### Create Volumes
1. Click the **Plus** button
2. Enter volume details:
   - **Name** - Volume name
   - **Driver** - Volume driver
   - **Labels** - Optional labels
   - **Options** - Driver-specific options
3. Click **Create** to create the volume

#### Remove Volumes
1. Click the **Trash** button
2. Confirm the deletion
3. The volume will be removed

#### Inspect Volumes
1. Click the **Info** button
2. View detailed volume information including mount point and usage statistics

---

## Project Management

### Project List

The Projects page manages Git-based projects with Docker integration:

**Columns:**
- **Name** - Project name
- **Repository** - Git repository URL
- **Branch** - Git branch
- **Status** - Project status
- **Containers** - Number of containers
- **Last Build** - Last build time
- **Actions** - Build, deploy, stop, delete

### Project Actions

#### Add Projects
1. Click the **Plus** button
2. Enter project details:
   - **Project Name** - Display name
   - **Repository URL** - Git repository URL
   - **Branch** - Git branch (default: main)
3. Click **Add Project** to create the project

#### Build Projects
1. Click the **Code2** button to build the project
2. The project status will change to "building"
3. Build progress will be shown in the status

#### Deploy Projects
1. Click the **Rocket** button to deploy the project
2. Containers will be created and started
3. The project status will update to "running"

#### Stop Projects
1. Click the **Square** button to stop the project
2. All project containers will be stopped
3. The project status will change to "stopped"

#### Delete Projects
1. Click the **Trash** button
2. Confirm the deletion
3. The project and all associated data will be removed

### Project Details

Click on any project row to see:
- **Configuration** - Repository settings, build configuration
- **Build History** - Previous build attempts and results
- **Deploy History** - Deployment history and results
- **Health Checks** - Container health status
- **Resource Limits** - Memory and CPU limits

---

## Terminal Access

### Terminal Interface

The Terminal page provides direct access to container shells:

#### Features
- **Container Selection** - Choose from running containers
- **Real-time Output** - Live command output
- **Command History** - Navigate through previous commands
- **Copy/Download** - Save terminal output
- **Maximize/Minimize** - Full-screen terminal mode

#### Using the Terminal
1. Select a container from the dropdown
2. Click **Connect** to establish the session
3. Type commands and press Enter to execute
4. Use arrow keys to navigate command history
5. Click **Disconnect** when finished

#### Terminal Commands
- **Basic Commands** - ls, cd, pwd, cat, etc.
- **Process Management** - ps, kill, top, etc.
- **Network Tools** - ping, curl, wget, etc.
- **System Tools** - apt-get, yum, apk, etc.

---

## Settings Configuration

### Settings Categories

The Settings page allows configuration of various application aspects:

#### General Settings
- **Theme** - Light or dark mode
- **Language** - Interface language
- **Timezone** - Display timezone

#### Notification Settings
- **Enable Notifications** - Turn on/off notifications
- **Email Notifications** - Email address for alerts
- **Notification Types** - Choose which events trigger notifications

#### Docker Settings
- **Default Registry** - Default Docker registry
- **Auto Pull Images** - Automatically pull new image versions
- **Cleanup Policy** - Automatic cleanup settings

#### UI Settings
- **Refresh Interval** - Dashboard update frequency
- **Items Per Page** - Number of items per page
- **Default View** - Default list view type

#### Advanced Settings
- **API Rate Limiting** - Configure API rate limits
- **Log Level** - Application logging level
- **Backup Settings** - Backup frequency and retention

### Configuration Management

#### Import Settings
1. Click **Import Configuration**
2. Select a configuration file
3. Review the import summary
4. Click **Import** to apply settings

#### Export Settings
1. Click **Export Configuration**
2. Choose export format (JSON)
3. Download the configuration file
4. Save for backup or sharing

#### Reset Settings
1. Click **Reset to Defaults**
2. Confirm the reset action
3. All settings will be restored to defaults

---

## Monitoring and Metrics

### System Metrics

The application provides comprehensive system monitoring:

#### Real-time Metrics
- **CPU Usage** - Current CPU utilization
- **Memory Usage** - RAM utilization
- **Disk Usage** - Storage utilization
- **Network Traffic** - Inbound/outbound traffic
- **System Load** - Load average

#### Historical Data
- **Metrics History** - View metrics over time
- **Performance Trends** - Identify patterns and anomalies
- **Resource Planning** - Plan capacity based on usage

### Container Metrics

#### Container Statistics
- **Resource Usage** - CPU, memory per container
- **Network I/O** - Network traffic per container
- **Block I/O** - Disk usage per container
- **Process Count** - Number of processes

#### Health Monitoring
- **Container Health** - Health check results
- **Uptime Tracking** - Container uptime
- **Error Rates** - Error frequency and patterns

### Alerting

#### Notification Types
- **System Alerts** - High resource usage
- **Container Events** - Start/stop/failure notifications
- **Security Events** - Security-related notifications
- **Maintenance Alerts** - Required maintenance actions

---

## Backup and Restore

### Backup Configuration

#### Backup Options
- **Include Containers** - Back up container configurations
- **Include Images** - Back up Docker images
- **Include Networks** - Back up network configurations
- **Include Volumes** - Back up volume data
- **Include Projects** - Back up project configurations
- **Include Settings** - Back up application settings
- **Include Logs** - Back up application logs
- **Compression** - Compress backup files

#### Creating Backups
1. Navigate to **Settings** → **Backup**
2. Select backup options
3. Click **Create Backup**
4. Wait for backup completion
5. Note the backup ID for restoration

### Backup Management

#### Viewing Backups
1. Click **Backup List** to see all backups
2. View backup details including:
   - Creation timestamp
   - Backup size
   - Included components
   - Backup configuration

#### Restoring Backups
1. Select a backup from the list
2. Click **Restore**
3. Confirm the restore action
4. Wait for restoration completion
5. Verify restored data

#### Cleanup
1. Click **Cleanup Old Backups**
2. Set retention policy
3. Remove old backups automatically
4. Monitor backup storage usage

---

## Troubleshooting

### Common Issues

#### Application Won't Start
1. Check Docker is running: `docker --version`
2. Check port availability: `lsof -i :5003`
3. Check application logs: `docker-compose logs`
4. Verify system resources: `df -h` and `free -m`

#### Container Operations Fail
1. Check Docker daemon status
2. Verify container exists: `docker ps -a`
3. Check container logs: `docker logs container-name`
4. Verify permissions: `docker inspect container-name`

#### Terminal Connection Issues
1. Verify container is running
2. Check container has shell access
3. Verify terminal service is running
4. Check WebSocket connection

#### Performance Issues
1. Check system resource usage
2. Monitor application logs for errors
3. Verify metrics collection is working
4. Check rate limiting status

### Health Checks

#### Application Health
```bash
curl http://localhost:5003/health
```

#### Detailed Health
```bash
curl http://localhost:5003/health/detailed
```

#### Component Health
```bash
curl http://localhost:5003/health/check/docker
curl http://localhost:5003/health/check/redis
curl http://localhost:5003/health/check/memory
```

### Log Analysis

#### Application Logs
```bash
docker-compose logs advanced-container-manager
```

#### System Logs
```bash
tail -f ./logs/application.log
```

#### Audit Logs
```bash
curl "http://localhost:5003/api/audit/logs?limit=50"
```

### Performance Optimization

#### System Resources
- Monitor CPU and memory usage
- Clean up unused Docker resources
- Optimize container resource limits
- Regular system maintenance

#### Application Performance
- Adjust refresh intervals
- Optimize database queries
- Enable caching where appropriate
- Monitor API response times

### Getting Help

#### Documentation
- Review this user guide
- Check API documentation
- Review README file
- Check GitHub issues

#### Support
- Check application logs for errors
- Use health check endpoints
- Review audit logs for issues
- Contact support if needed

---

## Keyboard Shortcuts

### Global Shortcuts
- **Ctrl + /** - Open command palette
- **Ctrl + K** - Quick search
- **Ctrl + /** - Toggle sidebar
- **F5** - Refresh page

### Dashboard Shortcuts
- **D** - Navigate to Dashboard
- **C** - Navigate to Containers
- **I** - Navigate to Images
- **N** - Navigate to Networks
- **V** - Navigate to Volumes
- **P** - Navigate to Projects
- **T** - Navigate to Terminal
- **S** - Navigate to Settings

### Container Shortcuts
- **Enter** - Select container
- **Space** - Toggle container selection
- **Ctrl + A** - Select all containers
- **Delete** - Delete selected containers

---

## Tips and Best Practices

### Container Management
- Use descriptive container names
- Regularly clean up unused containers
- Monitor resource usage
- Set appropriate resource limits
- Use health checks for critical containers

### Image Management
- Use specific tags instead of `latest`
- Regularly clean up unused images
- Use multi-stage builds for optimization
- Scan images for vulnerabilities

### Network Management
- Use custom networks for isolation
- Avoid using default bridge for production
- Configure proper subnet ranges
- Use network aliases for service discovery

### Volume Management
- Use named volumes for persistent data
- Regularly backup important volumes
- Monitor disk usage
- Use volume drivers appropriately

### Security Best Practices
- Regularly update base images
- Use non-root users in containers
- Limit container capabilities
- Use secrets for sensitive data
- Regular security scanning

---

## Advanced Features

### Custom Metrics
- Create custom metric dashboards
- Set up alerting thresholds
- Configure metric retention
- Export metrics data

### Automation
- Use API for automated workflows
- Set up scheduled backups
- Implement health monitoring
- Configure automated cleanup

### Integration
- Use webhooks for notifications
- Integrate with monitoring systems
- Connect to CI/CD pipelines
- Export metrics to external systems

---

## FAQ

### Q: How do I access the application from another machine?
A: Update the Docker Compose file to expose the service on all interfaces (`0.0.0.0`) and configure firewall rules.

### Q: Can I run multiple instances of the application?
A: Yes, but ensure they use different ports and data directories to avoid conflicts.

### Q: How do I backup my data?
A: Use the built-in backup feature in Settings → Backup, or manually copy the `./data` directory.

### Q: What happens if Docker daemon stops working?
A: The application will show degraded status but continue running. Restart Docker to restore full functionality.

### Q: Can I use this with Docker Swarm or Kubernetes?
A: Yes, the application can be deployed on Docker Swarm. For Kubernetes, you would need to create appropriate manifests.

---

## Support

For additional help and support:
- Check the [API Documentation](./API_DOCUMENTATION.md)
- Review the [README.md](./README.md)
- Check GitHub issues for known problems
- Contact support at support@advancedcontainermanager.com

---

*Last updated: February 5, 2026*
