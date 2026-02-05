# Advanced Container Manager

A professional web-based container management platform inspired by Portainer and modern container management tools.

## 🚀 Features

### 🎯 Core Functionality
- **Real-time Monitoring**: Live CPU, memory, disk, and network metrics
- **Container Management**: Start, stop, restart, inspect containers
- **Web Terminal**: Full bash shell access inside containers
- **Project Management**: Multi-project Git repository integration
- **Resource Monitoring**: Live resource usage with charts and graphs
- **Health Checks**: Container health status monitoring

### 🎨 Professional UI
- **Modern Design**: Glassmorphism effects and smooth animations
- **Responsive Layout**: Works on desktop and mobile devices
- **Real-time Updates**: WebSocket-based live data streaming
- **Interactive Charts**: Visual metrics with Chart.js
- **Dark Theme**: Professional terminal aesthetic

### 📊 Advanced Features
- **Docker Integration**: Full Docker API access
- **Metrics Collection**: Background system and container metrics
- **Terminal Sessions**: xterm.js powered web terminal
- **Process Monitoring**: View running processes inside containers
- **Log Management**: Advanced log viewing and filtering
- **Network Management**: Docker networks control
- **Volume Management**: Docker volumes management
- **Image Management**: Docker images control

## 🛠️ Installation

### Prerequisites
- Docker Engine running on the host
- Python 3.8 or higher
- Git (for project management features)

### Quick Start

```bash
# Clone the repository
git clone <repository-url>
cd AdvancedContainerManager

# Install dependencies
pip install -r requirements.txt

# Start the manager
python advanced_manager.py
```

### Docker Deployment

```bash
# Build the image
docker build -t advanced-container-manager .

# Run the manager
docker run -d \
  --name advanced-container-manager \
  --restart unless-stopped \
  -p 5003:5003 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  advanced-container-manager
```

### Docker Compose

```yaml
version: '3.8'
services:
  container-manager:
    build: .
    container_name: advanced-container-manager
    ports:
      - "5003:5003"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    restart: unless-stopped
    environment:
      - DOCKER_HOST=unix:///var/run/docker.sock
```

## 🌐 Access

Once running, access the web interface at:
- **Main Dashboard**: http://localhost:5003
- **Containers**: http://localhost:5003/containers
- **Projects**: http://localhost:5003/projects
- **Images**: http://localhost:5003/images
- **Networks**: http://localhost:5003/networks
- **Volumes**: http://localhost:5003/volumes
- **Settings**: http://localhost:5003/settings

## 📋 Usage

### Container Management
1. **View Containers**: See all containers with real-time metrics
2. **Terminal Access**: Click the terminal icon to open a shell inside running containers
3. **Resource Monitoring**: View CPU and memory usage in real-time
4. **Control Actions**: Start, stop, restart containers with one click

### Project Management
1. **Add Projects**: Add Git repositories to manage
2. **Build Images**: Build Docker images from source code
3. **Deploy Containers**: Deploy and manage project containers
4. **Health Monitoring**: Track project health status

### Advanced Features
- **Web Terminal**: Full bash access with command history
- **Metrics Collection**: Historical performance data
- **Process Monitoring**: View processes inside containers
- **Log Management**: Advanced log viewing and filtering

## 🔧 Configuration

### Environment Variables

```bash
# Application settings
PORT=5003
HOST=0.0.0.0
DEBUG=false

# Docker settings
DOCKER_HOST=unix:///var/run/docker.sock

# Metrics settings
METRICS_INTERVAL=5
METRICS_RETENTION=24

# Redis settings (optional)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0
```

### Settings Panel

Access the settings panel at `/settings` to configure:
- Application preferences
- Docker connection settings
- Monitoring thresholds
- Theme and language options

## 📊 Monitoring

### System Metrics
- **CPU Usage**: Real-time CPU percentage
- **Memory Usage**: Memory consumption and availability
- **Disk Usage**: Storage space utilization
- **Network I/O**: Network traffic statistics
- **Load Average**: System load metrics

### Container Metrics
- **Resource Usage**: Per-container CPU and memory
- **Network Traffic**: Container network I/O
- **Block I/O**: Disk read/write operations
- **Health Status**: Container health checks

## 🔐 Security

### Docker Socket Access
The manager requires Docker socket access for container management:
```bash
-v /var/run/docker.sock:/var/run/docker.sock
```

