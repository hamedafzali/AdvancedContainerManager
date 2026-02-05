#!/usr/bin/env python3
"""
Advanced Professional Container Manager
Features: Web terminal, real-time metrics, advanced monitoring, professional UI
Inspired by Portainer and modern container management platforms
"""

import os
import json
import subprocess
import logging
import asyncio
import websockets
import threading
import time
from datetime import datetime, timedelta
from flask import Flask, render_template, jsonify, request, redirect, url_for, send_file
from flask_socketio import SocketIO, emit
import docker
import psutil
from git import Repo
import yaml
import redis
import base64

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.config['SECRET_KEY'] = os.urandom(24)
socketio = SocketIO(app, cors_allowed_origins="*")

# Docker client
try:
    docker_client = docker.from_env()
    docker_client.ping()
    DOCKER_AVAILABLE = True
    logger.info("Docker client initialized successfully")
except Exception as e:
    logger.error(f"Docker not available: {e}")
    DOCKER_AVAILABLE = False

# Redis for real-time data (optional)
try:
    redis_client = redis.Redis(host='localhost', port=6379, db=0, decode_responses=True)
    REDIS_AVAILABLE = True
    logger.info("Redis client initialized")
except:
    REDIS_AVAILABLE = False
    logger.warning("Redis not available - using in-memory storage")

# Configuration
PROJECTS_DIR = "/tmp/advanced_manager_projects"
CONFIG_FILE = "/tmp/advanced_manager_config.json"
METRICS_FILE = "/tmp/advanced_manager_metrics.json"

# Ensure directories exist
os.makedirs(PROJECTS_DIR, exist_ok=True)

class MetricsCollector:
    """Collect system and container metrics"""
    
    def __init__(self):
        self.metrics_history = []
        self.max_history = 100
    
    def collect_system_metrics(self):
        """Collect system-wide metrics"""
        try:
            metrics = {
                'timestamp': datetime.now().isoformat(),
                'cpu_percent': psutil.cpu_percent(interval=1),
                'memory_percent': psutil.virtual_memory().percent,
                'disk_usage': psutil.disk_usage('/').percent,
                'network_io': psutil.net_io_counters()._asdict() if psutil.net_io_counters() else {},
                'load_average': os.getloadavg() if hasattr(os, 'getloadavg') else [0, 0, 0]
            }
            return metrics
        except Exception as e:
            logger.error(f"Error collecting system metrics: {e}")
            return {}
    
    def collect_container_metrics(self, container_id):
        """Collect container-specific metrics"""
        if not DOCKER_AVAILABLE:
            return {}
        
        try:
            container = docker_client.containers.get(container_id)
            stats = container.stats(stream=False)
            
            # Calculate CPU usage
            cpu_usage = 0.0
            if stats['cpu_stats']['cpu_usage']['total_usage'] > 0:
                cpu_delta = stats['cpu_stats']['cpu_usage']['total_usage'] - stats['precpu_stats']['cpu_usage']['total_usage']
                system_delta = stats['cpu_stats']['system_cpu_usage'] - stats['precpu_stats']['system_cpu_usage']
                if system_delta > 0:
                    cpu_usage = (cpu_delta / system_delta) * len(stats['cpu_stats']['cpu_usage']['percpu_usage']) * 100.0
            
            # Memory usage
            memory_usage = 0.0
            if stats['memory_stats']['limit'] > 0:
                memory_usage = (stats['memory_stats']['usage'] / stats['memory_stats']['limit']) * 100.0
            
            # Network I/O
            network_rx = 0
            network_tx = 0
            for interface, data in stats['networks'].items():
                network_rx += data['rx_bytes']
                network_tx += data['tx_bytes']
            
            return {
                'timestamp': datetime.now().isoformat(),
                'cpu_percent': round(cpu_usage, 2),
                'memory_percent': round(memory_usage, 2),
                'memory_usage': stats['memory_stats']['usage'],
                'memory_limit': stats['memory_stats']['limit'],
                'network_rx': network_rx,
                'network_tx': network_tx,
                'block_read': stats['blkio_stats']['read_bytes'] if 'blkio_stats' in stats else 0,
                'block_write': stats['blkio_stats']['write_bytes'] if 'blkio_stats' in stats else 0
            }
        except Exception as e:
            logger.error(f"Error collecting container metrics: {e}")
            return {}
    
    def store_metrics(self, metrics_type, data):
        """Store metrics in history"""
        if REDIS_AVAILABLE:
            key = f"metrics:{metrics_type}"
            redis_client.lpush(key, json.dumps(data))
            redis_client.ltrim(key, 0, self.max_history - 1)
        else:
            self.metrics_history.append({
                'type': metrics_type,
                'data': data,
                'timestamp': datetime.now().isoformat()
            })
            if len(self.metrics_history) > self.max_history:
                self.metrics_history.pop(0)

