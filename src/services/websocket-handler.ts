import { Server as SocketIOServer, Socket } from 'socket.io';
import { MetricsCollector } from './metrics-collector';
import { Logger } from '../utils/logger';
import { WebSocketMessage } from '../types';

export class WebSocketHandler {
  private io: SocketIOServer;
  private metricsCollector: MetricsCollector;
  private logger: Logger;
  private connectedClients: Set<string> = new Set();

  constructor(io: SocketIOServer, metricsCollector: MetricsCollector, logger: Logger) {
    this.io = io;
    this.metricsCollector = metricsCollector;
    this.logger = logger;
    
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      this.handleConnection(socket);
    });

    this.io.on('disconnect', (socket: Socket) => {
      this.handleDisconnection(socket);
    });
  }

  private handleConnection(socket: Socket): void {
    const clientId = socket.id;
    this.connectedClients.add(clientId);
    
    this.logger.info(`Client connected: ${clientId}`);
    
    // Join system room for global updates
    socket.join('system');
    
    // Send initial system status
    this.sendSystemStatus(socket);
    
    // Set up client-specific event handlers
    this.setupClientHandlers(socket);
  }

  private handleDisconnection(socket: Socket): void {
    const clientId = socket.id;
    this.connectedClients.delete(clientId);
    
    this.logger.info(`Client disconnected: ${clientId}`);
  }

  private setupClientHandlers(socket: Socket): void {
    // Subscribe to container updates
    socket.on('subscribe_container', (data) => {
      const { containerId } = data;
      socket.join(`container:${containerId}`);
      this.logger.info(`Client ${socket.id} subscribed to container ${containerId}`);
    });

    // Unsubscribe from container updates
    socket.on('unsubscribe_container', (data) => {
      const { containerId } = data;
      socket.leave(`container:${containerId}`);
      this.logger.info(`Client ${socket.id} unsubscribed from container ${containerId}`);
    });

    // Request system metrics
    socket.on('get_system_metrics', async () => {
      try {
        const metrics = await this.metricsCollector.collectSystemMetrics();
        socket.emit('system_metrics', metrics);
      } catch (error) {
        this.logger.error('Error getting system metrics:', error);
        socket.emit('error', { message: 'Failed to get system metrics' });
      }
    });

    // Request container metrics
    socket.on('get_container_metrics', async (data) => {
      try {
        const { containerId } = data;
        const metrics = await this.metricsCollector.collectContainerMetrics(containerId);
        socket.emit('container_metrics', { containerId, metrics });
      } catch (error) {
        this.logger.error(`Error getting container metrics for ${containerId}:`, error);
        socket.emit('error', { message: `Failed to get container metrics for ${containerId}` });
      }
    });

    // Request metrics history
    socket.on('get_system_metrics_history', async (data) => {
      try {
        const { limit = 100 } = data;
        const history = await this.metricsCollector.getSystemMetricsHistory(limit);
        socket.emit('system_metrics_history', history);
      } catch (error) {
        this.logger.error('Error getting system metrics history:', error);
        socket.emit('error', { message: 'Failed to get system metrics history' });
      }
    });

    // Request container metrics history
    socket.on('get_container_metrics_history', async (data) => {
      try {
        const { containerId, limit = 100 } = data;
        const history = await this.metricsCollector.getContainerMetricsHistory(containerId, limit);
        socket.emit('container_metrics_history', { containerId, history });
      } catch (error) {
        this.logger.error(`Error getting container metrics history for ${containerId}:`, error);
        socket.emit('error', { message: `Failed to get container metrics history for ${containerId}` });
      }
    });
  }

  private async sendSystemStatus(socket: Socket): Promise<void> {
    try {
      const metrics = await this.metricsCollector.collectSystemMetrics();
      const metricsSummary = this.metricsCollector.getMetricsSummary();
      
      socket.emit('system_status', {
        timestamp: new Date().toISOString(),
        metrics,
        summary: metricsSummary,
        connectedClients: this.connectedClients.size
      });
    } catch (error) {
      this.logger.error('Error sending system status:', error);
    }
  }

  public broadcastSystemMetrics(metrics: any): void {
    this.io.to('system').emit('system_metrics_update', metrics);
  }

  public broadcastContainerMetrics(containerId: string, metrics: any): void {
    this.io.to(`container:${containerId}`).emit('container_metrics_update', {
      containerId,
      metrics
    });
  }

  public broadcastSystemStatus(status: any): void {
    this.io.to('system').emit('system_status_update', status);
  }

  public broadcastNotification(notification: {
    type: 'info' | 'warning' | 'error' | 'success';
    message: string;
    data?: any;
  }): void {
    this.io.emit('notification', notification);
  }

  public getClientCount(): number {
    return this.connectedClients.size;
  }

  public getConnectedClients(): string[] {
    return Array.from(this.connectedClients);
  }
}

export default WebSocketHandler;