### Network Security
- Runs on configurable port (default: 5003)
- Supports HTTPS configuration
- Can be placed behind reverse proxy

### User Authentication
- Basic authentication support (configurable)
- Session management
- Role-based access control (future feature)

## 🚀 Advanced Features

### Web Terminal
- **Full Shell Access**: bash, sh, and other shells
- **Command History**: Up/down arrow navigation
- **Tab Completion**: Smart command suggestions
- **Copy/Paste**: Clipboard integration
- **Session Management**: Multiple terminal sessions

### Real-time Updates
- **WebSocket Integration**: Live data streaming
- **Auto-refresh**: Configurable update intervals
- **Event Notifications**: Real-time alerts
- **Status Changes**: Instant status updates

### Project Management
- **Git Integration**: Clone and manage repositories
- **Build Automation**: Automated Docker image building
- **Deployment**: One-click container deployment
- **Environment Variables**: Per-project configuration

## 📚 API Documentation

### REST API Endpoints

#### System
- `GET /api/system/metrics` - Get system metrics
- `GET /api/system/status` - Get system status

#### Containers
- `GET /api/containers` - List all containers
- `GET /api/container/<id>` - Get container details
- `POST /api/container/<id>/restart` - Restart container
- `POST /api/container/<id>/terminal` - Create terminal session
- `GET /api/container/<id>/logs` - Get container logs
- `GET /api/container/<id>/metrics` - Get container metrics
- `GET /api/container/<id>/processes` - Get container processes

#### Projects
- `GET /api/projects` - List all projects
- `POST /api/projects` - Add new project
- `GET /api/project/<name>` - Get project details
- `POST /api/project/<name>/build` - Build project
- `POST /api/project/<name>/start` - Start project
- `POST /api/project/<name>/stop` - Stop project
- `GET /api/project/<name>/health` - Get project health

### WebSocket Events
- `container_update` - Container status updates
- `system_metrics` - System metrics updates
- `project_status` - Project status changes

## 🛠️ Development

### Project Structure
```
AdvancedContainerManager/
├── advanced_manager.py      # Main Flask application
├── templates/               # HTML templates
│   ├── advanced_dashboard.html
│   ├── advanced_containers.html
│   ├── projects.html
│   ├── images.html
│   ├── networks.html
│   ├── volumes.html
│   ├── settings.html
│   ├── container_detail.html
│   └── terminal.html
├── requirements.txt          # Python dependencies
├── Dockerfile               # Docker configuration
├── docker-compose.yml       # Docker Compose setup
└── README.md               # This file
```

### Adding New Features
1. **Backend**: Add routes in `advanced_manager.py`
2. **Frontend**: Create templates in `templates/`
3. **API**: Add REST endpoints with `/api/` prefix
4. **WebSocket**: Add events for real-time updates

### Contributing
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 🐛 Troubleshooting

### Common Issues

#### Docker Socket Permission Denied
```bash
# Add user to docker group
sudo usermod -aG docker $USER

# Or run with sudo
sudo python advanced_manager.py
```

#### Port Already in Use
```bash
# Change port in environment
PORT=5004 python advanced_manager.py
```

#### Container Not Found
```bash
# Check Docker daemon status
docker version

# Check container list
docker ps -a
```

#### Metrics Not Showing
```bash
# Check Redis connection
redis-cli ping

# Disable Redis (uses in-memory storage)
# Remove redis from requirements.txt
```

### Debug Mode
```bash
# Enable debug mode
DEBUG=true python advanced_manager.py

# Check logs
tail -f /var/log/advanced-manager.log
```

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🤝 Support

- **Documentation**: Check this README and inline documentation
- **Issues**: Report bugs and feature requests on GitHub
- **Community**: Join our Discord server for discussions
- **Email**: support@advancedcontainermanager.com

## 🚀 Roadmap

### Upcoming Features
- [ ] User authentication and authorization
- [ ] Multi-host Docker management
- [ ] Kubernetes integration
- [ ] Container orchestration
- [ ] Backup and restore functionality
- [ ] Plugin system
- [ ] Mobile app
- [ ] API rate limiting
- [ ] Audit logging
- [ ] Custom themes

### Version History
- **v1.0.0** - Initial release with core features
- **v1.1.0** - Added project management
- **v1.2.0** - Enhanced terminal and monitoring
- **v1.3.0** - Advanced UI and real-time updates

---

**Advanced Container Manager** - Professional container management made simple. 🐳✨