class TerminalManager:
    """Manage web-based terminal sessions"""
    
    def __init__(self):
        self.active_sessions = {}
    
    def create_session(self, container_id):
        """Create a new terminal session for a container"""
        if not DOCKER_AVAILABLE:
            return None
        
        try:
            container = docker_client.containers.get(container_id)
            if container.status != 'running':
                return None
            
            # Create exec instance for shell access
            exec_id = container.client.api.exec_create(
                container_id,
                'bash',
                stdin=True,
                stdout=True,
                stderr=True,
                tty=True
            )
            
            session_id = f"{container_id}_{int(time.time())}"
            self.active_sessions[session_id] = {
                'container_id': container_id,
                'exec_id': exec_id,
                'socket': None
            }
            
            return session_id
        except Exception as e:
            logger.error(f"Error creating terminal session: {e}")
            return None
    
    def send_command(self, session_id, command):
        """Send command to terminal session"""
        if session_id not in self.active_sessions:
            return False
        
        try:
            session = self.active_sessions[session_id]
            container = docker_client.containers.get(session['container_id'])
            
            # Start the exec instance and attach to it
            socket = container.client.api.exec_start(
                session['exec_id'],
                detach=False,
                tty=True,
                stream=True
            )
            
            # Send command
            socket._sock.send(command.encode())
            return True
        except Exception as e:
            logger.error(f"Error sending command to terminal: {e}")
            return False

class AdvancedProjectManager:
    """Enhanced project management with advanced features"""
    
    def __init__(self):
        self.projects_dir = PROJECTS_DIR
        self.config_file = CONFIG_FILE
        self.load_config()
    
    def load_config(self):
        """Load project configuration"""
        try:
            if os.path.exists(self.config_file):
                with open(self.config_file, 'r') as f:
                    self.config = json.load(f)
            else:
                self.config = {"projects": {}, "settings": {}}
                self.save_config()
        except Exception as e:
            logger.error(f"Error loading config: {e}")
            self.config = {"projects": {}, "settings": {}}
    
    def save_config(self):
        """Save project configuration"""
        try:
            with open(self.config_file, 'w') as f:
                json.dump(self.config, f, indent=2)
        except Exception as e:
            logger.error(f"Error saving config: {e}")
    
    def get_projects(self):
        """Get all projects"""
        return self.config.get("projects", {})
    
    def get_project(self, name):
        """Get specific project"""
        return self.config.get("projects", {}).get(name)
    
    def add_project(self, name, repo_url, branch="main", dockerfile_path="Dockerfile", 
                   compose_file="docker-compose.yml", environment_vars={}):
        """Add a new project from repository with advanced options"""
        try:
            project_path = os.path.join(self.projects_dir, name)
            
            # Clone repository with specific branch
            if os.path.exists(project_path):
                repo = Repo(project_path)
                origin = repo.remotes.origin
                origin.pull()
            else:
                repo = Repo.clone_from(repo_url, project_path, branch=branch)
            
            # Add to config with advanced settings
            self.config["projects"][name] = {
                "name": name,
                "repo_url": repo_url,
                "branch": branch,
                "path": project_path,
                "dockerfile": dockerfile_path,
                "compose_file": compose_file,
                "environment_vars": environment_vars,
                "containers": [],
                "status": "configured",
                "created_at": datetime.now().isoformat(),
                "last_updated": datetime.now().isoformat(),
                "build_history": [],
                "deploy_history": [],
                "health_checks": [],
                "auto_restart": False,
                "resource_limits": {
                    "memory": "512m",
                    "cpu": "0.5"
                }
            }
            
            self.save_config()
            return {"success": True, "message": f"Project {name} added successfully"}
            
        except Exception as e:
            logger.error(f"Error adding project: {e}")
            return {"success": False, "message": str(e)}
    
    def get_project_health(self, name):
        """Get comprehensive project health status"""
        project = self.config["projects"].get(name)
        if not project:
            return None
        
        health_status = {
            "overall": "healthy",
            "containers": [],
            "last_check": datetime.now().isoformat(),
            "issues": []
        }
        
        if DOCKER_AVAILABLE:
            try:
                # Check project containers
                project_containers = [c for c in docker_client.containers.list(all=True) 
                                    if c.name.startswith(name.lower())]
                
                for container in project_containers:
                    container_health = {
                        "name": container.name,
                        "status": container.status,
                        "health": "unknown"
                    }
                    
                    # Check container health if available
                    if container.status == 'running':
                        try:
                            health_info = container.attrs.get('State', {}).get('Health', {})
                            if health_info:
                                container_health["health"] = health_info.get('Status', 'unknown')
                                container_health["failing_streak"] = health_info.get('FailingStreak', 0)
                        except:
                            container_health["health"] = "running"
                    
                    health_status["containers"].append(container_health)
                
                # Determine overall health
                if not project_containers:
                    health_status["overall"] = "no_containers"
                else:
                    unhealthy = [c for c in health_status["containers"] if c.get("health") == "unhealthy"]
                    if unhealthy:
                        health_status["overall"] = "unhealthy"
                        health_status["issues"] = [f"Container {c['name']} is unhealthy" for c in unhealthy]
                        
            except Exception as e:
                logger.error(f"Error checking project health: {e}")
                health_status["overall"] = "error"
                health_status["issues"].append(str(e))
        
        return health_status

