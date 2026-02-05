import { Router } from 'express';
import { DockerService } from '../services/docker-service';
import { ProjectService } from '../services/project-service';
import { TerminalService } from '../services/terminal-service';
import { MetricsCollector } from '../services/metrics-collector';
import { Logger } from '../utils/logger';
import { asyncHandler } from '../middleware/error-handler';

export function routes(
  dockerService: DockerService,
  projectService: ProjectService,
  terminalService: TerminalService,
  metricsCollector: MetricsCollector
): Router {
  const router = Router();
  const logger = new Logger('routes');

  // System routes
  router.get('/system/status', asyncHandler(async (req, res) => {
    try {
      const systemInfo = await dockerService.getSystemInfo();
      const version = await dockerService.getVersion();
      const metricsSummary = metricsCollector.getMetricsSummary();
      
      res.json({
        success: true,
        data: {
          docker: {
            connected: dockerService.isConnected(),
            version,
            systemInfo
          },
          metrics: metricsSummary,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      logger.error('Error getting system status:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }));

  router.get('/system/metrics', asyncHandler(async (req, res) => {
    try {
      const metrics = await metricsCollector.collectSystemMetrics();
      res.json({
        success: true,
        data: metrics
      });
    } catch (error) {
      logger.error('Error getting system metrics:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }));

  router.get('/system/metrics/history', asyncHandler(async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const history = await metricsCollector.getSystemMetricsHistory(limit);
      res.json({
        success: true,
        data: history
      });
    } catch (error) {
      logger.error('Error getting system metrics history:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }));

  // Container routes
  router.get('/containers', asyncHandler(async (req, res) => {
    try {
      const containers = await dockerService.getAllContainers();
      res.json({
        success: true,
        data: containers
      });
    } catch (error) {
      logger.error('Error getting containers:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }));

  router.get('/containers/:id', asyncHandler(async (req, res) => {
    try {
      const container = await dockerService.getContainer(req.params.id);
      res.json({
        success: true,
        data: container
      });
    } catch (error) {
      logger.error(`Error getting container ${req.params.id}:`, error);
      res.status(404).json({
        success: false,
        message: 'Container not found'
      });
    }
  }));

  router.post('/containers/:id/start', asyncHandler(async (req, res) => {
    try {
      await dockerService.startContainer(req.params.id);
      res.json({
        success: true,
        message: `Container ${req.params.id} started successfully`
      });
    } catch (error) {
      logger.error(`Error starting container ${req.params.id}:`, error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }));

  router.post('/containers/:id/stop', asyncHandler(async (req, res) => {
    try {
      await dockerService.stopContainer(req.params.id);
      res.json({
        success: true,
        message: `Container ${req.params.id} stopped successfully`
      });
    } catch (error) {
      logger.error(`Error stopping container ${req.params.id}:`, error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }));

  router.post('/containers/:id/restart', asyncHandler(async (req, res) => {
    try {
      await dockerService.restartContainer(req.params.id);
      res.json({
        success: true,
        message: `Container ${req.params.id} restarted successfully`
      });
    } catch (error) {
      logger.error(`Error restarting container ${req.params.id}:`, error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }));

  router.delete('/containers/:id', asyncHandler(async (req, res) => {
    try {
      await dockerService.removeContainer(req.params.id, true);
      res.json({
        success: true,
        message: `Container ${req.params.id} removed successfully`
      });
    } catch (error) {
      logger.error(`Error removing container ${req.params.id}:`, error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }));

  router.get('/containers/:id/logs', asyncHandler(async (req, res) => {
    try {
      const options = {
        tail: req.query.tail ? parseInt(req.query.tail as string) : 100,
        since: req.query.since ? new Date(req.query.since as string) : undefined,
        until: req.query.until ? new Date(req.query.until as string) : undefined,
        timestamps: req.query.timestamps !== 'false',
        stdout: req.query.stdout !== 'false',
        stderr: req.query.stderr !== 'false'
      };

      const logs = await dockerService.getContainerLogs(req.params.id, options);
      
      res.setHeader('Content-Type', 'text/plain');
      res.send(logs);
    } catch (error) {
      logger.error(`Error getting logs for container ${req.params.id}:`, error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }));

  router.get('/containers/:id/stats', asyncHandler(async (req, res) => {
    try {
      const stats = await dockerService.getContainerStats(req.params.id);
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      logger.error(`Error getting stats for container ${req.params.id}:`, error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }));

  router.get('/containers/:id/processes', asyncHandler(async (req, res) => {
    try {
      const processes = await dockerService.getContainerProcesses(req.params.id);
      res.json({
        success: true,
        data: processes
      });
    } catch (error) {
      logger.error(`Error getting processes for container ${req.params.id}:`, error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }));

  // Image routes
  router.get('/images', asyncHandler(async (req, res) => {
    try {
      const images = await dockerService.getAllImages();
      res.json({
        success: true,
        data: images
      });
    } catch (error) {
      logger.error('Error getting images:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }));

  router.post('/images/pull', asyncHandler(async (req, res) => {
    try {
      const { imageName } = req.body;
      await dockerService.pullImage(imageName);
      res.json({
        success: true,
        message: `Image ${imageName} pulled successfully`
      });
    } catch (error) {
      logger.error(`Error pulling image ${imageName}:`, error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }));

  router.delete('/images/:id', asyncHandler(async (req, res) => {
    try {
      await dockerService.removeImage(req.params.id, true);
      res.json({
        success: true,
        message: `Image ${req.params.id} removed successfully`
      });
    } catch (error) {
      logger.error(`Error removing image ${req.params.id}:`, error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }));

  // Network routes
  router.get('/networks', asyncHandler(async (req, res) => {
    try {
      const networks = await dockerService.getAllNetworks();
      res.json({
        success: true,
        data: networks
      });
    } catch (error) {
      logger.error('Error getting networks:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }));

  router.post('/networks', asyncHandler(async (req, res) => {
    try {
      const { name, options } = req.body;
      await dockerService.createNetwork(name, options);
      res.json({
        success: true,
        message: `Network ${name} created successfully`
      });
    } catch (error) {
      logger.error(`Error creating network ${name}:`, error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }));

  router.delete('/networks/:id', asyncHandler(async (req, res) => {
    try {
      await dockerService.removeNetwork(req.params.id);
      res.json({
        success: true,
        message: `Network ${req.params.id} removed successfully`
      });
    } catch (error) {
      logger.error(`Error removing network ${req.params.id}:`, error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }));

  // Volume routes
  router.get('/volumes', asyncHandler(async (req, res) => {
    try {
      const volumes = await dockerService.getAllVolumes();
      res.json({
        success: true,
        data: volumes
      });
    } catch (error) {
      logger.error('Error getting volumes:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }));

  router.post('/volumes', asyncHandler(async (req, res) => {
    try {
      const { name, options } = req.body;
      await dockerService.createVolume(name, options);
      res.json({
        success: true,
        message: `Volume ${name} created successfully`
      });
    } catch (error) {
      logger.error(`Error creating volume ${name}:`, error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }));

  router.delete('/volumes/:id', asyncHandler(async (req, res) => {
    try {
      await dockerService.removeVolume(req.params.id, true);
      res.json({
        success: true,
        message: `Volume ${req.params.id} removed successfully`
      });
    } catch (error) {
      logger.error(`Error removing volume ${req.params.id}:`, error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }));

  // Project routes
  router.get('/projects', asyncHandler(async (req, res) => {
    try {
      const projects = projectService.getProjects();
      res.json({
        success: true,
        data: Object.fromEntries(projects)
      });
    } catch (error) {
      logger.error('Error getting projects:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }));

  router.post('/projects', asyncHandler(async (req, res) => {
    try {
      const {
        name,
        repoUrl,
        branch = 'main',
        dockerfile = 'Dockerfile',
        composeFile = 'docker-compose.yml',
        environmentVars = {}
      } = req.body;

      const project = await projectService.addProject(
        name,
        repoUrl,
        branch,
        dockerfile,
        composeFile,
        environmentVars
      );
      
      res.json({
        success: true,
        data: project
      });
    } catch (error) {
      logger.error('Error adding project:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }));

  router.get('/projects/:name', asyncHandler(async (req, res) => {
    try {
      const project = projectService.getProject(req.params.name);
      if (!project) {
        return res.status(404).json({
          success: false,
          message: 'Project not found'
        });
      }
      
      res.json({
        success: true,
        data: project
      });
    } catch (error) {
      logger.error(`Error getting project ${req.params.name}:`, error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }));

  router.post('/projects/:name/build', asyncHandler(async (req, res) => {
    try {
      await projectService.buildProject(req.params.name);
      res.json({
        success: true,
        message: `Project ${req.params.name} built successfully`
      });
    } catch (error) {
      logger.error(`Error building project ${req.params.name}:`, error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }));

  router.post('/projects/:name/deploy', asyncHandler(async (req, res) => {
    try {
      await projectService.deployProject(req.params.name);
      res.json({
        success: true,
        message: `Project ${req.params.name} deployed successfully`
      });
    } catch (error) {
      logger.error(`Error deploying project ${req.params.name}:`, error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }));

  router.post('/projects/:name/stop', asyncHandler(async (req, res) => {
    try {
      await projectService.stopProject(req.params.name);
      res.json({
        success: true,
        message: `Project ${req.params.name} stopped successfully`
      });
    } catch (error) {
      logger.error(`Error stopping project ${req.params.name}:`, error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }));

  router.delete('/projects/:name', asyncHandler(async (req, res) => {
    try {
      await projectService.removeProject(req.params.name);
      res.json({
        success: true,
        message: `Project ${req.params.name} removed successfully`
      });
    } catch (error) {
      logger.error(`Error removing project ${req.params.name}:`, error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }));

  router.get('/projects/:name/health', asyncHandler(async (req, res) => {
    try {
      const health = await projectService.getProjectHealth(req.params.name);
      res.json({
        success: true,
        data: health
      });
    } catch (error) {
      logger.error(`Error getting project health for ${req.params.name}:`, error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }));

  router.get('/projects/summary', asyncHandler(async (req, res) => {
    try {
      const summary = projectService.getProjectsSummary();
      res.json({
        success: true,
        data: summary
      });
    } catch (error) {
      logger.error('Error getting projects summary:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }));

  // Terminal routes
  router.post('/terminal/:containerId/session', asyncHandler(async (req, res) => {
    try {
      const { userId } = req.body;
      const sessionId = terminalService.createSession(req.params.containerId, userId);
      
      res.json({
        success: true,
        data: { sessionId }
      });
    } catch (error) {
      logger.error(`Error creating terminal session: ${error}`);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }));

  router.get('/terminal/sessions', asyncHandler(async (req, res) => {
    try {
      const sessions = terminalService.getSessions();
      res.json({
        success: true,
        data: sessions
      });
    } catch (error) {
      logger.error('Error getting terminal sessions:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }));

  router.get('/terminal/sessions/summary', asyncHandler(async (req, res) => {
    try {
      const summary = terminalService.getSessionsSummary();
      res.json({
        success: true,
        data: summary
      });
    } catch (error) {
      logger.error('Error getting terminal sessions summary:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  });

  router.delete('/terminal/sessions/:sessionId', asyncHandler(async (req, res) => {
    try {
      terminalService.closeSession(req.params.sessionId);
      res.json({
        success: true,
        message: `Terminal session ${req.params.sessionId} closed`
      });
    } catch (error) {
      logger.error(`Error closing terminal session: ${error}`);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  });

  return router;
}

export default routes;
