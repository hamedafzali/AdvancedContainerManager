import { Logger } from "../utils/logger";
import {
  EC2Client,
  DescribeInstancesCommand,
  RunInstancesCommand,
  TerminateInstancesCommand,
} from "@aws-sdk/client-ec2";
import { fromEnv } from "@aws-sdk/credential-provider-env";
import { InstancesClient } from "@google-cloud/compute";
import { DefaultAzureCredential } from "@azure/identity";
import { ComputeManagementClient } from "@azure/arm-compute";

export interface CloudProvider {
  name: string;
  type: "aws" | "gcp" | "azure";
  region: string;
  credentials?: Record<string, any>;
}

export interface CloudInstance {
  id: string;
  name: string;
  type: string;
  status: string;
  region: string;
  provider: string;
  cpu: number;
  memory: number;
  storage: number;
  cost: number;
  tags: Record<string, string>;
  createdAt: string;
  publicIp?: string;
  privateIp?: string;
}

export interface CloudMetrics {
  provider: string;
  region: string;
  timestamp: string;
  instances: number;
  totalCpu: number;
  totalMemory: number;
  totalStorage: number;
  totalCost: number;
  utilization: {
    cpu: number;
    memory: number;
    network: number;
  };
}

export interface InstanceConfig {
  name: string;
  type: string;
  image: string;
  region: string;
  tags?: Record<string, string>;
}

export class MultiCloudService {
  private providers: Map<string, CloudProvider> = new Map();
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private metrics: CloudMetrics[] = [];
  private logger: Logger;

  constructor() {
    this.logger = new Logger();
  }

  public addProvider(provider: CloudProvider): void {
    this.providers.set(provider.name, provider);
    this.logger.info(
      `Added cloud provider: ${provider.name} (${provider.type})`,
    );
  }

  public removeProvider(providerName: string): void {
    this.stopAutoSync(providerName);
    this.providers.delete(providerName);
    this.logger.info(`Removed cloud provider: ${providerName}`);
  }

  public getProviders(): CloudProvider[] {
    return Array.from(this.providers.values());
  }

  public async fetchInstances(providerName: string): Promise<CloudInstance[]> {
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(`Provider ${providerName} not found`);
    }