class AdvancedContainerManager:
    """Enhanced container management with advanced features"""
    
    def __init__(self):
        self.docker_client = docker_client if DOCKER_AVAILABLE else None
        self.terminal_manager = TerminalManager()
        self.metrics_collector = MetricsCollector()
    
    def get_all_containers(self):
        """Get all containers with enhanced information"""
        if not DOCKER_AVAILABLE:
            return []
        
        try:
            containers = []
            for container in docker_client.containers.list(all=True):
                container_info = self.get_container_inspect(container.id)
                if container_info:
                    containers.append(container_info)
            return containers
        except Exception as e:
            logger.error(f"Error getting containers: {e}")
            return []
    
    def get_container_inspect(self, container_id):
        """Get detailed container information"""
        if not DOCKER_AVAILABLE:
            return None
        
        try:
            container = self.docker_client.containers.get(container_id)
            inspect_data = container.attrs
            
            # Enhanced information
            enhanced_data = {
                "id": container.id[:12],
                "name": container.name,
                "status": container.status,
                "image": container.image.tags[0] if container.image.tags else "unknown",
                "created": container.attrs['Created'],
                "started_at": container.attrs.get('State', {}).get('StartedAt'),
                "finished_at": container.attrs.get('State', {}).get('FinishedAt'),
                "exit_code": container.attrs.get('State', {}).get('ExitCode'),
                "ports": container.ports,
                "mounts": container.attrs.get('Mounts', []),
                "networks": container.attrs.get('NetworkSettings', {}).get('Networks', {}),
                "labels": container.labels,
                "env": container.attrs.get('Config', {}).get('Env', []),
                "cmd": container.attrs.get('Config', {}).get('Cmd', []),
                "entrypoint": container.attrs.get('Config', {}).get('Entrypoint', []),
                "working_dir": container.attrs.get('Config', {}).get('WorkingDir', ''),
                "restart_policy": container.attrs.get('HostConfig', {}).get('RestartPolicy', {}),
                "resources": {
                    "memory_limit": container.attrs.get('HostConfig', {}).get('Memory', 0),
                    "cpu_shares": container.attrs.get('HostConfig', {}).get('CpuShares', 0),
                    "cpu_quota": container.attrs.get('HostConfig', {}).get('CpuQuota', 0),
                    "cpu_period": container.attrs.get('HostConfig', {}).get('CpuPeriod', 0)
                },
                "health": container.attrs.get('State', {}).get('Health', {}),
                "log_path": container.attrs.get('LogPath', ''),
                "driver": container.attrs.get('Driver', ''),
                "exec_ids": []  # Track active terminal sessions
            }
            
            return enhanced_data
        except Exception as e:
            logger.error(f"Error inspecting container: {e}")
            return None
    
    def get_container_processes(self, container_id):
        """Get running processes inside container"""
        if not DOCKER_AVAILABLE:
            return []
        
        try:
            container = self.docker_client.containers.get(container_id)
            if container.status != 'running':
                return []
            
            # Get top processes
            top = container.top()
            processes = []
            
            if top and 'Processes' in top:
                headers = top['Titles']
                for process in top['Processes']:
                    process_dict = dict(zip(headers, process))
                    processes.append({
                        'pid': process_dict.get('PID', ''),
                        'user': process_dict.get('USER', ''),
                        'time': process_dict.get('TIME', ''),
                        'command': process_dict.get('COMMAND', ''),
                        'cpu': process_dict.get('%CPU', '0.0'),
                        'memory': process_dict.get('%MEM', '0.0')
                    })
            
            return processes
        except Exception as e:
            logger.error(f"Error getting container processes: {e}")
            return []
    
    def get_container_logs_with_options(self, container_id, lines=100, since=None, until=None, follow=False):
        """Get container logs with advanced options"""
        if not DOCKER_AVAILABLE:
            return {"success": False, "message": "Docker not available"}
        
        try:
            container = self.docker_client.containers.get(container_id)
            
            # Build log options
            log_options = {
                'tail': lines,
                'timestamps': True,
                'stdout': True,
                'stderr': True
            }
            
            if since:
                if isinstance(since, str):
                    since = datetime.fromisoformat(since.replace('Z', '+00:00'))
                log_options['since'] = since
            
            if until:
                if isinstance(until, str):
                    until = datetime.fromisoformat(until.replace('Z', '+00:00'))
                log_options['until'] = until
            
            logs = container.logs(**log_options).decode('utf-8')
            
            return {
                "success": True,
                "logs": logs,
                "container_id": container_id,
                "lines_count": len(logs.split('\n')),
                "options": log_options
            }
        except Exception as e:
            logger.error(f"Error getting container logs: {e}")
            return {"success": False, "message": str(e)}
    
    def create_terminal_session(self, container_id):
        """Create a web terminal session for container"""
        return self.terminal_manager.create_session(container_id)
    
    def get_container_stats_history(self, container_id, hours=1):
        """Get historical container statistics"""
        if REDIS_AVAILABLE:
            try:
                key = f"metrics:container:{container_id}"
                data = redis_client.lrange(key, 0, -1)
                return [json.loads(item) for item in data]
            except:
                return []
        else:
            # Return recent metrics from memory
            return [m for m in self.metrics_collector.metrics_history 
                   if m.get('container_id') == container_id]

