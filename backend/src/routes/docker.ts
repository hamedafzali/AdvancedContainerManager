import { Router } from "express";
import { asyncHandler } from "../middleware/error-handler";
import type { RouteDeps } from "./deps";

/** Container, image, network and volume routes. */
export function registerDockerRoutes(router: Router, deps: RouteDeps): void {
  const { dockerService, logger } = deps;

  // Container routes
  router.get(
    "/containers",
    asyncHandler(async (req, res) => {
      try {
        const containers = await dockerService.getAllContainers();
        res.json({
          success: true,
          data: containers,
        });
      } catch (error) {
        logger.error("Error getting containers:", error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.get(
    "/containers/:id",
    asyncHandler(async (req, res) => {
      try {
        const container = await dockerService.getContainer(req.params.id);
        res.json({
          success: true,
          data: container,
        });
      } catch (error) {
        logger.error(`Error getting container ${req.params.id}:`, error);
        res.status(404).json({
          success: false,
          message: "Container not found",
        });
      }
    }),
  );

  router.post(
    "/containers/create",
    asyncHandler(async (req, res) => {
      try {
        const {
          name,
          image,
          ports = [],
          env = {},
          packages = [],
          command,
        } = req.body || {};

        if (!image) {
          return res.status(400).json({
            success: false,
            message: "Image is required",
          });
        }

        const created = await dockerService.createContainerFromWizard({
          name,
          image,
          ports,
          env,
          packages,
          command,
        });

        res.json({
          success: true,
          data: created,
        });
      } catch (error) {
        logger.error("Error creating container:", error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.post(
    "/containers/:id/start",
    asyncHandler(async (req, res) => {
      try {
        await dockerService.startContainer(req.params.id);
        res.json({
          success: true,
          message: `Container ${req.params.id} started successfully`,
        });
      } catch (error) {
        logger.error(`Error starting container ${req.params.id}:`, error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.post(
    "/containers/:id/stop",
    asyncHandler(async (req, res) => {
      try {
        await dockerService.stopContainer(req.params.id);
        res.json({
          success: true,
          message: `Container ${req.params.id} stopped successfully`,
        });
      } catch (error) {
        logger.error(`Error stopping container ${req.params.id}:`, error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.post(
    "/containers/:id/restart",
    asyncHandler(async (req, res) => {
      try {
        await dockerService.restartContainer(req.params.id);
        res.json({
          success: true,
          message: `Container ${req.params.id} restarted successfully`,
        });
      } catch (error) {
        logger.error(`Error restarting container ${req.params.id}:`, error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.put(
    "/containers/:id/ports",
    asyncHandler(async (req, res) => {
      try {
        const { ports } = req.body;
        const containerId = req.params.id;

        if (!ports || !Array.isArray(ports)) {
          return res.status(400).json({
            success: false,
            message: "Ports array is required",
          });
        }

        // Update container port mappings
        const result = await dockerService.updateContainerPorts(
          containerId,
          ports,
        );

        logger.info(`Updated port mappings for container: ${containerId}`);

        res.json({
          success: true,
          message: "Container port mappings updated successfully",
          data: result,
        });
      } catch (error) {
        logger.error(
          `Failed to update port mappings for container ${req.params.id}:`,
          error,
        );
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.delete(
    "/containers/:id",
    asyncHandler(async (req, res) => {
      try {
        await dockerService.removeContainer(req.params.id, true);
        res.json({
          success: true,
          message: `Container ${req.params.id} removed successfully`,
        });
      } catch (error) {
        logger.error(`Error removing container ${req.params.id}:`, error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.get(
    "/containers/:id/logs",
    asyncHandler(async (req, res) => {
      try {
        const options = {
          tail: req.query.tail ? parseInt(req.query.tail as string) : 100,
          since: req.query.since
            ? new Date(req.query.since as string)
            : undefined,
          until: req.query.until
            ? new Date(req.query.until as string)
            : undefined,
          timestamps: req.query.timestamps !== "false",
          stdout: req.query.stdout !== "false",
          stderr: req.query.stderr !== "false",
        };

        const logs = await dockerService.getContainerLogs(
          req.params.id,
          options,
        );

        res.setHeader("Content-Type", "text/plain");
        res.send(logs);
      } catch (error) {
        logger.error(
          `Error getting logs for container ${req.params.id}:`,
          error,
        );
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.get(
    "/containers/:id/stats",
    asyncHandler(async (req, res) => {
      try {
        const stats = await dockerService.getContainerStats(req.params.id);
        res.json({
          success: true,
          data: stats,
        });
      } catch (error) {
        logger.error(
          `Error getting stats for container ${req.params.id}:`,
          error,
        );
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.get(
    "/containers/:id/processes",
    asyncHandler(async (req, res) => {
      try {
        const processes = await dockerService.getContainerProcesses(
          req.params.id,
        );
        res.json({
          success: true,
          data: processes,
        });
      } catch (error) {
        logger.error(
          `Error getting processes for container ${req.params.id}:`,
          error,
        );
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  // Image routes
  router.get(
    "/images",
    asyncHandler(async (req, res) => {
      try {
        const images = await dockerService.getAllImages();
        res.json({
          success: true,
          data: images,
        });
      } catch (error) {
        logger.error("Error getting images:", error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.post(
    "/images/pull",
    asyncHandler(async (req, res) => {
      try {
        const { imageName } = req.body;
        await dockerService.pullImage(imageName);
        res.json({
          success: true,
          message: `Image ${imageName} pulled successfully`,
        });
      } catch (error) {
        logger.error(`Error pulling image ${req.body.name}:`, error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.delete(
    "/images/:id",
    asyncHandler(async (req, res) => {
      try {
        await dockerService.removeImage(req.params.id, true);
        res.json({
          success: true,
          message: `Image ${req.params.id} removed successfully`,
        });
      } catch (error) {
        logger.error(`Error removing image ${req.params.id}:`, error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  // Network routes
  router.get(
    "/networks",
    asyncHandler(async (req, res) => {
      try {
        const networks = await dockerService.getAllNetworks();
        res.json({
          success: true,
          data: networks,
        });
      } catch (error) {
        logger.error("Error getting networks:", error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.post(
    "/networks",
    asyncHandler(async (req, res) => {
      try {
        const { name, options } = req.body;
        await dockerService.createNetwork(name, options);
        res.json({
          success: true,
          message: `Network ${name} created successfully`,
        });
      } catch (error) {
        logger.error(`Error creating network ${req.body.name}:`, error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.delete(
    "/networks/:id",
    asyncHandler(async (req, res) => {
      try {
        await dockerService.removeNetwork(req.params.id);
        res.json({
          success: true,
          message: `Network ${req.params.id} removed successfully`,
        });
      } catch (error) {
        logger.error(`Error removing network ${req.params.id}:`, error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  // Volume routes
  router.get(
    "/volumes",
    asyncHandler(async (req, res) => {
      try {
        const volumes = await dockerService.getAllVolumes();
        res.json({
          success: true,
          data: volumes,
        });
      } catch (error) {
        logger.error("Error getting volumes:", error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.post(
    "/volumes",
    asyncHandler(async (req, res) => {
      try {
        const { name, options } = req.body;
        await dockerService.createVolume(name, options);
        res.json({
          success: true,
          message: `Volume ${name} created successfully`,
        });
      } catch (error) {
        logger.error(`Error creating volume ${req.body.name}:`, error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.delete(
    "/volumes/:id",
    asyncHandler(async (req, res) => {
      try {
        await dockerService.removeVolume(req.params.id, true);
        res.json({
          success: true,
          message: `Volume ${req.params.id} removed successfully`,
        });
      } catch (error) {
        logger.error(`Error removing volume ${req.params.id}:`, error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  // Advanced Container Operations
  router.post("/containers/batch", async (req, res) => {
    try {
      const { operations } = req.body;
      await dockerService.batchContainerOperations(operations);
      res.json({ success: true, message: "Batch operations completed" });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  router.get("/containers/:id/advanced-stats", async (req, res) => {
    try {
      const { id } = req.params;
      const stats = await dockerService.getAdvancedContainerStats(id);
      res.json({ success: true, data: stats });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  router.get("/containers/cached", async (req, res) => {
    try {
      const containers = await dockerService.getContainersWithCache();
      res.json({ success: true, data: containers });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  router.get("/containers/:id/metrics/cached", async (req, res) => {
    try {
      const { id } = req.params;
      const metrics = await dockerService.getContainerMetricsWithCache(id);
      res.json({ success: true, data: metrics });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });
}