    try {
      switch (provider.type) {
        case "aws":
          return await this.fetchAwsInstances(provider);
        case "gcp":
          return await this.fetchGcpInstances(provider);
        case "azure":
          return await this.fetchAzureInstances(provider);
        default:
          throw new Error(`Unsupported provider type: ${provider.type}`);
      }
    } catch (error) {
      this.logger.error(
        `Failed to fetch instances from ${providerName}:`,
        error,
      );
      throw error;
    }
  }

  public async getAllInstances(): Promise<CloudInstance[]> {
    const allInstances: CloudInstance[] = [];

    for (const provider of this.providers.values()) {
      try {
        const instances = await this.fetchInstances(provider.name);
        allInstances.push(...instances);
      } catch (error) {
        this.logger.error(
          `Failed to fetch instances from ${provider.name}:`,
          error,
        );
      }
    }

    return allInstances;
  }

  public async getMetrics(providerName: string): Promise<CloudMetrics> {
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(`Provider ${providerName} not found`);
    }

    const instances = await this.fetchInstances(providerName);

    return {
      provider: provider.name,
      region: provider.region,
      timestamp: new Date().toISOString(),
      instances: instances.length,
      totalCpu: instances.reduce((sum, instance) => sum + instance.cpu, 0),
      totalMemory: instances.reduce(
        (sum, instance) => sum + instance.memory,
        0,
      ),
      totalStorage: instances.reduce(
        (sum, instance) => sum + instance.storage,
        0,
      ),
      totalCost: instances.reduce((sum, instance) => sum + instance.cost, 0),
      utilization: {
        cpu: 0.65,
        memory: 0.58,
        network: 0.42,
      },
    };
  }

  public async getAllMetrics(): Promise<CloudMetrics[]> {
    const allMetrics: CloudMetrics[] = [];

    for (const provider of this.providers.values()) {
      try {
        const metrics = await this.getMetrics(provider.name);
        allMetrics.push(metrics);
      } catch (error) {
        this.logger.error(
          `Failed to fetch metrics from ${provider.name}:`,
          error,
        );
      }
    }

    return allMetrics;
  }

  public startAutoSync(providerName: string, intervalMs: number = 60000): void {
    this.stopAutoSync(providerName);

    const interval = setInterval(async () => {
      try {
        const metrics = await this.getMetrics(providerName);
        this.metrics.push(metrics);

        if (this.metrics.length > 100) {
          this.metrics = this.metrics.slice(-100);
        }
      } catch (error) {
        this.logger.error(`Auto sync failed for ${providerName}:`, error);
      }
    }, intervalMs);

    this.intervals.set(providerName, interval);
    this.logger.info(`Started auto sync for ${providerName} (${intervalMs}ms)`);
  }

  public stopAutoSync(providerName: string): void {
    const interval = this.intervals.get(providerName);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(providerName);
      this.logger.info(`Stopped auto sync for ${providerName}`);
    }
  }

  private async fetchAwsInstances(
    provider: CloudProvider,
  ): Promise<CloudInstance[]> {
    const client = new EC2Client({
      region: provider.region,
      credentials: fromEnv(),
    });

    const response = await client.send(new DescribeInstancesCommand({}));
    const instances: CloudInstance[] = [];

    (response.Reservations || []).forEach((reservation) => {
      (reservation.Instances || []).forEach((instance) => {
        const tags = (instance.Tags || []).reduce((acc, tag) => {
          if (tag.Key) acc[tag.Key] = tag.Value || "";
          return acc;
        }, {});

        instances.push({
          id: instance.InstanceId || "",
          name: (tags as any).Name || instance.InstanceId || "",
          type: instance.InstanceType || "",
          status: instance.State?.Name || "unknown",
          region: provider.region,
          provider: "aws",
          cpu: 2,
          memory: 4,
          storage: 20,
          cost: 0.05,
          tags: tags as Record<string, string>,
          createdAt:
            instance.LaunchTime?.toISOString() || new Date().toISOString(),
          publicIp: instance.PublicIpAddress,
          privateIp: instance.PrivateIpAddress,
        });
      });
    });

    return instances;
  }

  private async fetchGcpInstances(
    provider: CloudProvider,
  ): Promise<CloudInstance[]> {
    const credentials = this.resolveCredentials("gcp", provider.credentials);
    if (!credentials.projectId || !credentials.keyFile) {
      throw new Error(
        "Missing GCP credentials (GOOGLE_APPLICATION_CREDENTIALS, GOOGLE_CLOUD_PROJECT)",
      );
    }

    const client = new InstancesClient({ keyFilename: credentials.keyFile });
    const [response] = await client.list({
      project: credentials.projectId,
    });
    const instances: CloudInstance[] = [];

    for (const instance of response) {
      const tags = (instance.labels || {}) as Record<string, string>;
      instances.push({
        id: instance.id?.toString() || "",
        name: instance.name || "",
        provider: provider.name,
        region: provider.region,
        type: instance.machineType?.split("/").pop() || "unknown",
        status: instance.status || "unknown",
        cpu: 2,
        memory: 4,
        storage: 20,
        cost: 0.05,
        tags: tags as Record<string, string>,
        createdAt: instance.creationTimestamp || new Date().toISOString(),
        publicIp: instance.networkInterfaces?.[0]?.accessConfigs?.[0]?.natIP,
        privateIp: instance.networkInterfaces?.[0]?.networkIP,
      });
    }

    return instances;
  }

  private async fetchAzureInstances(
    provider: CloudProvider,
  ): Promise<CloudInstance[]> {
    const credentials = this.resolveCredentials("azure", provider.credentials);
    const client = new ComputeManagementClient(
      new DefaultAzureCredential(),
      credentials.subscriptionId,
    );

    const instances: CloudInstance[] = [];

    const vms = await client.virtualMachines.listAll();

    for await (const vm of vms) {
      instances.push({
        id: vm.id || "",
        name: vm.name || "",
        provider: provider.name,
        region: provider.region,
        type: vm.hardwareProfile?.vmSize || "unknown",
        status: "running",
        cpu: 2,
        memory: 4,
        storage: 20,
        cost: 0.05,
        tags: vm.tags as Record<string, string>,
        createdAt: new Date().toISOString(),
      });
    }

    return instances;
  }

  private resolveCredentials(
    provider: string,
    credentials?: Record<string, any>,
  ): any {
    switch (provider) {
      case "aws":
        return {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          region: process.env.AWS_DEFAULT_REGION,
        };
      case "gcp":
        return {
          projectId: process.env.GOOGLE_CLOUD_PROJECT,
          keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
        };
      case "azure":
        return {
          subscriptionId: process.env.AZURE_SUBSCRIPTION_ID,
          tenantId: process.env.AZURE_TENANT_ID,
          clientId: process.env.AZURE_CLIENT_ID,
          clientSecret: process.env.AZURE_CLIENT_SECRET,
        };
      default:
        return credentials || {};
    }
  }

  public getMetricsHistory(providerName?: string): CloudMetrics[] {
    if (providerName) {
      return this.metrics.filter((m) => m.provider === providerName);
    }
    return this.metrics;
  }

  public async createInstance(
    providerName: string,
    config: InstanceConfig,
  ): Promise<CloudInstance> {
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(`Provider ${providerName} not found`);
    }

    if (provider.type === "aws") {
      const client = new EC2Client({
        region: config.region,
        credentials: fromEnv(),
      });

      const response = await client.send(
        new RunInstancesCommand({
          ImageId: config.image,
          InstanceType: config.type as any,
          MinCount: 1,
          MaxCount: 1,
          TagSpecifications: [
            {
              ResourceType: "instance",
              Tags: [{ Key: "Name", Value: config.name }],
            },
          ],
        }),
      );

      const instance = response.Instances?.[0];
      if (!instance) {
        throw new Error("Failed to create instance");
      }

      return {
        id: instance.InstanceId || "",
        name: config.name,
        type: config.type,
        status: "pending",
        region: config.region,
        provider: "aws",
        cpu: 2,
        memory: 4,
        storage: 20,
        cost: 0.05,
        tags: config.tags || {},
        createdAt: new Date().toISOString(),
        publicIp: instance.PublicIpAddress,
        privateIp: instance.PrivateIpAddress,
      };
    }

    throw new Error(`Instance creation not implemented for ${provider.type}`);
  }

  public async deleteInstance(
    providerName: string,
    instanceId: string,
  ): Promise<boolean> {
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(`Provider ${providerName} not found`);
    }

    if (provider.type === "aws") {
      const client = new EC2Client({
        region: provider.region,
        credentials: fromEnv(),
      });

      await client.send(
        new TerminateInstancesCommand({
          InstanceIds: [instanceId],
        }),
      );

      return true;
    }

    throw new Error(`Instance deletion not implemented for ${provider.type}`);
  }
}