# Initialize managers
project_manager = AdvancedProjectManager()
container_manager = AdvancedContainerManager()

# Background metrics collection
def collect_metrics_background():
    """Background thread for collecting metrics"""
    while True:
        try:
            # Collect system metrics
            system_metrics = container_manager.metrics_collector.collect_system_metrics()
            if system_metrics:
                container_manager.metrics_collector.store_metrics('system', system_metrics)
            
            # Collect container metrics
            if DOCKER_AVAILABLE:
                for container in docker_client.containers.list():
                    container_metrics = container_manager.metrics_collector.collect_container_metrics(container.id)
                    if container_metrics:
                        container_metrics['container_id'] = container.id
                        container_manager.metrics_collector.store_metrics(f'container:{container.id}', container_metrics)
            
            time.sleep(5)  # Collect every 5 seconds
        except Exception as e:
            logger.error(f"Error in metrics collection: {e}")
            time.sleep(10)

# Start metrics collection thread
metrics_thread = threading.Thread(target=collect_metrics_background, daemon=True)
metrics_thread.start()

# WebSocket events for real-time updates
@socketio.on('connect')
def handle_connect():
    """Handle client connection"""
    emit('status', {'message': 'Connected to Advanced Container Manager'})

@socketio.on('disconnect')
def handle_disconnect():
    """Handle client disconnection"""
    logger.info('Client disconnected')

@socketio.on('subscribe_container')
def handle_subscribe_container(data):
    """Subscribe to container updates"""
    container_id = data.get('container_id')
    if container_id:
        # Join room for this container
        from flask_socketio import join_room
        join_room(container_id)
        emit('status', {'message': f'Subscribed to {container_id} updates'})

# Routes
@app.route('/')
def dashboard():
    """Advanced dashboard with real-time metrics"""
    projects = project_manager.get_projects()
    containers = container_manager.get_all_containers() if DOCKER_AVAILABLE else []
    system_metrics = container_manager.metrics_collector.collect_system_metrics()
    
    return render_template('advanced_dashboard.html', 
                         projects=projects, 
                         containers=containers,
                         system_metrics=system_metrics)

@app.route('/containers')
def containers():
    """Advanced containers page"""
    containers = []
    if DOCKER_AVAILABLE:
        for container in docker_client.containers.list(all=True):
            container_data = container_manager.get_container_inspect(container.id)
            if container_data:
                containers.append(container_data)
    
    return render_template('advanced_containers.html', containers=containers)

@app.route('/projects')
def projects():
    """Projects page"""
    projects = project_manager.get_projects()
    return render_template('projects.html', projects=projects)

@app.route('/images')
def images():
    """Images page"""
    images = []
    if DOCKER_AVAILABLE:
        try:
            for image in docker_client.images.list():
                image_info = {
                    'id': image.id[:12],
                    'tags': image.tags,
                    'size': image.attrs['Size'],
                    'created': image.attrs['Created'],
                    'labels': image.labels
                }
                images.append(image_info)
        except Exception as e:
            logger.error(f"Error getting images: {e}")
    
    return render_template('images.html', images=images)

@app.route('/networks')
def networks():
    """Networks page"""
    networks = []
    if DOCKER_AVAILABLE:
        try:
            for network in docker_client.networks.list():
                network_info = {
                    'id': network.id[:12],
                    'name': network.name,
                    'driver': network.attrs.get('Driver', 'bridge'),
                    'scope': network.attrs.get('Scope', 'local'),
                    'containers': len(network.attrs.get('Containers', {})),
                    'created': network.attrs['Created']
                }
                networks.append(network_info)
        except Exception as e:
            logger.error(f"Error getting networks: {e}")
    
    return render_template('networks.html', networks=networks)

@app.route('/volumes')
def volumes():
    """Volumes page"""
    volumes = []
    if DOCKER_AVAILABLE:
        try:
            for volume in docker_client.volumes.list():
                volume_info = {
                    'name': volume.name,
                    'driver': volume.attrs.get('Driver', 'local'),
                    'mountpoint': volume.attrs.get('Mountpoint', ''),
                    'created': volume.attrs['CreatedAt'],
                    'labels': volume.attrs.get('Labels', {}),
                    'usage': volume.attrs.get('UsageData', {})
                }
                volumes.append(volume_info)
        except Exception as e:
            logger.error(f"Error getting volumes: {e}")
    
    return render_template('volumes.html', volumes=volumes)

@app.route('/settings')
def settings():
    """Settings page"""
    return render_template('settings.html')

@app.route('/container/<container_id>')
def container_detail(container_id):
    """Detailed container view"""
    container_info = container_manager.get_container_inspect(container_id)
    if not container_info:
        return "Container not found", 404
    
    processes = container_manager.get_container_processes(container_id)
    metrics_history = container_manager.get_container_stats_history(container_id)
    
    return render_template('container_detail.html', 
                         container=container_info,
                         processes=processes,
                         metrics_history=metrics_history)

@app.route('/terminal/<container_id>')
def terminal(container_id):
    """Web terminal for container"""
    container_info = container_manager.get_container_inspect(container_id)
    if not container_info:
        return "Container not found", 404
    
    if container_info['status'] != 'running':
        return "Container is not running", 400
    
    return render_template('terminal.html', container=container_info)

# API Routes
@app.route('/api/system/metrics')
def api_system_metrics():
    """Get system metrics"""
    metrics = container_manager.metrics_collector.collect_system_metrics()
    return jsonify(metrics)

@app.route('/api/container/<container_id>/metrics')
def api_container_metrics(container_id):
    """Get container metrics"""
    metrics = container_manager.metrics_collector.collect_container_metrics(container_id)
    return jsonify(metrics)

@app.route('/api/container/<container_id>/processes')
def api_container_processes(container_id):
    """Get container processes"""
    processes = container_manager.get_container_processes(container_id)
    return jsonify(processes)

@app.route('/api/container/<container_id>/logs')
def api_container_logs(container_id):
    """Get container logs with options"""
    lines = request.args.get('lines', 100, type=int)
    since = request.args.get('since')
    until = request.args.get('until')
    
    result = container_manager.get_container_logs_with_options(container_id, lines, since, until)
    return jsonify(result)

@app.route('/api/container/<container_id>/terminal', methods=['POST'])
def api_create_terminal(container_id):
    """Create terminal session"""
    session_id = container_manager.create_terminal_session(container_id)
    if session_id:
        return jsonify({"success": True, "session_id": session_id})
    else:
        return jsonify({"success": False, "message": "Failed to create terminal session"})

@app.route('/api/container/<container_id>/inspect')
def api_container_inspect(container_id):
    """Get detailed container information"""
    container_info = container_manager.get_container_inspect(container_id)
    return jsonify(container_info)

@app.route('/api/projects/<name>/health')
def api_project_health(name):
    """Get project health status"""
    health = project_manager.get_project_health(name)
    return jsonify(health)

if __name__ == '__main__':
    logger.info("Starting Advanced Professional Container Manager...")
    logger.info("Features:")
    logger.info("- Real-time metrics collection")
    logger.info("- Web-based terminal access")
    logger.info("- Advanced container monitoring")
    logger.info("- Professional UI design")
    logger.info("- WebSocket real-time updates")
    
    socketio.run(app, host='0.0.0.0', port=5003, debug=True)
